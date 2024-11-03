import { resolve } from 'path';
import {
  ExportedDeclarations,
  Identifier, ImportClause, ImportSpecifier,
  ModuleDeclaration, NamespaceImport,
  Node,
  ObjectLiteralExpression,
  Project,
  PropertyName,
  SourceFile,
  SyntaxKind,
  VariableDeclaration,
} from 'ts-morph';
import { ContainerBuilder } from '../container';
import { Event, EventDispatcher } from '../events';
import { DeclarationNode } from '../utils';

export class ResourceDeclarationDiscovered extends Event {
  constructor(
    public readonly resource: SourceFile,
    public readonly path: string,
    public readonly node: DeclarationNode,
    public readonly builder: ContainerBuilder,
  ) {
    super();
  }
}

type EnqueuedResource = {
  builder: ContainerBuilder;
  resource: SourceFile;
  excludeExports?: string[];
};

type ScanContext = {
  builder: ContainerBuilder,
  resource: SourceFile;
  path: string;
  exclude?: RegExp;
};

export class ResourceScanner {
  private readonly queue: Set<EnqueuedResource> = new Set();

  constructor(
    private readonly project: Project,
    private readonly eventDispatcher: EventDispatcher,
  ) {}

  enqueueResources(
    builder: ContainerBuilder,
    resources: string | string[],
    excludeExports?: string[],
    resolveFrom?: string,
  ): void {
    resolveFrom ??= this.project.getFileSystem().getCurrentDirectory();
    resources = (Array.isArray(resources) ? resources : [resources]).map((r) => resolve(resolveFrom, r));

    for (const resource of this.project.addSourceFilesAtPaths(resources)) {
      this.queue.add({ builder, resource, excludeExports })
    }
  }

  scanEnqueuedResources(): void {
    for (const { builder, resource, excludeExports } of this.queue) {
      this.scanResource(builder, resource, excludeExports);
    }
  }

  private scanResource(builder: ContainerBuilder, resource: SourceFile, exclude?: string[]): void {
    const ctx: ScanContext = {
      builder,
      resource,
      path: '',
      exclude: createExcludeRegex(exclude),
    };

    this.scanNode(ctx, resource);
  }

  private scanNode(ctx: ScanContext, node?: Node): void {
    if (ctx.exclude?.test(ctx.path)) {
      return;
    }

    if (Node.isSourceFile(node)) {
      this.scanModule(ctx, node);
    } else if (Node.isModuleDeclaration(node) && node.hasNamespaceKeyword()) {
      this.scanModule(ctx, node);
    } else if (Node.isObjectLiteralExpression(node)) {
      this.scanObject(ctx, node);
    } else if (Node.isVariableDeclaration(node)) {
      this.scanVariableDeclaration(ctx, node);
    } else if (Node.isIdentifier(node)) {
      this.scanIdentifier(ctx, node);
    } else if (Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node) || Node.isFunctionDeclaration(node)) {
      this.emitDeclaration(ctx, node);
    }
  }

  private scanModule(ctx: ScanContext, node: SourceFile | ModuleDeclaration): void {
    for (const [name, declarations] of node.getExportedDeclarations().entries()) {
      this.scanExportedDeclarations({ ...ctx, path: `${ctx.path}${name}.` }, declarations);
    }
  }

  private scanExportedDeclarations(ctx: ScanContext, declarations?: ExportedDeclarations[]): void {
    for (const declaration of declarations ?? []) {
      this.scanNode(ctx, declaration);
    }
  }

  private scanObject(ctx: ScanContext, node: ObjectLiteralExpression): void {
    for (const prop of node.getProperties()) {
      if (Node.isSpreadAssignment(prop)) {
        this.scanNode(ctx, prop.getExpression());
      } else if (Node.isShorthandPropertyAssignment(prop)) {
        this.scanNode({ ...ctx, path: `${ctx.path}${prop.getName()}.` }, prop.getNameNode());
      } else if (Node.isPropertyAssignment(prop)) {
        const name = this.resolveLiteralPropertyName(prop.getNameNode());

        if (name !== undefined) {
          this.scanNode({ ...ctx, path: `${ctx.path}${name}.` }, prop.getInitializerOrThrow());
        }
      }
    }
  }

  private scanIdentifier(ctx: ScanContext, node: Identifier): void {
    for (const definition of node.getDefinitionNodes()) {
      if (Node.isNamespaceImport(definition)) {
        this.scanModule(ctx, this.scanImportSpecifier(definition));
      } else if (Node.isImportClause(definition)) {
        this.scanExportedDeclarations(
          ctx,
          this.scanImportSpecifier(definition)
            .getExportedDeclarations()
            .get('default'),
        );
      } else if (Node.isImportSpecifier(definition)) {
        this.scanExportedDeclarations(
          ctx,
          this.scanImportSpecifier(definition)
            .getExportedDeclarations()
            .get(definition.getAliasNode()?.getText() ?? definition.getName()),
        );
      } else if (definition !== node) {
        this.scanNode(ctx, definition);
      }
    }
  }

  private scanImportSpecifier(definition: NamespaceImport | ImportClause | ImportSpecifier): SourceFile {
    const sourceFile = definition
      .getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration)
      .getModuleSpecifierSourceFileOrThrow();

    this.project.addSourceFileAtPath(sourceFile.getFilePath());

    return sourceFile;
  }

  private scanVariableDeclaration(ctx: ScanContext, node: VariableDeclaration): void {
    const initializer = node.getInitializer();

    if (initializer) {
      this.emitDeclaration(ctx, initializer);
    }
  }

  private resolveLiteralPropertyName(name: PropertyName): string | number | undefined {
    if (Node.isIdentifier(name)) {
      return name.getText();
    } else if (Node.isStringLiteral(name) || Node.isNumericLiteral(name)) {
      return name.getLiteralValue();
    } else {
      return undefined;
    }
  }

  private emitDeclaration(ctx: ScanContext, node: DeclarationNode): void {
    this.eventDispatcher.dispatch(new ResourceDeclarationDiscovered(
      ctx.resource,
      ctx.path.replace(/\.$/, ''),
      node,
      ctx.builder,
    ));
  }
}

function createExcludeRegex(patterns?: string[]): RegExp | undefined {
  if (!patterns || !patterns.length) {
    return undefined;
  }

  patterns = patterns.map((p) => p
    .replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^.]*')
  );

  return new RegExp(`^(?:${patterns.join('|')})\.$`);
}
