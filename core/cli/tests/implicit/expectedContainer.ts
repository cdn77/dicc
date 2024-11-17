import { Container, type ServiceType } from 'dicc';
import * as definitions0 from './definitions';

interface PublicServices {
  'entrypoint': Promise<ServiceType<typeof definitions0.entrypoint>>;
}

interface DynamicServices {
  '#DynamicServiceOfSomeKind0.0': definitions0.DynamicServiceOfSomeKind;
}

interface AnonymousServices {
  '#AnotherAlias0':
    | definitions0.AnotherWayToSayBye
    | definitions0.OneWayToSayBye;
  '#AnotherWayToSayBye0.0': definitions0.AnotherWayToSayBye;
  '#OneWayToSayBye0.0': definitions0.OneWayToSayBye;
  '#TestAsyncDependency0.0': Promise<definitions0.TestAsyncDependency>;
  '#TestAsyncFactoryMethod0.0': Promise<definitions0.TestAsyncFactoryMethod>;
  '#TestInjectionModes0.0': definitions0.TestInjectionModes;
  '#TestListDependency0.0': definitions0.TestListDependency;
  '#TestMultipleDependencies0.0': definitions0.TestMultipleDependencies;
  '#TestNoDependencies0.0': definitions0.TestNoDependencies;
  '#TestSingleDependency0.0': definitions0.TestSingleDependency;
  '#TestTupleInjection0.0': Promise<ServiceType<typeof definitions0.testTupleInjection>>;
}

export class TestContainer extends Container<PublicServices, DynamicServices, AnonymousServices> {
  constructor() {
    super({
      'entrypoint': {
        factory: async (di) => new definitions0.entrypoint.factory(
          await di.get('#TestTupleInjection0.0'),
        ),
        async: true,
      },
      '#AnotherWayToSayBye0.0': {
        aliases: ['#AnotherAlias0'],
        factory: () => new definitions0.AnotherWayToSayBye(),
      },
      '#DynamicServiceOfSomeKind0.0': {
        factory: undefined,
      },
      '#OneWayToSayBye0.0': {
        aliases: ['#AnotherAlias0'],
        factory: () => new definitions0.OneWayToSayBye(),
      },
      '#TestAsyncDependency0.0': {
        factory: async (di) => new definitions0.TestAsyncDependency(
          await di.get('#TestAsyncFactoryMethod0.0'),
        ),
        async: true,
      },
      '#TestAsyncFactoryMethod0.0': {
        factory: async (di) => definitions0.TestAsyncFactoryMethod.create(
          di.get('#TestListDependency0.0'),
        ),
        async: true,
      },
      '#TestInjectionModes0.0': {
        factory: (di) => new definitions0.TestInjectionModes(
          () => di.get('#TestSingleDependency0.0'),
          (service) => di.register('#DynamicServiceOfSomeKind0.0', service),
          { async run(cb) { return di.run(cb); } },
        ),
      },
      '#TestListDependency0.0': {
        factory: (di) => new definitions0.TestListDependency(
          di.find('#AnotherAlias0'),
        ),
      },
      '#TestMultipleDependencies0.0': {
        factory: (di) => new definitions0.TestMultipleDependencies(
          di.get('#TestNoDependencies0.0'),
          di.get('#TestSingleDependency0.0'),
        ),
      },
      '#TestNoDependencies0.0': {
        factory: () => new definitions0.TestNoDependencies(),
      },
      '#TestSingleDependency0.0': {
        factory: (di) => new definitions0.TestSingleDependency(
          di.get('#TestNoDependencies0.0'),
        ),
      },
      '#TestTupleInjection0.0': {
        factory: async (di) => definitions0.testTupleInjection(
          di.get('#TestSingleDependency0.0', false),
          di.get('#TestMultipleDependencies0.0', false),
          di.get('#TestListDependency0.0', false),
          di.get('#TestInjectionModes0.0', false),
          await di.get('#TestAsyncFactoryMethod0.0', false),
          await di.get('#TestAsyncFactoryMethod0.0', false),
          await di.get('#TestAsyncDependency0.0', false),
        ),
        async: true,
      },
    });
  }
}
