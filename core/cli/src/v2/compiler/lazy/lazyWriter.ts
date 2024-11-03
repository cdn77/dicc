import { Lazy } from './types';

export type LazyWriterAction =
  | { type: 'write', text: Lazy }
  | { type: 'conditional-write', condition: () => boolean, text: Lazy }
  | { type: 'line', text: Lazy }
  | { type: 'conditional-line', condition: () => boolean, text: Lazy }
  | { type: 'indent', actions: LazyWriterAction[] }
  | { type: 'block', actions: LazyWriterAction[] };

export class LazyWriter {
  readonly actions: LazyWriterAction[] = [];
  private stack: LazyWriterAction[][] = [];
  private cursor: LazyWriterAction[] = this.actions;

  write(...entries: Lazy[]): void {
    this.cursor.push(...entries.map((text): LazyWriterAction => ({ type: 'write', text })));
  }

  writeLine(text: Lazy): void {
    this.cursor.push({ type: 'line', text });
  }

  conditionalWrite(condition: () => boolean, text: Lazy): void {
    this.cursor.push({ type: 'conditional-write', condition, text });
  }

  conditionalWriteLine(condition: () => boolean, text: Lazy): void {
    this.cursor.push({ type: 'conditional-line', condition, text });
  }

  indent(cb: () => void): void {
    this.nest('indent', cb);
  }

  block(cb: () => void): void {
    this.nest('block', cb);
  }

  toString(): symbol {
    return Symbol('Do not stringify a LazyWriter!');
  }

  private nest(type: 'indent' | 'block', cb: () => void): void {
    try {
      const actions: LazyWriterAction[] = [];
      this.cursor.push({ type, actions });
      this.stack.push(this.cursor);
      this.cursor = actions;
      cb();
    } finally {
      this.cursor = this.stack.pop()!;
    }
  }
}
