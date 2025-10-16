import { Container, TypeSpecifierSet, TypeSpecifierWithAsync } from '../analysis';
import { getFirst, sortMap } from '../utils';
import { ServiceCompiler } from './serviceCompiler';
import { compareKeys, compareResources, compareTypes, formatType } from './utils';
import { WriterFactory } from './writerFactory';

const diccImports = [
  'Container',
  'type ForeignServiceType',
  'type ServiceType',
  'toAsyncIterable',
  'toSyncIterable',
];

export class ContainerCompiler {
  constructor(
    private readonly serviceCompiler: ServiceCompiler,
    private readonly writerFactory: WriterFactory,
  ) {}

  compile(container: Container): string {
    const writer = this.writerFactory.create();

    if (container.preamble) {
      writer.write(container.preamble.trimEnd());
      writer.write('\n\n');
    }

    writer.write(this.compileImports(container));
    writer.write('\n');
    writer.write(this.compileTypeMaps(container));
    writer.write('\n');
    writer.write(this.compileContainerClass(container));
    writer.write('\n');
    return writer.toString();
  }

  private compileImports(container: Container): string {
    const dicc: string[] = diccImports.filter((i) => i === 'Container' || container.imports.has(i));
    const imports: string[] = [`import { ${dicc.join(', ')} } from 'dicc';\n`];

    for (const [alias, resource] of sortMap(container.resources, compareResources)) {
      if (!resource.needsType && !resource.needsValue) {
        continue;
      }

      const typeOnly = !resource.needsValue ? 'type ' : '';
      imports.push(`import ${typeOnly}* as ${alias} from '${resource.staticImport}';\n`);
    }

    return imports.join('');
  }

  private compileTypeMaps(container: Container): string {
    const writer = this.writerFactory.create();

    writer.write('interface PublicServices {');
    writer.indent(() => writer.write(this.compileTypeMap(container.publicTypes)));
    writer.write('}\n');

    if (container.dynamicTypes.size) {
      writer.write('\ninterface DynamicServices {');
      writer.indent(() => writer.write(this.compileTypeMap(container.dynamicTypes)));
      writer.write('}\n');
    }

    if (container.anonymousTypes.size) {
      writer.write('\ninterface AnonymousServices {');
      writer.indent(() => writer.write(this.compileTypeMap(container.anonymousTypes)));
      writer.write('}\n');
    }

    return writer.toString();
  }

  private compileContainerClass(container: Container): string {
    const writer = this.writerFactory.create();
    const declaration =
      container.className === 'default' ? 'default class' : `class ${container.className}`;
    const dynamic = container.dynamicTypes.size ? 'DynamicServices' : 'object';
    const anonymous = container.anonymousTypes.size ? 'AnonymousServices' : 'object';

    writer.write(
      `export ${declaration} extends Container<PublicServices, ${dynamic}, ${anonymous}> {`,
    );
    writer.indent(() => {
      writer.write('constructor() {');
      writer.indent(() => {
        writer.write(
          `super(${this.serviceCompiler.compileDefinitions(container.services, container.resources)});`,
        );
      });
      writer.write('}');
    });
    writer.write('}');
    return writer.toString();
  }

  private compileTypeMap(map: Map<string, TypeSpecifierWithAsync | TypeSpecifierSet>): string {
    const writer = this.writerFactory.create();

    for (const [alias, typeOrTypes] of sortMap(map, compareKeys)) {
      let async = false;
      const types = (typeOrTypes instanceof TypeSpecifierSet ? [...typeOrTypes] : [typeOrTypes])
        .sort(compareTypes)
        .map((type) => {
          if (type.async) {
            async = true;
          }

          return formatType(type);
        });

      const [pre, post] = async ? [' Promise<', '>'] : [' ', ''];

      if (types.length === 1) {
        writer.write(`'${alias}':${pre}${getFirst(types)}${post};\n`);
        continue;
      }

      writer.write(`'${alias}':${pre.trimEnd()}`);
      writer.indent(() =>
        writer.write(
          types
            .map((type, i) => `| ${type}${i + 1 >= types.length && !post ? ';' : ''}`)
            .join('\n'),
        ),
      );

      if (post) {
        writer.write(`${post};\n`);
      }
    }

    return writer.toString();
  }
}
