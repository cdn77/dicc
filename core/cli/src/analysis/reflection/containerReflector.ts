import { BuilderMap } from '../../container';
import { LocalServiceDefinition } from '../../definitions';
import { BuilderReflectionFactory } from './builderReflection';
import { ExternalReflectionFactory } from './externalReflection';
import { ContainerReflection } from './types';

export class ContainerReflector {
  constructor(
    private readonly builderReflectionFactory: BuilderReflectionFactory,
    private readonly externalReflectionFactory: ExternalReflectionFactory,
    private readonly builders: BuilderMap,
  ) {}

  getContainerReflection(containerService: LocalServiceDefinition): ContainerReflection {
    const resource = containerService.declaration?.getSourceFile();
    const builder = resource && this.builders.getByResource(resource);
    return builder
      ? this.builderReflectionFactory.create(builder)
      : this.externalReflectionFactory.create(containerService.type);
  }
}
