import type { Type } from 'ts-morph';
import { ContainerBuilder } from '../../container';
import type { ExplicitServiceDefinition } from './explicitServiceDefinition';
import type { ForeignServiceDefinition } from './foreignServiceDefinition';
import type { ImplicitServiceDefinition } from './implicitServiceDefinition';
import type { LocalServiceDefinition } from './types';

export abstract class AbstractServiceDefinition {
  public readonly aliases: Set<Type>;

  constructor(
    public readonly builder: ContainerBuilder,
    public readonly id: string,
    public readonly type: Type,
    aliases?: Iterable<Type>,
  ) {
    this.aliases = new Set(aliases);
  }

  isForeign(): this is ForeignServiceDefinition {
    return false;
  }

  isLocal(): this is LocalServiceDefinition {
    return false;
  }

  isImplicit(): this is ImplicitServiceDefinition {
    return false;
  }

  isExplicit(): this is ExplicitServiceDefinition {
    return false;
  }
}
