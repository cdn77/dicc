import { Container, type ServiceType } from 'dicc';
import type * as childDefinitions0 from './childDefinitions';

interface PublicServices {
  'childPublicService': Promise<ServiceType<typeof childDefinitions0.childPublicService>>;
}

interface DynamicServices {
  '#DynamicChildService0.0': childDefinitions0.DynamicChildService;
}

interface AnonymousServices {
  '#ImplicitChildService0.0': Promise<childDefinitions0.ImplicitChildService>;
}

export class TestChildContainer extends Container<PublicServices, DynamicServices, AnonymousServices> {
  constructor() {
    super({
      'childPublicService': {
        factory: async (di) => {
          const childDefinitions0 = await import('./childDefinitions.js');
          return new childDefinitions0.childPublicService.factory(
            await di.get('#ImplicitChildService0.0'),
          );
        },
        async: true,
      },
      '#DynamicChildService0.0': {
        factory: undefined,
      },
      '#ImplicitChildService0.0': {
        factory: async (di) => {
          const childDefinitions0 = await import('./childDefinitions.js');
          return childDefinitions0.ImplicitChildService.create(
            di.get('#DynamicChildService0.0'),
          );
        },
        async: true,
      },
    });
  }
}
