import { ServiceDecorator, ServiceDefinition } from 'dicc';

export class ServiceDependency {}
export class OnCreateHookDependency {}
export class OnForkHookDependency {}
export class OnDestroyHookDependency {}

class TestServiceHooks {
  constructor(readonly dep: ServiceDependency) {}
}

export const testServiceHooks = {
  factory: TestServiceHooks,
  // eslint-disable-next-line unused-imports/no-unused-vars
  onCreate: (service, dep: OnCreateHookDependency) => {},
  // eslint-disable-next-line unused-imports/no-unused-vars
  onFork: (cb, service, dep: OnForkHookDependency) => cb(),
  // eslint-disable-next-line unused-imports/no-unused-vars
  onDestroy: (service, dep: OnDestroyHookDependency) => {},
} satisfies ServiceDefinition<TestServiceHooks>;

interface AnAlias {
  sayHi(): void;
}

class TestServiceDecorators implements AnAlias {
  sayHi() {
    console.log('Hi!');
  }
}

class TestAliasDecorators implements AnAlias {
  sayHi() {
    console.log('Hi!');
  }
}

export const testServiceDecorators = {
  factory: TestServiceDecorators,
  onFork: (cb) => cb(),
} satisfies ServiceDefinition<TestServiceDecorators>;

export const testAliasDecorators = {
  factory: TestAliasDecorators,
} satisfies ServiceDefinition<TestAliasDecorators>;

export const serviceDecorators = {
  decorate: (service) => service,
  onCreate: async () => {},
  // eslint-disable-next-line unused-imports/no-unused-vars
  onFork: (service) => {},
  priority: 1,
} satisfies ServiceDecorator<TestServiceDecorators>;

export const aliasDecorators = {
  onFork: () => {},
  onDestroy: () => {},
  priority: 2,
} satisfies ServiceDecorator<AnAlias>;
