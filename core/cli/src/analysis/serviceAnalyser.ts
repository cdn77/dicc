import { ServiceScope } from 'dicc';
import { ContainerBuilder } from '../container';
import {
  ArgumentDefinition,
  ArgumentOverride,
  AutoImplementedMethod,
  CallableDefinition,
  DecoratorDefinition,
  FactoryDefinition,
  LiteralDefinition,
  ForeignServiceDefinition,
  LocalServiceDefinition,
  PromiseType,
  ServiceDefinition,
} from '../definitions';
import { ContainerContext, CyclicDependencyError, DefinitionError, InternalError } from '../errors';
import { mergeMaps } from '../utils';
import { Autowiring, AutowiringFactory } from './autowiring';
import {
  Argument,
  ArgumentList,
  AutoImplement,
  AutoImplementMethod,
  Call,
  Factory,
  ForeignTypeSpecifier,
  ForkHookInfo,
  getAsyncMode,
  HookInfo,
  IterableInjectedArgument,
  ListInjectedArgument,
  LiteralArgument,
  LocalTypeSpecifier,
  OverriddenArgument,
  OverrideCall,
  OverrideValue,
  Service,
  SingleInjectedArgument,
  TypeSpecifier,
  withAsync,
} from './results';

export class ServiceAnalyser {
  private readonly autowiring: Autowiring;
  private readonly visitedServices: Map<ServiceDefinition, Service> = new Map();
  private readonly excludedServices: Set<Service> = new Set();
  private readonly eagerCalls: Set<Call> = new Set();
  private readonly dependencyChains: ServiceDefinition[][] = [];
  private currentDependencyChain: ServiceDefinition[] = [];

  constructor(
    autowiringFactory: AutowiringFactory,
  ) {
    this.autowiring = autowiringFactory.create(this);
  }

  * getAnalysedServices(): Iterable<[ContainerBuilder, Service]> {
    for (const [definition, service] of this.visitedServices) {
      if (!this.excludedServices.has(service)) {
        yield [definition.builder, service];
      }
    }
  }

  analyseServiceDefinition(
    definition: ServiceDefinition,
    startDependencyChain: boolean = false,
    externalArgs?: Map<string | number, ArgumentOverride>,
  ): Service {
    this.checkCyclicDependencies(definition, startDependencyChain);

    const visited = this.visitedServices.get(definition);

    if (visited) {
      this.releaseCyclicDependencyCheck(definition, startDependencyChain);
      return visited;
    }

    const decorators = definition.builder.decorate(definition);
    const scope = this.resolveScope(definition, decorators);
    const service: Service = withAsync(() => isServiceAsync(service), {
      id: definition.id,
      type: this.resolveTypeSpecifier(definition),
      aliases: new Set(),
      async: false,
      scope,
      anonymous: isAnonymous(definition),
    });

    this.visitedServices.set(definition, service);

    const ctx: ContainerContext = {
      builder: definition.builder,
      definition,
    };

    service.factory = this.analyseFactory(ctx, definition, scope, externalArgs);
    service.register = this.autowiring.resolveChildServiceRegistrations(ctx, definition);
    service.decorate = this.analyseHook(ctx, 'decorate', definition, decorators, scope);
    service.onCreate = this.analyseHook(ctx, 'onCreate', definition, decorators, scope);
    service.onFork = this.analyseForkHook(ctx, definition, decorators);
    service.onDestroy = this.analyseHook(ctx, 'onDestroy', definition, decorators, scope);

    this.releaseCyclicDependencyCheck(definition, startDependencyChain);
    return service;
  }

  private analyseFactory(
    ctx: ContainerContext,
    definition: ServiceDefinition,
    scope: ServiceScope,
    externalArgs?: Map<string | number, ArgumentOverride>,
  ): Factory | AutoImplement | undefined {
    if (definition.isForeign()) {
      const parent = this.analyseServiceDefinition(definition.parent);
      const service = definition.definition && this.analyseServiceDefinition(definition.definition);

      return withAsync(() => service ? service.async : definition.async, {
        kind: 'foreign',
        container: withAsync(() => parent.async, {
          id: definition.parent.id,
        }),
        id: definition.foreignId,
      });
    }

    const overrides = mergeMaps(
      definition.isExplicit() ? definition.args : new Map(),
      externalArgs ?? new Map(),
    );

    const call = definition.factory
      ? this.analyseCall({ ...ctx, method: 'factory' }, definition.factory, scope, overrides)
      : undefined;

    if (!definition.autoImplement) {
      return call ? { kind: 'local', call } : undefined;
    }

    const method = this.analyseAutoImplementedMethod(
      ctx,
      definition.autoImplement.method,
      definition.autoImplement.service,
    );

    if (!call) {
      return { kind: 'auto-interface', method };
    }

    call.statement = call.statement.replace(/^new(?=\s)/, 'new class extends');
    return { kind: 'auto-class', call, method };
  }

