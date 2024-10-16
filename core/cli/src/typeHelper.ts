import {
  CallExpression,
  ClassDeclaration,
  InterfaceDeclaration,
  Node,
  Project,
  PropertyName,
  Signature,
  Symbol,
  SyntaxKind,
  Type,
  TypeAliasDeclaration,
  TypeNode,
  TypeReferenceNode,
} from 'ts-morph';
import { TypeError } from './errors';
import { ReferenceResolver } from './referenceResolver';
import { ArgumentInfo, NestedParameterInfo, TypeFlag } from './types';

export class TypeHelper {
  private readonly refs: ReferenceResolver;
  private containerType?: Type;
  private containerParametersType?: Type;
  private serviceMapSymbolType?: Type;

  constructor(private readonly project: Project) {
    this.refs = this.createReferenceResolver('dicc/refs');
  }

  isServiceDefinition(node?: TypeNode): node is TypeReferenceNode {
    return Node.isTypeReference(node)
      && this.resolveRootType(node.getTypeName().getType()) === this.refs.get('ServiceDefinition', SyntaxKind.TypeAliasDeclaration);
  }

  isServiceDecorator(node?: TypeNode): node is TypeReferenceNode {
    return Node.isTypeReference(node)
      && this.resolveRootType(node.getTypeName().getType()) === this.refs.get('ServiceDecorator', SyntaxKind.TypeAliasDeclaration);
  }

  resolveLiteralPropertyName(name: PropertyName): string | number | undefined {
    if (Node.isIdentifier(name)) {
      return name.getText();
    } else if (Node.isStringLiteral(name) || Node.isNumericLiteral(name)) {
      return name.getLiteralValue();
    } else {
      return undefined;
    }
  }

  unwrapAsyncType(type: Type): [type: Type, async: boolean] {
    const target = this.resolveRootType(type);
    let async = false;

    if (target === this.refs.get('GlobalPromise', SyntaxKind.TypeAliasDeclaration)) {
      async = true;
      type = type.getTypeArguments()[0];
    }

    return [type, async];
  }

  resolveType(type: Type): [type: Type, flags: TypeFlag] {
    const originalType = type;
    let flags: TypeFlag = TypeFlag.None;

    [type, flags] = this.resolveNullable(type, flags);

    const signatures = type.getCallSignatures();

    if (signatures.length === 1) {
      const args = signatures[0].getParameters();
      const returnType = signatures[0].getReturnType();

      if (args.length === 0) {
        flags |= TypeFlag.Accessor;
        type = returnType;
      } else if (args.length === 1 && returnType.getText() === 'void') {
        flags |= TypeFlag.Injector;
        type = args[0].getValueDeclarationOrThrow().getType();
      }
    }

    const target = this.resolveRootType(type);

    if (target === this.refs.get('GlobalPromise', SyntaxKind.TypeAliasDeclaration)) {
      [type, flags] = this.resolveNullable(type.getTypeArguments()[0], flags | TypeFlag.Async);
    } else if (target === this.refs.get('GlobalIterable', SyntaxKind.TypeAliasDeclaration)) {
      flags |= TypeFlag.Iterable;
      type = type.getTypeArguments()[0];
    } else if (target === this.refs.get('GlobalAsyncIterable', SyntaxKind.TypeAliasDeclaration)) {
      flags |= TypeFlag.Async | TypeFlag.Iterable;
      type = type.getTypeArguments()[0];
    } else if (this.isContainer(target)) {
      flags |= TypeFlag.Container;
      type = target;
    }

    if (type.isArray()) {
      flags |= TypeFlag.Array;
      type = type.getArrayElementTypeOrThrow();
    }

    if ((flags & TypeFlag.Iterable) && (flags & (TypeFlag.Accessor | TypeFlag.Array))) {
      throw new TypeError(`Iterable services are mutually exclusive with accessors and arrays`, originalType);
    } else if ((flags & TypeFlag.Injector) && flags !== TypeFlag.Injector) {
      throw new TypeError(`Injectors must accept a single resolved service instance`, originalType);
    } else if ((flags & TypeFlag.Container) && flags !== TypeFlag.Container) {
      throw new TypeError(`A dependency on the container can only be a direct dependency`, originalType);
    }

    return [type, flags];
  }

