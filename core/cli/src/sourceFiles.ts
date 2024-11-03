import { Logger } from '@debugr/core';
import { Project, ScriptKind, SourceFile } from 'ts-morph';
import { DiccConfig } from './types';

type ContainerFiles = {
  inputs: Map<string, SourceFile[]>;
  output: SourceFile;
};

export class SourceFiles {
  private readonly logger: Logger;
  private readonly containers: Map<string, ContainerFiles> = new Map();

  constructor(project: Project, config: DiccConfig, logger: Logger) {
    this.logger = logger;

    for (const [outputPath, options] of Object.entries(config.containers)) {
      const inputs = new Map(Object.entries(options.resources).map(([resource, opts]) => [
        resource,
        project.addSourceFilesAtPaths(createSourceGlobs(resource, opts?.exclude ?? [])),
      ]));

      const output = project.createSourceFile(outputPath, createEmptyOutput(options.className), {
        scriptKind: ScriptKind.TS,
        overwrite: true,
      });

      this.containers.set(outputPath, { inputs, output });
    }
  }

  getInputs(container: string, resource: string): SourceFile[] {
    const inputs = this.getContainer(container).inputs.get(resource);

    if (!inputs) {
      throw new Error(`Unknown resource: '${resource}'`);
    } else if (!inputs.length) {
      if (resource.includes('*')) {
        this.logger.warning(`Resource '${resource}' didn't match any files`);
      } else {
        throw new Error(`Resource '${resource}' doesn't exist`);
      }
    }

    return inputs;
  }

  getOutput(container: string): SourceFile {
    return this.getContainer(container).output;
  }

  private getContainer(container: string): ContainerFiles {
    const files = this.containers.get(container);

    if (!files) {
      throw new Error(`Unknown container: '${container}'`);
    }

    return files;
  }
}

function createSourceGlobs(resource: string, exclude: string[]): string[] {
  return [resource].concat(exclude.filter((p) => /(\/|\.tsx?$)/i.test(p)).map((e) => `!${e}`));
}

function createEmptyOutput(className: string): string {
  const declaration = className === 'default' ? 'default class' : `class ${className}`;
  return `
import { Container } from 'dicc';

export ${declaration} extends Container<{}> {
  constructor() {
    super({});
  }
}
`;
}
