import { SourceFile, Type } from 'ts-morph';
import {
  ExplicitServiceDefinition,
  ExplicitServiceDefinitionOptions,
  ForeignServiceDefinition,
  ImplicitServiceDefinition,
  LocalServiceDefinition,
  LocalServiceDefinitionOptions,
  ServiceDefinition,
} from '../definitions';
import { DefinitionError, InternalError } from '../errors';
import { Event, EventDispatcher } from '../events';
import { getFirstIfOnly, getOrCreate, throwIfUndef } from '../utils';
import { ContainerBuilder } from './containerBuilder';

export abstract class ServiceEvent extends Event {
  constructor(
    public readonly service: ServiceDefinition,
  ) {
    super();
  }
}

export class ServiceAdded extends ServiceEvent {}
export class ServiceRemoved extends ServiceEvent {}

export class ServiceMap implements Iterable<ServiceDefinition> {
  private readonly definitions: Map<string, ServiceDefinition> = new Map();
  private readonly types: Map<Type, Set<ServiceDefinition>> = new Map();
  private readonly publicServices: Set<ServiceDefinition> = new Set();

  constructor(
    private readonly eventDispatcher: EventDispatcher,
  ) {}

  addImplicitDefinition(
    builder: ContainerBuilder,
    resource: SourceFile,
    path: string,
    type: Type,
    options: LocalServiceDefinitionOptions = {},
  ): void {
    const id = this.allocateServiceId(type);
    this.add(new ImplicitServiceDefinition(builder, resource, path, id, type, options));
  }

  addExplicitDefinition(
    builder: ContainerBuilder,
    resource: SourceFile,
    path: string,
    type: Type,
    options: ExplicitServiceDefinitionOptions = {},
  ): void {
    const id = options.anonymous ? this.allocateServiceId(type) : path;
    const definition = new ExplicitServiceDefinition(builder, resource, path, id, type, options);

    if (!definition.anonymous) {
      this.addPublicService(definition);
    }

    this.add(definition);
  }

  addForeignDefinition(
    builder: ContainerBuilder,
    container: LocalServiceDefinition,
    foreignId: string,
    type: Type,
    aliases?: Iterable<Type>,
    async: boolean = false,
  ): void {
    const anonymous = !container.isExplicit() || container.anonymous;

    const id = anonymous
      ? this.allocateServiceId(type)
      : `${container.id}.${foreignId}`;

    const definition = new ForeignServiceDefinition(builder, container, foreignId, id, type, aliases, async);

    if (!anonymous) {
      this.addPublicService(definition);
    }

    this.add(definition);
  }

  private add(definition: ServiceDefinition): void {
    this.definitions.set(definition.id, definition);
    getOrCreate(this.types, definition.type, () => new Set()).add(definition);

    for (const alias of definition.aliases) {
      getOrCreate(this.types, alias, () => new Set()).add(definition);
    }

    this.eventDispatcher.dispatch(new ServiceAdded(definition));
  }

  private allocateServiceId(type: Type): string {
    const typeName = type.getSymbol()?.getName() ?? 'Anonymous';
    const existing = getOrCreate(this.types, type, () => new Set());
    return `#${typeName}.${existing.size}`;
  }

  private addPublicService(definition: ServiceDefinition): void {
    const existing = this.definitions.get(definition.id);

    if (existing) {
      const source = definition.isForeign()
        ? `merged foreign service '${definition.foreignId}' from container '${definition.container.id}'`
        : `service '${definition.id}' exported from '${definition.resource.getFilePath()}'`;
      const collision = existing.isForeign()
        ? `merged foreign service '${existing.foreignId}' from container '${existing.container.id}'`
        : `definition exported from '${existing.resource.getFilePath()}'`

      const local = existing.isForeign() ? existing.container : existing;

      throw new DefinitionError(
        `Public service ID of ${source} collides with ${collision}`,
        { builder: local.builder, resource: local.resource, path: local.path, node: local.node },
      );
    }

    this.publicServices.add(definition);
  }

  remove(definition: ServiceDefinition): void {
    if (!this.definitions.delete(definition.id)) {
      return;
    }

    this.types.get(definition.type)?.delete(definition);

    for (const alias of definition.aliases) {
      this.types.get(alias)?.delete(definition);
    }

    this.publicServices.delete(definition);
    this.eventDispatcher.dispatch(new ServiceRemoved(definition));
  }

  getById(id: string): ServiceDefinition {
    return throwIfUndef(
      this.definitions.get(id),
      () => new InternalError(`Service '${id}' does not exist`),
    );
  }

  getPublicServices(): Iterable<ServiceDefinition> {
    return this.publicServices;
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

  get size(): number {
    return this.definitions.size;
  }

  * [Symbol.iterator](): Iterator<ServiceDefinition> {
    yield * this.definitions.values();
  }
}
