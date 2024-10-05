import { SourceFile } from 'ts-morph';
import { Autowiring } from './autowiring';
import { Checker } from './checker';
import { Compiler } from './compiler';
import { Container } from './container';
import { DefinitionScanner } from './definitionScanner';
import { SourceFiles } from './sourceFiles';
import { TypeHelper } from './typeHelper';
import { ContainerOptions, DiccConfig } from './types';

type ContainerCtx = {
  container: Container;
  outputFile: SourceFile;
  config: ContainerOptions;
};

export class Dicc {
  constructor(
    private readonly sourceFiles: SourceFiles,
    private readonly helper: TypeHelper,
    private readonly scanner: DefinitionScanner,
    private readonly autowiring: Autowiring,
    private readonly checker: Checker,
    private readonly config: DiccConfig,
  ) {}

  async compile(): Promise<void> {
    const containers: Set<ContainerCtx> = new Set();

    for (const [path, config] of Object.entries(this.config.containers)) {
      const container = new Container();

      for (const [resource, options] of Object.entries(config.resources)) {
        for (const input of this.sourceFiles.getInputs(path, resource)) {
          this.scanner.scanDefinitions(container, input, options ?? undefined);
        }
      }

      containers.add({ container, config, outputFile: this.sourceFiles.getOutput(path) });
    }

    for (const { container } of containers) {
      this.checker.removeExtraneousImplicitRegistrations(container);
      container.applyDecorators();
      this.autowiring.checkDependencies(container);
      // this.checker.scanUsages(container); // this doesn't work correctly with multiple containers
    }

    for (const { container, outputFile, config } of containers) {
      const compiler = new Compiler(container, outputFile, config);
      compiler.compile();
    }

    this.helper.destroy();

    for (const { outputFile } of containers) {
      await outputFile.save();
    }

    for (const { outputFile } of containers) {
      this.checker.checkOutput(outputFile);
    }
  }
}
