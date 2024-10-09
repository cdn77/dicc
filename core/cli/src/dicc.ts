import { Logger } from '@debugr/core';
import { SourceFile } from 'ts-morph';
import { Autowiring } from './autowiring';
import { Checker } from './checker';
import { Compiler } from './compiler';
import { Container } from './container';
import { DefinitionScanner } from './definitionScanner';
import { UserError } from './errors';
import { SourceFiles } from './sourceFiles';
import { ContainerOptions, DiccConfig } from './types';

type ContainerCtx = {
  container: Container;
  path: string;
  config: ContainerOptions;
  outputFile: SourceFile;
};

export class Dicc {
  constructor(
    private readonly sourceFiles: SourceFiles,
    private readonly scanner: DefinitionScanner,
    private readonly autowiring: Autowiring,
    private readonly checker: Checker,
    private readonly config: DiccConfig,
    private readonly logger: Logger,
  ) {}

  async compile(): Promise<void> {
    const containers: Set<ContainerCtx> = new Set();

    for (const [path, config] of Object.entries(this.config.containers)) {
      this.logger.debug(`Scanning resources for '${path}'...`);
      const container = new Container();

      for (const [resource, options] of Object.entries(config.resources)) {
        for (const input of this.sourceFiles.getInputs(path, resource)) {
          this.logger.trace(`Scanning '${input.getFilePath()}'`);
          this.scanner.scanDefinitions(container, input, options ?? undefined);
        }
      }

      containers.add({ container, path, config, outputFile: this.sourceFiles.getOutput(path) });
    }

    for (const { container, path } of containers) {
      this.logger.debug(`Post-processing '${path}'...`);
      this.logger.trace('Cleaning up...');
      this.checker.removeExtraneousImplicitRegistrations(container);
      this.logger.trace('Applying decorators...');
      container.applyDecorators();
      this.logger.trace('Autowiring dependencies...');
      this.autowiring.checkDependencies(container);
      // this.checker.scanUsages(container); // this doesn't work correctly with multiple containers
    }

    for (const { container, outputFile, path, config } of containers) {
      this.logger.debug(`Compiling '${path}'...`);
      const compiler = new Compiler(container, outputFile, config);
      compiler.compile();
    }

    this.logger.debug(`Writing output files...`);

    for (const { outputFile } of containers) {
      await outputFile.save();
    }

    this.logger.debug(`Type-checking compiled containers...`);
    let errors = false;

    for (const { outputFile } of containers) {
      if (!this.checker.checkOutput(outputFile)) {
        errors = true;
      }
    }

    if (errors) {
      throw new UserError(`Compiled container has TypeScript errors`);
    }
  }
}
