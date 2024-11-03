import { ContainerBuilder, ImportMode } from '../container';
import { Lazy, LazyWriter } from './lazy';

export class ImportMapCompiler {
  compile(builder: ContainerBuilder): Lazy {
    const writer = new LazyWriter();
    const dicc = [
      'Container',
      builder.imports.useForeignServiceType && 'type ForeignServiceType',
      builder.imports.useServiceType && 'type ServiceType',
    ];

    writer.writeLine(`import { ${dicc.filter((v) => !!v).join(', ')} } from 'dicc';`);

    for (const info of builder.imports) {
      if (info.mode === ImportMode.None) {
        continue;
      }

      const typeOnly = builder.lazyImports && !Boolean(info.mode & ImportMode.Value) ? 'type ' : '';
      writer.writeLine(`import ${typeOnly}* as ${info.alias} from '${info.specifier}';`);
    }

    return writer;
  }
}
