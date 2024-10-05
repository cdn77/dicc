import { Logger } from '@debugr/core';
import { ServiceScope } from 'dicc';
import { Container } from './container';
import {
  CallbackInfo,
  ParameterInfo,
  ServiceDecoratorInfo,
  ServiceDefinitionInfo,
  ServiceHooks,
  TypeFlag,
} from './types';

export class Autowiring {
  private readonly visitedServices: Set<ServiceDefinitionInfo> = new Set();
  private readonly visitedDecorators: Map<ServiceDecoratorInfo, Set<ServiceScope>> = new Map();
  private readonly resolving: string[] = [];

  constructor(
    private readonly logger: Logger,
  ) {}

  checkDependencies(container: Container): void {
    for (const definition of container.getDefinitions()) {
      this.checkServiceDependencies(container, definition);
    }

    // needs to run after all dependencies have been fully resolved
    for (const definition of container.getDefinitions()) {
      this.checkCyclicDependencies(container, definition);
    }
  }

  private checkServiceDependencies(container: Container, info: ServiceDefinitionInfo): void {
    if (!this.visitService(info)) {
      return;
    }

    this.logger.debug(`Checking '${info.path}' dependencies...`);
    const scope = this.resolveScope(info);

    if (info.factory) {
      if (this.checkParameters(container, info.factory.parameters, `service '${info.path}'`, scope, info.args) && !info.factory.async) {
        this.logger.trace(`Marking '${info.path}' factory as async because one or more parameters need to be awaited`);
        info.factory.async = true;
      }

      if (info.factory.async && !info.async) {
        this.logger.trace(`Marking '${info.path}' as async because factory is async`);
        info.async = true;
      }
    }

    if (this.checkHooks(container, info.hooks, `service '${info.path}'`, scope) && !info.async) {
      this.logger.trace(`Marking '${info.path}' as async because its 'onCreate' hook is async`);
      info.async = true;
    }

    const flags = this.checkDecorators(container, info.decorators, scope);

    if (flags.asyncDecorate && info.factory && !info.factory.async) {
      this.logger.trace(`Marking '${info.path}' factory as async because it has an async decorator`);
      info.factory.async = true;
    }

    if ((flags.asyncDecorate || flags.asyncOnCreate) && !info.async) {
      this.logger.trace(`Marking '${info.path}' as async because it has an async decorator`);
      info.async = true;
    }
  }

  private resolveScope(definition: ServiceDefinitionInfo): ServiceScope {
    const decoratorWithScope = definition.decorators.findLast((decorator) => decorator.scope !== undefined);
    return decoratorWithScope?.scope ?? definition.scope ?? 'global';
  }

  private checkHooks(container: Container, hooks: ServiceHooks, target: string, scope: ServiceScope): boolean {
    for (const hook of ['onCreate', 'onFork', 'onDestroy'] as const) {
      const info = hooks[hook];

      if (!info) {
        continue;
      }

      this.logger.debug(`Checking ${target} '${hook}' hook...`);

      if (this.checkParameters(container, info.parameters, `'${hook}' hook of ${target}`, scope) && !info.async) {
        this.logger.trace(`Marking '${hook}' hook of ${target} as async because one or more parameters need to be awaited`);
        info.async = true;
      }
    }

    return hooks.onCreate?.async ?? false;
  }

  private checkDecorators(container: Container, decorators: ServiceDecoratorInfo[], scope: ServiceScope): DecoratorFlags {
    const flags: DecoratorFlags = {};

    for (const decorator of decorators) {
      this.checkDecorator(container, decorator, scope, flags);
    }

    return flags;
  }

  private checkDecorator(container: Container, decorator: ServiceDecoratorInfo, scope: ServiceScope, flags: DecoratorFlags): void {
    if (!this.visitDecorator(decorator, scope)) {
      decorator.decorate?.async && (flags.asyncDecorate = true);
      decorator.hooks.onCreate?.async && (flags.asyncOnCreate = true);
      return;
    }

    if (decorator.decorate) {
      if (this.checkParameters(container, decorator.decorate.parameters, `decorator '${decorator.path}'`, scope)) {
        this.logger.trace(`Marking decorator '${decorator.path}' as async because one or more parameters need to be awaited`);
        decorator.decorate.async = true;
      }

      if (decorator.decorate.async) {
        flags.asyncDecorate = true;
      }
    }

    if (this.checkHooks(container, decorator.hooks, `decorator '${decorator.path}'`, scope)) {
      this.logger.trace(`Marking decorator '${decorator.path}' as async because its 'onCreate' hook is async`);
      flags.asyncOnCreate = true;
    }
  }

  private checkParameters(
    container: Container,
    parameters: ParameterInfo[],
    target: string,
    scope: ServiceScope,
    args?: Record<string, CallbackInfo | undefined>,
  ): boolean {
    let async = false;

    for (const parameter of parameters) {
      if (args && parameter.name in args) {
        const arg = args[parameter.name];

        if (arg && this.checkParameters(container, arg.parameters, `argument '${parameter.name}' of ${target}`, scope)) {
          this.logger.trace(`Parameter '${parameter.name}' of ${target} is async`);
          async = true;
        }
      } else if (this.checkParameter(container, parameter, target, scope)) {
        this.logger.trace(`Parameter '${parameter.name}' of ${target} is async`);
        async = true;
      }
    }

    return async;
  }

  private checkParameter(container: Container, parameter: ParameterInfo, target: string, scope: ServiceScope): boolean {
    if (parameter.flags & TypeFlag.Container) {
      return false;
    }

    const candidates = parameter.type && container.getByType(parameter.type);

    if (!candidates || !candidates.length) {
      if (parameter.flags & TypeFlag.Optional) {
        this.logger.trace(`Skipping parameter '${parameter.type}' of ${target}: unknown parameter type`);
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
      this.checkServiceDependencies(container, candidate);

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

  private checkCyclicDependencies(container: Container, definition: ServiceDefinitionInfo): void {
    this.checkCyclicDependency(definition.id);

    for (const param of definition.factory?.parameters ?? []) {
      this.checkParameterDependencies(container, param);
    }

    for (const param of definition.hooks?.onCreate?.parameters ?? []) {
      this.checkParameterDependencies(container, param);
    }

    for (const param of definition.decorators.flatMap((d) => [...d.decorate?.parameters ?? [], ...d.hooks.onCreate?.parameters ?? []])) {
      this.checkParameterDependencies(container, param);
    }

    this.releaseCyclicDependencyCheck(definition.id);
  }

  private checkParameterDependencies(container: Container, param: ParameterInfo): void {
    if (param.flags & (TypeFlag.Async | TypeFlag.Accessor | TypeFlag.Iterable)) {
      return;
    }

    const candidates = param.type && container.getByType(param.type);

    for (const candidate of candidates ?? []) {
      this.checkCyclicDependencies(container, candidate);
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
