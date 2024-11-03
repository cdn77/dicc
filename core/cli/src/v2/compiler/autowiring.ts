import { ServiceScope } from 'dicc';
import { ContainerBuilder, ContainerReflector } from '../container';
import {
  AccessorType,
  Argument,
  ArgumentOverride,
  Callable,
  DecoratorDefinition,
  ExplicitServiceDefinition,
  ForeignServiceDefinition,
  InjectorType,
  IterableType,
  ListType,
  LocalServiceDefinition,
  PromiseType,
  ScopedRunnerType,
  ServiceDefinition,
} from '../definitions';
import {
  AutowiringError,
  ContainerContext,
  CyclicDependencyError,
  DefinitionError,
  InternalError,
} from '../errors';
import { filterMap, getFirst, getOrCreate, skip } from '../utils';

export class Autowiring {
  private readonly visitedContainers: Set<ContainerBuilder> = new Set();
  private readonly visitedServices: Set<ServiceDefinition> = new Set();
  private readonly visitedDecorators: Map<DecoratorDefinition, Set<ServiceScope>> = new Map();
  private readonly resolving: ServiceDefinition[] = [];

  constructor(
    private readonly reflector: ContainerReflector,
  ) {}

  checkDependencies(containers: Iterable<ContainerBuilder>): void {
    const reiterable = new Set(containers);

    this.mergeForeignContainers(reiterable);

    for (const builder of reiterable) {
      this.checkContainer(builder);
    }
  }

  private mergeForeignContainers(containers: Iterable<ContainerBuilder>): void {
    for (const builder of containers) {
      for (const child of builder.services) {
        if (child.isLocal() && child.container) {
          this.mergeForeignServices(builder, child);
        }
      }
    }
  }

  private mergeForeignServices(builder: ContainerBuilder, definition: LocalServiceDefinition): void {
    const container = this.reflector.getContainerReflection(definition.type);

    for (const { id, type, aliases, async } of container.getPublicServices()) {
      builder.services.addForeignDefinition(builder, definition, id, type, aliases, async);
    }
  }

  private checkContainer(builder: ContainerBuilder): void {
    if (!this.visitContainer(builder)) {
      return;
    }

    const ctx: ContainerContext = { builder };

    for (const definition of builder.services) {
      this.checkServiceDependencies({ ...ctx, definition }, definition);
    }

    // needs to run after all dependencies have been fully resolved
    for (const definition of builder.services) {
      this.checkCyclicDependencies(builder, definition);
    }
  }

  private checkServiceDependencies(ctx: ContainerContext, definition: ServiceDefinition): void {
    if (!this.visitService(definition)) {
      return;
    }

    if (definition.isLocal()) {
      definition.decorators ??= ctx.builder.decorators.decorate(definition);
    }

    const scope = this.resolveScope(definition);

    if (definition.isLocal()) {
      this.checkLocalServiceDependencies(ctx, definition, scope);
    } else {
      this.checkForeignServiceDependencies(ctx, definition);
      return;
    }

    const flags = this.checkDecorators(ctx, definition.decorators!, scope);

    if (flags.asyncDecorate && definition.factory) {
      definition.factory.async = true;
    }

    if (flags.asyncDecorate || flags.asyncOnCreate) {
      definition.async = true;
    }
  }

