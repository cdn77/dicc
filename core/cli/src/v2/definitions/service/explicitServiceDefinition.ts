import { SourceFile, Type } from 'ts-morph';
import { ContainerBuilder } from '../../container';
import { Callable } from '../callable';
import { ArgumentOverride } from '../types';
import { AbstractLocalServiceDefinition } from './abstractLocalServiceDefinition';
import { ExplicitServiceDefinitionOptions } from './types';

export class ExplicitServiceDefinition extends AbstractLocalServiceDefinition {
  public args: Map<string, ArgumentOverride>;
  public object: boolean;
  public anonymous: boolean;
  public parent?: string;
  public onCreate?: Callable;
  public onFork?: Callable;
  public onDestroy?: Callable;

  constructor(
    builder: ContainerBuilder,
    resource: SourceFile,
    path: string,
    id: string,
    type: Type,
    options: ExplicitServiceDefinitionOptions = {},
  ) {
    super(builder, resource, path, id, type, options);
    this.args = options.args ?? new Map();
    this.object = options.object ?? false;
    this.anonymous = options.anonymous ?? false;
    this.onCreate = options.onCreate;
    this.onFork = options.onFork;
    this.onDestroy = options.onDestroy;
  }

  isExplicit(): this is ExplicitServiceDefinition {
    return true;
  }
}
