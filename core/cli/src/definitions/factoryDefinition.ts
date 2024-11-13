import { Node, SourceFile, Type } from 'ts-morph';
import { ArgumentDefinition } from './argumentDefinition';
import { CallableDefinition } from './callableDefinition';
import { ReturnType } from './types';

export class FactoryDefinition extends CallableDefinition {
  constructor(
    resource: SourceFile,
    path: string,
    args: Map<string, ArgumentDefinition>,
    rawReturnType: Type,
    returnType?: ReturnType,
    node?: Node,
    public readonly method?: string,
  ) {
    super(resource, path, args, rawReturnType, returnType, node);
  }
}
