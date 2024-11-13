import {
  ClassDeclaration,
  InterfaceDeclaration,
  MethodDeclaration,
  MethodSignature,
  Node,
  ObjectLiteralExpression,
  Signature,
  Symbol,
  SyntaxKind,
  Type,
  TypeAliasDeclaration,
} from 'ts-morph';
import {
  AccessorType,
  ArgumentDefinition,
  AutoImplementedMethod,
  CallableDefinition,
  FactoryDefinition,
  InjectorType,
  IterableType,
  ListType,
  PromiseType,
  ReturnType,
  ScopedRunnerType,
  SingleType,
  ValueType,
} from '../definitions';
import { DefinitionError, UnsupportedError, UserCodeContext } from '../errors';
import { getFirst, getFirstIfOnly, throwIfUndef } from './helpers';
import { ReferenceResolver, ReferenceResolverFactory } from './referenceResolver';

const refMap = {
  Container: SyntaxKind.ClassDeclaration,
  ServiceDefinition: SyntaxKind.TypeAliasDeclaration,
  ServiceDecorator: SyntaxKind.TypeAliasDeclaration,
  PublicServices: SyntaxKind.VariableDeclaration,
  DynamicServices: SyntaxKind.VariableDeclaration,
  ScopedRunner: SyntaxKind.InterfaceDeclaration,
  GlobalPromise: SyntaxKind.TypeAliasDeclaration,
  GlobalIterable: SyntaxKind.TypeAliasDeclaration,
  GlobalAsyncIterable: SyntaxKind.TypeAliasDeclaration,
};

export class TypeHelper {
  private readonly refs: ReferenceResolver<typeof refMap>;

  constructor(refsFactory: ReferenceResolverFactory) {
    this.refs = refsFactory.create('dicc/refs', refMap);
  }

  unwrapNullable(type: Type, nullable?: boolean): [type: Type, nullable: boolean] {
    if (nullable !== undefined) {
      return [type, nullable];
    }

    const nonNullable = type.getNonNullableType();
    return [nonNullable, nonNullable !== type];
  }

  isPromise(type: Type): boolean {
    return this.refs.isType(type, 'GlobalPromise');
  }

  isIterable(type: Type): boolean {
    return this.refs.isType(type, 'GlobalIterable');
  }

  isAsyncIterable(type: Type): boolean {
    return this.refs.isType(type, 'GlobalAsyncIterable');
  }

  isServiceDefinition(type: Type): boolean {
    return this.refs.isType(type, 'ServiceDefinition');
  }

  isDecoratorDefinition(type: Type): boolean {
    return this.refs.isType(type, 'ServiceDecorator');
  }

  isContainer(...types: Type[]): boolean {
    for (const type of types) {
      if (this.refs.isType(type, 'Container')) {
        return true;
      }
    }

    return false;
  }

  resolveAliases(type: Type): Type[] {
    const declaration = this.resolveDeclaration(type);

    if (Node.isClassDeclaration(declaration)) {
      return this.resolveClassTypes(declaration);
    } else if (Node.isInterfaceDeclaration(declaration)) {
      return this.resolveInterfaceTypes(declaration);
    } else {
      return this.resolveTypeAliases(type);
    }
  }

  private resolveClassTypes(declaration: ClassDeclaration): Type[] {
    const types: Type[] = [];
    let cursor: ClassDeclaration | undefined = declaration;

    while (cursor) {
      for (const ifc of cursor.getImplements()) {
        types.push(ifc.getType());
        const impl = ifc.getExpression();

        if (Node.isIdentifier(impl)) {
          types.push(...impl.getDefinitionNodes().flatMap((node) =>
            Node.isClassDeclaration(node)
              ? this.resolveClassTypes(node)
              : Node.isInterfaceDeclaration(node)
                ? this.resolveInterfaceTypes(node)
                : []
          ));
        }
      }

      const parent: ClassDeclaration | undefined = cursor.getBaseClass();
      parent && types.push(parent.getType());
      cursor = parent;
    }

    return types;
  }