  private analyseHook(
    ctx: ContainerContext,
    hook: 'decorate' | 'onCreate' | 'onDestroy',
    definition: ServiceDefinition,
    decorators: DecoratorDefinition[],
    scope: ServiceScope,
  ): HookInfo | undefined {
    const info: Omit<HookInfo, 'async'> = {
      calls: [],
      args: 0,
    };

    const overrides = indexedArgs('service');

    if (hook !== 'decorate' && definition.isExplicit() && definition[hook]) {
      const call = this.analyseCall({ ...ctx, method: hook }, definition[hook], scope, overrides);
      info.calls.push(call);
      info.args = Math.max(info.args, call.args.inject ? 2 : call.args.length ? 1 : 0);
    }

    for (const decorator of decorators) {
      if (decorator[hook]) {
        const call = this.analyseCall(
          { ...ctx, definition: decorator, method: hook },
          decorator[hook],
          scope,
          overrides,
        );

        info.calls.push(call);
        info.args = Math.max(info.args, call.args.inject ? 2 : call.args.length ? 1 : 0);
      }
    }

    return info.calls.length ? withAsync(hasAsyncCall, info) : undefined;

    function hasAsyncCall(): boolean {
      for (const call of info.calls) {
        if (call.async || call.args.async) {
          return true;
        }
      }

      return false;
    }
  }

  private analyseForkHook(
    ctx: ContainerContext,
    definition: ServiceDefinition,
    decorators: DecoratorDefinition[],
  ): ForkHookInfo | undefined {
    const containerCall = definition.isLocal() && definition.container;
    const serviceCall = definition.isExplicit() && definition.onFork
      ? this.analyseCall(
        { ...ctx, method: 'onFork' },
        definition.onFork,
        'global',
        indexedArgs('callback', 'service'),
      )
      : undefined;

    const args: number[] = [
      1, // at least (callback) must always be provided
      containerCall ? 2 : 0, // container call needs (callback, service)
      serviceCall // injected service call needs (callback, service, di), otherwise at most (callback, service)
        ? serviceCall.args.inject ? 3 : Math.min(serviceCall.args.length, 2)
        : 0,
    ];

    const info: ForkHookInfo = {
      args: 0,
      containerCall,
      serviceCall,
      calls: [],
    };

    for (const decorator of decorators) {
      if (decorator.onFork) {
        const call = this.analyseCall(
          { ...ctx, method: 'onFork', definition: decorator },
          decorator.onFork,
          'global',
          indexedArgs(serviceCall ? 'fork ?? service' : 'service'),
        );

        // injected decorator onFork hooks need the compiled call to have (cb, service, di),
        // otherwise (cb, service) if they have at least 1 argument
        args.push(call.args.inject ? 3 : call.args.length ? 2 : 0);
        info.calls.push(call);
      }
    }

    info.args = Math.max(...args);
    return info.containerCall || info.serviceCall || info.calls.length ? info : undefined;
  }

  private analyseAutoImplementedMethod(
    ctx: ContainerContext,
    method: AutoImplementedMethod,
    target: LocalServiceDefinition,
  ): AutoImplementMethod {
    const args = [...method.args.keys()];
    const service = this.analyseServiceDefinition(target, true, namedArgs(...args));
    const returnsPromise = method.returnType instanceof PromiseType;

    if (method.name === 'create') {
      this.excludedServices.add(service);

      if (returnsPromise) {
        return { name: 'create', args, async: true, service, eagerDeps: new Map() };
      }

      let eagerDeps: Map<string, Argument> | undefined;
      const getEagerDeps = () => eagerDeps ??= this.analyseAutoFactoryEagerDeps(service);

      return {
        name: 'create',
        args,
        async: false,
        get service() {
          getEagerDeps();
          return service;
        },
        get eagerDeps() {
          return getEagerDeps();
        },
      };
    }

    return withAsync(
      () => {
        if (service.async && !returnsPromise) {
          throw new DefinitionError(`Auto-implemented getter of async service doesn't return Promise`, {
            builder: ctx.builder,
            resource: method.resource,
            path: method.path,
            node: method.node,
          });
        }

        return returnsPromise;
      },
      { name: 'get', target: service.id, need: !method.returnType.nullable }
    );
  }

