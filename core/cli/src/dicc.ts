import { Autowiring } from './autowiring';
import { Checker } from './checker';
import { Compiler } from './compiler';
import { DefinitionScanner } from './definitionScanner';
import { SourceFiles } from './sourceFiles';
import { TypeHelper } from './typeHelper';
import { DiccConfig } from './types';


export class Dicc {
  private readonly sourceFiles: SourceFiles;
  private readonly helper: TypeHelper;
  private readonly scanner: DefinitionScanner;
  private readonly autowiring: Autowiring;
  private readonly compiler: Compiler;
  private readonly checker: Checker;
  private readonly config: DiccConfig;

  constructor(
    sourceFiles: SourceFiles,
    helper: TypeHelper,
    scanner: DefinitionScanner,
    autowiring: Autowiring,
    compiler: Compiler,
    checker: Checker,
    config: DiccConfig,
  ) {
    this.sourceFiles = sourceFiles;
    this.helper = helper;
    this.scanner = scanner;
    this.autowiring = autowiring;
    this.compiler = compiler;
    this.checker = checker;
    this.config = config;
  }

  async compile(): Promise<void> {
    const output = this.sourceFiles.getOutput();

    for (const [resource, options] of Object.entries(this.config.resources)) {
      for (const input of this.sourceFiles.getInputs(resource)) {
        this.scanner.scanDefinitions(input, options ?? undefined);
      }
    }

    this.checker.removeExtraneousImplicitRegistrations();
    this.autowiring.checkDependencies();
    this.checker.scanUsages();
    this.compiler.compile();

    this.helper.destroy();
    await output.save();
  }
}
