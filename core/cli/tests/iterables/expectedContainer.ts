import { Container, type ServiceType, toAsyncIterable, toSyncIterable } from 'dicc';
import * as definitions0 from './definitions';

interface PublicServices {
  'entrypoint': Promise<ServiceType<typeof definitions0.entrypoint>>;
}

interface AnonymousServices {
  '#AsyncService10.0': Promise<definitions0.AsyncService1>;
  '#AsyncService20.0': Promise<definitions0.AsyncService2>;
  '#AsyncService30.0': Promise<definitions0.AsyncService3>;
  '#AsyncServices0': Promise<
    | definitions0.AsyncService1
    | definitions0.AsyncService2
    | definitions0.AsyncService3
  >;
  '#MixedServices0': Promise<
    | definitions0.AsyncService1
    | definitions0.AsyncService2
    | definitions0.AsyncService3
    | definitions0.SyncService1
    | definitions0.SyncService2
    | definitions0.SyncService3
  >;
  '#SyncService10.0': definitions0.SyncService1;
  '#SyncService20.0': definitions0.SyncService2;
  '#SyncService30.0': definitions0.SyncService3;
  '#SyncServices0':
    | definitions0.SyncService1
    | definitions0.SyncService2
    | definitions0.SyncService3;
  '#TestInjectAsyncIterableOfAsyncServices0.0': definitions0.TestInjectAsyncIterableOfAsyncServices;
  '#TestInjectAsyncIterableOfMixedServices0.0': definitions0.TestInjectAsyncIterableOfMixedServices;
  '#TestInjectAsyncIterableOfSyncServices0.0': definitions0.TestInjectAsyncIterableOfSyncServices;
  '#TestInjectAsyncListOfAsyncServices0.0': definitions0.TestInjectAsyncListOfAsyncServices;
  '#TestInjectAsyncListOfMixedServices0.0': definitions0.TestInjectAsyncListOfMixedServices;
  '#TestInjectAsyncListOfSyncServices0.0': definitions0.TestInjectAsyncListOfSyncServices;
  '#TestInjectSyncIterableOfAsyncServices0.0': Promise<definitions0.TestInjectSyncIterableOfAsyncServices>;
  '#TestInjectSyncIterableOfMixedServices0.0': Promise<definitions0.TestInjectSyncIterableOfMixedServices>;
  '#TestInjectSyncIterableOfSyncServices0.0': definitions0.TestInjectSyncIterableOfSyncServices;
  '#TestInjectSyncListOfAsyncServices0.0': Promise<definitions0.TestInjectSyncListOfAsyncServices>;
  '#TestInjectSyncListOfMixedServices0.0': Promise<definitions0.TestInjectSyncListOfMixedServices>;
  '#TestInjectSyncListOfSyncServices0.0': definitions0.TestInjectSyncListOfSyncServices;
}

