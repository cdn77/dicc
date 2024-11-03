import { SourceFile, Type } from 'ts-morph';
import { DecoratorDefinition, DecoratorOptions, ServiceDefinition } from '../definitions';
import { Event, EventDispatcher } from '../events';
import { getOrCreate } from '../utils';

export abstract class DecoratorEvent extends Event {
  constructor(
    public readonly decorator: DecoratorDefinition,
  ) {
    super();
  }
}

export class DecoratorAdded extends DecoratorEvent {}
export class DecoratorRemoved extends DecoratorEvent {}

export class DecoratorMap {
  private readonly decorators: Map<Type, Set<DecoratorDefinition>> = new Map();

  constructor(
    private readonly eventDispatcher: EventDispatcher,
  ) {}

  add(
    resource: SourceFile,
    path: string,
    targetType: Type,
    options: DecoratorOptions = {},
  ): void {
    const definition = new DecoratorDefinition(resource, path, targetType, options);
    getOrCreate(this.decorators, definition.targetType, () => new Set()).add(definition);
    this.eventDispatcher.dispatch(new DecoratorAdded(definition));
  }

  remove(definition: DecoratorDefinition): void {
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
}