  private checkLocalServiceDependencies(ctx: ContainerContext, definition: LocalServiceDefinition, scope: ServiceScope): void {
    if (definition.factory) {
      const overrides = definition.isExplicit() ? definition.args : undefined;
      // todo check for extraneous overrides

      if (this.checkArguments({ ...ctx, method: 'factory' }, definition.factory.args, scope, overrides)) {
        definition.factory.async = true;
      }

      if (definition.factory.returnType instanceof PromiseType) {
        definition.factory.async = true;
      }

      if (definition.factory.async) {
        definition.async = true;
      }
    }

    if (definition.autoImplement) {
      const { service: target, method } = definition.autoImplement;

      // todo:
      // tady to vyjebat do metody;
      // pokud je to auto-getter, neres (je to totez jako accessor);
      // pokud je to auto-factory, mozna pouzij check service deps..?

      if (target.factory) {
        for (const [name, arg] of method.args) {
          const dst = target.factory.args.get(name);

          if (!dst || !arg.rawType.isAssignableTo(dst.rawType)) {
            // todo behave better towards async values we might be able to await
            const msg = dst
              ? `doesn't exist in target factory`
              : `is not assignable to target factory argument of the same name`;

            throw new DefinitionError(`Manual argument of auto-implemented method ${msg}`, {
              builder: ctx.builder,
              resource: definition.resource,
              path: definition.path,
              node: definition.autoImplement.method.node,
            });
          }
        }

        const injectedArgs = filterMap(target.factory.args, (_, name) => !method.args.has(name));
        const overrides = target.isExplicit() ? target.args : undefined;

        if (this.checkArguments({ ...ctx, method: 'auto-implement' }, injectedArgs, scope, overrides) && !target.async) {
          throw new AutowiringError(`Auto-implemented method must return a Promise because target has async dependencies`, ctx);
        }
      }
    }

    if (definition.container && this.checkChildContainerDependencies(ctx.builder, definition)) {
      definition.factory && (definition.factory.async = true);
      definition.async = true;
    }

    if (definition.isExplicit() && this.checkHooks(ctx, definition, scope)) {
      definition.async = true;
    }
  }

  private checkChildContainerDependencies(builder: ContainerBuilder, definition: LocalServiceDefinition): boolean {
    definition.autoRegister ??= new Map(this.resolveChildDynamicServices(builder, definition));

    let async = false;

    for (const injectable of definition.autoRegister.values()) {
      this.checkServiceDependencies({ builder, definition: injectable }, injectable);

      if (injectable.async) {
        async = true;
      }
    }

    return async;
  }

  private checkForeignServiceDependencies(ctx: ContainerContext, definition: ForeignServiceDefinition): void {
    this.checkServiceDependencies({ builder: ctx.builder, definition: definition.container }, definition.container);

    if (definition.container.async) {
      definition.async = true;
    }

    const container = this.reflector.getContainerReflection(definition.container.type);
    const builder = container.getBuilder();

    if (builder) {
      this.checkContainer(builder);
    }

    const reflection = container.getPublicServiceById(definition.foreignId);

    if (reflection?.async) {
      definition.factory.async = true;
    }
  }

  private checkHooks(
    ctx: ContainerContext,
    definition: ExplicitServiceDefinition | DecoratorDefinition,
    scope: ServiceScope,
  ): boolean {
    for (const name of ['onCreate', 'onFork', 'onDestroy'] as const) {
      const hook = definition[name];

      if (!hook) {
        continue;
      }

      const args = new Map(skip(name === 'onFork' ? 2 : 1, hook.args));

      if (this.checkArguments({ ...ctx, method: name }, args, scope)) {
        hook.async = true;
      }

      if (hook.returnType instanceof PromiseType) {
        hook.async = true;
      }
    }

    return definition.onCreate?.async ?? false;
  }

  private checkDecorators(
    ctx: ContainerContext,
    decorators: DecoratorDefinition[],
    scope: ServiceScope,
  ): DecoratorFlags {
    const flags: DecoratorFlags = {};

    for (const decorator of decorators) {
      this.checkDecorator({ ...ctx, definition: decorator }, decorator, scope, flags);
    }

    return flags;
  }

