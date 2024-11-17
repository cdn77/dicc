import {
  ClassDeclaration,
  Expression,
  FunctionDeclaration,
  InterfaceDeclaration,
  Node,
  ObjectLiteralExpression,
  SatisfiesExpression,
  SourceFile,
  Type,
  TypeNode,
} from 'ts-morph';
import { ContainerBuilder, ServiceAdded } from '../container';
import {
  ArgumentOverride,
  CallableDefinition,
  PromiseType,
  SingleType,
  ExplicitServiceDefinitionOptions,
  ServiceDefinition,
  AutoImplementedMethod,
  OverrideDefinition,
  LocalServiceDefinition,
} from '../definitions';
import { DefinitionError, UserCodeContext } from '../errors';
import { EventSubscription } from '../events';
import { DeclarationNode, DeclarationNodeDiscovered, TypeHelper } from '../utils';
import { CompilerExtension } from './compilerExtension';
import { getPropertyLiteralValueIfKind, subpath, validateServiceScope } from './helpers';

export class ServicesExtension extends CompilerExtension {
  private readonly pendingAutoImplements: Map<Type, PendingAutoImplement> = new Map();

  constructor(
    private readonly typeHelper: TypeHelper,
  ) {
    super();
  }

  * getSubscribedEvents(): Iterable<EventSubscription<any>> {
    yield DeclarationNodeDiscovered.sub((evt) => this.scanNode(evt.resource, evt.path, evt.node, evt.builder));
    yield ServiceAdded.sub((evt) => this.tryAutoImplement(evt.service));
  }

  private scanNode(resource: SourceFile, path: string, node: DeclarationNode, builder: ContainerBuilder): void {
    const ctx: UserCodeContext = { builder, resource, path, node };

    if (Node.isClassDeclaration(node)) {
      this.scanClassDeclaration(node, ctx);
    } else if (Node.isInterfaceDeclaration(node)) {
      this.scanInterfaceDeclaration(node, ctx);
    } else if (Node.isSatisfiesExpression(node)) {
      this.scanSatisfiesExpression(node, ctx);
    } else if (Node.isFunctionDeclaration(node) || Node.isExpression(node)) {
      this.scanExpression(node, ctx);
    }
  }

  private scanClassDeclaration(node: ClassDeclaration, ctx: UserCodeContext): void {
    if (node.getTypeParameters().length) {
      return;
    }

    const type = node.getType();
    const aliases = this.typeHelper.resolveAliases(type);

    ctx.builder.addImplicitDefinition(ctx.resource, ctx.path, type, {
      aliases,
      factory: this.typeHelper.resolveFactory(type, ctx),
      node,
      declaration: node,
      container: this.typeHelper.isContainer(type, ...aliases),
    });
  }

  private scanInterfaceDeclaration(node: InterfaceDeclaration, ctx: UserCodeContext): void {
    if (node.getTypeParameters().length) {
      return;
    }

    const type = node.getType();

    ctx.builder.addImplicitDefinition(ctx.resource, ctx.path, type, {
      aliases: this.typeHelper.resolveAliases(type),
      node,
      declaration: node,
    });
  }

  private scanExpression(
    node: FunctionDeclaration | Expression,
    ctx: UserCodeContext,
  ): void {
    const nodeIsExpression = Node.isExpression(node);

    if (!nodeIsExpression && node.getTypeParameters().length) {
      return;
    }

    const factory = this.typeHelper.resolveFactory(node.getType(), ctx, !nodeIsExpression);

    if (!factory) {
      if (nodeIsExpression) {
        return;
      }

      throw new DefinitionError('Unable to resolve factory signature', ctx);
    }

    let rtn = factory.returnType;

    if (!rtn) {
      return;
    } else if (rtn instanceof PromiseType) {
      rtn = rtn.value;
    }

    const [aliases, declaration] = rtn instanceof SingleType
      ? [this.typeHelper.resolveAliases(rtn.type), this.typeHelper.resolveDeclaration(rtn.type)]
      : [];

    ctx.builder.addImplicitDefinition(ctx.resource, ctx.path, rtn.type, {
      aliases,
      factory,
      node,
      declaration,
      container: this.typeHelper.isContainer(rtn.type, ...aliases ?? []),
    });
  }

