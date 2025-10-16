import { ServiceDefinition } from 'dicc';

const brand = Symbol('alias brand');

interface AnAlias {
  [brand]?: void;
}

class List1 implements AnAlias {}
class List2 implements AnAlias {}
class List3 implements AnAlias {}

interface AnotherAlias {
  [brand]?: void;
}

class Iterable1 implements AnotherAlias {}
class Iterable2 implements AnotherAlias {}
class Iterable3 implements AnotherAlias {}

export function listGenerator(): AnAlias[] {
  return [new List1(), new List2(), new List3()];
}

export function* iterableGenerator(): Iterable<AnotherAlias> {
  yield new Iterable1();
  yield new Iterable2();
  yield new Iterable3();
}

class TestDependingOnGenerators {
  constructor(
    readonly alias: AnAlias[],
    readonly another: Iterable<AnotherAlias>,
  ) {}
}

export const testDependingOnGenerators = {
  factory: TestDependingOnGenerators,
} satisfies ServiceDefinition<TestDependingOnGenerators>;
