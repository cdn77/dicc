import { Type } from 'ts-morph';
import { mapIterable, TypeHelper } from '../../utils';
import { ContainerReflection, ForeignServiceReflection } from './types';

export interface ExternalReflectionFactory {
  create(container: Type): ExternalReflection;
}

export class ExternalReflection implements ContainerReflection {
  private publicServices?: Set<ForeignServiceReflection>;
  private dynamicServices?: Set<ForeignServiceReflection>;

  constructor(
    private readonly typeHelper: TypeHelper,
    private readonly container: Type,
  ) {}

  getPublicServices(): Iterable<ForeignServiceReflection> {
    this.publicServices ??= new Set(this.resolveServices('public'));
    return this.publicServices;
  }

  getDynamicServices(): Iterable<ForeignServiceReflection> {
    this.dynamicServices ??= new Set(this.resolveServices('dynamic'));
    return this.dynamicServices;
  }

  private resolveServices(map: 'public' | 'dynamic'): Iterable<ForeignServiceReflection> {
    return mapIterable(
      this.typeHelper.resolveExternalContainerServices(this.container, map),
      ([id, type, aliases, async]) => ({ id, type, aliases, async }),
    );
  }
}
