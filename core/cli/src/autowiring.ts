import { ServiceScope } from 'dicc';
import { Type } from 'ts-morph';
import { ServiceRegistry } from './serviceRegistry';
import {
  CallbackInfo,
  ParameterInfo,
  ServiceDecoratorInfo,
  ServiceDefinitionInfo,
  ServiceHooks,
  TypeFlag,
} from './types';

export class Autowiring {
  private readonly registry: ServiceRegistry;
  private readonly visitedServices: Set<ServiceDefinitionInfo> = new Set();
  private readonly visitedDecorators: Map<ServiceDecoratorInfo, Set<ServiceScope>> = new Map();
  private readonly resolving: string[] = [];

  constructor(registry: ServiceRegistry) {
    this.registry = registry;
  }

  checkDependencies(): void {
    this.registry.applyDecorators();

    for (const definition of this.registry.getDefinitions()) {
      this.checkServiceDependencies(definition);
    }

    // needs to run after all dependencies have been fully resolved
    for (const definition of this.registry.getDefinitions()) {
      this.checkCyclicDependencies(definition);
    }
  }

  getTypeId(type: Type): string | undefined {
    return this.registry.getTypeId(type);
  }

  isAsync(type: Type): boolean {
    return this.registry.getByType(type).some((def) => def.async);
  }

  private checkServiceDependencies(definition: ServiceDefinitionInfo): void {
    if (!this.visitService(definition)) {
      return;
    }

    const scope = this.resolveScope(definition);

    if (definition.factory) {
      if (this.checkParameters(definition.factory.parameters, `service '${definition.id}'`, scope, definition.args)) {
        definition.factory.async = true;
      }

      if (definition.factory.async) {
        definition.async = true;
      }
    }

    if (this.checkHooks(definition.hooks, `service '${definition.id}'`, scope)) {
      definition.async = true;
    }

    const flags = this.checkDecorators(definition.decorators, scope);
    flags.asyncDecorate && definition.factory && (definition.factory.async = true);
    flags.asyncDecorate || flags.asyncOnCreate && (definition.async = true);
  }

  private resolveScope(definition: ServiceDefinitionInfo): ServiceScope {
    const decoratorWithScope = definition.decorators.findLast((decorator) => decorator.scope !== undefined);
    return decoratorWithScope?.scope ?? definition.scope ?? 'global';
  }

  private checkHooks(hooks: ServiceHooks, target: string, scope: ServiceScope): boolean {
    for (const hook of ['onCreate', 'onFork', 'onDestroy'] as const) {
      const info = hooks[hook];

      if (!info) {
        continue;
      }

      if (this.checkParameters(info.parameters, `'${hook}' hook of ${target}`, scope)) {
        info.async = true;
      }
    }

    return hooks.onCreate?.async ?? false;
  }

  private checkDecorators(decorators: ServiceDecoratorInfo[], scope: ServiceScope): DecoratorFlags {
    const flags: DecoratorFlags = {};

    for (const decorator of decorators) {
      this.checkDecorator(decorator, scope, flags);
    }

    return flags;
  }

  private checkDecorator(decorator: ServiceDecoratorInfo, scope: ServiceScope, flags: DecoratorFlags): void {
    if (!this.visitDecorator(decorator, scope)) {
      decorator.decorate?.async && (flags.asyncDecorate = true);
      decorator.hooks.onCreate?.async && (flags.asyncOnCreate = true);
      return;
    }

    if (decorator.decorate) {
      if (this.checkParameters(decorator.decorate.parameters, `decorator '${decorator.path}'`, scope)) {
        decorator.decorate.async = true;
      }

      if (decorator.decorate.async) {
        flags.asyncDecorate = true;
      }
    }

    if (this.checkHooks(decorator.hooks, `decorator '${decorator.path}'`, scope)) {
      flags.asyncOnCreate = true;
    }
  }

