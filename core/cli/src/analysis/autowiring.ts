import { ServiceScope } from 'dicc';
import { ContainerBuilder } from '../container';
import {
  AccessorType,
  InjectableType,
  InjectorType,
  IterableType,
  ListType,
  LocalServiceDefinition,
  PromiseType,
  ReturnType,
  ScopedRunnerType,
  ServiceDefinition,
  TupleType,
  ValueType,
} from '../definitions';
import { AutowiringError, ContainerContext } from '../errors';
import { getFirst, mapMap } from '../utils';
import { ContainerReflector } from './reflection';
import {
  AccessorInjectedArgument,
  Argument,
  AsyncMode,
  ChildServiceRegistrations,
  getAsyncMode,
  InjectedArgument,
  InjectorInjectedArgument,
  IterableInjectedArgument,
  ListInjectedArgument,
  SingleInjectedArgument,
  withAsync,
} from './results';
import { ServiceAnalyser } from './serviceAnalyser';

export interface AutowiringFactory {
  create(serviceAnalyser: ServiceAnalyser): Autowiring;
}

export type ArgumentInjectionOptions = {
  optional?: boolean;
  rest?: boolean;
};

export class Autowiring {
  constructor(
    private readonly reflector: ContainerReflector,
    private readonly serviceAnalyser: ServiceAnalyser,
  ) {}

  resolveArgumentInjection(
    ctx: ContainerContext,
    type: ValueType,
    options: ArgumentInjectionOptions,
    scope: ServiceScope,
  ): Argument | undefined {
    if (type instanceof TupleType) {
      return {
        kind: 'injected',
        mode: 'tuple',
        values: type.values.map((elemType, idx) => {
          const elem = this.resolveArgumentInjection(ctx, elemType, { optional: true }, scope);

          if (!elem) {
            throw new AutowiringError(`Unable to autowire tuple element #${idx}`, ctx);
          }

          return elem;
        }),
        spread: options.rest ?? false,
      };
    }

    if (type instanceof ScopedRunnerType) {
      return { kind: 'injected', mode: 'scoped-runner' };
    }

    for (const injectable of type.getInjectableTypes()) {
      const candidates = ctx.builder.findByType(injectable.serviceType);

      if (!candidates.size) {
        continue;
      }

      const argIsPromise = injectable instanceof PromiseType;
      const argIsList = (argIsPromise ? injectable.value : injectable) instanceof ListType;
      const argIsIterable = (argIsPromise ? injectable.value : injectable) instanceof IterableType;

      if (candidates.size > 1 && !argIsList && !argIsIterable) {
        throw new AutowiringError('Multiple services of matching type found', ctx);
      }

      if (injectable instanceof InjectorType) {
        return this.resolveInjector(ctx, getFirst(candidates));
      }

      return this.resolveInjection(ctx, injectable, options, candidates, scope);
    }

    if (options.optional) {
      return undefined;
    } else if (type.nullable) {
      return { kind: 'literal', source: 'undefined', async: 'none' };
    }

    console.log(type.type.getText());

    throw new AutowiringError(
      type instanceof InjectorType
        ? 'Unknown service type in injector'
        : 'Unable to autowire non-optional argument',
      ctx,
    );
  }

  private resolveInjector(ctx: ContainerContext, candidate: ServiceDefinition): InjectorInjectedArgument {
    if (candidate.isForeign()) {
      // or can we?
      throw new AutowiringError('Cannot inject injector for a service from a foreign container', ctx);
    } else if (candidate.scope === 'private') {
      throw new AutowiringError(`Cannot inject injector for privately-scoped service '${candidate.path}'`, ctx);
    } else if (candidate.factory) {
      throw new AutowiringError(`Cannot inject injector for non-dynamic service '${candidate.path}'`, ctx);
    }

    this.serviceAnalyser.analyseServiceDefinition(candidate, true);
    return { kind: 'injected', mode: 'injector', id: candidate.id };
  }

