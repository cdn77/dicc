import { ServiceDefinition } from 'dicc';
import { Resolver, ResolverFactory } from './common';

export class AsyncDependency {
  static async create(): Promise<AsyncDependency> {
    return new AsyncDependency();
  }

  private constructor() {}
}

export class AuthorsResolver implements Resolver {
  readonly operationName = 'authors';

  constructor(
    readonly asyncDep: AsyncDependency,
  ) {}

  resolve(args: Record<string, any>): any {
    return ['Emily Dickinson', 'Virginia Woolf'];
  }
}

export class BooksResolver implements Resolver {
  readonly operationName = 'books';

  resolve(args: Record<string, any>): any {
    return ['Poems', 'Mrs Dalloway'];
  }
}

class RootResolver {
  private readonly factories: Map<string, ResolverFactory>;

  constructor(
    factories: ResolverFactory[],
  ) {
    this.factories = new Map(factories.map((factory) => [factory.operationName, factory]));
  }

  resolve(operation: string, args: Record<string, any>): any {
    const factory = this.factories.get(operation);

    if (!factory) {
      throw new Error(`Unknown operation: '${operation}'`);
    }

    return factory.create().resolve(args);
  }
}

export const root = RootResolver satisfies ServiceDefinition<RootResolver>;
