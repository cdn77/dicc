import {
  CallExpression,
  ClassDeclaration,
  InterfaceDeclaration,
  Node,
  PropertyName,
  Signature,
  SourceFile,
  SyntaxKind,
  Type,
  TypeAliasDeclaration,
  TypeNode,
  TypeReferenceNode,
} from 'ts-morph';
import { TypeError } from './errors';
import { ReferenceResolver } from './referenceResolver';
import { SourceFiles } from './sourceFiles';
import { ReferenceMap, TypeFlag } from './types';

const referenceSpecifiers = {
  Container: { kind: SyntaxKind.ClassDeclaration, module: 'dicc' },
  ServiceDefinition: { kind: SyntaxKind.TypeAliasDeclaration, module: 'dicc' },
  ServiceDecorator: { kind: SyntaxKind.TypeAliasDeclaration, module: 'dicc' },
  'Promise<T>': { kind: SyntaxKind.TypeAliasDeclaration },
  'Iterable<T>': { kind: SyntaxKind.TypeAliasDeclaration },
  'AsyncIterable<T>': { kind: SyntaxKind.TypeAliasDeclaration },
} as const satisfies ReferenceMap;

export class TypeHelper {
  private readonly helper: SourceFile;
  private readonly refs: ReferenceResolver<typeof referenceSpecifiers>;
  private resolvers: number = 0;
  private containerType?: Type;

  constructor(sourceFiles: SourceFiles) {
    this.helper = sourceFiles.getHelper();
    this.refs = this.createReferenceResolver(referenceSpecifiers);
  }

  destroy(): void {
    this.helper.forget();
  }

  isServiceDefinition(node?: TypeNode): node is TypeReferenceNode {
    return Node.isTypeReference(node)
      && this.resolveRootType(node.getTypeName().getType()) === this.refs.get('ServiceDefinition');
  }

  isServiceDecorator(node?: TypeNode): node is TypeReferenceNode {
    return Node.isTypeReference(node)
      && this.resolveRootType(node.getTypeName().getType()) === this.refs.get('ServiceDecorator');
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

  resolveServiceType(type: Type): [type: Type, async: boolean] {
    const target = this.resolveRootType(type);
    let async = false;

    if (target === this.refs.get('Promise<T>')) {
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
      const params = signatures[0].getParameters();
      const returnType = signatures[0].getReturnType();

      if (params.length === 0) {
        flags |= TypeFlag.Accessor;
        type = returnType;
      } else if (params.length === 1 && returnType.getText() === 'void') {
        flags |= TypeFlag.Injector;
        type = params[0].getValueDeclarationOrThrow().getType();
      }
    }

    const target = this.resolveRootType(type);

    if (target === this.refs.get('Promise<T>')) {
      [type, flags] = this.resolveNullable(type.getTypeArguments()[0], flags | TypeFlag.Async);
    } else if (target === this.refs.get('Iterable<T>')) {
      flags |= TypeFlag.Iterable;
      type = type.getTypeArguments()[0];
    } else if (target === this.refs.get('AsyncIterable<T>')) {
      flags |= TypeFlag.Async | TypeFlag.Iterable;
      type = type.getTypeArguments()[0];
    } else if (target === this.getContainerType()) {
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

  private getFirstSignature([first, ...rest]: Signature[], ctx: Type): Signature {
    if (!first) {
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

  createReferenceResolver<M extends ReferenceMap>(map: M): ReferenceResolver<M> {
    return new ReferenceResolver(this, this.helper, ++this.resolvers, map);
  }

  * getContainerMethodCalls(methodName: string): Iterable<CallExpression> {
    const method = this.refs.get('Container').getInstanceMethodOrThrow(methodName);

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

  getContainerType(): Type {
    return this.containerType ??= this.resolveRootType(this.refs.get('Container').getType());
  }
}
