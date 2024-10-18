import {
  Parameter,
  InvalidParameterPathError,
  ParameterExpansionError,
  UnknownParameterError,
} from './types';

export class ParameterStore<Parameters extends Record<string, any> = {}> {
  private readonly resolving: Set<string> = new Set();

  constructor(
    private readonly parameters: Parameters,
  ) {}

  getAll(): Parameters {
    return this.expandValue(this.parameters);
  }

  resolve<P extends string>(path: P, need?: true): Parameter<Parameters, P>;
  resolve<P extends string>(path: P, need: false): Parameter<Parameters, P> | undefined;
  resolve<P extends string>(path: P, need?: boolean): Parameter<Parameters, P> | undefined {
    try {
      return this.resolvePath(path);
    } catch (e: unknown) {
      if (e instanceof UnknownParameterError && need === false) {
        return undefined;
      }

      throw e;
    }
  }

  expand(value: string, need?: true): string;
  expand(value: string, need: false): string | undefined;
  expand(value: string, need?: boolean): string | undefined {
    try {
      return this.expandString(value);
    } catch (e: unknown) {
      if (e instanceof UnknownParameterError && need === false) {
        return undefined;
      }

      throw e;
    }
  }

  private resolvePath(path: string): any {
    if (this.resolving.has(path)) {
      throw new ParameterExpansionError(`Cannot resolve parameter '${path}': cyclic parameter dependency detected`);
    }

    const tokens = path.split(/\./g);
    let cursor: any = this.parameters;

    for (let i = 0; i < tokens.length; ++i) {
      const token = tokens[i];

      if (typeof cursor !== 'object' || cursor === null) {
        throw new InvalidParameterPathError(tokens.slice(0, i).join('.'));
      }

      if (!(token in cursor)) {
        throw new UnknownParameterError(tokens.slice(0, i).join('.'));
      }

      cursor = cursor[token];
    }

    try {
      this.resolving.add(path);
      return this.expandValue(cursor);
    } finally {
      this.resolving.delete(path);
    }
  }

  private expandString(value: string): string {
    return value.replace(/%([a-z0-9_.]+)%/gi, (_, path) => this.resolvePath(path));
  }

  private expandValue(value: any): any {
    const type = typeof value;

    if (type === 'string') {
      return this.expandString(value);
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.expandValue(v));
    }

    if (type !== 'object' || value === null) {
      return value;
    }

    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.expandValue(v)]));
  }
}
