import { CodeBlockWriter } from 'ts-morph';
import { LazyTemplate } from './lazyTemplate';
import { LazyWriter, LazyWriterAction } from './lazyWriter';
import { Lazy } from './types';

export class LazyCompiler {
  constructor(
    private readonly createWriter: () => CodeBlockWriter,
  ) {}

  compile(content: Lazy): string {
    if (content instanceof LazyTemplate) {
      return this.compileTemplate(content);
    } else if (content instanceof LazyWriter) {
      const writer = this.createWriter();
      this.compileWriter(writer, content.actions);
      return writer.toString();
    } else if (typeof content === 'function') {
      return this.compile(content());
    } else {
      return content;
    }
  }

  private compileTemplate(template: LazyTemplate): string {
    const result: string[] = [];

    for (let i = 0; i < template.args.length; ++i) {
      result.push(template.tokens[i], this.compile(template.args[i]));
    }

    result.push(template.tokens[template.tokens.length - 1]);
    return result.join('');
  }

  private compileWriter(writer: CodeBlockWriter, actions: LazyWriterAction[]): void {
    for (const action of actions) {
      switch (action.type) {
        case 'write': writer.write(this.compile(action.text)); break;
        case 'line': writer.writeLine(this.compile(action.text)); break;
        case 'conditional-write':
          action.condition() && writer.write(this.compile(action.text));
          break;
        case 'conditional-line':
          action.condition() && writer.writeLine(this.compile(action.text));
          break;
        case 'indent':
          writer.indent(() => this.compileWriter(writer, action.actions));
          break;
        case 'block':
          writer.block(() => this.compileWriter(writer, action.actions));
          break;
      }
    }
  }
}
