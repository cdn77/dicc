import { ServiceScope } from 'dicc';
import { ClassDeclaration, InterfaceDeclaration, Node, Type } from 'ts-morph';
import { AutoImplementedMethod } from '../autoImplementedMethod';
import { CallableDefinition } from '../callableDefinition';
import { FactoryDefinition } from '../factoryDefinition';
import { ArgumentOverride } from '../types';
import { ExplicitServiceDefinition } from './explicitServiceDefinition';
import { ForeignServiceDefinition } from './foreignServiceDefinition';
import { ImplicitServiceDefinition } from './implicitServiceDefinition';

export type AutoImplementationInfo = {
  method: AutoImplementedMethod;
  service: LocalServiceDefinition;
};

export type LocalServiceDefinitionOptions = {
  aliases?: Iterable<Type>;
  factory?: FactoryDefinition;
  scope?: ServiceScope;
  node?: Node;
  declaration?: ClassDeclaration | InterfaceDeclaration;
  container?: boolean;
};

export type ExplicitServiceDefinitionOptions = LocalServiceDefinitionOptions & {
  object?: boolean;
  args?: Map<string | number, ArgumentOverride>;
  anonymous?: boolean;
  onCreate?: CallableDefinition;
  onFork?: CallableDefinition;
  onDestroy?: CallableDefinition;
};

export type ForeignFactoryInfo = {
  async: boolean;
};

export type LocalServiceDefinition =
  | ImplicitServiceDefinition
  | ExplicitServiceDefinition;

export type ServiceDefinition =
  | LocalServiceDefinition
  | ForeignServiceDefinition;
