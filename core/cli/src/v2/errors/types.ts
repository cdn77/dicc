import { Node, SourceFile } from 'ts-morph';
import { ContainerBuilder } from '../container';
import { DecoratorDefinition, ServiceDefinition } from '../definitions';

export type UserCodeContext = {
  builder: ContainerBuilder;
  resource: SourceFile;
  path: string;
  node?: Node;
};

export type ContainerContext = {
  builder: ContainerBuilder;
  definition?: ServiceDefinition | DecoratorDefinition;
  method?: 'factory' | 'override' | 'decorate' | 'onCreate' | 'onFork' | 'onDestroy' | 'auto-implement';
  argument?: string;
};

export interface ErrorReporter<E extends Error> {
  supports(error: unknown): error is E;
  report(error: E): Iterable<string>;
}
