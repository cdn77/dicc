import { ServiceScope } from 'dicc';
import { ClassDeclaration, InterfaceDeclaration, Node, Type } from 'ts-morph';
import { AutoImplementedMethod } from '../autoImplementedMethod';
import { Callable } from '../callable';
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
  args?: Map<string, ArgumentOverride>;
  scope?: ServiceScope;
  node?: Node;
  declaration?: ClassDeclaration | InterfaceDeclaration;
  container?: boolean;
};

export type ExplicitServiceDefinitionOptions = LocalServiceDefinitionOptions & {
  object?: boolean;
  anonymous?: boolean;
  onCreate?: Callable;
  onFork?: Callable;
  onDestroy?: Callable;
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
