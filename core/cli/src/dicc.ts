import { Logger } from '@debugr/core';
import { SourceFile } from 'ts-morph';
import { Autowiring } from './autowiring';
import { Checker } from './checker';
import { Compiler } from './compiler';
import { ContainerBuilder } from './containerBuilder';
import { DefinitionScanner } from './definitionScanner';
import { UserError } from './errors';
import { SourceFiles } from './sourceFiles';
import { ContainerOptions, DiccConfig } from './types';

type ContainerCtx = {
  builder: ContainerBuilder;
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
      const builder = new ContainerBuilder();

      for (const [resource, options] of Object.entries(config.resources)) {
        for (const input of this.sourceFiles.getInputs(path, resource)) {
          this.logger.trace(`Scanning '${input.getFilePath()}'`);
          this.scanner.scanDefinitions(builder, input, options ?? undefined);
        }
      }

      containers.add({ builder, path, config, outputFile: this.sourceFiles.getOutput(path) });
    }

    for (const { builder, path } of containers) {
      this.logger.debug(`Post-processing '${path}'...`);
      this.checker.checkAutoFactories(builder);
      this.logger.trace('Cleaning up...');
      this.checker.removeExtraneousImplicitRegistrations(builder);
      this.logger.trace('Applying decorators...');
      builder.applyDecorators();
      this.logger.trace('Autowiring dependencies...');
      this.autowiring.checkDependencies(builder);
      // this.checker.scanUsages(builder); // this doesn't work correctly with multiple containers
    }

    for (const { builder, outputFile, path, config } of containers) {
      this.logger.debug(`Compiling '${path}'...`);
      const compiler = new Compiler(builder, outputFile, config);
      compiler.compile();
    }

    this.logger.debug(`Writing output files...`);

    for (const { outputFile } of containers) {
      await outputFile.save();
    }

    this.logger.debug(`Type-checking compiled containers...`);
    let errors = false;

    for (const { outputFile, config, path } of containers) {
      if (!config.typeCheck) {
        this.logger.debug(`Type-checking disabled for '${path}', skipping.`);
      } else if (!this.checker.checkOutput(outputFile)) {
        errors = true;
      }
    }

    if (errors) {
      throw new UserError(`One or more compiled containers have TypeScript errors`);
    }
  }
}
