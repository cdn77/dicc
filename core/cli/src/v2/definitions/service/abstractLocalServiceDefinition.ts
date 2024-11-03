import { ServiceScope } from 'dicc';
import { ClassDeclaration, InterfaceDeclaration, Node, SourceFile, Type } from 'ts-morph';
import { ContainerBuilder } from '../../container';
import { DecoratorDefinition } from '../decoratorDefinition';
import { FactoryDefinition } from '../factoryDefinition';
import type { ExplicitServiceDefinition } from './explicitServiceDefinition';
import type { ImplicitServiceDefinition } from './implicitServiceDefinition';
import { AbstractServiceDefinition } from './abstractServiceDefinition';
import type {
  AutoImplementationInfo,
  LocalServiceDefinitionOptions,
  ServiceDefinition,
} from './types';

export class AbstractLocalServiceDefinition extends AbstractServiceDefinition {
  public readonly factory?: FactoryDefinition;
  public readonly scope: ServiceScope;
  public readonly node?: Node;
  public readonly declaration?: ClassDeclaration | InterfaceDeclaration;
  public readonly container: boolean;
  public autoImplement?: AutoImplementationInfo;
  public decorators?: DecoratorDefinition[];
  public autoRegister?: Map<string, ServiceDefinition>;

  constructor(
    builder: ContainerBuilder,
    public readonly resource: SourceFile,
    public readonly path: string,
    id: string,
    type: Type,
    options: LocalServiceDefinitionOptions = {},
  ) {
    super(builder, id, type, options.aliases);
    this.factory = options.factory;
    this.scope = options.scope ?? 'global';
    this.node = options.node;
    this.declaration = options.declaration;
    this.container = options.container ?? false;
  }

  isLocal(): this is ImplicitServiceDefinition | ExplicitServiceDefinition {
    return true;
  }
}