  private resolveInterfaceTypes(declaration: InterfaceDeclaration): Type[] {
    const types: Type[] = [];
    const queue: (ClassDeclaration | InterfaceDeclaration | TypeAliasDeclaration)[] = [declaration];
    let cursor: ClassDeclaration | InterfaceDeclaration | TypeAliasDeclaration | undefined;

    while (cursor = queue.shift()) {
      if (Node.isClassDeclaration(cursor)) {
        types.push(...this.resolveClassTypes(cursor));
      } else if (Node.isInterfaceDeclaration(cursor)) {
        for (const ifc of cursor.getBaseDeclarations()) {
          types.push(ifc.getType());
          queue.push(ifc);
        }
      } else {
        types.push(cursor.getType());
      }
    }

    return types;
  }

  private resolveTypeAliases(type: Type): Type[] {
    const aliases: Type[] = [type];

    for (let i = 0; i < aliases.length; ++i) {
      aliases.push(...aliases[i].getBaseTypes());
    }

    return aliases.slice(1);
  }

  resolveDeclaration(type: Type): ClassDeclaration | InterfaceDeclaration | undefined {
    return type
      .getSymbol()
      ?.getDeclarations()
      .find((node) => Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node));
  }

  resolveFactory(type: Type, ctx: UserCodeContext): FactoryDefinition {
    const [signature, method] = this.resolveFactorySignature(type, ctx);

    if (!signature) {
      throw new DefinitionError(`Unable to resolve factory signature`, ctx);
    }

    try {
      ctx = { ...ctx, node: signature.getDeclaration() };
    } catch {
      // this will happen with implicit constructors, it's okay to ignore
    }

    return new FactoryDefinition(
      ctx.resource,
      ctx.path,
      this.resolveArguments(signature, ctx.node),
      ...this.resolveReturnType(signature),
      ctx.node,
      method,
    );
  }

  private resolveFactorySignature(type: Type, ctx: UserCodeContext): [signature?: Signature, method?: string] {
    const constructSignature = type.isClass() && this.resolveConstructSignature(type, ctx);

    if (constructSignature) {
      return [constructSignature, 'constructor'];
    }

    const callSignature = !type.isClass() && this.resolveCallSignature(type, ctx);

    if (callSignature) {
      return [callSignature];
    }

    const create = ctx.node
      ?.asKind(SyntaxKind.ClassDeclaration)
      ?.getStaticMethod('create');

    if (!create) {
      return [];
    }

    const createSignature = this.resolveCallSignature(create.getType(), { ...ctx, node: create });
    return createSignature ? [createSignature, 'create'] : [];
  }

  resolveCallable(type: Type, ctx: UserCodeContext): CallableDefinition {
    const signature = throwIfUndef(
      this.resolveCallSignature(type, ctx),
      () => new DefinitionError(`Unable to resolve call signature`, ctx),
    );

    return new CallableDefinition(
      ctx.resource,
      ctx.path,
      this.resolveArguments(signature, ctx.node),
      ...this.resolveReturnType(signature),
      ctx.node,
    );
  }

  resolveCallableProperty(
    object: ObjectLiteralExpression,
    property: string,
    ctx: UserCodeContext,
  ): CallableDefinition | undefined {
    const node = object.getProperty(property);
    return node && this.resolveCallable(node.getType(), { ...ctx, path: `${ctx.path}.${property}`, node });
  }

  resolveCallSignature(type: Type, ctx: UserCodeContext): Signature | undefined {
    return this.resolveFirstSignature(type.getCallSignatures(), ctx);
  }

  resolveConstructSignature(type: Type, ctx: UserCodeContext): Signature | undefined {
    const symbol = type.getSymbol();
    const declaration = symbol?.getValueDeclaration();
    const classType = declaration && symbol?.getTypeAtLocation(declaration);

    const ctors = classType?.getConstructSignatures().filter((signature) => {
      try {
        const declaration = signature.getDeclaration().asKindOrThrow(SyntaxKind.Constructor);

        return !declaration.hasModifier(SyntaxKind.PrivateKeyword)
          && !declaration.hasModifier(SyntaxKind.ProtectedKeyword);
      } catch (e: any) {
        // This would happen if a class has no explicit constructor -
        // in that case we'd get a construct signature, but no declaration.
        return true;
      }
    });

    return this.resolveFirstSignature(ctors ?? [], ctx);
  }

  private resolveFirstSignature(signatures: Signature[], ctx: UserCodeContext): Signature | undefined {
    switch (signatures.length) {
      case 0: return undefined;
      case 1: return signatures[0];
      default: throw new UnsupportedError('Overload signatures are not supported', ctx);
    }
  }

  resolveArguments(signature: Signature, ctx?: Node): Map<string, ArgumentDefinition> {
    const args: Map<string, ArgumentDefinition> = new Map();
    ctx ??= signature.getDeclaration();

    for (const arg of signature.getParameters()) {
      const node = arg.getValueDeclaration() ?? ctx;
      const type = arg.getTypeAtLocation(node);
      const declaration = node.asKind(SyntaxKind.Parameter);

      args.set(arg.getName(), new ArgumentDefinition(
        type,
        this.resolveValueType(type, node),
        declaration?.isOptional() ?? false,
        declaration?.isRestParameter() ?? false,
        node,
      ));
    }

    return args;
  }

  resolveValueType(rawType: Type, node: Node): ValueType {
    const [type, nullable] = this.unwrapNullable(rawType);

    if (this.refs.isType(type, 'ScopedRunner')) {
      return new ScopedRunnerType(nullable);
    } else if (this.isIterable(type)) {
      return new IterableType(type, this.resolveSingleType(getFirst(type.getTypeArguments())), nullable);
    } else if (this.isAsyncIterable(rawType)) {
      return new IterableType(type, this.resolveSingleType(getFirst(type.getTypeArguments())), nullable, true);
    } else if (this.isPromise(type)) {
      return this.resolvePromiseType(type, nullable);
    } else {
      return this.resolveListType(type, nullable)
        ?? this.resolveCallableType(type, nullable, node)
        ?? this.resolveSingleType(type, nullable);
    }
  }

  private resolveCallableType(type: Type, nullable: boolean, node: Node): ValueType | undefined {
    const signature = getFirstIfOnly(type.getCallSignatures());

    if (!signature) {
      return undefined;
    }

    const [p1, p2] = signature.getParameters();

    if (p2) {
      return undefined;
    }

    const rawRtnType = signature.getReturnType();
    const [rtnType, rtnNullable] = this.unwrapNullable(rawRtnType);

    if (p1) {
      return rawRtnType.isVoid()
        ? new InjectorType(type, p1.getTypeAtLocation(node).getNonNullableType(), nullable)
        : undefined;
    } else if (this.isPromise(rtnType)) {
      return new AccessorType(type, this.resolvePromiseType(rtnType, rtnNullable), nullable);
    } else {
      return new AccessorType(
        type,
        this.resolveListType(rtnType, rtnNullable) ?? this.resolveSingleType(rtnType, rtnNullable),
        nullable,
      );
    }
  }

  private resolvePromiseType(rawType: Type, nullable_?: boolean): PromiseType {
    const [type, nullable] = this.unwrapNullable(rawType, nullable_);
    const [valueType] = type.getTypeArguments();

    return new PromiseType(
      rawType,
      this.resolveListType(valueType) ?? this.resolveSingleType(valueType),
      nullable,
    );
  }

  private resolveListType(rawType: Type, nullable_?: boolean): ListType | undefined {
    const [type, nullable] = this.unwrapNullable(rawType, nullable_);

    return type.isArray() || type.isReadonlyArray()
      ? new ListType(rawType, this.resolveSingleType(type.getArrayElementType()!), nullable)
      : undefined;
  }

  private resolveSingleType(rawType: Type, nullable?: boolean): SingleType {
    return new SingleType(...this.unwrapNullable(rawType, nullable));
  }

  resolveReturnType(signature: Signature): [Type, ReturnType | undefined] {
    const raw = signature.getReturnType();

    if (raw.isVoid() || (raw.isUnion() && raw.getUnionTypes().some((t) => t.isVoid()))) {
      return [raw, undefined];
    }

    let [type, nullable] = this.unwrapNullable(raw);

    if (this.isIterable(type)) {
      return [raw, new IterableType(type, this.resolveSingleType(getFirst(type.getTypeArguments())), nullable)];
    } else if (this.isAsyncIterable(type)) {
      return [raw, new IterableType(type, this.resolveSingleType(getFirst(type.getTypeArguments())), nullable, true)];
    } else if (this.isPromise(type)) {
      return [raw, this.resolvePromiseType(type, nullable)];
    }

    return [raw, this.resolveListType(type, nullable) ?? this.resolveSingleType(type, nullable)];
  }

  resolveAutoImplementedMethod(
    declaration: ClassDeclaration | InterfaceDeclaration,
    ctx: UserCodeContext,
  ): AutoImplementedMethod | undefined {
    const method = getFirstIfOnly(this.resolveFactoryMethodCandidates(declaration));
    const name = method?.getName() ?? '';

    if (!method || !/^(get|create)$/.test(name)) {
      return undefined;
    }

    const signature = this.resolveCallSignature(method.getType(), ctx);

    if (!signature) {
      return undefined;
    }

    const args = this.resolveArguments(signature, method);

    if (name === 'get' && args.size) {
      return undefined;
    }

    const [rawReturnType, returnType] = this.resolveReturnType(signature);

    if (!returnType) {
      return undefined;
    }

    return new AutoImplementedMethod(ctx.resource, ctx.path, name, args, rawReturnType, returnType, method);
  }

  private resolveFactoryMethodCandidates(
    declaration: ClassDeclaration | InterfaceDeclaration,
  ): (MethodDeclaration | MethodSignature)[] {
    if (Node.isInterfaceDeclaration(declaration)) {
      return declaration.getMethods();
    } else if (!declaration.isAbstract()) {
      return [];
    } else {
      return declaration.getInstanceMethods().filter((method) => method.isAbstract());
    }
  }

  * resolveExternalContainerServices(
    container: Type,
    map: 'public' | 'dynamic',
  ): Iterable<[id: string, type: Type, aliases: Iterable<Type>, async: boolean]> {
    const declaration = container.getSymbol()?.getValueDeclaration();

    if (!declaration) {
      return;
    }

    const propName: keyof typeof refMap = map === 'public' ? 'PublicServices' : 'DynamicServices';
    const prop = container.getProperty(findSymbolProp(this.refs.getType(propName)));
    const type = prop?.getTypeAtLocation(declaration).getNonNullableType();

    if (type) {
      yield * this.resolveExternalContainerServiceMap(type, declaration);
    }
  }

  private * resolveExternalContainerServiceMap(
    map: Type,
    declaration: Node,
  ): Iterable<[id: string, type: Type, aliases: Iterable<Type>, async: boolean]> {
    for (const prop of map.getProperties()) {
      let type = prop.getTypeAtLocation(declaration).getNonNullableType();
      let aliases: Type[] = [];
      let async = false;

      if (this.isPromise(type)) {
        [type] = type.getTypeArguments();
        async = true;
      }

      if (type.isIntersection()) {
        [type, ...aliases] = type.getIntersectionTypes();
      }

      if (!aliases.length) {
        aliases = this.resolveAliases(type);
      }

      yield [prop.getName(), type, aliases, async];
    }
  }
}

function findSymbolProp(symbol: Type) {
  return (prop: Symbol) => symbol === prop.getValueDeclaration()
    ?.asKind(SyntaxKind.PropertyDeclaration)
    ?.getNameNode()
    ?.asKind(SyntaxKind.ComputedPropertyName)
    ?.getExpression()
    .getType();
}
