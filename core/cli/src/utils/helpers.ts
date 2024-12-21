export function getOrCreate<K, V>(map: Map<K, V>, key: K, factory: () => V): V {
  const existing = map.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const value = factory();
  map.set(key, value);
  return value;
}

export function allocateInSet(set: Set<string>, format: string, cb?: (key: string) => void): string {
  for (let i = 0; ; ++i) {
    const value = format.replace(/\{i}/, i.toString());

    if (!set.has(value)) {
      set.add(value);
      cb && cb(value);
      return value;
    }
  }
}

export function allocateInMap<V>(map: Map<string, V>, format: string, value: V): string {
  for (let i = 0; ; ++i) {
    const key = format.replace(/\{i}/, i.toString());

    if (!map.has(key)) {
      map.set(key, value);
      return key;
    }
  }
}

export function getFirst<T>(items: Iterable<T>): T {
  const [first] = items;
  return first;
}

export function getFirstIfOnly<T>(items: Iterable<T>): T | undefined {
  const [first, next] = items;
  return next !== undefined ? undefined : first;
}

export function * skip<T>(count: number, iterable: Iterable<T>): Iterable<T> {
  for (const value of iterable) {
    if (count > 0) {
      --count;
      continue;
    }

    yield value;
  }
}

export function mapSet<T, R>(items: Set<T>, cb: (value: T) => R): R[] {
  return [...items].map(cb);
}

export function mapMap<K1, V1, K2, V2>(map: Map<K1, V1>, cb: (k: K1, v: V1) => [K2, V2]): Map<K2, V2> {
  const map2: Map<K2, V2> = new Map();

  for (const [k, v] of map) {
    map2.set(...cb(k, v));
  }

  return map2;
}

export function * mapIterable<V, R>(iterable: Iterable<V>, cb: (value: V) => R): Iterable<R> {
  for (const item of iterable) {
    yield cb(item);
  }
}

export function filterMap<K, V>(map: Map<K, V>, predicate: (v: V, k: K) => boolean): Map<K, V> {
  return new Map([...map].filter(([k, v]) => predicate(v, k)));
}

export type MapEntry<K, V> = { k: K, v: V };

export function sortMap<K, V>(map: Map<K, V>, callback: (a: MapEntry<K, V>, b: MapEntry<K, V>) => number): Map<K, V> {
  return new Map([...map].sort(([ak, av], [bk, bv]) => callback({ k: ak, v: av }, { k: bk, v: bv })));
}

export function mergeMaps<K1, V1, K2, V2>(a: Map<K1, V1>, b: Map<K2, V2>): Map<K1 | K2, V1 | V2> {
  return new Map<K1 | K2, V1 | V2>([...a, ...b]);
}

export function find<T>(items: Iterable<T>, cb: (value: T) => boolean): T | undefined {
  for (const item of items) {
    if (cb(item)) {
      return item;
    }
  }

  return undefined;
}

export function hasCommonElements<T>(a: Set<T>, b: Set<T>): boolean {
  const [smaller, larger] = a.size < b.size ? [a, b] : [b, a];

  for (const value of smaller) {
    if (larger.has(value)) {
      return true;
    }
  }

  return false;
}

export function throwIfUndef<T>(value: T | undefined, createError: () => Error): T {
  if (value === undefined) {
    throw createError();
  }

  return value;
}
