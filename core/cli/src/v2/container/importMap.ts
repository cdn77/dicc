import { SourceFile } from 'ts-morph';
import { getOrCreate } from '../utils';
import { ContainerBuilder } from './containerBuilder';

export enum ImportMode {
  None = 0b00,
  Type = 0b01,
  Value = 0b10,
  Both = 0b11,
}

export type ImportInfo = {
  specifier: string;
  dynamicSpecifier: string;
  alias: string;
  mode: ImportMode;
};

export class ImportMap implements Iterable<ImportInfo> {
  public useServiceType: boolean = false;
  public useForeignServiceType: boolean = false;

  private readonly resources: Map<SourceFile, ImportInfo> = new Map();
  private readonly aliases: Set<string> = new Set();

  getInfo(builder: ContainerBuilder, resource: SourceFile, mode: ImportMode = ImportMode.None): ImportInfo {
    const info = getOrCreate(this.resources, resource, () => {
      const name = resource.getFilePath()
        .replace(/^(?:.*?\/)?([^\/]+)(?:\/index)?(?:\.d)?\.tsx?$/i, '$1')
        .replace(/^[^a-z]+|[^a-z0-9]+/gi, '')
        .replace(/^$/, 'anon');

      for (let i = 0; ; ++i) {
        const alias = `${name}${i}`;

        if (!this.aliases.has(alias)) {
          const info: ImportInfo = {
            ...this.resolveSpecifier(builder, resource),
            alias,
            mode,
          };

          this.aliases.add(alias);
          return info;
        }
      }
    });

    info.mode |= mode;
    return info;
  }

  private resolveSpecifier(
    builder: ContainerBuilder,
    resource: SourceFile,
  ): { specifier: string, dynamicSpecifier: string } {
    const specifier = builder.sourceFile.getRelativePathAsModuleSpecifierTo(resource);
    const ext = resource.getFilePath().match(/\.([mc]?)[jt]sx?$/i);
    return { specifier, dynamicSpecifier: `${specifier}.${ext ? ext[1] : ''}js` };
  }

  * [Symbol.iterator](): Iterator<ImportInfo> {
    yield * this.resources.values();
  }
}
