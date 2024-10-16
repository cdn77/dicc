import { Logger } from '@debugr/core';
import { ServiceScope } from 'dicc';
import { SourceFile } from 'ts-morph';
import { ContainerBuilder } from './containerBuilder';
import { DefinitionError, TypeError, UserError } from './errors';
import {
  ArgumentInfo,
  ArgumentOverrideMap,
  ServiceDecoratorInfo,
  ServiceDefinitionInfo,
  ServiceHooks,
  TypeFlag,
} from './types';

export interface AutowiringFactory {
  create(containers: Map<SourceFile, ContainerBuilder>): Autowiring;
}

export class Autowiring {
  private readonly visitedContainers: Set<ContainerBuilder> = new Set();
  private readonly visitedServices: Set<ServiceDefinitionInfo> = new Set();
  private readonly visitedDecorators: Map<ServiceDecoratorInfo, Set<ServiceScope>> = new Map();
  private readonly resolving: string[] = [];

  constructor(
    private readonly logger: Logger,
    private readonly containers: Map<SourceFile, ContainerBuilder>,
  ) {}

  checkDependencies(): void {
    for (const builder of this.containers.values()) {
      this.checkContainer(builder);
    }
  }

  private checkContainer(builder: ContainerBuilder): void {
    if (!this.visitContainer(builder)) {
      return;
    }

    this.logger.debug(`Checking container '${builder.path}'...`);

    for (const definition of builder.getDefinitions()) {
      this.checkServiceDependencies(builder, definition);
    }

    // needs to run after all dependencies have been fully resolved
    for (const definition of builder.getDefinitions()) {
      this.checkCyclicDependencies(builder, definition);
    }
  }

  private checkServiceDependencies(builder: ContainerBuilder, info: ServiceDefinitionInfo): void {
    if (!this.visitService(info)) {
      return;
    }

    const desc = info.parent ? `'${info.path}.${info.id}'` : `'${info.path}'`;

    this.logger.debug(`Checking ${desc} dependencies...`);
    const scope = this.resolveScope(info);

    if (info.container) {
      const src = info.type.getSymbolOrThrow().getValueDeclarationOrThrow().getSourceFile();
      const params = this.containers.get(src)?.getParametersInfo();

      if (params && info.factory?.method === 'constructor' && !info.factory.args.length) {
        info.factory.args = [
          { name: 'parameters', type: params.type, flags: TypeFlag.None },
        ];
      }
    }

    if (info.factory) {
      if (info.parent) {
        const parentSvc = builder.get(info.parent);
        this.checkServiceDependencies(builder, parentSvc);

        if (parentSvc.async && !info.async) {
          this.logger.trace(`Marking ${desc} as async because parent container needs to be awaited`);
          info.async = true;
        }

        const parentSrc = parentSvc.type.getSymbolOrThrow().getValueDeclarationOrThrow().getSourceFile();
        const parentBuilder = this.containers.get(parentSrc);

        if (parentBuilder) {
          this.checkContainer(parentBuilder);

          if (parentBuilder.isAsync(info.type) && !info.factory.async) {
            this.logger.trace(`Marking ${desc} factory as async because service is async in parent container`);
            info.factory.async = true;
          }
        }
      } else if (this.checkArguments(builder, info.factory.args, `service ${desc}`, scope, info.args) && !info.factory.async) {
        this.logger.trace(`Marking ${desc} factory as async because one or more arguments need to be awaited`);
        info.factory.async = true;
      }

      if (info.factory.async && !info.async) {
        this.logger.trace(`Marking ${desc} as async because factory is async`);
        info.async = true;
      }
    }

    if (info.creates) {
      this.logger.trace(`Checking auto-factory ${desc} target arguments...`);
      const injectedArgs = info.creates.factory.args.filter((p) => !info.creates!.manualArgs.includes(p.name));

      if (this.checkArguments(builder, injectedArgs, `auto-factory ${desc}`, scope, info.creates.args) && !info.creates.async) {
        throw new DefinitionError(`Auto-factory ${desc} must return a Promise because target has async dependencies`);
      }
    }

    if (this.checkHooks(builder, info.hooks, `service ${desc}`, scope) && !info.async) {
      this.logger.trace(`Marking ${desc} as async because its 'onCreate' hook is async`);
      info.async = true;
    }

    const flags = this.checkDecorators(builder, info.decorators, scope);

    if (flags.asyncDecorate && info.factory && !info.factory.async) {
      this.logger.trace(`Marking ${desc} factory as async because it has an async decorator`);
      info.factory.async = true;
    }

    if ((flags.asyncDecorate || flags.asyncOnCreate) && !info.async) {
      this.logger.trace(`Marking ${desc} as async because it has an async decorator`);
      info.async = true;
    }
  }

