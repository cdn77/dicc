import { ContainerBuilder } from '../container';
import { ForeignServiceDefinition } from '../definitions';
import { ContainerCompiler } from './containerCompiler';
import { Lazy, LazyWriter } from './lazy';
import { ServiceCompiler } from './serviceCompiler';

export interface ForeignServiceCompilerFactory {
  create(
    container: ContainerCompiler,
    builder: ContainerBuilder,
    definition: ForeignServiceDefinition,
  ): ForeignServiceCompiler;
}

export class ForeignServiceCompiler extends ServiceCompiler<ForeignServiceDefinition> {
  constructor(
    container: ContainerCompiler,
    builder: ContainerBuilder,
    definition: ForeignServiceDefinition,
  ) {
    super(container, builder, definition);
  }

  compile(): Lazy {
    const [parentId, parentAsync] = this.container.resolveServiceInjection(this.definition.container.type);

    if (parentId === undefined) {
      throw 'unreachable';
    }

    const writer = new LazyWriter();

    writer.block(() => {
      writer.writeLine(this.compileFactory(parentId, parentAsync));
      writer.writeLine(`scope: 'private',`);

      if (this.definition.async) {
        writer.writeLine('async: true,');
      }
    });

    return writer;
  }

  private compileFactory(parentId: string, parentAsync: boolean): Lazy {
    const writer = new LazyWriter();

    const async = this.definition.async ? 'async ' : '';
    writer.write(`factory: ${async}(di) => `);

    if (parentAsync) {
      writer.write('{\n');
      writer.indent(() => {
        writer.writeLine(`const parent = await di.get('${parentId}');`);
        writer.writeLine(`return parent.get('${this.definition.foreignId}');`);
      });
      writer.write('}');
    } else {
      writer.write(`di.get('${parentId}').get('${this.definition.foreignId}')`);
    }

    writer.write(',');

    return writer;
  }
}
