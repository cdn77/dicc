import { Container, type ServiceType } from 'dicc';
import * as definitions0 from './definitions';

interface PublicServices {
  'testAliasInjection': ServiceType<typeof definitions0.testAliasInjection>;
  'testArgumentOverrides': ServiceType<typeof definitions0.testArgumentOverrides>;
  'testNonObjectExplicit': ServiceType<typeof definitions0.testNonObjectExplicit>;
  'testWithDisabledImplicitAlias': ServiceType<typeof definitions0.testWithDisabledImplicitAlias>;
  'testWithImplicitAlias': ServiceType<typeof definitions0.testWithImplicitAlias>;
  'testWithOverriddenAlias': ServiceType<typeof definitions0.testWithOverriddenAlias>;
}

interface DynamicServices {}

interface AnonymousServices {
  '#AnAlias0':
    | ServiceType<typeof definitions0.testWithExplicitAlias>
    | ServiceType<typeof definitions0.testWithImplicitAlias>;
  '#TestWithExplicitAlias0.0': ServiceType<typeof definitions0.testWithExplicitAlias>;
}

export class TestContainer extends Container<PublicServices, DynamicServices, AnonymousServices> {
  constructor() {
    super({
      'testAliasInjection': {
        factory: (di) => new definitions0.testAliasInjection.factory(
          di.find('#AnAlias0'),
        ),
      },
      'testArgumentOverrides': {
        factory: (di) => new definitions0.testArgumentOverrides.factory(
          definitions0.testArgumentOverrides.args.alias(
            di.get('testWithImplicitAlias'),
          ),
          di.get('testWithOverriddenAlias'),
          definitions0.testArgumentOverrides.args.runtime,
        ),
      },
      'testNonObjectExplicit': {
        factory: () => new definitions0.testNonObjectExplicit(),
      },
      'testWithDisabledImplicitAlias': {
        factory: () => new definitions0.testWithDisabledImplicitAlias.factory(),
      },
      'testWithImplicitAlias': {
        aliases: ['#AnAlias0'],
        factory: () => new definitions0.testWithImplicitAlias.factory(),
      },
      'testWithOverriddenAlias': {
        factory: () => new definitions0.testWithOverriddenAlias.factory(),
      },
      '#TestWithExplicitAlias0.0': {
        aliases: ['#AnAlias0'],
        factory: () => new definitions0.testWithExplicitAlias.factory(),
        scope: 'private',
      },
    });
  }
}
