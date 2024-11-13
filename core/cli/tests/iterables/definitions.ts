import { ServiceDefinition } from 'dicc';

interface AsyncServices {}
interface SyncServices {}
interface MixedServices {}

export class AsyncService1 implements AsyncServices, MixedServices {
  static async create(): Promise<AsyncService1> {
    return new AsyncService1();
  }

  private constructor() {}
}

export class AsyncService2 implements AsyncServices, MixedServices {
  static async create(): Promise<AsyncService2> {
    return new AsyncService2();
  }

  private constructor() {}
}

export class AsyncService3 implements AsyncServices, MixedServices {
  static async create(): Promise<AsyncService3> {
    return new AsyncService3();
  }

  private constructor() {}
}

export class SyncService1 implements SyncServices, MixedServices {}
export class SyncService2 implements SyncServices, MixedServices {}
export class SyncService3 implements SyncServices, MixedServices {}

export class TestInjectSyncListOfSyncServices {
  constructor(
    readonly value: SyncServices[],
  ) {}
}

export class TestInjectSyncListOfAsyncServices {
  constructor(
    readonly value: AsyncServices[],
  ) {}
}

export class TestInjectSyncListOfMixedServices {
  constructor(
    readonly value: MixedServices[],
  ) {}
}

export class TestInjectSyncIterableOfSyncServices {
  constructor(
    readonly value: Iterable<SyncServices>,
  ) {}
}

export class TestInjectSyncIterableOfAsyncServices {
  constructor(
    readonly value: Iterable<AsyncServices>,
  ) {}
}

export class TestInjectSyncIterableOfMixedServices {
  constructor(
    readonly value: Iterable<MixedServices>,
  ) {}
}

export class TestInjectAsyncListOfSyncServices {
  constructor(
    readonly value: Promise<SyncServices[]>,
  ) {}
}

export class TestInjectAsyncListOfAsyncServices {
  constructor(
    readonly value: Promise<AsyncServices[]>,
  ) {}
}

export class TestInjectAsyncListOfMixedServices {
  constructor(
    readonly value: Promise<MixedServices[]>,
  ) {}
}

export class TestInjectAsyncIterableOfSyncServices {
  constructor(
    readonly value: AsyncIterable<SyncServices>,
  ) {}
}

export class TestInjectAsyncIterableOfAsyncServices {
  constructor(
    readonly value: AsyncIterable<AsyncServices>,
  ) {}
}

export class TestInjectAsyncIterableOfMixedServices {
  constructor(
    readonly value: AsyncIterable<MixedServices>,
  ) {}
}

class Entrypoint {
  constructor(
    readonly syncListOfSync: TestInjectSyncListOfSyncServices,
    readonly syncListOfAsync: TestInjectSyncListOfAsyncServices,
    readonly syncListOfMixed: TestInjectSyncListOfMixedServices,
    readonly syncIterableOfSync: TestInjectSyncIterableOfSyncServices,
    readonly syncIterableOfAsync: TestInjectSyncIterableOfAsyncServices,
    readonly syncIterableOfMixed: TestInjectSyncIterableOfMixedServices,
    readonly asyncListOfSync: TestInjectAsyncListOfSyncServices,
    readonly asyncListOfAsync: TestInjectAsyncListOfAsyncServices,
    readonly asyncListOfMixed: TestInjectAsyncListOfMixedServices,
    readonly asyncIterableOfSync: TestInjectAsyncIterableOfSyncServices,
    readonly asyncIterableOfAsync: TestInjectAsyncIterableOfAsyncServices,
    readonly asyncIterableOfMixed: TestInjectAsyncIterableOfMixedServices,
  ) {}
}

export const entrypoint = {
  factory: Entrypoint,
} satisfies ServiceDefinition<Entrypoint>;
