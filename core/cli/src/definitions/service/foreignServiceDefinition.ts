import { Type } from 'ts-morph';
import { ContainerBuilder } from '../../container';
import { AbstractServiceDefinition } from './abstractServiceDefinition';
import { LocalServiceDefinition, ServiceDefinition } from './types';

export class ForeignServiceDefinition extends AbstractServiceDefinition {
  constructor(
    builder: ContainerBuilder,
    public readonly parent: LocalServiceDefinition,
    public readonly foreignId: string,
    id: string,
    type: Type,
    aliases?: Iterable<Type>,
    public readonly definition?: ServiceDefinition,
    public readonly async: boolean = false,
  ) {
    super(builder, id, type, aliases);
  }

  isForeign(): this is ForeignServiceDefinition {
    return true;
  }
}
