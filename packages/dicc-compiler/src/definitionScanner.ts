import { ServiceScope } from 'dicc';
import {
  ExportedDeclarations,
  Expression,
  Identifier,
  ModuleDeclaration,
  Node,
  ObjectLiteralExpression,
  SatisfiesExpression,
  Signature,
  SourceFile,
  Symbol,
  SyntaxKind,
  Type,
  TypeNode,
} from 'ts-morph';
import { ServiceRegistry } from './serviceRegistry';
import { TypeHelper } from './typeHelper';
import { ParameterInfo, ServiceFactoryInfo, ServiceHooks, TypeFlag } from './types';

export class DefinitionScanner {
  private readonly registry: ServiceRegistry;
  private readonly helper: TypeHelper;

  constructor(registry: ServiceRegistry, helper: TypeHelper) {
    this.registry = registry;
    this.helper = helper;
  }

  scanDefinitions(input: SourceFile): void {
    for (const [id, expression] of this.scanNode(input)) {
      try {
        const [definition, type, aliases] = this.extractDefinitionParameters(expression);

        if (definition && type) {
          this.registerDefinition(input, id, definition, type, aliases);
        }
      } catch (e: any) {
        throw new Error(`Invalid definition '${id}': ${e.message}`);
      }
    }
  }

  scanUsages(): void {
    for (const method of ['get', 'find', 'createAccessor', 'createListAccessor', 'createIterator', 'createAsyncIterator']) {
      for (const call of this.helper.getContainerMethodCalls(method)) {
        const [id] = call.getArguments();

        if (Node.isStringLiteral(id) && !this.registry.has(id.getLiteralValue())) {
          const sf = id.getSourceFile();
          const ln = id.getStartLineNumber();
          console.log(`Warning: unknown service '${id.getLiteralValue()}' in call to Container.${method}() in ${sf.getFilePath()} on line ${ln}`);
        }
      }
    }

    const registrations: Set<string> = new Set();

    for (const call of this.helper.getContainerMethodCalls('register')) {
      const [id] = call.getArguments();

      if (Node.isStringLiteral(id)) {
        registrations.add(id.getLiteralValue());
      }
    }

    for (const definition of this.registry.getDefinitions()) {
      if (!definition.factory && !registrations.has(definition.id)) {
        console.log(`Warning: no Container.register() call found for dynamic service '${definition.id}'`);
      }
    }
  }

  private * scanNode(node?: Node, path: string = ''): Iterable<[string, SatisfiesExpression]> {
    if (Node.isSourceFile(node)) {
      yield * this.scanModule(node, path);
    } else if (Node.isModuleDeclaration(node) && node.hasNamespaceKeyword()) {
      yield * this.scanModule(node, path);
    } else if (Node.isObjectLiteralExpression(node)) {
      yield * this.scanObject(node, path);
    } else if (Node.isVariableDeclaration(node)) {
      yield * this.scanNode(node.getInitializer(), path);
    } else if (Node.isIdentifier(node)) {
      yield * this.scanIdentifier(node, path);
    } else if (Node.isSatisfiesExpression(node)) {
      yield [path.replace(/\.$/, ''), node];
    }
  }

  private * scanModule(node: SourceFile | ModuleDeclaration, path: string = ''): Iterable<[string, SatisfiesExpression]> {
    for (const [name, declarations] of node.getExportedDeclarations()) {
      yield * this.scanExportedDeclarations(declarations, `${path}${name}.`);
    }
  }

  private * scanExportedDeclarations(declarations?: ExportedDeclarations[], path: string = ''): Iterable<[string, SatisfiesExpression]> {
    for (const declaration of declarations ?? []) {
      yield * this.scanNode(declaration, path);
    }
  }

  private * scanObject(node: ObjectLiteralExpression, path: string = ''): Iterable<[string, SatisfiesExpression]> {
    for (const prop of node.getProperties()) {
      if (Node.isSpreadAssignment(prop)) {
        yield * this.scanNode(prop.getExpression(), path);
      } else if (Node.isShorthandPropertyAssignment(prop)) {
        yield * this.scanNode(prop.getNameNode(), `${path}${prop.getName()}.`);
      } else if (Node.isPropertyAssignment(prop)) {
        const name = this.helper.resolveLiteralPropertyName(prop.getNameNode());

        if (name !== undefined) {
          yield * this.scanNode(prop.getInitializerOrThrow(), `${path}${name}.`);
        }
      }
    }
  }

