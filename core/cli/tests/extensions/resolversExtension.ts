import { Node, SyntaxKind } from 'ts-morph';
import {
  AnalyseServices,
  AutoImplementedMethod,
  CompilerExtension,
  CompilerExtensionInjectSpecifier,
  ContainerBuilder,
  EventSubscription,
  LiteralDefinition,
  LocalServiceDefinition,
  ReferenceMap,
  ReferenceResolver,
  SingleType,
  TypeHelper,
} from '../../dist';

const referenceMap = {
  Resolver: SyntaxKind.InterfaceDeclaration,
  ResolverFactory: SyntaxKind.ClassDeclaration,
} satisfies ReferenceMap;

export class ResolversExtension extends CompilerExtension {
  static readonly inject = [
    CompilerExtensionInjectSpecifier.ReferenceResolver,
    CompilerExtensionInjectSpecifier.TypeHelper,
  ];

  static readonly references = {
    module: './common.ts',
    map: referenceMap,
  };

  constructor(
    private readonly refs: ReferenceResolver<typeof referenceMap>,
    private readonly typeHelper: TypeHelper,
  ) {
    super();
  }

  *getSubscribedEvents(): Iterable<EventSubscription<any>> {
    yield AnalyseServices.sub((evt) => this.process(evt.builder));
  }

  private process(builder: ContainerBuilder): void {
    for (const definition of builder.findByType(this.refs.getType('Resolver'))) {
      if (definition.isLocal()) {
        this.registerFactory(definition, builder);
      }
    }
  }

  private registerFactory(
    resolverDefinition: LocalServiceDefinition,
    builder: ContainerBuilder,
  ): void {
    const operation = this.resolveOperationName(resolverDefinition);

    if (!operation) {
      return;
    }

    builder.removeService(resolverDefinition);

    const declaration = this.refs.get('ResolverFactory');
    const resource = declaration.getSourceFile();
    const type = this.refs.getType('ResolverFactory');

    builder.addExplicitDefinition(resource, 'ResolverFactory', type, {
      anonymous: true,
      factory: this.typeHelper.resolveFactory(type, {
        builder,
        resource,
        path: 'ResolverFactory',
      }),
      args: new Map([['operationName', new LiteralDefinition(JSON.stringify(operation))]]),
      node: declaration,
      declaration,
      autoImplement: {
        method: new AutoImplementedMethod(
          resource,
          'ResolverFactory',
          'create',
          new Map(),
          resolverDefinition.type,
          new SingleType(resolverDefinition.type),
        ),
        service: resolverDefinition,
      },
    });
  }

  private resolveOperationName(service: LocalServiceDefinition): string | undefined {
    if (!service.declaration) {
      return undefined;
    }

    const prop = service.declaration.getProperty('operationName');

    if (!Node.isPropertyDeclaration(prop)) {
      return undefined;
    }

    const value = prop.getInitializer();

    return Node.isStringLiteral(value) ? value.getLiteralValue() : undefined;
  }
}
