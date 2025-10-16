import type { AsyncLocalStorage } from 'async_hooks';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace AsyncContextShim {
  let async_hooks: typeof import('async_hooks') | undefined;

  export class Variable<T> {
    private store?: AsyncLocalStorage<T>;

    get(): T | undefined {
      return this.store?.getStore();
    }

    async run<Return, Args extends any[]>(
      value: T,
      fn: (...args: Args) => Return,
      ...args: Args
    ): Promise<Return> {
      try {
        async_hooks ??= await import('async_hooks');
      } catch {
        throw new Error("Your environment doesn't support AsyncLocalStorage");
      }

      this.store ??= new async_hooks.AsyncLocalStorage();
      return this.store.run(value, fn, ...args);
    }
  }
}
