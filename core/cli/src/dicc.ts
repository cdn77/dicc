import { Logger } from '@debugr/core';
import { SourceFile } from 'ts-morph';
import { AutowiringFactory } from './autowiring';
import { Checker } from './checker';
import { Compiler } from './compiler';
import { ContainerBuilder } from './containerBuilder';
import { DefinitionScanner } from './definitionScanner';
import { UserError } from './errors';
import { SourceFiles } from './sourceFiles';
import { DiccConfig } from './types';

export class Dicc {
  constructor(
    private readonly sourceFiles: SourceFiles,
    private readonly scanner: DefinitionScanner,
    private readonly autowiringFactory: AutowiringFactory,
    private readonly checker: Checker,
    private readonly config: DiccConfig,
    private readonly logger: Logger,
  ) {}

  async compile(): Promise<void> {
    const containers: Map<SourceFile, ContainerBuilder> = new Map();

    for (const [path, options] of Object.entries(this.config.containers)) {
      this.logger.debug(`Scanning resources for '${path}'...`);
      const builder = new ContainerBuilder(path, options, this.sourceFiles.getOutput(path));

      for (const [resource, opts] of Object.entries(options.resources)) {
        for (const input of this.sourceFiles.getInputs(path, resource)) {
          this.logger.trace(`Scanning '${input.getFilePath()}'`);
          this.scanner.scanDefinitions(builder, input, opts ?? undefined);
        }
      }

      containers.set(builder.output, builder);
    }

    for (const builder of containers.values()) {
      this.logger.debug(`Post-processing '${builder.path}'...`);
      this.checker.checkAutoFactories(builder);
      this.logger.trace('Cleaning up...');
      this.checker.removeExtraneousImplicitRegistrations(builder);
      this.logger.trace('Applying decorators...');
      builder.applyDecorators();
    }

    this.mergeForeignServices(containers);

    this.logger.trace('Autowiring dependencies...');
    this.autowiringFactory.create(containers).checkDependencies();

    for (const builder of containers.values()) {
      this.logger.debug(`Compiling '${builder.path}'...`);
      const compiler = new Compiler(builder);
      compiler.compile();
    }

    this.logger.debug(`Writing output files...`);

    for (const output of containers.keys()) {
      await output.save();
    }

    this.logger.debug(`Type-checking compiled containers...`);
    let errors = false;

    for (const [output, builder] of containers) {
      if (!builder.options.typeCheck) {
        this.logger.debug(`Type-checking disabled for '${builder.path}', skipping.`);
      } else if (!this.checker.checkOutput(output)) {
        errors = true;
      }
    }

    if (errors) {
      throw new UserError(`One or more compiled containers have TypeScript errors`);
    }
  }

  private mergeForeignServices(containers: Map<SourceFile, ContainerBuilder>): void {
    for (const builder of containers.values()) {
      for (const def of builder.getDefinitions()) {
        if (!def.container) {
          continue;
        }

        const source = def.type.getSymbol()?.getValueDeclaration()?.getSourceFile();

        if (!source) {
          continue;
        }

        const services = containers.get(source)?.getPublicServices() ?? this.scanner.resolvePublicServices(def.type);

        for (const [id, type, async] of services) {
          builder.register({
            id,
            type,
            factory: {
              args: [],
              returnType: type,
              async,
            },
            source: def.source,
            path: def.path,
            object: def.object,
            explicit: def.explicit,
            parent: def.id,
            scope: 'private',
            aliases: [],
            hooks: {},
          });
        }
      }
    }
  }
}
