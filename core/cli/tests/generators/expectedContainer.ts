import { Container, type ServiceType } from 'dicc';
import * as definitions0 from './definitions';

interface PublicServices {
  'testDependingOnGenerators': ServiceType<typeof definitions0.testDependingOnGenerators>;
}

interface AnonymousServices {
  '#AnAlias0.0': ServiceType<typeof definitions0.listGenerator>;
  '#AnotherAlias0.0': ServiceType<typeof definitions0.iterableGenerator>;
}

export class TestContainer extends Container<PublicServices, object, AnonymousServices> {
  constructor() {
    super({
      'testDependingOnGenerators': {
        factory: (di) => new definitions0.testDependingOnGenerators.factory(
          di.get('#AnAlias0.0'),
          di.get('#AnotherAlias0.0'),
        ),
      },
      '#AnAlias0.0': {
        factory: () => definitions0.listGenerator(),
      },
      '#AnotherAlias0.0': {
        factory: () => definitions0.iterableGenerator(),
      },
    });
  }
}
