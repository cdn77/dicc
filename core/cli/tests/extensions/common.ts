export interface Resolver {
  readonly operationName: string;
  resolve(args: Record<string, any>): Promise<any> | any;
}

export abstract class ResolverFactory {
  constructor(readonly operationName: string) {}

  abstract create(): Resolver;
}
