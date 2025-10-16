import { Container, type ServiceType } from 'dicc';
import * as definitions0 from './definitions';

interface PublicServices {
  'testAliasDecorators': ServiceType<typeof definitions0.testAliasDecorators>;
  'testServiceDecorators': Promise<ServiceType<typeof definitions0.testServiceDecorators>>;
  'testServiceHooks': ServiceType<typeof definitions0.testServiceHooks>;
}

interface AnonymousServices {
  '#OnCreateHookDependency0.0': definitions0.OnCreateHookDependency;
  '#OnDestroyHookDependency0.0': definitions0.OnDestroyHookDependency;
  '#OnForkHookDependency0.0': definitions0.OnForkHookDependency;
  '#ServiceDependency0.0': definitions0.ServiceDependency;
}

export class TestContainer extends Container<PublicServices, object, AnonymousServices> {
  constructor() {
    super({
      'testAliasDecorators': {
        factory: () => new definitions0.testAliasDecorators.factory(),
        onFork: async (callback) => {
          definitions0.aliasDecorators.onFork();
          return callback();
        },
        onDestroy: () => {
          definitions0.aliasDecorators.onDestroy();
        },
      },
      'testServiceDecorators': {
        factory: () => {
          const service = new definitions0.testServiceDecorators.factory();
          return definitions0.serviceDecorators.decorate(
            service,
          );
        },
        async: true,
        onCreate: async () => {
          await definitions0.serviceDecorators.onCreate();
        },
        onFork: async (callback, service) => definitions0.testServiceDecorators.onFork(
          async (fork) => {
            definitions0.aliasDecorators.onFork();
            definitions0.serviceDecorators.onFork(
              fork ?? service,
            );
            return callback(fork);
          },
        ),
        onDestroy: () => {
          definitions0.aliasDecorators.onDestroy();
        },
      },
      'testServiceHooks': {
        factory: (di) => new definitions0.testServiceHooks.factory(
          di.get('#ServiceDependency0.0'),
        ),
        onCreate: (service, di) => {
          definitions0.testServiceHooks.onCreate(
            service,
            di.get('#OnCreateHookDependency0.0'),
          );
        },
        onFork: async (callback, service, di) => definitions0.testServiceHooks.onFork(
          callback,
          service,
          di.get('#OnForkHookDependency0.0'),
        ),
        onDestroy: (service, di) => {
          definitions0.testServiceHooks.onDestroy(
            service,
            di.get('#OnDestroyHookDependency0.0'),
          );
        },
      },
      '#OnCreateHookDependency0.0': {
        factory: () => new definitions0.OnCreateHookDependency(),
      },
      '#OnDestroyHookDependency0.0': {
        factory: () => new definitions0.OnDestroyHookDependency(),
      },
      '#OnForkHookDependency0.0': {
        factory: () => new definitions0.OnForkHookDependency(),
      },
      '#ServiceDependency0.0': {
        factory: () => new definitions0.ServiceDependency(),
      },
    });
  }
}
