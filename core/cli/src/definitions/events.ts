import { SourceFile } from 'ts-morph';
import { ContainerBuilder } from '../container';
import { Event } from '../events';
import { DeclarationNode } from '../utils';

export class DeclarationNodeDiscovered extends Event {
  constructor(
    public readonly resource: SourceFile,
    public readonly path: string,
    public readonly node: DeclarationNode,
    public readonly builder: ContainerBuilder,
  ) {
    super();
  }
}