  private resolveScope(definition: ServiceDefinitionInfo): ServiceScope {
    const decoratorWithScope = definition.decorators.findLast((decorator) => decorator.scope !== undefined);
    return decoratorWithScope?.scope ?? definition.scope ?? 'global';
  }

  private checkHooks(builder: ContainerBuilder, hooks: ServiceHooks, target: string, scope: ServiceScope): boolean {
    for (const hook of ['onCreate', 'onFork', 'onDestroy'] as const) {
      const info = hooks[hook];

      if (!info) {
        continue;
      }

      this.logger.debug(`Checking ${target} '${hook}' hook...`);

      if (this.checkArguments(builder, info.args, `'${hook}' hook of ${target}`, scope) && !info.async) {
        this.logger.trace(`Marking '${hook}' hook of ${target} as async because one or more arguments need to be awaited`);
        info.async = true;
      }
    }

    return hooks.onCreate?.async ?? false;
  }

  private checkDecorators(builder: ContainerBuilder, decorators: ServiceDecoratorInfo[], scope: ServiceScope): DecoratorFlags {
    const flags: DecoratorFlags = {};

    for (const decorator of decorators) {
      this.checkDecorator(builder, decorator, scope, flags);
    }

    return flags;
  }

  private checkDecorator(builder: ContainerBuilder, decorator: ServiceDecoratorInfo, scope: ServiceScope, flags: DecoratorFlags): void {
    if (!this.visitDecorator(decorator, scope)) {
      decorator.decorate?.async && (flags.asyncDecorate = true);
      decorator.hooks.onCreate?.async && (flags.asyncOnCreate = true);
      return;
    }

    if (decorator.decorate) {
      if (this.checkArguments(builder, decorator.decorate.args, `decorator '${decorator.path}'`, scope)) {
        this.logger.trace(`Marking decorator '${decorator.path}' as async because one or more arguments need to be awaited`);
        decorator.decorate.async = true;
      }

      if (decorator.decorate.async) {
        flags.asyncDecorate = true;
      }
    }

    if (this.checkHooks(builder, decorator.hooks, `decorator '${decorator.path}'`, scope)) {
      this.logger.trace(`Marking decorator '${decorator.path}' as async because its 'onCreate' hook is async`);
      flags.asyncOnCreate = true;
    }
  }

  private checkArguments(
    builder: ContainerBuilder,
    args: ArgumentInfo[],
    target: string,
    scope: ServiceScope,
    argOverrides?: ArgumentOverrideMap,
  ): boolean {
    let async = false;

    for (const arg of args) {
      if (argOverrides && arg.name in argOverrides) {
        const override = argOverrides[arg.name];

        if (typeof override === 'object' && this.checkArguments(builder, override.args, `argument '${arg.name}' of ${target}`, scope)) {
          this.logger.trace(`Argument '${arg.name}' of ${target} is async`);
          async = true;
        }
      } else if (this.checkArgument(builder, arg, target, scope)) {
        this.logger.trace(`Argument '${arg.name}' of ${target} is async`);
        async = true;
      }
    }

    return async;
  }

  private checkArgument(builder: ContainerBuilder, arg: ArgumentInfo, target: string, scope: ServiceScope): boolean {
    if (arg.flags & TypeFlag.Container) {
      return false;
    }

    if (!arg.type) {
      return this.checkOptional(arg, target);
    }

    const services = builder.getByType(arg.type);

    if (services.length) {
      return this.checkServiceCandidates(builder, arg, target, scope, services);
    }

    const parameters = builder.getParametersByType(arg.type);

    if (!parameters) {
      return this.checkOptional(arg, target);
    }

    if (arg.flags & ~(TypeFlag.Optional | TypeFlag.Array)) {
      throw new TypeError(
        `Container parameters cannot be injected into iterables, async arguments, accessors, or injectors`,
        arg.type,
      );
    }

    if ('nestedTypes' in parameters) {
      if (this.checkMultiple(arg)) {
        throw new TypeError(
          `Cannot inject container parameters into array argument '${arg.name}' of ${target}`,
          arg.type,
        );
      }

      return false;
    }

    if (Boolean(parameters.flags & TypeFlag.Array) !== this.checkMultiple(arg)) {
      const [p, a] = parameters.flags & TypeFlag.Array ? ['', 'non-'] : ['non-', ''];

      throw new TypeError(
        `Cannot inject ${p}array parameter '${parameters.path}' into ${a}array argument '${arg.name}' of ${target}`,
        arg.type,
      );
    }

    return false;
  }

