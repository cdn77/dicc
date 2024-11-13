import { Project, SourceFile, ScriptKind } from 'ts-morph';
import { CompilerConfig } from '../config';
import { ContainerBuilder, ContainerBuilderFactory } from './containerBuilder';

export class BuilderMap implements Iterable<ContainerBuilder> {
  private readonly builders: Map<SourceFile, ContainerBuilder> = new Map();

  constructor(
    project: Project,
    builderFactory: ContainerBuilderFactory,
    config: CompilerConfig,
  ) {
    for (const [path, options] of Object.entries(config.containers)) {
      const resource = project.createSourceFile(path, createEmptyContent(options.className), {
        scriptKind: ScriptKind.TS,
        overwrite: true,
      });

      this.builders.set(resource, builderFactory.create(resource, options));
    }
  }

  getByResource(resource: SourceFile): ContainerBuilder | undefined {
    return this.builders.get(resource);
  }

  [Symbol.iterator](): Iterator<ContainerBuilder> {
    return this.builders.values();
  }
}

function createEmptyContent(className: string): string {
  const declaration = className === 'default' ? 'default class' : `class ${className}`;
  return `
import { Container } from 'dicc';

export ${declaration} extends Container {
  constructor() {
    super({});
  }
}
`;
}
