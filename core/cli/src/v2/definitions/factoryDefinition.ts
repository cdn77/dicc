import { Node, Type } from 'ts-morph';
import { Argument } from './argument';
import { Callable } from './callable';
import { ReturnType } from './types';

export class FactoryDefinition extends Callable {
  constructor(
    args: Map<string, Argument>,
    rawReturnType: Type,
    returnType?: ReturnType,
    node?: Node,
    public readonly method?: string,
  ) {
    super(args, rawReturnType, returnType, node);
  }
}
