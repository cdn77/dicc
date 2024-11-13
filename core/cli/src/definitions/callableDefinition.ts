import { Node, SourceFile, Type } from 'ts-morph';
import { ArgumentDefinition } from './argumentDefinition';
import { ReturnType } from './types';

export class CallableDefinition {
  constructor(
    public readonly resource: SourceFile,
    public readonly path: string,
    public readonly args: Map<string, ArgumentDefinition>,
    public readonly rawReturnType: Type,
    public readonly returnType?: ReturnType, // undefined means void
    public readonly node?: Node,
  ) {}
}
