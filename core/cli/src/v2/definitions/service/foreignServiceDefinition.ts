import { Type } from 'ts-morph';
import { ContainerBuilder } from '../../container';
import { AbstractLocalServiceDefinition } from './abstractLocalServiceDefinition';
import { AbstractServiceDefinition } from './abstractServiceDefinition';
import { ForeignFactoryInfo } from './types';


export class ForeignServiceDefinition extends AbstractServiceDefinition {
  public readonly factory: ForeignFactoryInfo = {
    async: false,
  };

  constructor(
    builder: ContainerBuilder,
    public readonly container: AbstractLocalServiceDefinition,
    public readonly foreignId: string,
    id: string,
    type: Type,
    aliases?: Iterable<Type>,
    async: boolean = false,
  ) {
    super(builder, id, type, aliases);
    this.async = async;
  }

  isForeign(): this is ForeignServiceDefinition {
    return true;
  }
}
