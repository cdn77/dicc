import { Node, SourceFile, SyntaxKind, TypeAliasDeclaration } from 'ts-morph';
import { TypeHelper } from './typeHelper';
import { ReferenceMap, ResolvedReference, ResolvedReferences } from './types';

export class ReferenceResolver<M extends ReferenceMap> {
  private references?: ResolvedReferences<M>;

  constructor(
    private readonly helper: TypeHelper,
    private readonly file: SourceFile,
    private readonly id: number,
    private readonly map: M,
  ) {
    this.setupHelper();
  }

  get<N extends keyof M>(name: N): ResolvedReference<M[N]> {
    this.references ??= this.resolve();
    return this.references[name];
  }

  private setupHelper(): void {
    for (const [name, spec] of Object.entries(this.map)) {
      if (spec.module) {
        this.file.addStatements(`export { ${name} as ${name}${this.id} } from '${spec.module}';\n`);
      } else {
        const kind = spec.kind === SyntaxKind.TypeAliasDeclaration ? 'type' : 'const';
        const exportName = name.replace(/(<|$)/, `${this.id}$1`);
        this.file.addStatements(`export ${kind} ${exportName} = ${name};\n`);
      }
    }
  }

  private resolve(): ResolvedReferences<M> {
    const references: ResolvedReferences<M> = {} as any;
    const exports = this.file.getExportedDeclarations();

    for (const [name, spec] of Object.entries(this.map)) {
      const declarations = exports.get(`${name.replace(/<.+$/, '')}${this.id}`) ?? [];
      const reference = declarations.find(Node.is(spec.kind));

      if (!reference) {
        throw new Error(`Unable to resolve reference to '${name}'${spec.module ? ` from module '${spec.module}'` : ''}`);
      }

      references[name as keyof ResolvedReferences<M>] = reference instanceof TypeAliasDeclaration
        ? this.helper.resolveRootType(reference.getType())
        : reference as any;
    }

    return references;
  }
}
