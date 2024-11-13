import { Node, SourceFile, Type } from 'ts-morph';
import { ValueType } from './types';

export class ArgumentDefinition {
  constructor(
    public readonly rawType: Type,
    public readonly type: ValueType,
    public readonly optional: boolean = false,
    public readonly rest: boolean = false,
    public readonly node?: Node,
  ) {}
}

export class OverrideDefinition {
  constructor(
    public readonly resource: SourceFile,
    public readonly path: string,
    public readonly type: ValueType,
    public readonly node?: Node,
  ) {}
}
