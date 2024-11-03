import { ServiceDefinition } from '../../definitions';
import { ContainerBuilder } from '../containerBuilder';
import { ContainerReflection, ForeignServiceReflection } from './types';

export class BuilderReflection implements ContainerReflection {
  constructor(
    private readonly builder: ContainerBuilder,
  ) {}

  getBuilder(): ContainerBuilder | undefined {
    return this.builder;
  }

  getPublicServiceById(id: string): ForeignServiceReflection {
    return this.reflect(this.builder.services.getById(id));
  }

  * getPublicServices(): Iterable<ForeignServiceReflection> {
    for (const definition of this.builder.services.getPublicServices()) {
      yield this.reflect(definition);
    }
  }

  * getDynamicServices(): Iterable<ForeignServiceReflection> {
    for (const definition of this.builder.services) {
      if (definition.isExplicit() && !definition.factory && !definition.autoImplement) {
        yield this.reflect(definition);
      }
    }
  }

  private reflect(definition: ServiceDefinition): ForeignServiceReflection {
    return {
      id: definition.id,
      type: definition.type,
      aliases: definition.aliases,
      get async() {
        return definition.async;
      },
    };
  }
}