  private resolveInjection(
    ctx: ContainerContext,
    injectable: InjectableType,
    options: ArgumentInjectionOptions,
    candidates: Set<ServiceDefinition>,
    scope: ServiceScope,
  ): InjectedArgument {
    const argIsPromise = injectable instanceof PromiseType;
    const argIsAccessor = injectable instanceof AccessorType;
    const accessorIsAsync = argIsAccessor && injectable.returnType instanceof PromiseType;
    const argIsIterable = injectable instanceof IterableType;
    const alias = candidates.size > 1
      ? ctx.builder.getTypeName(injectable.aliasType)
      : getFirst(candidates).id;
    const async: (() => boolean)[] = [];

    for (const candidate of candidates) {
      const service = this.serviceAnalyser.analyseServiceDefinition(candidate, argIsAccessor);
      candidates.size > 1 && service.aliases.add(alias);

      if (scope === 'global' && service.scope === 'local' && !argIsAccessor) {
        throw new AutowiringError(
          `Cannot inject locally-scoped dependency '${service.id}' into globally-scoped service`,
          ctx,
        );
      }

      if (argIsPromise) {
        continue;
      }

      async.push(() => {
        if (!service.async) {
          return false;
        }

        if (argIsAccessor && !accessorIsAsync) {
          throw new AutowiringError(
            `Cannot inject synchronous accessor for async service '${service.id}'`,
            ctx,
          );
        }

        return true;
      });
    }

    if (argIsAccessor) {
      return this.accessor(injectable.returnType, alias, () => async.some((cb) => cb()));
    } else if (argIsIterable) {
      return this.iterable(options.rest ?? false, alias, getAsyncCb(injectable.async));
    } else if ((argIsPromise ? injectable.value : injectable) instanceof ListType) {
      return this.list(options.rest ?? false, alias, getAsyncCb());
    } else {
      return this.single(injectable, options.optional ?? false, alias, getAsyncCb());
    }

    function getAsyncCb(targetIsAsync: boolean = argIsPromise): () => AsyncMode {
      return () => {
        const hasAsyncCandidate = async.some((cb) => cb());
        return getAsyncMode(hasAsyncCandidate, targetIsAsync);
      };
    }
  }

  private single(type: InjectableType, optional: boolean, alias: string, async: () => AsyncMode): SingleInjectedArgument {
    return withAsync(async, {
      kind: 'injected',
      mode: 'single',
      alias,
      need: !optional && !type.nullable,
      spread: false,
    });
  }

  private list(spread: boolean, alias: string, async: () => AsyncMode): ListInjectedArgument {
    return withAsync(async, {
      kind: 'injected',
      mode: 'list',
      alias,
      spread,
    });
  }

  private iterable(spread: boolean, alias: string, async: () => AsyncMode): IterableInjectedArgument {
    return withAsync(async, {
      kind: 'injected',
      mode: 'iterable',
      alias,
      spread,
    });
  }

  private accessor(returnType: ReturnType, alias: string, async: () => boolean): AccessorInjectedArgument {
    return withAsync(async, {
      kind: 'injected',
      mode: 'accessor',
      alias,
      need: !returnType.nullable,
      target: returnType instanceof ListType ? 'list' : 'single',
    });
  }

  resolveChildServiceRegistrations(
    ctx: ContainerContext,
    definition: ServiceDefinition,
  ): ChildServiceRegistrations | undefined {
    if (!definition.isLocal() || !definition.container) {
      return undefined;
    }

    const definitions = this.getInjectableDynamicServices(
      ctx.builder,
      definition,
    );

    const services = mapMap(definitions, (foreignId, definition) => {
      const service = this.serviceAnalyser.analyseServiceDefinition(definition);
      const arg: SingleInjectedArgument = withAsync(() => getAsyncMode(service.async, false), {
        kind: 'injected',
        mode: 'single',
        alias: service.id,
        need: true,
        spread: false,
      });

      return [foreignId, arg];
    });

    return withAsync(hasAsync, { services });

    function hasAsync(): boolean {
      for (const arg of services.values()) {
        if (arg.async === 'await') {
          return true;
        }
      }

      return false;
    }
  }

  private getInjectableDynamicServices(
    parent: ContainerBuilder,
    child: LocalServiceDefinition,
  ): Map<string, ServiceDefinition> {
    const reflection = this.reflector.getContainerReflection(child);
    const services: Map<string, ServiceDefinition> = new Map();

    for (const service of reflection.getDynamicServices()) {
      const [candidate, extra] = parent.findByType(service.type);

      if (candidate && !extra && candidate.isLocal() && candidate.factory) {
        services.set(service.id, candidate);
      }
    }

    return services;
  }
}
