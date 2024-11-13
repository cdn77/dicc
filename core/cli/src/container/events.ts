import { DecoratorDefinition, ServiceDefinition } from '../definitions';
import { Event } from '../events';

export abstract class ServiceEvent extends Event {
  constructor(
    public readonly service: ServiceDefinition,
  ) {
    super();
  }
}

export class ServiceAdded extends ServiceEvent {}
export class ServiceRemoved extends ServiceEvent {}

export abstract class DecoratorEvent extends Event {
  constructor(
    public readonly decorator: DecoratorDefinition,
  ) {
    super();
  }
}

export class DecoratorAdded extends DecoratorEvent {}
export class DecoratorRemoved extends DecoratorEvent {}