  private scanSatisfiesExpression(node: SatisfiesExpression, ctx: UserCodeContext): void {
    const typeNode = node.getTypeNode();

    if (!Node.isTypeReference(typeNode) || !this.typeHelper.isServiceDefinition(typeNode.getTypeName().getType())) {
      return;
    }

    const [typeArg, aliasArg] = typeNode.getTypeArguments();
    const type = typeArg.getType();
    const aliases = aliasArg
      ? this.resolveExplicitAliases(aliasArg)
      : this.typeHelper.resolveAliases(type);
    const expression = node.getExpression();
    const [factoryType, options] = this.resolveExplicitDefinition(expression, { ...ctx, node: expression });
    let declaration = factoryType ? this.typeHelper.resolveDeclaration(factoryType) : undefined;
    const factoryCtx = options.object ? subpath(ctx, 'factory') : ctx;
    const factory = declaration
      ? this.typeHelper.resolveFactory(declaration.getType(), factoryCtx)
      : factoryType
        ? this.typeHelper.resolveFactory(factoryType, factoryCtx)
        : undefined;

    if (!declaration && factory && factory.returnType && factory.returnType) {
      const returnType = factory.returnType instanceof PromiseType
        ? factory.returnType.value.type
        : factory.returnType.type;
      declaration = this.typeHelper.resolveDeclaration(returnType);
    }

    ctx.builder.addExplicitDefinition(ctx.resource, ctx.path, type, {
      factory,
      node,
      declaration,
      aliases,
      ...options,
      container: this.typeHelper.isContainer(type, ...aliases),
    });
  }

  private resolveExplicitAliases(aliases: TypeNode): Type[] {
    const type = aliases.getType();

    return type.isUnknown() ? []
      : type.isIntersection() ? type.getIntersectionTypes()
        : [type];
  }

  private resolveExplicitDefinition(node: Expression, ctx: UserCodeContext): [Type | undefined, ExplicitServiceDefinitionOptions] {
    if (!Node.isObjectLiteralExpression(node)) {
      const type = node.getType();
      return [type.isUndefined() ? undefined : type, {}];
    }

    let factoryType = node.getProperty('factory')?.getType();

    if (factoryType?.isUndefined()) {
      factoryType = undefined;
    }

    const args = this.resolveArgumentOverrides(getPropertyLiteralValueIfKind(node, 'args', 'object'), subpath(ctx, 'args'));
    const scope = getPropertyLiteralValueIfKind(node, 'scope', 'string', subpath(ctx, 'scope'), validateServiceScope);
    const anonymous = getPropertyLiteralValueIfKind(node, 'anonymous', 'boolean');
    const onCreate = this.typeHelper.resolveCallableProperty(node, 'onCreate', ctx);
    const onFork = this.typeHelper.resolveCallableProperty(node, 'onFork', ctx);
    const onDestroy = this.typeHelper.resolveCallableProperty(node, 'onDestroy', ctx);
    return [factoryType, { object: true, args, scope, anonymous, onCreate, onFork, onDestroy }];
  }

  private resolveArgumentOverrides(
    args: ObjectLiteralExpression | undefined,
    ctx: UserCodeContext,
  ): Map<string | number, ArgumentOverride> | undefined {
    if (!args) {
      return undefined;
    }

    const map: Map<string | number, ArgumentOverride> = new Map();

    for (const prop of args.getProperties()) {
      if (!Node.isPropertyNamed(prop)) {
        throw new DefinitionError(`Invalid service arguments, not a named property`, { ...ctx, node: prop });
      }

      const type = prop.getType();
      const name = prop.getName();
      const signature = this.typeHelper.resolveCallSignature(type, subpath({ ...ctx, node: prop }, name));
      const arg = /^\d+$/.test(name) ? parseInt(name, 10) : name;

      if (signature) {
        map.set(arg, new CallableDefinition(
          ctx.resource,
          `${ctx.path}.${name}`,
          this.typeHelper.resolveArguments(signature, prop),
          ...this.typeHelper.resolveReturnType(signature),
          prop,
        ));
      } else {
        map.set(arg, new OverrideDefinition(
          ctx.resource,
          `${ctx.path}.${name}`,
          this.typeHelper.resolveValueType(type, prop),
        ));
      }
    }

    return map;
  }

  private tryAutoImplement(definition: ServiceDefinition): void {
    if (!definition.isLocal()) {
      return;
    }

    const pending = this.pendingAutoImplements.get(definition.type);

    if (pending && pending.factory.builder === definition.builder) {
      this.pendingAutoImplements.delete(definition.type);

      pending.factory.autoImplement = {
        method: pending.method,
        service: definition,
      };

      if (pending.method.name === 'create') {
        definition.builder.removeService(definition);
      }
    }

    if (
      !definition.declaration
      || (definition.factory && definition.factory.method !== 'constructor')
      || definition.autoImplement
    ) {
      return;
    }

    const method = this.typeHelper.resolveAutoImplementedMethod(definition.declaration, {
      builder: definition.builder,
      resource: definition.resource,
      path: definition.path,
      node: definition.node,
    });

    if (!method) {
      return;
    }

    const targetType = method.returnType instanceof PromiseType
      ? method.returnType.value.type
      : method.returnType.type;

    const [service, nonUnique] = definition.builder.findByType(targetType);

    if (nonUnique) {
      return;
    } else if (!service) {
      this.pendingAutoImplements.set(targetType, { method, factory: definition });
      return;
    } else if (!service.isLocal()) {
      return;
    }

    if (method.name === 'create') {
      definition.builder.removeService(service);
    }

    definition.autoImplement = { method, service };
  }
}

type PendingAutoImplement = {
  method: AutoImplementedMethod;
  factory: LocalServiceDefinition;
};
