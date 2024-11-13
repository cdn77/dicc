import { ContainerAnalyser } from '../analysis';
import { BuilderMap } from '../container';
import { ResourceScanner } from '../definitions';
import { CompilerExtension, ExtensionLoader } from '../extensions';
import { ContainerCompiler } from './containerCompiler';

export class Compiler {
  private readonly extensions: Set<CompilerExtension> = new Set();

  constructor(
    private readonly extensionLoader: ExtensionLoader,
    private readonly defaultExtensions: AsyncIterable<CompilerExtension>,
    private readonly resourceScanner: ResourceScanner,
    private readonly containerAnalyser: ContainerAnalyser,
    private readonly containerCompiler: ContainerCompiler,
    private readonly builders: BuilderMap,
  ) {}

  async compile(): Promise<void> {
    await this.loadExtensions();

    this.loadResources();

    for (const [builder, container] of this.containerAnalyser.analyse(this.builders)) {
      builder.sourceFile.replaceWithText(this.containerCompiler.compile(container));
    }

    for (const builder of this.builders) {
      await builder.sourceFile.save();
    }
  }

  private async loadExtensions(): Promise<void> {
    for await (const extension of this.defaultExtensions) {
      this.extensions.add(extension);
    }

    for await (const extension of this.extensionLoader.load()) {
      this.extensions.add(extension);
    }
  }

  private loadResources(): void {
    for (const builder of this.builders) {
      for (const [resource, options] of Object.entries(builder.options.resources)) {
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
}

function createResourceGlobs(resource: string, exclude: string[]): string[] {
  return [resource, ...exclude.filter((p) => /(\/|\.tsx?$)/i.test(p)).map((e) => `!${e}`)];
}
