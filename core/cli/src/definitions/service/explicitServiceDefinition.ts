import { SourceFile, Type } from 'ts-morph';
import { ContainerBuilder } from '../../container';
import { CallableDefinition } from '../callableDefinition';
import { ArgumentOverride } from '../types';
import { AbstractLocalServiceDefinition } from './abstractLocalServiceDefinition';
import { ExplicitServiceDefinitionOptions } from './types';

export class ExplicitServiceDefinition extends AbstractLocalServiceDefinition {
  public readonly args: Map<string | number, ArgumentOverride>;
  public readonly object: boolean;
  public readonly anonymous: boolean;
  public readonly onCreate?: CallableDefinition;
  public readonly onFork?: CallableDefinition;
  public readonly onDestroy?: CallableDefinition;

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
