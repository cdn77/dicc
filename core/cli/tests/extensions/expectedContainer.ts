import { Container, type ServiceType } from 'dicc';
import * as common0 from './common';
import * as definitions0 from './definitions';

interface PublicServices {
  'root': Promise<ServiceType<typeof definitions0.root>>;
}

interface AnonymousServices {
  '#AsyncDependency0.0': Promise<definitions0.AsyncDependency>;
  '#ResolverFactory0': Promise<ServiceType<typeof common0.ResolverFactory>>;
  '#ResolverFactory0.0': Promise<ServiceType<typeof common0.ResolverFactory>>;
  '#ResolverFactory0.1': ServiceType<typeof common0.ResolverFactory>;
}

export class TestContainer extends Container<PublicServices, object, AnonymousServices> {
  constructor() {
    super({
      'root': {
        factory: async (di) => new definitions0.root(
          await di.find('#ResolverFactory0'),
        ),
        async: true,
      },
      '#AsyncDependency0.0': {
        factory: async () => definitions0.AsyncDependency.create(),
        async: true,
      },
      '#ResolverFactory0.0': {
        aliases: ['#ResolverFactory0'],
        factory: async (di) => {
          const call0Arg0 = await di.get('#AsyncDependency0.0');
          return new class extends common0.ResolverFactory {
            create: ServiceType<typeof common0.ResolverFactory>['create'] = () => new definitions0.AuthorsResolver(
              call0Arg0,
            );
          }(
            "authors",
          );
        },
        async: true,
      },
      '#ResolverFactory0.1': {
        aliases: ['#ResolverFactory0'],
        factory: () => new class extends common0.ResolverFactory {
          create: ServiceType<typeof common0.ResolverFactory>['create'] = () => new definitions0.BooksResolver();
        }(
          "books",
        ),
      },
    });
  }
}
