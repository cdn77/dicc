import { Node, Type } from 'ts-morph';
import { Argument } from './argument';
import { ReturnType } from './types';

export class Callable {
  public async?: boolean;

  constructor(
    public readonly args: Map<string, Argument>,
    public readonly rawReturnType: Type,
    public readonly returnType?: ReturnType, // undefined means void
    public readonly node?: Node,
  ) {}
}
