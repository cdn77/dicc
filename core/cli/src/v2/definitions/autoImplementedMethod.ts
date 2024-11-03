import { Node, Type } from 'ts-morph';
import { Argument } from './argument';
import { Callable } from './callable';
import { ReturnType } from './types';

export class AutoImplementedMethod extends Callable {
  declare public readonly returnType: ReturnType;

  constructor(
    public readonly name: string,
    args: Map<string, Argument>,
    rawReturnType: Type,
    returnType: ReturnType,
    node?: Node,
  ) {
    super(args, rawReturnType, returnType, node);
  }
}
