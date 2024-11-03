import { CompilerConfig } from '../config';
import { CompilerExtension, ExtensionLoader } from '../extensions';
import { Autowiring } from './autowiring';
import { Compilation } from './compilation';
import { ContainerCompilerFactory } from './containerCompiler';
import { ResourceScanner } from './resourceScanner';

export class Compiler {
  private readonly extensions: Set<CompilerExtension>;

  constructor(
    private readonly extensionLoader: ExtensionLoader,
    private readonly resourceScanner: ResourceScanner,
    private readonly autowiring: Autowiring,
    private readonly containerCompilerFactory: ContainerCompilerFactory,
    extensions: Iterable<CompilerExtension>,
    private readonly config: CompilerConfig,
    private readonly compilation: Compilation,
  ) {
    this.extensions = new Set(extensions);
  }

  async loadExtensions(): Promise<void> {
    for await (const extension of this.extensionLoader.load(this.config.extensions, this.config.configFile)) {
      this.extensions.add(extension);
    }
  }

  loadResources(): void {
    for (const [builder, config] of this.compilation.containers) {
      for (const [resource, options] of Object.entries(config.resources)) {
        this.resourceScanner.enqueueResources(
          builder,
          createResourceGlobs(resource, options?.excludePaths ?? []),
          options?.excludeExports ?? [],
        );
      }

      for (const extension of this.extensions) {
        extension.loadResources(builder, (resources, excludeExports, resolveFrom) => {
          this.resourceScanner.enqueueResources(builder, resources, excludeExports, resolveFrom);
        });
      }
    }

    this.resourceScanner.scanEnqueuedResources();
  }

  autowireDependencies(): void {
    for (const builder of this.compilation.containers.keys()) {
      for (const extension of this.extensions) {
        extension.autowireDependencies(builder);
      }
    }

    this.autowiring.checkDependencies(this.compilation.containers.keys());
  }

  compile(): string {
    for (const builder of this.compilation.containers.keys()) {
      return this.containerCompilerFactory.create(builder).compile();
    }

    return '';
  }
}

function createResourceGlobs(resource: string, exclude: string[]): string[] {
  return [resource, ...exclude.filter((p) => /(\/|\.tsx?$)/i.test(p)).map((e) => `!${e}`)];
}
