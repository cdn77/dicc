import { ServiceScope } from 'dicc';
import {
  ClassDeclaration,
  ExportedDeclarations,
  Expression,
  Identifier,
  InterfaceDeclaration,
  ModuleDeclaration,
  Node,
  ObjectLiteralExpression,
  SatisfiesExpression,
  Signature,
  SourceFile,
  Symbol,
  SyntaxKind,
  Type,
  TypeReferenceNode,
  VariableDeclaration,
} from 'ts-morph';
import { ServiceRegistry } from './serviceRegistry';
import { TypeHelper } from './typeHelper';
import {
  ParameterInfo,
  ResourceOptions,
  ServiceFactoryInfo,
  ServiceHookInfo,
  ServiceHooks,
  TypeFlag,
} from './types';

export class DefinitionScanner {
  private readonly registry: ServiceRegistry;
  private readonly helper: TypeHelper;

  constructor(registry: ServiceRegistry, helper: TypeHelper) {
    this.registry = registry;
    this.helper = helper;
  }

  scanDefinitions(source: SourceFile, options: ResourceOptions = {}): void {
    const exclude = createExcludeRegex(options.exclude);
    const ctx: ScanContext = { source, exclude, path: '' };
    this.scanNode(ctx, source);
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
    } else if (Node.isClassDeclaration(node)) {
      this.scanClassDeclaration(ctx, node);
    } else if (Node.isInterfaceDeclaration(node)) {
      this.scanInterfaceDeclaration(ctx, node);
    } else if (Node.isSatisfiesExpression(node)) {
      this.scanSatisfiesExpression(ctx, node);
    }
  }

  private scanModule(ctx: ScanContext, node: SourceFile | ModuleDeclaration): void {
    for (const [name, declarations] of node.getExportedDeclarations()) {
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
        const name = this.helper.resolveLiteralPropertyName(prop.getNameNode());

        if (name !== undefined) {
          this.scanNode({ ...ctx, path: `${ctx.path}${name}.` }, prop.getInitializerOrThrow());
        }
      }
    }
  }

  private scanIdentifier(ctx: ScanContext, node: Identifier): void {
    for (const definition of node.getDefinitionNodes()) {
      if (Node.isNamespaceImport(definition)) {
        this.scanModule(
          ctx,
          definition
            .getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration)
            .getModuleSpecifierSourceFileOrThrow(),
        );
      } else if (Node.isImportClause(definition)) {
        this.scanExportedDeclarations(
          ctx,
          definition
            .getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration)
            .getModuleSpecifierSourceFileOrThrow()
            .getExportedDeclarations()
            .get('default'),
        );
      } else if (Node.isImportSpecifier(definition)) {
        this.scanExportedDeclarations(
          ctx,
          definition
            .getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration)
            .getModuleSpecifierSourceFileOrThrow()
            .getExportedDeclarations()
            .get(definition.getAliasNode()?.getText() ?? definition.getName()),
        );
      } else if (Node.isVariableDeclaration(definition)) {
        this.scanNode(ctx, definition.getInitializer());
      }
    }
  }

  private scanClassDeclaration(ctx: ScanContext, node: ClassDeclaration): void {
    if (node.isAbstract() || node.getTypeParameters().length) {
      return;
    }

    this.registerService(ctx, node.getType(), this.helper.resolveClassTypes(node));
  }

  private scanInterfaceDeclaration(ctx: ScanContext, node: InterfaceDeclaration): void {
    if (node.getTypeParameters().length) {
      return;
    }

    this.registerService(ctx, node.getType(), this.helper.resolveInterfaceTypes(node));
  }

  private scanVariableDeclaration(ctx: ScanContext, node: VariableDeclaration): void {
    this.scanNode(ctx, node.getInitializer());
  }

  private scanSatisfiesExpression(ctx: ScanContext, node: SatisfiesExpression): void {
    const satisfies = node.getTypeNode();

    if (this.helper.isServiceDefinition(satisfies)) {
      const [typeArg, aliasArg] = satisfies.getTypeArguments();
      this.registerService(ctx, typeArg.getType(), this.helper.resolveAliases(aliasArg), node.getExpression());
    } else if (this.helper.isServiceDecorator(satisfies)) {
      this.registerDecorator(ctx, node.getExpression(), satisfies);
    }
  }

  private registerService(
    ctx: ScanContext,
    type: Type,
    aliases: Type[],
    definition?: Expression,
  ): void {
    const source = ctx.source;
    const path = ctx.path.replace(/\.$/, '');
    const [factory, object] = this.resolveFactory(type, definition);
    const scope = this.resolveServiceScope(definition);
    const hooks = this.resolveServiceHooks(definition);
    const id = definition ? path : undefined;
    const explicit = !!definition;
    this.registry.register({ source, path, id, type, aliases, object, explicit, factory, scope, hooks });
  }

  private registerDecorator(ctx: ScanContext, definition: Expression, nodeType: TypeReferenceNode): void {
    if (!Node.isObjectLiteralExpression(definition)) {
      return;
    }

    const source = ctx.source;
    const path = ctx.path.replace(/\.$/, '');
    const [typeArg] = nodeType.getTypeArguments();
    const type = typeArg.getType();
    const decorate = this.resolveServiceHook(definition, 'decorate');
    const scope = this.resolveServiceScope(definition);
    const hooks = this.resolveServiceHooks(definition);
    this.registry.decorate({ source, path, type, decorate, scope, hooks });
  }

  private resolveFactory(type: Type, definition?: Expression): [factory?: ServiceFactoryInfo, object?: boolean] {
    if (!definition && type.isClass()) {
      const symbol = type.getSymbolOrThrow();
      const declaration = symbol.getValueDeclarationOrThrow();
      return [this.resolveFactoryInfo(symbol.getTypeAtLocation(declaration)), false];
    }

    const [factory, object] = Node.isObjectLiteralExpression(definition)
      ? [definition.getPropertyOrThrow('factory'), true]
      : [definition, false];
    return [factory && this.resolveFactoryInfo(factory.getType()), object];
  }

  private resolveFactoryInfo(factoryType: Type): ServiceFactoryInfo | undefined {
    if (factoryType.isUndefined()) {
      return undefined;
    }

    const [signature, method] = this.helper.resolveFactorySignature(factoryType);
    const [returnType, async] = this.helper.resolveServiceType(signature.getReturnType());
    const parameters = signature.getParameters().map((param) => this.resolveParameter(param));
    return { parameters, returnType, method, async };
  }

  private resolveServiceHooks(definition?: Expression): ServiceHooks {
    if (!Node.isObjectLiteralExpression(definition)) {
      return {};
    }

    const hooks: ServiceHooks = {};

    for (const hook of ['onCreate', 'onFork', 'onDestroy'] as const) {
      hooks[hook] = this.resolveServiceHook(definition, hook);
    }

    return hooks;
  }

  private resolveServiceHook(definition: ObjectLiteralExpression, hook: string): ServiceHookInfo | undefined {
    const signature = this.resolveHookSignature(hook, definition.getProperty(hook));

    if (!signature) {
      return undefined;
    }

    const [, ...parameters] = signature.getParameters();
    const [, flags] = this.helper.resolveType(signature.getReturnType());

    return {
      parameters: parameters.map((p) => this.resolveParameter(p)),
      async: Boolean(flags & TypeFlag.Async),
    };
  }

  private resolveHookSignature(type: string, hook?: Node): Signature | undefined {
    if (Node.isMethodDeclaration(hook)) {
      return hook.getSignature();
    } else if (Node.isPropertyAssignment(hook)) {
      const hookValue = hook.getInitializer();

      if (Node.isFunctionExpression(hookValue) || Node.isArrowFunction(hookValue)) {
        return hookValue.getSignature();
      }
    }

    if (!hook) {
      return undefined;
    }

    throw new Error(`Invalid '${type}' hook, must be a method declaration or property assignment`);
  }

  private resolveParameter(symbol: Symbol): ParameterInfo {
    const name = symbol.getName();
    const declaration = symbol.getValueDeclarationOrThrow();
    let [type, flags] = this.helper.resolveType(declaration.getType());

    if (Node.isParameterDeclaration(declaration) && declaration.hasInitializer()) {
      flags |= TypeFlag.Optional;
    }

    return type.isClassOrInterface() || type.isObject()
      ? { name, type, flags }
      : { name, flags };
  }

  private resolveServiceScope(definition?: Expression): ServiceScope | undefined {
    if (!Node.isObjectLiteralExpression(definition)) {
      return undefined;
    }

    const scopeProp = definition.getProperty('scope');

    if (!scopeProp) {
      return undefined;
    } else if (!Node.isPropertyAssignment(scopeProp)) {
      throw new Error(`The 'scope' option must be a simple property assignment`);
    }

    const initializer = scopeProp.getInitializer();

    if (!Node.isStringLiteral(initializer)) {
      throw new Error(`The 'scope' option must be initialised with a string literal`);
    }

    const scope = initializer.getLiteralValue();

    switch (scope) {
      case 'global':
      case 'local':
      case 'private':
        return scope;
      default:
        throw new Error(`Invalid value for 'scope', must be one of 'global', 'local' or 'private'`);
    }
  }
}

type ScanContext = {
  source: SourceFile;
  path: string;
  exclude?: RegExp;
};

function createExcludeRegex(patterns?: string[]): RegExp | undefined {
  if (!patterns || !patterns.length) {
    return undefined;
  }

  patterns = patterns
    .filter((p) => !/(\/|\.tsx?$)/i.test(p))
    .map((p) => p
      .replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')
      .replace(/\\\*\\\*/g, '.*')
      .replace(/\\\*/g, '[^.]*')
    );

  return new RegExp(`^(?:${patterns.join('|')})\.$`);
}