export class TestContainer extends Container<PublicServices, object, AnonymousServices> {
  constructor() {
    super({
      'entrypoint': {
        factory: async (di) => new definitions0.entrypoint.factory(
          di.get('#TestInjectSyncListOfSyncServices0.0'),
          await di.get('#TestInjectSyncListOfAsyncServices0.0'),
          await di.get('#TestInjectSyncListOfMixedServices0.0'),
          di.get('#TestInjectSyncIterableOfSyncServices0.0'),
          await di.get('#TestInjectSyncIterableOfAsyncServices0.0'),
          await di.get('#TestInjectSyncIterableOfMixedServices0.0'),
          di.get('#TestInjectAsyncListOfSyncServices0.0'),
          di.get('#TestInjectAsyncListOfAsyncServices0.0'),
          di.get('#TestInjectAsyncListOfMixedServices0.0'),
          di.get('#TestInjectAsyncIterableOfSyncServices0.0'),
          di.get('#TestInjectAsyncIterableOfAsyncServices0.0'),
          di.get('#TestInjectAsyncIterableOfMixedServices0.0'),
        ),
        async: true,
      },
      '#AsyncService10.0': {
        aliases: [
          '#AsyncServices0',
          '#MixedServices0',
        ],
        factory: async () => definitions0.AsyncService1.create(),
        async: true,
      },
      '#AsyncService20.0': {
        aliases: [
          '#AsyncServices0',
          '#MixedServices0',
        ],
        factory: async () => definitions0.AsyncService2.create(),
        async: true,
      },
      '#AsyncService30.0': {
        aliases: [
          '#AsyncServices0',
          '#MixedServices0',
        ],
        factory: async () => definitions0.AsyncService3.create(),
        async: true,
      },
      '#SyncService10.0': {
        aliases: [
          '#SyncServices0',
          '#MixedServices0',
        ],
        factory: () => new definitions0.SyncService1(),
      },
      '#SyncService20.0': {
        aliases: [
          '#SyncServices0',
          '#MixedServices0',
        ],
        factory: () => new definitions0.SyncService2(),
      },
      '#SyncService30.0': {
        aliases: [
          '#SyncServices0',
          '#MixedServices0',
        ],
        factory: () => new definitions0.SyncService3(),
      },
      '#TestInjectAsyncIterableOfAsyncServices0.0': {
        factory: (di) => new definitions0.TestInjectAsyncIterableOfAsyncServices(
          di.iterate('#AsyncServices0'),
        ),
      },
      '#TestInjectAsyncIterableOfMixedServices0.0': {
        factory: (di) => new definitions0.TestInjectAsyncIterableOfMixedServices(
          di.iterate('#MixedServices0'),
        ),
      },
      '#TestInjectAsyncIterableOfSyncServices0.0': {
        factory: (di) => new definitions0.TestInjectAsyncIterableOfSyncServices(
          toAsyncIterable(di.iterate('#SyncServices0')),
        ),
      },
      '#TestInjectAsyncListOfAsyncServices0.0': {
        factory: (di) => new definitions0.TestInjectAsyncListOfAsyncServices(
          Promise.resolve(di.find('#AsyncServices0')),
        ),
      },
      '#TestInjectAsyncListOfMixedServices0.0': {
        factory: (di) => new definitions0.TestInjectAsyncListOfMixedServices(
          Promise.resolve(di.find('#MixedServices0')),
        ),
      },
      '#TestInjectAsyncListOfSyncServices0.0': {
        factory: (di) => new definitions0.TestInjectAsyncListOfSyncServices(
          Promise.resolve(di.find('#SyncServices0')),
        ),
      },
      '#TestInjectSyncIterableOfAsyncServices0.0': {
        factory: async (di) => new definitions0.TestInjectSyncIterableOfAsyncServices(
          await toSyncIterable(di.iterate('#AsyncServices0')),
        ),
        async: true,
      },
      '#TestInjectSyncIterableOfMixedServices0.0': {
        factory: async (di) => new definitions0.TestInjectSyncIterableOfMixedServices(
          await toSyncIterable(di.iterate('#MixedServices0')),
        ),
        async: true,
      },
      '#TestInjectSyncIterableOfSyncServices0.0': {
        factory: (di) => new definitions0.TestInjectSyncIterableOfSyncServices(
          di.iterate('#SyncServices0'),
        ),
      },
      '#TestInjectSyncListOfAsyncServices0.0': {
        factory: async (di) => new definitions0.TestInjectSyncListOfAsyncServices(
          await di.find('#AsyncServices0'),
        ),
        async: true,
      },
      '#TestInjectSyncListOfMixedServices0.0': {
        factory: async (di) => new definitions0.TestInjectSyncListOfMixedServices(
          await di.find('#MixedServices0'),
        ),
        async: true,
      },
      '#TestInjectSyncListOfSyncServices0.0': {
        factory: (di) => new definitions0.TestInjectSyncListOfSyncServices(
          di.find('#SyncServices0'),
        ),
      },
    });
  }
}