  private analyseAutoFactoryEagerDeps(service: Service): Map<string, Argument> {
    if (!service.factory || (service.factory.kind !== 'local' && service.factory.kind !== 'auto-class')) {
      throw new InternalError('This should not happen');
    }

    const deps: Map<string, Argument> = new Map(this.extractEagerArgs(service.factory.call));

    if (
      service.factory.kind === 'auto-class'
      && service.factory.method.name === 'create'
      && service.factory.method.eagerDeps.size
    ) {
      for (const [name, arg] of service.factory.method.eagerDeps) {
        deps.set(name, arg);
      }

      service.factory.method.eagerDeps.clear();
    }

    if (service.decorate && service.decorate.async) {
      Object.defineProperty(service.decorate, 'async', { get() { return false; } });

      for (const call of service.decorate.calls) {
        for (const [name, arg] of this.extractEagerArgs(call)) {
          deps.set(name, arg);
        }
      }
    }

    return deps;
  }

  private * extractEagerArgs(call: Call): Iterable<[string, Argument]> {
    if (call.async) {
      throw new Error(`Async call '${call.statement}(...)' in auto-implemented factory method cannot be resolved eagerly`);
    }

    Object.defineProperty(call.args, 'async', { get() { return false; } });
    let i = 0;

    for (const arg of call.args) {
      if (hasAsyncMode(arg) && arg.async === 'await') {
        this.eagerCalls.add(call);
        const name = `call${this.eagerCalls.size - 1}Arg${i}`;
        call.args.replace(i, { kind: 'literal', source: name, async: 'none' });
        yield [name, { ...arg, async: 'none' }];
      }

      ++i;
    }
  }

  private analyseCall(
    ctx: ContainerContext,
    callable: CallableDefinition,
    scope: ServiceScope,
    overrides?: Map<string | number, ArgumentOverride>,
  ): Call {
    const [pre, post] = callable instanceof FactoryDefinition && callable.method
      ? callable.method === 'constructor' ? ['new ', ''] : ['', `.${callable.method}`]
      : ['', ''];
    const resource = ctx.builder.getResourceAlias(callable.resource);

    return {
      resource,
      statement: `${pre}${resource}.${callable.path}${post}`,
      args: this.analyseArgs(ctx, callable.args, scope, overrides),
      async: callable.returnType instanceof PromiseType,
    };
  }

  private analyseArgs(
    ctx: ContainerContext,
    args: Map<string, ArgumentDefinition>,
    scope: ServiceScope,
    overrides?: Map<string | number, ArgumentOverride>,
  ): ArgumentList {
    const items: Argument[] = [];
    const result: Omit<ArgumentList, 'async'> = {
      inject: false,
      get length() { return items.length; },
      *[Symbol.iterator]() { yield * items; },
      replace(index: number, arg: Argument) { items[index] = arg; },
    };
    const undefs: Argument[] = [];

    for (const [name, arg] of args) {
      const override = overrides?.get(name) ?? overrides?.get(result.length);

      if (override) {
        const overridden = this.resolveOverride(ctx, arg, name, scope, override);
        items.push(...undefs.splice(0, undefs.length), overridden);

        if (overridden.kind === 'overridden' && overridden.value.kind === 'call') {
          overridden.value.args.inject && (result.inject = true);
        }
        continue;
      }

      const argument = this.autowiring.resolveArgumentInjection({ ...ctx, argument: name }, arg, scope);

      if (!argument) {
        undefs.push({ kind: 'literal', source: 'undefined', async: 'none' });
        continue;
      }

      items.push(...undefs.splice(0, undefs.length), argument);
      argument.kind === 'injected' && (result.inject = true);
    }

    return withAsync(hasAsyncArg, result);

    function hasAsyncArg(): boolean {
      for (const arg of result) {
        if (hasAsyncMode(arg) && arg.async === 'await') {
          return true;
        }
      }

      return false;
    }
  }

