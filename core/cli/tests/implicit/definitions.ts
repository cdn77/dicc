import { ScopedRunner, ServiceDefinition } from 'dicc';

export class TestNoDependencies {}

interface AliasInterface {
  sayHello(): void;
}

export class TestSingleDependency implements AliasInterface {
  constructor(readonly dependency: TestNoDependencies) {}

  sayHello() {
    console.log('Hello!');
  }
}

export class TestMultipleDependencies {
  constructor(
    readonly dependencyOne: TestNoDependencies,
    readonly dependencyTwo: AliasInterface,
  ) {}
}

interface AnotherAlias {
  sayBye(): void;
}

export class OneWayToSayBye implements AnotherAlias {
  sayBye() {
    console.log('Bye!');
  }
}

export class AnotherWayToSayBye implements AnotherAlias {
  sayBye() {
    console.log('Ciao!');
  }
}

export class TestListDependency {
  constructor(readonly services: AnotherAlias[]) {}
}

export interface DynamicServiceOfSomeKind {
  beGayDoCrime(): void;
}

export class TestInjectionModes {
  constructor(
    readonly accessor: () => TestSingleDependency,
    readonly injector: (service: DynamicServiceOfSomeKind) => void,
    readonly runner: ScopedRunner,
  ) {}
}

export class TestFactoryMethod {
  static create(dependency: TestListDependency): TestFactoryMethod {
    return new TestFactoryMethod(dependency);
  }

  private constructor(readonly dependency: TestListDependency) {}
}

export class TestAsyncFactoryMethod {
  static async create(dependency: TestListDependency): Promise<TestAsyncFactoryMethod> {
    return new TestAsyncFactoryMethod(dependency);
  }

  private constructor(readonly dependency: TestListDependency) {}
}

export class TestAsyncDependency {
  constructor(readonly dependency: TestAsyncFactoryMethod) {}
}

class TestTupleInjection {
  constructor(
    readonly testSingle: TestSingleDependency,
    readonly testMultiple: TestMultipleDependencies,
    readonly testList: TestListDependency,
    readonly testInjectionModes: TestInjectionModes,
    readonly testFactoryMethod: TestAsyncFactoryMethod,
    readonly testAsyncFactoryMethod: TestAsyncFactoryMethod,
    readonly testAsyncDependency: TestAsyncDependency,
  ) {}
}

function testTupleInjectionFactory<C extends new (...args: any[]) => any>(
  ctor: C,
): (...args: ConstructorParameters<C>) => InstanceType<C> {
  return (...args: ConstructorParameters<C>) => new ctor(...args);
}

export const testTupleInjection = testTupleInjectionFactory(TestTupleInjection);

class Entrypoint {
  constructor(readonly testTupleInjection: TestTupleInjection) {}
}

export const entrypoint = {
  factory: Entrypoint,
} satisfies ServiceDefinition<Entrypoint>;
