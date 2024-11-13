import { SourceFile, Type } from 'ts-morph';
import { ContainerOptions } from '../config';
import {
  DecoratorDefinition,
  DecoratorOptions,
  ExplicitServiceDefinition,
  ExplicitServiceDefinitionOptions,
  ForeignServiceDefinition,
  ImplicitServiceDefinition,
  LocalServiceDefinition,
  LocalServiceDefinitionOptions,
  ServiceDefinition,
} from '../definitions';
import { DefinitionError, InternalError } from '../errors';
import { EventDispatcher } from '../events';
import { allocateInSet, getFirstIfOnly, getOrCreate, throwIfUndef } from '../utils';
import { DecoratorAdded, DecoratorRemoved, ServiceAdded, ServiceRemoved } from './events';

export interface ContainerBuilderFactory {
  create(sourceFile: SourceFile, options: ContainerOptions): ContainerBuilder;
}

export class ContainerBuilder {
  private readonly services: Map<string, ServiceDefinition> = new Map();
  private readonly publicServices: Set<ServiceDefinition> = new Set();
  private readonly dynamicServices: Set<LocalServiceDefinition> = new Set();
  private readonly types: Map<Type, Set<ServiceDefinition>> = new Map();
  private readonly typeNames: Map<Type, string> = new Map();
  private readonly uniqueTypeNames: Set<string> = new Set();
  private readonly childContainers: Set<LocalServiceDefinition> = new Set();
  private readonly decorators: Map<Type, Set<DecoratorDefinition>> = new Map();
  private readonly resources: Map<SourceFile, string> = new Map();
  private readonly uniqueResourceAliases: Set<string> = new Set();

  constructor(
    private readonly eventDispatcher: EventDispatcher,
    readonly sourceFile: SourceFile,
    readonly options: ContainerOptions,
  ) {}

  addImplicitDefinition(
    resource: SourceFile,
    path: string,
    type: Type,
    options: LocalServiceDefinitionOptions = {},
  ): void {
    const id = this.allocateServiceId(options.factory?.returnType?.aliasType ?? type);
    this.addService(new ImplicitServiceDefinition(this, resource, path, id, type, options));
  }

  addExplicitDefinition(
    resource: SourceFile,
    path: string,
    type: Type,
    options: ExplicitServiceDefinitionOptions = {},
  ): void {
    const id = options.anonymous
      ? this.allocateServiceId(options.factory?.returnType?.aliasType ?? type)
      : path;
    const definition = new ExplicitServiceDefinition(this, resource, path, id, type, options);

    if (!definition.anonymous) {
      this.addPublicService(definition);
    }

    this.addService(definition);
  }

  addForeignDefinition(
    container: LocalServiceDefinition,
    foreignId: string,
    type: Type,
    aliases?: Iterable<Type>,
    definition?: ServiceDefinition,
    async?: boolean,
  ): void {
    const anonymous = !container.isExplicit() || container.anonymous;

    const id = anonymous
      ? this.allocateServiceId(type)
      : `${container.id}.${foreignId}`;

    const def = new ForeignServiceDefinition(this, container, foreignId, id, type, aliases, definition, async);

    if (!anonymous) {
      this.addPublicService(def);
    }

    this.addService(def);
  }

  private addService(definition: ServiceDefinition): void {
    this.services.set(definition.id, definition);
    getOrCreate(this.types, definition.type, () => new Set()).add(definition);

    for (const alias of definition.aliases) {
      getOrCreate(this.types, alias, () => new Set()).add(definition);
    }

    if (definition.isLocal()) {
      if (!definition.factory) {
        this.dynamicServices.add(definition);
      }

      if (definition.container) {
        this.childContainers.add(definition);
      }
    }

    this.eventDispatcher.dispatch(new ServiceAdded(definition));
  }

  getTypeName(type: Type): string {
    return getOrCreate(this.typeNames, type, () => {
      const typeName = type.getSymbol()?.getName() ?? 'Anonymous';
      return allocateInSet(this.uniqueTypeNames, `#${typeName}{i}`);
    });
  }

  getTypeNamesIfExist(types: Iterable<Type>): string[] {
    return [...types].map((type) => this.typeNames.get(type)).filter((name) => name !== undefined);
  }