  resolveAliases(aliases?: TypeNode): Type[] {
    if (!aliases) {
      return [];
    } else if (Node.isUndefinedKeyword(aliases)) {
      return [];
    } else if (Node.isTupleTypeNode(aliases)) {
      return aliases.getElements().map((el) => el.getType());
    } else {
      return [aliases.getType()];
    }
  }

  resolveNullable(type: Type, flags: TypeFlag): [type: Type, flags: TypeFlag] {
    const nonNullable = type.getNonNullableType();
    return nonNullable !== type ? [nonNullable, flags | TypeFlag.Optional] : [type, flags];
  }

  resolveClassTypes(declaration: ClassDeclaration): Type[] {
    const types: Set<Type> = new Set();
    let cursor: ClassDeclaration | undefined = declaration;

    while (cursor) {
      for (const ifc of cursor.getImplements()) {
        types.add(ifc.getType());

        const impl = ifc.getExpression();

        if (Node.isIdentifier(impl)) {
          const parents = impl.getDefinitionNodes().flatMap((node) =>
            Node.isClassDeclaration(node)
            ? this.resolveClassTypes(node)
              : Node.isInterfaceDeclaration(node)
              ? this.resolveInterfaceTypes(node)
              : []
          );

          for (const parent of parents) {
            types.add(parent);
          }
        }
      }

      const parent: ClassDeclaration | undefined = cursor.getBaseClass();
      parent && types.add(parent.getType());
      cursor = parent;
    }

    return [...types];
  }

  resolveInterfaceTypes(declaration: InterfaceDeclaration): Type[] {
    const types: Set<Type> = new Set();
    const queue: (ClassDeclaration | InterfaceDeclaration | TypeAliasDeclaration)[] = [declaration];
    let cursor: ClassDeclaration | InterfaceDeclaration | TypeAliasDeclaration | undefined;

    while (cursor = queue.shift()) {
      if (Node.isClassDeclaration(cursor)) {
        for (const classType of this.resolveClassTypes(cursor)) {
          types.add(classType);
        }
      } else if (Node.isInterfaceDeclaration(cursor)) {
        for (const ifc of cursor.getBaseDeclarations()) {
          types.add(ifc.getType());
          queue.push(ifc);
        }
      } else {
        types.add(cursor.getType());
      }
    }

    return [...types];
  }

  resolveFactorySignature(factory: Type): [signature: Signature, method?: string] {
    const ctors = factory.getConstructSignatures();

    if (!ctors.length) {
      return [this.getFirstSignature(factory.getCallSignatures(), factory)];
    }

    const publicCtors = ctors.filter((ctor) => {
      try {
        const declaration = ctor.getDeclaration();

        return Node.isConstructorDeclaration(declaration)
          && !declaration.hasModifier(SyntaxKind.PrivateKeyword)
          && !declaration.hasModifier(SyntaxKind.ProtectedKeyword)
      } catch {
        return true; // this would happen if a class has no explicit constructor -
                     // in that case we'd get a construct signature, but no declaration
      }
    });

    if (!publicCtors.length) {
      const cprop = factory.getProperty('create');
      const csig = cprop?.getTypeAtLocation(cprop.getValueDeclarationOrThrow()).getCallSignatures();
      return [this.getFirstSignature(csig ?? [], factory), 'create'];
    }

    return [this.getFirstSignature(publicCtors, factory), 'constructor'];
  }

  resolveAutoFactorySignature(type: Type): [signature?: Signature, method?: string] {
    const [prop, ...rest] = type.getProperties();

    if (!prop) {
      return [this.getFirstSignature(type.getCallSignatures(), type, false)];
    } else if (prop.getName() !== 'create' || rest.length) {
      return [];
    }

    const create = prop.getTypeAtLocation(prop.getDeclarations()[0]);
    return [this.getFirstSignature(create.getCallSignatures(), type, false), 'create'];
  }

  resolveArgumentInfo(symbol: Symbol): ArgumentInfo {
    const name = symbol.getName();
    const declaration = symbol.getValueDeclarationOrThrow();
    let [type, flags] = this.resolveType(declaration.getType());

    if (Node.isParameterDeclaration(declaration) && declaration.hasInitializer()) {
      flags |= TypeFlag.Optional;
    }

    return type.isClassOrInterface() || type.isObject()
      ? { name, type, flags }
      : { name, flags };
  }

