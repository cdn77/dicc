import { ServiceScope } from 'dicc';
import { Node, SourceFile, Type } from 'ts-morph';
import { Callable } from './callable';

export type DecoratorOptions = {
  scope?: ServiceScope;
  decorate?: Callable;
  onCreate?: Callable;
  onFork?: Callable;
  onDestroy?: Callable;
  priority?: number;
  node?: Node;
};

export class DecoratorDefinition {
  public readonly scope?: ServiceScope;
  public readonly decorate?: Callable;
  public readonly onCreate?: Callable;
  public readonly onFork?: Callable;
  public readonly onDestroy?: Callable;
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