  private checkParameters(
    parameters: ParameterInfo[],
    target: string,
    scope: ServiceScope,
    args?: Record<string, CallbackInfo | undefined>,
  ): boolean {
    let async = false;

    for (const parameter of parameters) {
      if (args && parameter.name in args) {
        const arg = args[parameter.name];

        if (arg && this.checkParameters(arg.parameters, `argument '${parameter.name}' of ${target}`, scope)) {
          async = true;
        }
      } else if (this.checkParameter(parameter, target, scope)) {
        async = true;
      }
    }

    return async;
  }

  private checkParameter(parameter: ParameterInfo, target: string, scope: ServiceScope): boolean {
    if (parameter.flags & TypeFlag.Container) {
      return false;
    }

    const candidates = parameter.type && this.registry.getByType(parameter.type);

    if (!candidates || !candidates.length) {
      if (parameter.flags & TypeFlag.Optional) {
        return false;
      }

      throw new Error(
        parameter.flags & TypeFlag.Injector
          ? `Unknown service type in injector '${parameter.name}' of ${target}`
          : `Unable to autowire non-optional parameter '${parameter.name}' of ${target}`
      );
    } else if (candidates.length > 1 && !(parameter.flags & (TypeFlag.Array | TypeFlag.Iterable))) {
      throw new Error(`Multiple services for parameter '${parameter.name}' of ${target} found`);
    } else if (parameter.flags & TypeFlag.Injector) {
      if (candidates[0].scope === 'private') {
        throw new Error(`Cannot inject injector for privately-scoped service '${candidates[0].id}' into ${target}`);
      }

      return false;
    }

    let async = false;

    for (const candidate of candidates) {
      this.checkServiceDependencies(candidate);

      if (scope === 'global' && candidate.scope === 'local' && !(parameter.flags & TypeFlag.Accessor)) {
        throw new Error(`Cannot inject locally-scoped service '${candidate.id}' into globally-scoped ${target}`);
      }

      if (candidate.factory?.async && !(parameter.flags & TypeFlag.Async)) {
        if (parameter.flags & (TypeFlag.Accessor | TypeFlag.Iterable)) {
          throw new Error(`Cannot inject async service '${candidate.id}' into synchronous accessor or iterable parameter '${parameter.name}' of ${target}`);
        }

        async = true;
      }
    }

    return async;
  }

  private checkCyclicDependencies(definition: ServiceDefinitionInfo): void {
    this.checkCyclicDependency(definition.id);

    for (const param of definition.factory?.parameters ?? []) {
      this.checkParameterDependencies(param);
    }

    for (const param of definition.hooks?.onCreate?.parameters ?? []) {
      this.checkParameterDependencies(param);
    }

    for (const param of definition.decorators.flatMap((d) => [...d.decorate?.parameters ?? [], ...d.hooks.onCreate?.parameters ?? []])) {
      this.checkParameterDependencies(param);
    }

    this.releaseCyclicDependencyCheck(definition.id);
  }

  private checkParameterDependencies(param: ParameterInfo): void {
    if (param.flags & (TypeFlag.Async | TypeFlag.Accessor | TypeFlag.Iterable)) {
      return;
    }

    const candidates = param.type && this.registry.getByType(param.type);

    for (const candidate of candidates ?? []) {
      this.checkCyclicDependencies(candidate);
    }
  }

  private checkCyclicDependency(id: string): void {
    const idx = this.resolving.indexOf(id);

    if (idx > -1) {
      throw new Error(`Cyclic dependency detected: ${this.resolving.join(' → ')} → ${id}`);
    }

    this.resolving.push(id);
  }

  private releaseCyclicDependencyCheck(id: string): void {
    const last = this.resolving.pop();

    if (last !== id) {
      throw new Error(`Dependency chain checker broken`);
    }
  }

  private visitService(definition: ServiceDefinitionInfo): boolean {
    if (this.visitedServices.has(definition)) {
      return false;
    }

    this.visitedServices.add(definition);
    return true;
  }

  private visitDecorator(decorator: ServiceDecoratorInfo, scope: ServiceScope): boolean {
    const scopes = this.visitedDecorators.get(decorator) ?? new Set();
    this.visitedDecorators.set(decorator, scopes);

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
