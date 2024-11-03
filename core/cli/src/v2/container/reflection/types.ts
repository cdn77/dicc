import { Type } from 'ts-morph';
import { ContainerBuilder } from '../containerBuilder';

export type ForeignServiceReflection = {
  readonly id: string;
  readonly type: Type;
  readonly aliases: Iterable<Type>;
  readonly async: boolean;
};

export interface ContainerReflection {
  getBuilder(): ContainerBuilder | undefined;
  getPublicServices(): Iterable<ForeignServiceReflection>;
  getPublicServiceById(id: string): ForeignServiceReflection;
  getDynamicServices(): Iterable<ForeignServiceReflection>;
}
