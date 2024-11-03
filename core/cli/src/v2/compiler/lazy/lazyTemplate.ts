export class LazyTemplate {
  constructor(
    readonly tokens: TemplateStringsArray,
    readonly args: any[],
  ) {}

  toString(): symbol {
    return Symbol('Do not stringify a LazyTemplate!');
  }
}

export function $lazy(tokens: TemplateStringsArray, ...args: any[]): LazyTemplate {
  return new LazyTemplate(tokens, args);
}
