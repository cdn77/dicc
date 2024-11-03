const stack: (LazyArgs | undefined)[] = [];
let current: LazyArgs | undefined = undefined;

export class LazyArgs {
  private last: number = -1;

  constructor(
    private readonly args: string[],
  ) {}

  use(arg: string): void {
    const idx = this.args.indexOf(arg);

    if (idx > this.last) {
      this.last = idx;
    }
  }

  watch<R>(cb: () => R): R {
    try {
      stack.push(current);
      current = this;
      return cb();
    } finally {
      current = stack.pop();
    }
  }

  get value(): () => string {
    return () => this.args.slice(0, this.last + 1).join(', ');
  }

  toString(): symbol {
    return Symbol(`Do not stringify LazyArgs!`);
  }
}

export function $args(...args: string[]): LazyArgs {
  return new LazyArgs(args);
}

$args.use = <R = undefined>(arg: string, value?: R): R | undefined => {
  current?.use(arg);
  return value;
};

$args.unwatch = <R>(cb: () => R): R => {
  try {
    stack.push(current);
    current = undefined;
    return cb();
  } finally {
    current = stack.pop();
  }
};
