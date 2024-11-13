import { Container, type ForeignServiceType, type ServiceType } from 'dicc';
import type * as parentDefinitions0 from './parentDefinitions';

interface PublicServices {
  'parentServiceDependingOnChildPublicService': Promise<ServiceType<typeof parentDefinitions0.parentServiceDependingOnChildPublicService>>;
}

interface DynamicServices {}

interface AnonymousServices {
  '#ChildPublicService0.0': Promise<ForeignServiceType<ServiceType<typeof parentDefinitions0.childContainer>, 'childPublicService'>>;
  '#ParentImplementationOfChildDynamicService0.0': Promise<parentDefinitions0.ParentImplementationOfChildDynamicService>;
  '#TestChildContainer0.0': Promise<ServiceType<typeof parentDefinitions0.childContainer>>;
}

export class TestParentContainer extends Container<PublicServices, DynamicServices, AnonymousServices> {
  constructor() {
    super({
      'parentServiceDependingOnChildPublicService': {
        factory: async (di) => {
          const parentDefinitions0 = await import('./parentDefinitions.js');
          return new parentDefinitions0.parentServiceDependingOnChildPublicService.factory(
            await di.get('#ChildPublicService0.0'),
          );
        },
        async: true,
      },
      '#ChildPublicService0.0': {
        factory: async (di) => {
          const parentDefinitions0 = await import('./parentDefinitions.js');
          const parent = await di.get('#TestChildContainer0.0');
          const service = await parent.get('childPublicService');
          return parentDefinitions0.childServiceDecorators.decorate(
            service,
          );
        },
        async: true,
        scope: 'private',
      },
      '#ParentImplementationOfChildDynamicService0.0': {
        factory: async () => {
          const parentDefinitions0 = await import('./parentDefinitions.js');
          return parentDefinitions0.ParentImplementationOfChildDynamicService.create();
        },
        async: true,
      },
      '#TestChildContainer0.0': {
        factory: async (di) => {
          const parentDefinitions0 = await import('./parentDefinitions.js');
          const service = new parentDefinitions0.childContainer.factory();
          service.register('#DynamicChildService0.0', await di.get('#ParentImplementationOfChildDynamicService0.0'));
          return service;
        },
        async: true,
        onFork: async (callback, service) => {
          const parentDefinitions0 = await import('./parentDefinitions.js');
          return service.run(async () => parentDefinitions0.childContainer.onFork(
            async (fork) => {
              parentDefinitions0.childContainerDecorators.onFork();
              return callback(fork);
            },
          ));
        },
      },
    });
  }
}
