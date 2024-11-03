import {
  Node,
  SyntaxKind,
  KindToNodeMappings,
  SourceFile,
  Type,
} from 'ts-morph';
import { InternalError } from '../errors';
import { getOrCreate } from './helpers';
import { ModuleResolver } from './moduleResolver';

export type ReferenceMap = Record<string, SyntaxKind>;

export type ResolvedReference<M extends ReferenceMap, N extends keyof M> = KindToNodeMappings[M[N]];

export type ResolvedMap<M extends ReferenceMap> = {
  [N in keyof M]: ResolvedReference<M, N>;
};

export interface ReferenceResolverFactory {
  create<M extends ReferenceMap>(moduleName: string, map: M, resolveFrom?: string): ReferenceResolver<M>;
}

export class ReferenceResolver<M extends ReferenceMap> {
  private readonly nodes: ResolvedMap<M>;
  private readonly types: Map<keyof M, Type> = new Map();

  constructor(
    moduleResolver: ModuleResolver,
    private readonly moduleName: string,
    map: M,
    resolveFrom?: string,
  ) {
    this.nodes = this.resolve(moduleResolver.resolve(this.moduleName, resolveFrom), map);
  }

  get<N extends keyof M>(name: N): ResolvedReference<M, N> {
    return this.nodes[name];
  }

  getType(name: keyof M): Type {
    return getOrCreate(this.types, name, () => this.resolveRootType(this.nodes[name].getType()));
  }

  isType(type: Type, name: keyof M): boolean {
    return this.resolveRootType(type) === this.getType(name);
  }

  private resolve(sourceFile: SourceFile, map: M): ResolvedMap<M> {
    const exports = sourceFile.getExportedDeclarations();

    return Object.fromEntries(Object.entries(map).map(([name, kind]) => {
      const declarations = exports.get(name);

      if (!declarations) {
        throw new InternalError(
          `Unable to resolve reference '${name}': module '${this.moduleName}' has no such export`,
        );
      }

      const node = declarations.find(Node.is(kind));

      if (!node) {
        throw new InternalError(
          `Unable to resolve reference '${name}': module '${this.moduleName}' has no export of the required kind`,
        );
      }

      return [name, node] as [any, any];
    }));
  }

  private resolveRootType(type: Type): Type {
    let target: Type | undefined;

    while ((target = type.getTargetType()) && target !== type) {
      type = target;
    }

    return target ?? type;
  }
}
