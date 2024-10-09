import { Type } from 'ts-morph';
import { ServiceDecoratorInfo, ServiceDefinitionInfo, ServiceRegistrationInfo } from './types';

export class ContainerBuilder {
  private readonly definitions: Map<string, ServiceDefinitionInfo> = new Map();
  private readonly types: Map<Type, string> = new Map();
  private readonly typeIds: Set<string> = new Set();
  private readonly aliases: Map<string, Set<string>> = new Map();
  private readonly decorators: Map<string, ServiceDecoratorInfo[]> = new Map();

  register({ id, type, ...registration }: ServiceRegistrationInfo): void {
    const typeId = this.registerType(type);
    id ??= typeId;
    const definition = { id, type, ...registration, decorators: [] };
    this.definitions.set(id, definition);
    this.registerAlias(id, id);
    this.registerAlias(id, typeId);

    for (const alias of definition.aliases) {
      this.registerAlias(id, this.registerType(alias));
    }
  }

  unregister(id: string): void {
    const definition = this.definitions.get(id);

    if (!definition) {
      return;
    }

    this.definitions.delete(id);
    this.aliases.get(id)?.delete(id);

    for (const type of [definition.type, ...definition.aliases]) {
      const typeId = this.types.get(type);

      if (typeId !== undefined) {
        this.aliases.get(typeId)?.delete(id);
      }
    }
  }

  decorate(decorator: ServiceDecoratorInfo): void {
    const typeId = this.registerType(decorator.type);
    this.decorators.has(typeId) || this.decorators.set(typeId, []);
    this.decorators.get(typeId)!.push(decorator);
  }

  applyDecorators(): void {
    const decorated: Set<ServiceDefinitionInfo> = new Set();

    for (const [id, decorators] of this.decorators) {
      const definitions = [...this.aliases.get(id) ?? []].map((id) => this.get(id));

      for (const definition of definitions) {
        definition.decorators.push(...decorators);
        decorated.add(definition);
      }
    }

    for (const definition of decorated) {
      definition.decorators.sort((a, b) => b.priority - a.priority);
    }
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  get(id: string): ServiceDefinitionInfo {
    return this.definitions.get(id)!;
  }

  getDefinitions(): Iterable<ServiceDefinitionInfo> {
    return this.definitions.values();
  }

  getTypeId(type: Type): string | undefined {
    return this.types.get(type);
  }

  getIdsByType(type: Type): string[] {
    const alias = this.types.get(type);

    if (alias === undefined) {
      return [];
    }

    return [...this.aliases.get(alias) ?? []];
  }

  getByType(type: Type): ServiceDefinitionInfo[] {
    return this.getIdsByType(type).map((id) => this.definitions.get(id)!);
  }

  isAsync(type: Type): boolean {
    return this.getByType(type).some((def) => def.async);
  }

  private registerType(type: Type): string {
    const existing = this.types.get(type);

    if (existing !== undefined) {
      return existing;
    }

    const name = type.getSymbol()?.getName() ?? 'Anonymous';

    for (let idx = 0; true; ++idx) {
      const id = `#${name}.${idx}`;

      if (!this.typeIds.has(id)) {
        this.types.set(type, id);
        this.typeIds.add(id);
        return id;
      }
    }
  }

  private registerAlias(id: string, alias: string): void {
    const ids = this.aliases.get(alias) ?? new Set();
    this.aliases.set(alias, ids);
    ids.add(id);
  }
}
