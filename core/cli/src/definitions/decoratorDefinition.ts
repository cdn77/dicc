import { ServiceScope } from 'dicc';
import { Node, SourceFile, Type } from 'ts-morph';
import { CallableDefinition } from './callableDefinition';

export type DecoratorOptions = {
  scope?: ServiceScope;
  decorate?: CallableDefinition;
  onCreate?: CallableDefinition;
  onFork?: CallableDefinition;
  onDestroy?: CallableDefinition;
  priority?: number;
  node?: Node;
};

export class DecoratorDefinition {
  public readonly scope?: ServiceScope;
  public readonly decorate?: CallableDefinition;
  public readonly onCreate?: CallableDefinition;
  public readonly onFork?: CallableDefinition;
  public readonly onDestroy?: CallableDefinition;
  public readonly priority: number;
  public readonly node?: Node;

  constructor(
    public readonly resource: SourceFile,
    public readonly path: string,
    public readonly targetType: Type,
    options: DecoratorOptions = {},
  ) {
    this.scope = options.scope;
    this.decorate = options.decorate;
    this.onCreate = options.onCreate;
    this.onFork = options.onFork;
    this.onDestroy = options.onDestroy;
    this.priority = options.priority ?? 0;
    this.node = options.node;
  }
}