  private checkDecorator(
    ctx: ContainerContext,
    decorator: DecoratorDefinition,
    scope: ServiceScope,
    flags: DecoratorFlags,
  ): void {
    if (!this.visitDecorator(decorator, scope)) {
      decorator.decorate?.async && (flags.asyncDecorate = true);
      decorator.onCreate?.async && (flags.asyncOnCreate = true);
      return;
    }

    if (decorator.decorate) {
      const args = new Map(skip(1, decorator.decorate.args));

      if (this.checkArguments({ ...ctx, method: 'decorate' }, args, scope)) {
        decorator.decorate.async = true;
      }

      if (decorator.decorate.returnType instanceof PromiseType) {
        decorator.decorate.async = true;
      }

      if (decorator.decorate.async) {
        flags.asyncDecorate = true;
      }
    }

    if (this.checkHooks(ctx, decorator, scope)) {
      flags.asyncOnCreate = true;
    }
  }

  private checkArguments(
    ctx: ContainerContext,
    args: Map<string, Argument>,
    scope: ServiceScope,
    overrides?: Map<string, ArgumentOverride>,
  ): boolean {
    let async = false;

    for (const [name, arg] of args) {
      const override = overrides?.get(name);

      if (override) {
        if (override instanceof Callable) {
          if (this.checkArguments({ ...ctx, method: 'override', argument: name }, override.args, scope)) {
            async = true;
          }
        } else {
          // todo check assignable & async
        }
      } else if (this.checkInjectableArgument({ ...ctx, argument: name }, arg, scope)) {
        async = true;
      }
    }

    return async;
  }

  private checkInjectableArgument(ctx: ContainerContext, arg: Argument, scope: ServiceScope): boolean {
    if (arg.type instanceof ScopedRunnerType) {
      return false;
    }

    for (const serviceType of arg.type.getInjectableTypes()) {
      const candidates = ctx.builder.services.findByType(serviceType);

      if (!candidates.size) {
        continue;
      }

      if (candidates.size > 1 && !(arg.type instanceof ListType || arg.type instanceof IterableType)) {
        throw new AutowiringError('Multiple services of matching type found', ctx);
      }

      if (arg.type instanceof InjectorType) {
        return this.checkInjector(ctx, getFirst(candidates));
      }

      return this.checkInjectionCandidates(ctx, arg, scope, candidates);
    }

    if (arg.optional || arg.type.nullable) {
      return false;
    }

    throw new AutowiringError(
      arg.type instanceof InjectorType
        ? 'Unknown service type in injector'
        : 'Unable to autowire non-optional argument',
      ctx,
    );
  }

  private checkInjector(ctx: ContainerContext, candidate: ServiceDefinition): boolean {
    if (candidate.isForeign()) {
      throw new AutowiringError('Cannot inject injector for a service from a foreign container', ctx);
    } else if (candidate.scope === 'private') {
      throw new AutowiringError(`Cannot inject injector for privately-scoped service '${candidate.path}'`, ctx);
    }

    ctx.builder.types.add(candidate.type);
    return false;
  }

  private checkInjectionCandidates(ctx: ContainerContext, arg: Argument, scope: ServiceScope, candidates: Iterable<ServiceDefinition>): boolean {
    let async = false;

    for (const candidate of candidates) {
      this.checkServiceDependencies({ builder: ctx.builder, definition: candidate }, candidate);

      if (candidate.isLocal() && scope === 'global' && candidate.scope === 'local' && !(arg.type instanceof AccessorType)) {
        throw new AutowiringError(
          `Cannot inject locally-scoped dependency '${candidate.path}' into globally-scoped service`,
          ctx,
        );
      }

      if (candidate.async && !(arg.type instanceof PromiseType)) {
        if (arg.type instanceof AccessorType || arg.type instanceof IterableType) {
          const desc = candidate.isLocal()
            ? `dependency '${candidate.path}'`
            : `foreign dependency '${candidate.foreignId}'`;

          throw new AutowiringError(
            `Cannot inject async ${desc} into synchronous accessor or iterable argument`,
            ctx,
          );
        }

        async = true;
      }

      ctx.builder.types.add(candidate.type);
    }

    return async;
  }

