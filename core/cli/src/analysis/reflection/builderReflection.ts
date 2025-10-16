import { ContainerBuilder } from '../../container';
import { ServiceDefinition } from '../../definitions';
import { ContainerReflection, ForeignServiceReflection } from './types';

export interface BuilderReflectionFactory {
  create(container: ContainerBuilder): BuilderReflection;
}

export class BuilderReflection implements ContainerReflection {
  constructor(private readonly container: ContainerBuilder) {}

  *getPublicServices(): Iterable<ForeignServiceReflection> {
    for (const definition of this.container.getPublicServices()) {
      yield this.reflect(definition);
    }
  }

  *getDynamicServices(): Iterable<ForeignServiceReflection> {
    for (const definition of this.container.getDynamicServices()) {
      yield this.reflect(definition);
    }
  }

  private reflect(definition: ServiceDefinition): ForeignServiceReflection {
    return {
      id: definition.id,
      type: definition.type,
      aliases: definition.aliases,
      definition,
    };
  }
}
