import { Logger } from '@debugr/core';
import { ServiceScope } from 'dicc';
import { relative } from 'path';
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
  SyntaxKind,
  Type,
  TypeReferenceNode,
  VariableDeclaration,
} from 'ts-morph';
import { ContainerBuilder } from './containerBuilder';
import { DefinitionError } from './errors';
import { TypeHelper } from './typeHelper';
import {
  CallbackInfo,
  ResourceOptions,
  ServiceFactoryInfo,
  ServiceHooks,
  TypeFlag,
} from './types';

export class DefinitionScanner {
  constructor(
    private readonly helper: TypeHelper,
    private readonly logger: Logger,
  ) {}

  scanDefinitions(builder: ContainerBuilder, source: SourceFile, options: ResourceOptions = {}): void {
    const exclude = createExcludeRegex(options.exclude);
    const ctx: ScanContext = {
      builder,
      source,
      exclude,
      path: '',
      describe() {
        return `'${this.path.replace(/\.$/, '')}' found in '${relative(process.cwd(), this.source.getFilePath())}'`;
      },
    };

    this.scanNode(ctx, source);
  }

  private scanNode(ctx: ScanContext, node?: Node): void {
    if (ctx.exclude?.test(ctx.path)) {
      this.logger.trace(`Ignored ${ctx.describe()}`);
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
    const args = this.resolveServiceArgs(definition);
    const scope = this.resolveServiceScope(definition);
    const hooks = this.resolveServiceHooks(definition);
    const anonymous = this.resolveAnonymousFlag(definition);
    const id = definition && !anonymous ? path : undefined;
    const explicit = !!definition;

    this.logger.debug(`Register service ${ctx.describe()}`);

    ctx.builder.register({
      source,
      path,
      id,
      type,
      aliases,
      object,
      explicit,
      anonymous,
      factory,
      args,
      scope,
      hooks,
    });
  }

  private registerDecorator(ctx: ScanContext, definition: Expression, nodeType: TypeReferenceNode): void {
    if (!Node.isObjectLiteralExpression(definition)) {
      return;
    }

    const source = ctx.source;
    const path = ctx.path.replace(/\.$/, '');
    const [typeArg] = nodeType.getTypeArguments();
    const type = typeArg.getType();
    const priority = this.resolveDecoratorPriority(definition);
    const decorate = this.resolveServiceHook(definition, 'decorate');
    const scope = this.resolveServiceScope(definition);
    const hooks = this.resolveServiceHooks(definition);
    this.logger.debug(`Register decorator ${ctx.describe()}`);
    ctx.builder.decorate({ source, path, type, priority, decorate, scope, hooks });
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
    const [returnType, async] = this.helper.unwrapAsyncType(signature.getReturnType());
    const parameters = signature.getParameters().map((param) => this.helper.resolveParameterInfo(param));
    return { parameters, returnType, method, async };
  }

  private resolveServiceArgs(definition?: Expression): Record<string, CallbackInfo | undefined> | undefined {
    if (!Node.isObjectLiteralExpression(definition)) {
      return undefined;
    }

    const argsProp = definition.getProperty('args');

    if (!argsProp) {
      return undefined;
    } else if (!Node.isPropertyAssignment(argsProp)) {
      throw new DefinitionError(`Invalid 'args', must be a property assignment`, argsProp);
    }

    const argsInit = argsProp.getInitializer();

    if (!Node.isObjectLiteralExpression(argsInit)) {
      throw new DefinitionError(`Invalid 'args', must be an object literal`, argsInit ?? argsProp);
    }

    const args: Record<string, CallbackInfo | undefined> = {};

    for (const arg of argsInit.getProperties()) {
      if (!Node.isPropertyAssignment(arg)) {
        throw new DefinitionError(`Invalid 'args' property, 'args' must be a plain object literal`, arg ?? argsInit);
      }

      args[arg.getName()] = this.resolveCallbackInfo(arg);
    }

    return args;
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

  private resolveServiceHook(definition: ObjectLiteralExpression, hook: string): CallbackInfo | undefined {
    const hookProp = definition.getProperty(hook);
    const info = this.resolveCallbackInfo(hookProp, hook === 'onFork' ? 2 : 1);

    if (!info && hookProp) {
      throw new DefinitionError(`Invalid '${hook}' hook, must be a method declaration or property assignment`, hookProp);
    }

    return info;
  }

  private resolveCallbackInfo(node?: Node, skip: number = 0): CallbackInfo | undefined {
    const signature = this.resolveCallSignature(node);

    if (!signature) {
      return undefined;
    }

    const parameters = signature.getParameters().slice(skip);
    const [, flags] = this.helper.resolveType(signature.getReturnType());

    return {
      parameters: parameters.map((p) => this.helper.resolveParameterInfo(p)),
      async: Boolean(flags & TypeFlag.Async),
    };
  }

  private resolveCallSignature(node?: Node): Signature | undefined {
    if (Node.isMethodDeclaration(node)) {
      return node.getSignature();
    } else if (Node.isPropertyAssignment(node)) {
      const value = node.getInitializer();

      if (Node.isFunctionExpression(value) || Node.isArrowFunction(value)) {
        return value.getSignature();
      }
    }

    return undefined;
  }

  private resolveServiceScope(definition?: Expression): ServiceScope | undefined {
    const initializer = this.resolvePropertyInitializer(definition, 'scope');

    if (!initializer) {
      return undefined;
    } else if (!Node.isStringLiteral(initializer)) {
      throw new DefinitionError(`The 'scope' option must be a string literal`, initializer);
    }

    const scope = initializer.getLiteralValue();

    switch (scope) {
      case 'global':
      case 'local':
      case 'private':
        return scope;
      default:
        throw new DefinitionError(`Invalid value for 'scope', must be one of 'global', 'local' or 'private'`, initializer);
    }
  }

  private resolveDecoratorPriority(definition?: Expression): number {
    const initializer = this.resolvePropertyInitializer(definition, 'priority');

    if (!initializer) {
      return 0;
    } else if (Node.isNumericLiteral(initializer)) {
      return initializer.getLiteralValue();
    } else {
      throw new DefinitionError(`The 'priority' option must be a numeric literal`, initializer);
    }
  }

  private resolveAnonymousFlag(definition?: Expression): boolean | undefined {
    const initializer = this.resolvePropertyInitializer(definition, 'anonymous');

    if (!initializer) {
      return undefined;
    } else if (Node.isTrueLiteral(initializer) || Node.isFalseLiteral(initializer)) {
      return initializer.getLiteralValue();
    } else {
      throw new DefinitionError(`The 'anonymous' option must be a boolean literal`, initializer);
    }
  }

  private resolvePropertyInitializer(definition: Expression | undefined, name: string): Node | undefined {
    if (!Node.isObjectLiteralExpression(definition)) {
      return undefined;
    }

    const prop = definition.getProperty(name);

    if (!prop) {
      return undefined;
    } else if (!Node.isPropertyAssignment(prop)) {
      throw new DefinitionError(`The '${name}' option must be a simple property assignment`, prop);
    }

    return prop.getInitializerOrThrow(`Missing initializer for option '${name}'`);
  }
}

type ScanContext = {
  builder: ContainerBuilder,
  source: SourceFile;
  path: string;
  exclude?: RegExp;
  describe(): string;
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