  private resolveOverride(
    ctx: ContainerContext,
    arg: ArgumentDefinition,
    name: string,
    scope: ServiceScope,
    override: ArgumentOverride,
  ): LiteralArgument | OverriddenArgument {
    if (override instanceof LiteralDefinition) {
      return { kind: 'literal', source: override.source, async: 'none' };
    }

    let value: OverrideCall | OverrideValue;

    if (override instanceof CallableDefinition) {
      const call = this.analyseCall({ ...ctx, method: 'override', argument: name }, override, scope);
      value = { kind: 'call', ...call };
    } else {
      const resource = ctx.builder.getResourceAlias(override.resource);
      const path = `${resource}.${override.path}`;
      value = { kind: 'value', resource, path, async: override.type instanceof PromiseType };
    }

    // async reflects the (return) type of the override in code, so it can be resolved here:
    const async = getAsyncMode(value.async, arg.type instanceof PromiseType);
    return { kind: 'overridden', value, async, spread: arg.rest };
  }

  private resolveScope(definition: ServiceDefinition, decorators: DecoratorDefinition[]): ServiceScope {
    const decoratorWithScope = decorators.findLast((decorator) => decorator.scope !== undefined);
    return decoratorWithScope?.scope ?? (definition.isLocal() ? definition.scope : 'global');
  }

  private resolveTypeSpecifier(definition: ForeignServiceDefinition): ForeignTypeSpecifier;
  private resolveTypeSpecifier(definition: LocalServiceDefinition): LocalTypeSpecifier;
  private resolveTypeSpecifier(definition: ServiceDefinition): TypeSpecifier;
  private resolveTypeSpecifier(definition: ServiceDefinition): TypeSpecifier {
    if (definition.isForeign()) {
      return {
        kind: 'foreign',
        container: this.resolveTypeSpecifier(definition.parent),
        id: definition.foreignId,
      };
    }

    const resource = definition.builder.getResourceAlias(definition.resource);

    return {
      kind: 'local',
      resource,
      path: `${resource}.${definition.path}`,
      indirect: definition.isExplicit() || !!(definition.factory && !definition.factory.method),
    };
  }

  private checkCyclicDependencies(definition: ServiceDefinition, startNewChain: boolean): void {
    if (startNewChain) {
      this.dependencyChains.push(this.currentDependencyChain);
      this.currentDependencyChain = [];
    }

    const idx = this.currentDependencyChain.indexOf(definition);

    if (idx < 0) {
      this.currentDependencyChain.push(definition);
      return;
    }

    throw new CyclicDependencyError(...this.currentDependencyChain.slice(idx), definition);
  }

  private releaseCyclicDependencyCheck(definition: ServiceDefinition, startedNewChain: boolean): void {
    if (definition !== this.currentDependencyChain.pop()) {
      throw new InternalError('Cyclic dependency checker is broken');
    }

    if (startedNewChain) {
      const previous = this.dependencyChains.pop();

      if (!previous || this.currentDependencyChain.length) {
        throw new InternalError('Cyclic dependency checker is broken');
      }

      this.currentDependencyChain = previous;
    }
  }
}

function indexedArgs(...values: string[]): Map<string | number, ArgumentOverride> {
  return new Map(values.map((value, i) => [i, new LiteralDefinition(value)]));
}

function namedArgs(...names: string[]): Map<string | number, ArgumentOverride> {
  return new Map(names.map((name) => [name, new LiteralDefinition(name)]));
}

function isServiceAsync(service: Service): boolean {
  switch (service.factory?.kind) {
    case 'local':
    case 'auto-class':
      if (service.factory.call.async || service.factory.call.args.async) {
        return true;
      }
      break;
    case 'foreign':
      if (service.factory.async || service.factory.container.async) {
        return true;
      }
      break;
  }

  if (service.factory?.kind === 'auto-class' || service.factory?.kind === 'auto-interface') {
    if (service.factory.method.name === 'create' && service.factory.method.eagerDeps.size) {
      return true;
    }
  }

  return service.register?.async
    || service.decorate?.async
    || service.onCreate?.async
    || false;
}

function isAnonymous(definition: ServiceDefinition): boolean {
  if (definition.isLocal()) {
    return !definition.isExplicit() || definition.anonymous;
  }

  return !definition.parent.isExplicit() || definition.parent.anonymous;
}

function hasAsyncMode(
  argument: Argument,
): argument is OverriddenArgument | SingleInjectedArgument | ListInjectedArgument | IterableInjectedArgument {
  switch (argument.kind) {
    case 'raw':
      return false;
    case 'injected':
      switch (argument.mode) {
        case 'scoped-runner':
        case 'injector':
        case 'accessor':
          return false;
      }
      break;
  }

  return true;
}