  private checkServiceCandidates(builder: ContainerBuilder, arg: ArgumentInfo, target: string, scope: ServiceScope, candidates: ServiceDefinitionInfo[]): boolean {
    if (candidates.length > 1 && !this.checkMultiple(arg)) {
      throw new TypeError(`Multiple services for argument '${arg.name}' of ${target} found`, arg.type);
    } else if (arg.flags & TypeFlag.Injector) {
      if (candidates[0].scope === 'private') {
        throw new TypeError(`Cannot inject injector for privately-scoped service '${candidates[0].id}' into ${target}`, arg.type);
      }

      return false;
    }

    let async = false;

    for (const candidate of candidates) {
      this.checkServiceDependencies(builder, candidate);

      if (scope === 'global' && candidate.scope === 'local' && !(arg.flags & TypeFlag.Accessor)) {
        throw new TypeError(`Cannot inject locally-scoped service '${candidate.id}' into globally-scoped ${target}`, arg.type);
      }

      if (candidate.async && !(arg.flags & TypeFlag.Async)) {
        if (arg.flags & (TypeFlag.Accessor | TypeFlag.Iterable)) {
          throw new TypeError(`Cannot inject async service '${candidate.id}' into synchronous accessor or iterable argument '${arg.name}' of ${target}`, arg.type);
        }

        async = true;
      }
    }

    return async;
  }

  private checkOptional(arg: ArgumentInfo, target: string): boolean {
    if (arg.flags & TypeFlag.Optional) {
      this.logger.trace(`Skipping argument '${arg.name}' of ${target}: unknown argument type`);
      return false;
    }

    throw new TypeError(
      arg.flags & TypeFlag.Injector
        ? `Unknown service type in injector '${arg.name}' of ${target}`
        : `Unable to autowire non-optional argument '${arg.name}' of ${target}`,
      arg.type,
    );
  }

  private checkMultiple(arg: ArgumentInfo): boolean {
    return Boolean(arg.flags & (TypeFlag.Array | TypeFlag.Iterable));
  }

  private checkCyclicDependencies(builder: ContainerBuilder, definition: ServiceDefinitionInfo): void {
    this.checkCyclicDependency(definition.id);

    for (const arg of definition.factory?.args ?? []) {
      this.checkArgumentDependencies(builder, arg);
    }

    for (const arg of definition.hooks?.onCreate?.args ?? []) {
      this.checkArgumentDependencies(builder, arg);
    }

    for (const arg of definition.decorators.flatMap((d) => [...d.decorate?.args ?? [], ...d.hooks.onCreate?.args ?? []])) {
      this.checkArgumentDependencies(builder, arg);
    }

    this.releaseCyclicDependencyCheck(definition.id);
  }

  private checkArgumentDependencies(builder: ContainerBuilder, arg: ArgumentInfo): void {
    if (arg.flags & (TypeFlag.Async | TypeFlag.Accessor | TypeFlag.Iterable)) {
      return;
    }

    const candidates = arg.type && builder.getByType(arg.type);

    for (const candidate of candidates ?? []) {
      this.checkCyclicDependencies(builder, candidate);
    }
  }

  private checkCyclicDependency(id: string): void {
    const idx = this.resolving.indexOf(id);

    if (idx > -1) {
      throw new UserError(`Cyclic dependency detected: ${this.resolving.join(' → ')} → ${id}`);
    }

    this.resolving.push(id);
  }

  private releaseCyclicDependencyCheck(id: string): void {
    const last = this.resolving.pop();

    if (last !== id) {
      throw new Error(`Dependency chain checker broken`);
    }
  }

  private visitContainer(builder: ContainerBuilder): boolean {
    if (this.visitedContainers.has(builder)) {
      return false;
    }

    this.visitedContainers.add(builder);
    return true;
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
