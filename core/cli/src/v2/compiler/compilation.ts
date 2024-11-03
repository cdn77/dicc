import { Project, ScriptKind, Type } from 'ts-morph';
import { CompilerConfig, ContainerOptions } from '../config';
import { ContainerBuilder, ContainerBuilderFactory } from '../container';

export class Compilation {
  public readonly containers: Map<ContainerBuilder, ContainerOptions> = new Map();
  private readonly types: Map<Type, ContainerBuilder> = new Map();

  constructor(
    public readonly config: CompilerConfig,
    builderFactory: ContainerBuilderFactory,
    project: Project,
  ) {
    for (const [path, options] of Object.entries(this.config.containers)) {
      const sourceFile = project.createSourceFile(path, createEmptyOutput(options.className), {
        scriptKind: ScriptKind.TS,
        overwrite: true,
      });

      this.containers.set(builderFactory.create(sourceFile, options.className, options.lazyImports), options);
    }

    for (const container of this.containers.keys()) {
      this.types.set(container.sourceFile.getClassOrThrow(container.className).getType(), container);
    }
  }

  getContainerByType(type: Type): ContainerBuilder | undefined {
    return this.types.get(type);
  }
}

function createEmptyOutput(className: string): string {
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
