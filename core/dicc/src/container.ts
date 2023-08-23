import { AsyncLocalStorage } from 'async_hooks';
import { Store } from './store';
import {
  CompiledAsyncServiceDefinition,
  CompiledServiceDefinition,
  CompiledServiceDefinitionMap,
  CompiledServiceForkHook,
  CompiledSyncServiceDefinition,
  FindResult,
  GetResult,
  IterateResult,
  ServiceScope,
} from './types';
import {
  createAsyncIterator,
  createIterator,
  isAsyncIterable,
  isIterable,
  isPromiseLike,
} from './utils';


export class Container<Services extends Record<string, any> = {}> {
  private readonly definitions: Map<string, CompiledServiceDefinition> = new Map();
  private readonly aliases: Map<string, string[]> = new Map();
  private readonly globalServices: Store = new Store();
  private readonly localServices: AsyncLocalStorage<Store> = new AsyncLocalStorage();
  private readonly forkHooks: Map<string, CompiledServiceForkHook<any>> = new Map();
  private readonly creating: Set<string> = new Set();

  constructor(definitions: CompiledServiceDefinitionMap<Services>) {
    this.importDefinitions(definitions);
  }

  get<K extends keyof Services>(id: K): GetResult<Services, K, true>;
  get<K extends keyof Services, Need extends boolean>(id: K, need: Need): GetResult<Services, K, Need>;
  get(id: string, need: boolean = true): any {
    return this.getOrCreate(this.resolve(id), need);
  }

  iterate<K extends keyof Services>(alias: K): IterateResult<Services, K>;
  iterate(alias: string): Iterable<any> | AsyncIterable<any> {
    const ids = this.resolve(alias, false);
    const async = ids.some((id) => this.definitions.get(id)?.async);
    return async
      ? createAsyncIterator(ids, async (id) => this.getOrCreate(id, false))
      : createIterator(ids, (id) => this.getOrCreate(id, false));
  }

  find<K extends keyof Services>(alias: K): FindResult<Services, K>;
  find(alias: string): Promise<any[]> | any[] {
    const iterable = this.iterate(alias);

    if (isAsyncIterable(iterable)) {
      return Promise.resolve().then(async () => {
        const values: any[] = [];

        for await (const value of iterable) {
          values.push(value);
        }

        return values;
      });
    } else if (isIterable(iterable)) {
      return [...iterable];
    } else {
      throw new Error(`This should be unreachable!`);
    }
  }

  register<K extends keyof Services>(alias: K, service: Services[K], force?: boolean): PromiseLike<void> | void;
  register(alias: string, service: any): PromiseLike<void> | void {
    const id = this.resolve(alias);
    const definition = this.definitions.get(id);

    if (!definition) {
      throw new Error(`Unknown service '${id}'`);
    } else if (definition.factory !== undefined) {
      throw new Error(`Static service '${id}' cannot be registered dynamically`);
    }

    const store = this.getStore(definition.scope);

    if (!store) {
      throw new Error(`Cannot register private service '${id}'`);
    } else if (store.hasOwn(id)) {
      throw new Error(`Service '${id}' already exists in the ${definition.scope} scope`);
    }

    store.set(id, service);

    if (isPromiseLike(service)) {
      return service.then(async (instance) => {
        definition.onCreate && await definition.onCreate(instance, this);
      });
    } else {
      return definition.onCreate && definition.onCreate(service, this);
    }
  }

  async fork<R>(cb: () => Promise<R>): Promise<R> {
    const parent = this.currentStore;
    const store = new Store(parent);

    for (const [id, hook] of this.forkHooks) {
      const fork = await hook(await this.get(id), this);
      fork && store.set(id, fork);
    }

    try {
      return await this.localServices.run(store, cb);
    } finally {
      for (const [id, service] of store) {
        const definition = this.definitions.get(id);
        definition?.onDestroy && await definition.onDestroy(service, this);
        store.delete(id);
      }
    }
  }

  async reset(): Promise<void> {
    if (this.currentStore !== this.globalServices) {
      throw new Error(`Only the global container instance can be reset, this is a fork`);
    }

    for (const [id, definition] of this.definitions) {
      if (this.globalServices.has(id)) {
        definition.onDestroy && await definition.onDestroy(this.globalServices.get(id), this);
        this.globalServices.delete(id);
      }
    }

    this.globalServices.clear();
  }

  private importDefinitions(definitions: CompiledServiceDefinitionMap<Services>): void {
    for (const [id, definition] of Object.entries(definitions)) {
      this.definitions.set(id, definition)
      this.aliases.set(id, [id]);
      definition.onFork && this.forkHooks.set(id, definition.onFork);

      for (const alias of definition.aliases ?? []) {
        this.aliases.has(alias) || this.aliases.set(alias, []);
        this.aliases.get(alias)!.push(id);
      }
    }
  }

  private resolve(alias: string, single?: true): string;
  private resolve(alias: string, single: false): string[];
  private resolve(alias: string, single: boolean = true): string[] | string {
    const ids = this.aliases.get(alias);

    if (!ids) {
      throw new Error(`Unknown service: '${alias}'`);
    } else if (single && ids.length > 1) {
      throw new Error(`Multiple services matching '${alias}' found`);
    }

    return single ? ids[0] : ids;
  }

  private getOrCreate(id: string, need: boolean = true): any {
    return this.currentStore.has(id) ? this.currentStore.get(id) : this.create(id, need);
  }

  private create(id: string, need: boolean = true): any {
    const definition = this.definitions.get(id);

    if (!definition) {
      throw new Error(`Unknown service '${id}'`);
    } else if (!definition.factory) {
      if (need) {
        throw new Error(`Dynamic service '${id}' has not been registered`);
      }

      return undefined;
    } else if (definition.scope === 'local' && !this.localServices.getStore()) {
      throw new Error(`Cannot create local service '${id}' in global scope`);
    } else if (definition.scope !== 'private') {
      if (this.creating.has(id)) {
        throw new Error(`Service '${id}' is already being created, is there perhaps a cyclic dependency?`);
      }

      this.creating.add(id);
    }

    return definition.async
      ? this.createInstanceAsync(id, definition, need)
      : this.createInstanceSync(id, definition, need);
  }

  private createInstanceSync<T>(id: string, definition: CompiledSyncServiceDefinition<T>, need: boolean = true): T | undefined {
    const service = definition.factory(this);
    this.getStore(definition.scope)?.set(id, service);
    service && definition.onCreate && definition.onCreate(service, this);
    this.creating.delete(id);

    if (!service && need) {
      throw new Error(`Unable to create required service '${id}'`);
    }

    return service;
  }

  private createInstanceAsync<T>(id: string, definition: CompiledAsyncServiceDefinition<T>, need: boolean = true): Promise<T | undefined> {
    const servicePromise = Promise.resolve()       // needed so that definition.factory()
      .then(async () => definition.factory(this))  // is never called synchronously
      .then(async (service) => {
        service && definition.onCreate && await definition.onCreate(service, this);
        this.creating.delete(id);

        if (!service && need) {
          throw new Error(`Unable to create required service '${id}'`);
        }

        return service;
      });

    this.getStore(definition.scope)?.set(id, servicePromise);
    return servicePromise;
  }

  private get currentStore(): Store {
    return this.localServices.getStore() ?? this.globalServices;
  }

  private getStore(scope: ServiceScope = 'global'): Store | undefined {
    if (scope === 'global') {
      return this.globalServices;
    } else if (scope === 'local') {
      const store = this.localServices.getStore();

      if (!store) {
        throw new Error('Cannot access local store in global context');
      }

      return store;
    } else {
      return undefined;
    }
  }
}