  private allocateServiceId(type: Type): string {
    const typeName = this.getTypeName(type);
    const existing = getOrCreate(this.types, type, () => new Set());
    return `${typeName}.${existing.size}`;
  }

  private addPublicService(definition: ServiceDefinition): void {
    const existing = this.services.get(definition.id);

    if (existing) {
      const source = definition.isForeign()
        ? `merged foreign service '${definition.foreignId}' from container '${definition.parent.id}'`
        : `service '${definition.id}' exported from '${definition.resource.getFilePath()}'`;
      const collision = existing.isForeign()
        ? `merged foreign service '${existing.foreignId}' from container '${existing.parent.id}'`
        : `definition exported from '${existing.resource.getFilePath()}'`

      const local = existing.isForeign() ? existing.parent : existing;

      throw new DefinitionError(
        `Public service ID of ${source} collides with ${collision}`,
        { builder: local.builder, resource: local.resource, path: local.path, node: local.node },
      );
    }

    this.publicServices.add(definition);
  }

  removeService(definition: ServiceDefinition): void {
    if (!this.services.delete(definition.id)) {
      return;
    }

    this.types.get(definition.type)?.delete(definition);

    for (const alias of definition.aliases) {
      this.types.get(alias)?.delete(definition);
    }

    this.publicServices.delete(definition);
    definition.isLocal() && this.dynamicServices.delete(definition);
    this.eventDispatcher.dispatch(new ServiceRemoved(definition));
  }

  getById(id: string): ServiceDefinition {
    return throwIfUndef(
      this.services.get(id),
      () => new InternalError(`Service '${id}' does not exist`),
    );
  }

  getPublicServices(): Iterable<ServiceDefinition> {
    return this.publicServices;
  }

  getDynamicServices(): Iterable<LocalServiceDefinition> {
    return this.dynamicServices;
  }

  getAllServices(): Iterable<ServiceDefinition> {
    return this.services.values();
  }

  getChildContainers(): Iterable<LocalServiceDefinition> {
    return this.childContainers;
  }

  getByTypeIfSingle(type: Type): ServiceDefinition | undefined {
    return getFirstIfOnly(this.types.get(type) ?? []);
  }

  findByType(type: Type): Set<ServiceDefinition> {
    return this.types.get(type) ?? new Set();
  }

  findByAnyType(...types: Type[]): Set<ServiceDefinition> {
    return new Set(types.flatMap((type) => [...this.types.get(type) ?? []]));
  }

  addDecorator(
    resource: SourceFile,
    path: string,
    targetType: Type,
    options: DecoratorOptions = {},
  ): void {
    const definition = new DecoratorDefinition(resource, path, targetType, options);
    getOrCreate(this.decorators, definition.targetType, () => new Set()).add(definition);
    this.eventDispatcher.dispatch(new DecoratorAdded(definition));
  }

  removeDecorator(definition: DecoratorDefinition): void {
    const definitions = this.decorators.get(definition.targetType);

    if (!definitions?.delete(definition)) {
      return;
    }

    this.eventDispatcher.dispatch(new DecoratorRemoved(definition));
  }

  decorate(service: ServiceDefinition): DecoratorDefinition[] {
    const decorators: DecoratorDefinition[] = [];

    for (const target of [service.type, ...service.aliases]) {
      decorators.push(...this.decorators.get(target) ?? []);
    }

    return decorators.sort((a, b) => b.priority - a.priority);
  }

  getResourceAlias(resource: SourceFile): string {
    return getOrCreate(this.resources, resource, () => {
      const alias = resource.getFilePath()
        .replace(/^(?:.*?\/)?([^\/]+)(?:\/index)?(?:\.d)?\.tsx?$/i, '$1')
        .replace(/^[^a-z]+|[^a-z0-9]+/gi, '')
        .replace(/^$/, 'anon');

      return allocateInSet(this.uniqueResourceAliases, `${alias}{i}`);
    });
  }

  * getResourceMap(): Iterable<[alias: string, staticImport: string, dynamicImport: string]> {
    for (const [resource, alias] of this.resources) {
      const ext = resource.getFilePath().match(/\.([mc]?)[jt]sx?$/i);
      const staticImport = this.sourceFile.getRelativePathAsModuleSpecifierTo(resource);
      const dynamicImport = `${staticImport}.${ext ? ext[1] : ''}js`;
      yield [alias, staticImport, dynamicImport];
    }
  }
}
