import { ServiceDefinition } from 'dicc';

interface AnAlias {
  sayHi(): void;
}

class TestWithImplicitAlias implements AnAlias {
  sayHi() {
    console.log('Hi!');
  }
}

export const testWithImplicitAlias = {
  factory: TestWithImplicitAlias,
} satisfies ServiceDefinition<TestWithImplicitAlias>;

class TestWithExplicitAlias {
  sayHi() {
    console.log('Ciao!');
  }
}

export const testWithExplicitAlias = {
  factory: TestWithExplicitAlias,
  anonymous: true,
  scope: 'private',
} satisfies ServiceDefinition<TestWithExplicitAlias, AnAlias>;

class TestWithDisabledImplicitAlias implements AnAlias {
  sayHi() {
    console.log('Not today!');
  }
}

export const testWithDisabledImplicitAlias = {
  factory: TestWithDisabledImplicitAlias,
} satisfies ServiceDefinition<TestWithDisabledImplicitAlias, unknown>;

interface AnotherAlias {
  sayBye(): void;
}

class TestWithOverriddenAlias implements AnAlias, AnotherAlias {
  sayHi() {
    console.log('Not me either!');
  }

  sayBye() {
    console.log('Servus!');
  }
}

export const testWithOverriddenAlias = {
  factory: TestWithOverriddenAlias,
} satisfies ServiceDefinition<TestWithOverriddenAlias, AnotherAlias>;

class TestAliasInjection {
  constructor(
    readonly dependencies: AnAlias[],
  ) {}
}

export const testAliasInjection = {
  factory: TestAliasInjection,
} satisfies ServiceDefinition<TestAliasInjection>;

class TestNonObjectExplicit {}

export const testNonObjectExplicit
  = TestNonObjectExplicit satisfies ServiceDefinition<TestNonObjectExplicit>;

class TestArgumentOverrides {
  constructor(
    readonly alias: AnAlias,
    readonly another: AnotherAlias,
    readonly pi: number,
    readonly runtime: string,
  ) {}
}

export class AsyncPiProvider {
  static async create(): Promise<AsyncPiProvider> {
    return new AsyncPiProvider();
  }

  readonly value = 3.14;

  private constructor() {}
}

export const testArgumentOverrides = {
  factory: TestArgumentOverrides,
  args: {
    alias: (service: TestWithImplicitAlias) => service,
    pi: (provider: AsyncPiProvider) => provider.value,
    runtime: 'some runtime value',
  },
} satisfies ServiceDefinition<TestArgumentOverrides>;
