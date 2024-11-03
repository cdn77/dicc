import { Type } from 'ts-morph';
import { ImportMap, ImportMode, TypeMap } from '../container';
import {
  ForeignServiceDefinition,
  LocalServiceDefinition,
  ServiceDefinition,
} from '../definitions';
import { getFirst, getOrCreate } from '../utils';
import { Lazy, LazyWriter } from './lazy';

export class TypeMapCompiler {
  compile(types: TypeMap, imports: ImportMap, definitions: Iterable<ServiceDefinition>): Lazy {
    const [publicTypes, dynamicMap, anonymousMap, async] = this.mapTypes(types, imports, definitions);

    const writer = new LazyWriter();
    writer.write(this.compileMap('Public', publicTypes.join('\n')));
    writer.write(this.compileMap('Dynamic', this.compileTypes(dynamicMap, async)));
    writer.write(this.compileMap('Anonymous', this.compileTypes(anonymousMap, async)));
    return writer;
  }

  private compileMap(name: string, content: Lazy): Lazy {
    if (!content) {
      return `interface ${name}Services {}\n\n`;
    }

    const writer = new LazyWriter();
    writer.writeLine(`interface ${name}Services {`);
    writer.indent(() => writer.write(content));
    writer.writeLine('}\n');
    return writer;
  }

  private compileTypes(map: Map<string, Set<string>>, async: Set<string>): Lazy {
    if (!map.size) {
      return '';
    }

    const writer = new LazyWriter();

    for (const [alias, types] of map) {
      const [pre, post] = async.has(alias) ? ['Promise<', '>'] : ['', ''];

      if (types.size === 1) {
        writer.writeLine(`'${alias}': ${pre}${getFirst(types)}${post};`);
        continue;
      }

      writer.writeLine(`'${alias}':${pre ? ' ' : ''}${pre}`);
      writer.indent(() => {
        writer.write(`| ${[...types].join('\n| ')};`);
      });
    }

    return writer;
  }

  private mapTypes(
    types: TypeMap,
    imports: ImportMap,
    definitions: Iterable<ServiceDefinition>,
  ): [string[], Map<string, Set<string>>, Map<string, Set<string>>, Set<string>] {
    const publicTypes: string[] = [];
    const dynamicMap: Map<string, Set<string>> = new Map();
    const anonymousMap: Map<string, Set<string>> = new Map();
    const async: Set<string> = new Set();

    for (const definition of definitions) {
      const type = this.compileType(definition, imports);

      if (!definition.id.startsWith('#')) {
        const [pre, post] = definition.async ? ['Promise<', '>'] : ['', ''];
        publicTypes.push(`'${definition.id}': ${pre}${type}${post};`);
        continue;
      }

      const map = definition.isLocal() && !definition.factory && !definition.autoImplement
        ? dynamicMap
        : anonymousMap;

      this.addTypesToMap(definition.id, type, definition.aliases, types, map, definition.async ? async : undefined);
    }

    return [publicTypes, dynamicMap, anonymousMap, async];
  }

  private addTypesToMap(
    id: string,
    type: string,
    aliases: Iterable<Type>,
    types: TypeMap,
    map: Map<string, Set<string>>,
    async?: Set<string>,
  ): void {
    getOrCreate(map, id, () => new Set).add(type);
    async?.add(id);

    for (const name of types.getTypeNamesIfExist(aliases)) {
      const alias = `#${name}`;
      getOrCreate(map, alias, () => new Set).add(type);
      async?.add(alias);
    }
  }

  private compileType(definition: ServiceDefinition, importMap: ImportMap): string {
    if (definition.isLocal()) {
      return this.compileLocalType(definition, importMap);
    } else if (definition.isForeign()) {
      return this.compileForeignType(definition, importMap);
    } else {
      throw 'unreachable';
    }
  }

  private compileLocalType(definition: LocalServiceDefinition, importMap: ImportMap): string {
    const info = importMap.getInfo(definition.builder, definition.resource, ImportMode.Type);
    const path = `${info.alias}.${definition.path}`;

    if (!definition.isExplicit() && (!definition.factory || definition.factory.method === 'constructor')) {
      return path;
    }

    importMap.useServiceType = true;
    return `ServiceType<typeof ${path}>`;
  }

  private compileForeignType(definition: ForeignServiceDefinition, importMap: ImportMap): string {
    importMap.useForeignServiceType = true;
    const containerType = this.compileLocalType(definition.container, importMap);
    return `ForeignServiceType<${containerType}, '${definition.foreignId}'>`;
  }
}
