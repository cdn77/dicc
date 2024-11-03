import { Type } from 'ts-morph';
import { ContainerBuilder, ImportMode } from '../container';
import { DecoratorDefinition, LocalServiceDefinition, ServiceDefinition } from '../definitions';
import { find, mapSet } from '../utils';
import { ForeignServiceCompilerFactory } from './foreignServiceCompiler';
import { ImportMapCompiler } from './importMapCompiler';
import { $lazy as $, Lazy, LazyCompiler, LazyWriter } from './lazy';
import { LocalServiceCompilerFactory } from './localServiceCompiler';
import { TypeMapCompiler } from './typeMapCompiler';

export interface ContainerCompilerFactory {
  create(builder: ContainerBuilder): ContainerCompiler;
}

export class ContainerCompiler {
  private readonly compiledDefinitions: Set<ServiceDefinition> = new Set();

  constructor(
    private readonly localServiceCompilerFactory: LocalServiceCompilerFactory,
    private readonly foreignServiceCompilerFactory: ForeignServiceCompilerFactory,
    private readonly typeMapCompiler: TypeMapCompiler,
    private readonly importMapCompiler: ImportMapCompiler,
    private readonly lazyCompiler: LazyCompiler,
    private readonly builder: ContainerBuilder,
  ) {}

  compile(): string {
    const definitions = this.compileDefinitions();
    const containerClass = this.compileClass(definitions);
    const typeMaps = this.typeMapCompiler.compile(this.builder.types, this.builder.imports, this.compiledDefinitions);
    const imports = this.importMapCompiler.compile(this.builder);

    return this.lazyCompiler.compile($`${imports}\n${typeMaps}\n${containerClass}`);
  }

  private compileDefinitions(): Lazy[] {
    for (const definition of this.builder.services.getPublicServices()) {
      this.compiledDefinitions.add(definition);
      definition.source ??= this.compileService(definition);
    }

    return [...this.compiledDefinitions]
      .sort((a, b) => compareIDs(a.id, b.id))
      .map((def) => $`'${def.id}': ${def.source},\n`);
  }

  private compileClass(definitions: Lazy[]): Lazy {
    const writer = new LazyWriter();
    const declaration = this.builder.className === 'default'
      ? 'default class'
      : `class ${this.builder.className}`;

    writer.writeLine(`export ${declaration} extends Container<PublicServices, DynamicServices, AnonymousServices> {`);
    writer.indent(() => {
      writer.writeLine('constructor() {');
      writer.indent(() => {
        writer.writeLine('super({');
        writer.indent(() => writer.write(...definitions));
        writer.writeLine('});');
      })
      writer.writeLine('}');
    });
    writer.writeLine('}');

    return writer;
  }

  resolveServiceInjection(type: Type): [id: string | undefined, async: boolean] {
    const definitions = this.builder.services.findByType(type);
    const [id] = mapSet(definitions, (definition) => {
      this.compiledDefinitions.add(definition);
      definition.source ??= this.compileService(definition);
      return definition.id;
    });

    const async = !!find(definitions, (definition) => definition.async);

    switch (definitions.size) {
      case 0: return [undefined, false];
      case 1: return [id, async];
      default: return [`#${this.builder.types.getTypeName(type)}`, async];
    }
  }

  resolveDefinitionPath(definition: LocalServiceDefinition | DecoratorDefinition, mode?: ImportMode): string {
    const info = this.builder.imports.getInfo(this.builder, definition.resource, mode);
    return `${info.alias}.${definition.path}`;
  }

  private compileService(definition: ServiceDefinition): Lazy {
    if (definition.isLocal()) {
      return this.localServiceCompilerFactory.create(this, this.builder, definition).compile();
    } else {
      return this.foreignServiceCompilerFactory.create(this, this.builder, definition).compile();
    }
  }
}

function compareIDs(a: string, b: string): number {
  return (a.indexOf('#') - b.indexOf('#')) || (
    a < b ? -1 : a > b ? 1 : 0
  );
}
