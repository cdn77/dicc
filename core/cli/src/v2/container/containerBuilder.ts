import { SourceFile } from 'ts-morph';
import { DecoratorMap } from './decoratorMap';
import { ImportMap } from './importMap';
import { ServiceMap } from './serviceMap';
import { TypeMap } from './typeMap';

export interface ContainerBuilderFactory {
  create(sourceFile: SourceFile, className: string, lazyImports: boolean): ContainerBuilder;
}

export class ContainerBuilder {
  constructor(
    readonly services: ServiceMap,
    readonly decorators: DecoratorMap,
    readonly types: TypeMap,
    readonly imports: ImportMap,
    readonly sourceFile: SourceFile,
    readonly className: string,
    readonly lazyImports: boolean,
  ) {}
}
