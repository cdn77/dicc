import { Type } from 'ts-morph';
import { Compilation } from '../../compiler';
import { getOrCreate } from '../../utils';
import { BuilderReflection } from './builderReflection';
import { ExternalReflectionFactory } from './externalReflection';
import { ContainerReflection } from './types';

export class ContainerReflector {
  private readonly reflections: Map<Type, ContainerReflection> = new Map();

  constructor(
    private readonly compilation: Compilation,
    private readonly externalReflectionFactory: ExternalReflectionFactory,
  ) {}

  getContainerReflection(type: Type): ContainerReflection {
    return getOrCreate(this.reflections, type, () => {
      const builder = this.compilation.getContainerByType(type);
      return builder ? new BuilderReflection(builder) : this.externalReflectionFactory.create(type);
    });
  }
}
