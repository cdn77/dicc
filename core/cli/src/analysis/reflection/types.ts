import { Type } from 'ts-morph';
import { ServiceDefinition } from '../../definitions';

export type ForeignServiceReflection = {
  id: string;
  type: Type;
  aliases: Iterable<Type>;
  definition?: ServiceDefinition;
  async?: boolean;
};

export interface ContainerReflection {
  getPublicServices(): Iterable<ForeignServiceReflection>;
  getDynamicServices(): Iterable<ForeignServiceReflection>;
}
