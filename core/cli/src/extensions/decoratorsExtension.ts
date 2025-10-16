import { Node, SourceFile } from 'ts-morph';
import { ContainerBuilder } from '../container';
import { DefinitionError, UserCodeContext } from '../errors';
import { EventSubscription } from '../events';
import { DeclarationNode, DeclarationNodeDiscovered, TypeHelper } from '../utils';
import { CompilerExtension } from './compilerExtension';
import { getPropertyLiteralValueIfKind, subpath, validateServiceScope } from './helpers';

export class DecoratorsExtension extends CompilerExtension {
  constructor(private readonly typeHelper: TypeHelper) {
    super();
  }

  *getSubscribedEvents(): Iterable<EventSubscription<any>> {
    yield DeclarationNodeDiscovered.sub((evt) =>
      this.scanNode(evt.resource, evt.path, evt.node, evt.builder),
    );
  }

  private scanNode(
    resource: SourceFile,
    path: string,
    node: DeclarationNode,
    builder: ContainerBuilder,
  ): void {
    if (!Node.isSatisfiesExpression(node)) {
      return;
    }

    const typeNode = node.getTypeNode();

    if (
      !Node.isTypeReference(typeNode) ||
      !this.typeHelper.isDecoratorDefinition(typeNode.getTypeName().getType())
    ) {
      return;
    }

    const expression = node.getExpression();
    const ctx: UserCodeContext = { builder, resource, path, node: expression };

    if (!Node.isObjectLiteralExpression(expression)) {
      throw new DefinitionError('Invalid decorator definition, must be an object literal', ctx);
    }

    const [typeArg] = typeNode.getTypeArguments();
    const targetType = typeArg.getType();
    const scope = getPropertyLiteralValueIfKind(
      expression,
      'scope',
      'string',
      subpath(ctx, 'scope'),
      validateServiceScope,
    );
    const decorate = this.typeHelper.resolveCallableProperty(expression, 'decorate', ctx);
    const onCreate = this.typeHelper.resolveCallableProperty(expression, 'onCreate', ctx);
    const onFork = this.typeHelper.resolveCallableProperty(expression, 'onFork', ctx);
    const onDestroy = this.typeHelper.resolveCallableProperty(expression, 'onDestroy', ctx);
    const priority = getPropertyLiteralValueIfKind(expression, 'priority', 'number');

    builder.addDecorator(resource, path, targetType, {
      scope,
      decorate,
      onCreate,
      onFork,
      onDestroy,
      priority,
      node: expression,
    });
  }
}