  private * scanIdentifier(node: Identifier, path: string = ''): Iterable<[string, SatisfiesExpression]> {
    for (const definition of node.getDefinitionNodes()) {
      if (Node.isNamespaceImport(definition)) {
        yield * this.scanModule(
          definition
            .getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration)
            .getModuleSpecifierSourceFileOrThrow(),
          path,
        );
      } else if (Node.isImportClause(definition)) {
        yield * this.scanExportedDeclarations(
          definition
            .getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration)
            .getModuleSpecifierSourceFileOrThrow()
            .getExportedDeclarations()
            .get('default'),
          path,
        );
      } else if (Node.isImportSpecifier(definition)) {
        yield * this.scanExportedDeclarations(
          definition
            .getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration)
            .getModuleSpecifierSourceFileOrThrow()
            .getExportedDeclarations()
            .get(definition.getAliasNode()?.getText() ?? definition.getName()),
          path,
        );
      } else if (Node.isVariableDeclaration(definition)) {
        yield * this.scanNode(definition.getInitializerOrThrow(), path);
      }
    }
  }

  private extractDefinitionParameters(expression: SatisfiesExpression): [definition?: Expression, type?: TypeNode, aliases?: TypeNode] {
    const satisfies = expression.getTypeNode();

    if (!this.helper.isServiceDefinition(satisfies)) {
      return [];
    }

    const definition = expression.getExpression();
    const [type, aliases] = satisfies.getTypeArguments();
    return [definition, type, aliases];
  }

  private registerDefinition(source: SourceFile, id: string, definition: Expression, typeArg: TypeNode, aliasArg?: TypeNode): void {
    const type = typeArg.getType();
    const aliases = this.helper.resolveAliases(aliasArg);
    const [factory, object] = this.resolveFactory(definition);
    const hooks = this.resolveServiceHooks(definition);
    const scope = this.resolveServiceScope(definition);
    this.registry.register({ source, id, type, aliases, object, factory, hooks, scope });
  }

  private resolveFactory(definition: Expression): [factory?: ServiceFactoryInfo, object?: boolean] {
    const [factory, object] = Node.isObjectLiteralExpression(definition)
      ? [definition.getPropertyOrThrow('factory'), true]
      : [definition, false];
    return [this.resolveFactoryInfo(factory.getType()), object];
  }

  private resolveFactoryInfo(factoryType: Type): ServiceFactoryInfo | undefined {
    if (factoryType.isUndefined()) {
      return undefined;
    }

    const ctors = factoryType.getConstructSignatures();
    const constructable = ctors.length > 0;
    const signatures = [...ctors, ...factoryType.getCallSignatures()];

    if (!signatures.length) {
      if (!constructable) {
        throw new Error(`No call or construct signatures found on service factory`);
      }

      return { constructable, parameters: [], returnType: factoryType };
    } else if (signatures.length > 1) {
      throw new Error(`Multiple overloads on service factories aren't supported`);
    }

    const [returnType, async] = this.helper.resolveServiceType(signatures[0].getReturnType());
    const parameters = signatures[0].getParameters().map((param) => this.resolveParameter(param));
    return { parameters, returnType, constructable, async };
  }

  private resolveServiceHooks(definition?: Expression): ServiceHooks {
    if (!Node.isObjectLiteralExpression(definition)) {
      return {};
    }

    const hooks: ServiceHooks = {};

    for (const hook of ['onCreate', 'onFork', 'onDestroy'] as const) {
      const signature = this.resolveHookSignature(hook, definition.getProperty(hook));

      if (signature) {
        const [, ...parameters] = signature.getParameters();

        if (parameters.length) {
          const [, flags] = this.helper.resolveType(signature.getReturnType());

          hooks[hook] = {
            parameters: parameters.map((p) => this.resolveParameter(p)),
            async: Boolean(flags & TypeFlag.Async),
          };
        }
      }
    }

    return hooks;
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
    const [type, flags] = this.helper.resolveType(symbol.getValueDeclarationOrThrow().getType());
    const name = symbol.getName();
    return type.isClassOrInterface() || type.isObject()
      ? { name, type, flags }
      : { name, flags };
  }

  private resolveServiceScope(definition?: Expression): ServiceScope {
    if (!Node.isObjectLiteralExpression(definition)) {
      return 'global';
    }

    const scopeProp = definition.getProperty('scope');

    if (!scopeProp) {
      return 'global';
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
