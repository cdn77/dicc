export function isPromiseLike(value: any): value is PromiseLike<any> {
  return 'then' in value && typeof value.then === 'function';
}

export function createIterator<T, R>(
  input: T[],
  transform: (value: T) => R | undefined,
): Iterable<R> {
  return {
    *[Symbol.iterator]() {
      for (const value of input) {
        const result = transform(value);

        if (result !== undefined) {
          yield result;
        }
      }
    },
  };
}

export function createAsyncIterator<T, R>(
  input: T[],
  transform: (value: T) => Promise<R | undefined>,
): AsyncIterable<R> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const value of input) {
        const result = await transform(value);

        if (result !== undefined) {
          yield result;
        }
      }
    },
  };
}

export async function* toAsyncIterable<T>(iterable: Iterable<T>): AsyncIterable<T> {
  yield* iterable;
}

export async function toSyncIterable<T>(iterable: AsyncIterable<T>): Promise<Iterable<T>> {
  const items: T[] = [];

  for await (const item of iterable) {
    items.push(item);
  }

  return items;
}
