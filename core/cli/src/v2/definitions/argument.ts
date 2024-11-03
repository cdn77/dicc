import { Node, Type } from 'ts-morph';
import { ValueType } from './types';

export class Argument {
  constructor(
    public readonly rawType: Type,
    public readonly type: ValueType,
    public readonly optional: boolean = false,
    public readonly rest: boolean = false,
    public readonly node?: Node,
  ) {}
}