  private resolveScope(definition: ServiceDefinition): ServiceScope {
    if (!definition.isLocal()) {
      return 'global';
    }

    const decoratorWithScope = definition.decorators?.findLast((decorator) => decorator.scope !== undefined);
    return decoratorWithScope?.scope ?? definition.scope;
  }

  private * resolveChildDynamicServices(
    builder: ContainerBuilder,
    definition: LocalServiceDefinition,
  ): Iterable<[foreignId: string, localDefinition: ServiceDefinition]> {
    const container = this.reflector.getContainerReflection(definition.type);

    for (const service of container.getDynamicServices()) {
      const [candidate, more] = builder.services.findByAnyType(service.type, ...service.aliases);

      if (more) {
        throw new AutowiringError(
          `Multiple services can be autowired into merged container's dynamic service`,
          { builder, definition },
        );
      } else if (candidate) {
        yield [service.id, candidate];
      }
    }
  }

  private checkCyclicDependencies(builder: ContainerBuilder, definition: ServiceDefinition): void {
    this.checkCyclicDependency(definition);

    if (definition.isForeign()) {
      this.checkCyclicDependencies(builder, definition.container);
    } else {
      if (definition.factory) {
        for (const arg of definition.factory.args.values()) {
          this.checkArgumentDependencies(builder, arg);
        }
      }

      if (definition.isExplicit() && definition.onCreate) {
        for (const arg of skip(1, definition.onCreate.args.values())) {
          this.checkArgumentDependencies(builder, arg);
        }
      }

      if (definition.autoRegister) {
        for (const injectable of definition.autoRegister.values()) {
          this.checkCyclicDependencies(builder, injectable);
        }
      }

      if (definition.decorators) {
        for (const arg of definition.decorators.flatMap(getDecoratorArguments)) {
          this.checkArgumentDependencies(builder, arg);
        }
      }
    }

    this.releaseCyclicDependencyCheck(definition);
  }

  private checkArgumentDependencies(builder: ContainerBuilder, arg: Argument): void {
    if (
      arg.type instanceof PromiseType
      || arg.type instanceof AccessorType
      || arg.type instanceof IterableType
      || arg.type instanceof InjectorType
      || arg.type instanceof ScopedRunnerType
    ) {
      return;
    }

    for (const candidate of builder.services.findByType(arg.type.type)) {
      this.checkCyclicDependencies(builder, candidate);
    }
  }

  private checkCyclicDependency(definition: ServiceDefinition): void {
    const idx = this.resolving.indexOf(definition);

    if (idx > -1) {
      throw new CyclicDependencyError(...this.resolving.slice(idx), definition);
    }

    this.resolving.push(definition);
  }

  private releaseCyclicDependencyCheck(definition: ServiceDefinition): void {
    const last = this.resolving.pop();

    if (last !== definition) {
      throw new InternalError(`Dependency chain checker broken`);
    }
  }

  private visitContainer(builder: ContainerBuilder): boolean {
    if (this.visitedContainers.has(builder)) {
      return false;
    }

    this.visitedContainers.add(builder);
    return true;
  }

  private visitService(definition: ServiceDefinition): boolean {
    if (this.visitedServices.has(definition)) {
      return false;
    }

    this.visitedServices.add(definition);
    return true;
  }

  private visitDecorator(decorator: DecoratorDefinition, scope: ServiceScope): boolean {
    const scopes = getOrCreate(this.visitedDecorators, decorator, () => new Set());

    if (scopes.has(scope)) {
      return false;
    }

    scopes.add(scope);
    return true;
  }
}

type DecoratorFlags = {
  asyncDecorate?: boolean;
  asyncOnCreate?: boolean;
};

function getDecoratorArguments(decorator: DecoratorDefinition): Argument[] {
  return [
    ...skip(1, decorator.decorate?.args.values() ?? []),
    ...skip(1, decorator.onCreate?.args.values() ?? []),
  ];
}
