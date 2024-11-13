import { Node, SourceFile, Type } from 'ts-morph';
import { ArgumentDefinition } from './argumentDefinition';
import { CallableDefinition } from './callableDefinition';
import { ReturnType } from './types';

export class AutoImplementedMethod extends CallableDefinition {
  declare public readonly returnType: ReturnType;

  constructor(
    resource: SourceFile,
    path: string,
    public readonly name: string,
    args: Map<string, ArgumentDefinition>,
    rawReturnType: Type,
    returnType: ReturnType,
    node?: Node,
  ) {
    super(resource, path, args, rawReturnType, returnType, node);
  }
}