  * resolveContainerPublicServices(type: Type): Iterable<[string, Type]> {
    const declaration = type.getSymbol()?.getValueDeclaration();

    if (!declaration) {
      return;
    }

    const prop = type.getProperty(findSymbolProp(this.getServiceMapSymbolType()));
    const map = prop?.getTypeAtLocation(declaration).getNonNullableType();

    if (!map) {
      return;
    }

    for (const prop of map.getProperties()) {
      if (!prop.getName().startsWith('#')) {
        yield [prop.getName(), prop.getTypeAtLocation(declaration)];
      }
    }
  }

  private getFirstSignature(signatures: Signature[], ctx: Type, need?: true): Signature;
  private getFirstSignature(signatures: Signature[], ctx: Type, need: false): Signature | undefined;
  private getFirstSignature([first, ...rest]: Signature[], ctx: Type, need?: boolean): Signature | undefined {
    if (!first) {
      if (need === false) {
        return undefined;
      }

      throw new TypeError(`No call or construct signatures found on service factory`, ctx);
    } else if (rest.length) {
      throw new TypeError(`Multiple overloads on service factories aren't supported`, ctx);
    }

    return first;
  }

  resolveRootType(type: Type): Type {
    let target: Type | undefined;

    while ((target = type.getTargetType()) && target !== type) {
      type = target;
    }

    return target ?? type;
  }

  createReferenceResolver(moduleName: string): ReferenceResolver {
    return new ReferenceResolver(this.project, this, moduleName);
  }

  * getContainerMethodCalls(methodName: string): Iterable<CallExpression> {
    const method = this.refs
      .get('Container', SyntaxKind.ClassDeclaration)
      .getInstanceMethodOrThrow(methodName);

    for (const r1 of method.findReferences()) {
      for (const r2 of r1.getReferences()) {
        if (!r2.isDefinition()) {
          const call = r2.getNode().getFirstAncestorByKind(SyntaxKind.CallExpression);

          if (call) {
            yield call;
          }
        }
      }
    }
  }

  isContainer(type: Type): boolean {
    if (!type.isClass()) {
      return false;
    }

    this.containerType ??= this.resolveRootType(this.refs.get('Container', SyntaxKind.ClassDeclaration).getType());
    const queue: Type[] = [type];

    for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
      if (this.resolveRootType(t) === this.containerType) {
        return true;
      }

      queue.push(...t.getBaseTypes());
    }

    return false;
  }

  resolveNestedContainerParameters(declaration: InterfaceDeclaration, type: Type, aliases: Type[]): Map<Type, NestedParameterInfo> | undefined {
    this.containerParametersType ??= this.resolveRootType(this.refs.get('ContainerParameters', SyntaxKind.InterfaceDeclaration).getType());

    if (type !== this.containerParametersType && !aliases.includes(this.containerParametersType)) {
      return undefined;
    }

    const map: Map<Type, NestedParameterInfo> = new Map();
    const queue: [type: Type, path: string, flags: TypeFlag][] = [[type, '', TypeFlag.None]];

    while (queue.length) {
      const [parent, path, flags] = queue.shift()!;

      for (const prop of parent.getProperties()) {
        let [ptype, pflags] = this.resolveNullable(prop.getTypeAtLocation(declaration), flags);
        const ppath = `${path}${prop.getName()}`;

        if (ptype.isArray()) {
          ptype = ptype.getArrayElementTypeOrThrow();
          pflags |= TypeFlag.Array;
        }

        if (!ptype.isAnonymous()) {
          map.set(ptype, {
            path: ppath,
            flags: pflags,
          });
        }

        if (!(pflags & TypeFlag.Array) && (ptype.isObject() || ptype.isClass() || ptype.isInterface())) {
          queue.push([ptype, `${ppath}.`, pflags]);
        }
      }
    }

    return map;
  }

  private getServiceMapSymbolType(): Type {
    return this.serviceMapSymbolType ??= this.refs.get('ServiceMap', SyntaxKind.VariableDeclaration).getType();
  }
}

function findSymbolProp(symbol: Type) {
  return (prop: Symbol) => {
    const d = prop.getValueDeclaration();

    if (!Node.isPropertyDeclaration(d)) {
      return false;
    }

    const n = d.getNameNode();

    if (!Node.isComputedPropertyName(n)) {
      return false;
    }

    return n.getExpression().getType() === symbol;
  };
}
