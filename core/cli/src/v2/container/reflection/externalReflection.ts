import { Type } from 'ts-morph';
import { ContainerBuilder } from '../containerBuilder';
import { InternalError } from '../../errors';
import { mapIterable, throwIfUndef, TypeHelper } from '../../utils';
import { ContainerReflection, ForeignServiceReflection } from './types';

export interface ExternalReflectionFactory {
  create(container: Type): ExternalReflection;
}

export class ExternalReflection implements ContainerReflection {
  private publicServices?: Map<string, ForeignServiceReflection>;
  private dynamicServices?: Map<string, ForeignServiceReflection>;

  constructor(
    private readonly typeHelper: TypeHelper,
    private readonly container: Type,
  ) {}

  getBuilder(): ContainerBuilder | undefined {
    return undefined;
  }

  getPublicServiceById(id: string): ForeignServiceReflection {
    this.publicServices ??= new Map(this.resolveServices('public'));

    return throwIfUndef(
      this.publicServices.get(id),
      () => new InternalError(`Unknown service: '${id}'`),
    );
  }

  getPublicServices(): Iterable<ForeignServiceReflection> {
    this.publicServices ??= new Map(this.resolveServices('public'));
    return this.publicServices.values();
  }

  getDynamicServices(): Iterable<ForeignServiceReflection> {
    this.dynamicServices ??= new Map(this.resolveServices('dynamic'));
    return this.dynamicServices.values();
  }

  private resolveServices(map: 'public' | 'dynamic'): Iterable<[string, ForeignServiceReflection]> {
    return mapIterable(
      this.typeHelper.resolveExternalContainerServices(this.container, map),
      (reflection) => [reflection.id, reflection]
    );
  }
}
