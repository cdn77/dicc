import {
  ExportedDeclarations,
  Node,
  Project,
  SyntaxKind,
  Type,
  TypeAliasDeclaration,
  ts,
} from 'ts-morph';
import { TypeHelper } from './typeHelper';
import { ResolvedReference } from './types';

export class ReferenceResolver {
  private readonly cache: Map<string, Type | Node> = new Map();
  private readonly exports: ReadonlyMap<string, ExportedDeclarations[]>;

  constructor(
    private readonly project: Project,
    private readonly typeHelper: TypeHelper,
    private readonly moduleName: string,
  ) {
    this.exports = this.resolveModule();
  }

  get<K extends SyntaxKind>(name: string, kind: K): ResolvedReference<K> {
    const cached = this.cache.get(name);

    if (cached) {
      return cached as ResolvedReference<K>;
    }

    const declarations = this.exports.get(name);

    if (!declarations) {
      throw new Error(`Unable to resolve reference '${name}': module '${this.moduleName}' has no such export`);
    }

    const node = declarations.find(Node.is(kind));

    if (!node) {
      throw new Error(`Unable to resolve reference '${name}': module '${this.moduleName}' has no export of the required kind`);
    }

    const reference = node instanceof TypeAliasDeclaration
      ? this.typeHelper.resolveRootType(node.getType())
      : node;

    this.cache.set(name, reference);
    return reference as ResolvedReference<K>;
  }

  private resolveModule(): ReadonlyMap<string, ExportedDeclarations[]> {
    const fs = this.project.getFileSystem();

    const result = ts.resolveModuleName(
      this.moduleName,
      `${fs.getCurrentDirectory()}/dummy.ts`,
      this.project.getCompilerOptions(),
      this.project.getModuleResolutionHost(),
    );

    if (!result.resolvedModule) {
      throw new Error(`Unable to resolve module '${this.moduleName}'`);
    }

    const file = this.project.addSourceFileAtPath(result.resolvedModule.resolvedFileName);

    return file.getExportedDeclarations();
  }
}
