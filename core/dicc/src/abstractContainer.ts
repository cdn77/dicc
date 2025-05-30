import { AsyncContextShim as AsyncContext } from './asyncContext';
import { ServiceStore } from './serviceStore';
import {
  CompiledAsyncServiceDefinition,
  CompiledServiceDefinition,
  CompiledServiceDefinitionMap,
  CompiledServiceForkHook,
  CompiledSyncServiceDefinition,
  FindResult,
  GetResult,
  IterateResult,
  ScopedRunner,
  ServiceScope,
} from './types';
import {
  createAsyncIterator,
  createIterator,
  isPromiseLike,
} from './utils';

export abstract class AbstractContainer<Services extends Record<string, any> = {}> implements ScopedRunner {
  private readonly definitions: Map<string, CompiledServiceDefinition<any, Services>> = new Map();
  private readonly aliases: Map<string, string[]> = new Map();
  private readonly globalServices: ServiceStore = new ServiceStore();
  private readonly localServices: AsyncContext.Variable<ServiceStore> = new AsyncContext.Variable();
  private readonly forkHooks: [string, CompiledServiceForkHook<any, Services>][] = [];
  private readonly creating: Set<string> = new Set();

  constructor(definitions: CompiledServiceDefinitionMap<Services>) {
    this.importDefinitions(definitions);
  }

  get<Id extends keyof Services>(id: Id): GetResult<Services, Id, true>;
  get<Id extends keyof Services, Need extends boolean>(id: Id, need: Need): GetResult<Services, Id, Need>;
  get(id: string, need: boolean = true): any {
    return this.getOrCreate(this.resolve(id), need);
  }

  find<Id extends keyof Services>(alias: Id): FindResult<Services, Id>;
  find(alias: string): Promise<any[]> | any[] {
    const ids = this.resolve(alias, false);
    const async = ids.some((id) => this.definitions.get(id)?.async);

    return async
      ? Promise.all(ids.map(async (id) => this.getOrCreate(id, false)))
        .then((services) => services.filter((service) => service !== undefined))
      : ids.map((id) => this.getOrCreate(id, false)).filter((service) => service !== undefined);
  }

  iterate<Id extends keyof Services>(alias: Id): IterateResult<Services, Id>;
  iterate(alias: string): Iterable<any> | AsyncIterable<any> {
    const ids = this.resolve(alias, false);
    const async = ids.some((id) => this.definitions.get(id)?.async);
    return async
      ? createAsyncIterator(ids, async (id) => this.getOrCreate(id, false))
      : createIterator(ids, (id) => this.getOrCreate(id, false));
  }

  register<Id extends keyof Services>(alias: Id, service: Services[Id]): PromiseLike<void> | void;
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

    if (definition.async) {
      const servicePromise = (isPromiseLike(service) ? service : Promise.resolve(service))
        .then(async (instance) => {
          definition.onCreate && await definition.onCreate(instance, this);
          return instance;
        });

      store.set(id, servicePromise);
      return servicePromise;
    } else {
      store.set(id, service);
      definition.onCreate && definition.onCreate(service, this);
    }
  }

  async run<R>(cb: () => R | Promise<R>): Promise<R> {
    const parent = this.currentStore;
    const store = new ServiceStore(parent);
    const chain = this.forkHooks.reduceRight((next, [id, hook]) => {
      return async () => {
        const callback = async (localService?: any) => {
          localService && store.set(id, localService);
          return next();
        };

        return hook(callback, await this.get(id), this);
      };
    }, (async () => this.localServices.run(store, cb)) as () => Promise<any>);

    try {
      return await chain();
    } finally {
      for (const [id, service] of store) {
        const definition = this.definitions.get(id);
        definition?.onDestroy && await definition.onDestroy(await service, this);
        store.delete(id);
      }
    }
  }

  async reset(): Promise<void> {
    if (this.currentStore !== this.globalServices) {
      throw new Error(`The container can only be reset from the global scope, this call is running inside an async local scope`);
    }

    for (const [id, definition] of this.definitions) {
      if (this.globalServices.hasOwn(id)) {
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

      if (definition.onFork) {
        this.forkHooks.push([id, definition.onFork]);
      }

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
    } else if (definition.scope === 'local' && !this.localServices.get()) {
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

  private createInstanceSync<T>(id: string, definition: CompiledSyncServiceDefinition<T, Services>, need: boolean = true): T | undefined {
    const service = definition.factory(this);
    this.getStore(definition.scope)?.set(id, service);
    service && definition.onCreate && definition.onCreate(service, this);
    this.creating.delete(id);

    if (!service && need) {
      throw new Error(`Unable to create required service '${id}'`);
    }

    return service;
  }

  private createInstanceAsync<T>(id: string, definition: CompiledAsyncServiceDefinition<T, Services>, need: boolean = true): Promise<T | undefined> {
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

  private get currentStore(): ServiceStore {
    return this.localServices.get() ?? this.globalServices;
  }

  private getStore(scope: ServiceScope = 'global'): ServiceStore | undefined {
    if (scope === 'global') {
      return this.globalServices;
    } else if (scope === 'local') {
      const store = this.localServices.get();

      if (!store) {
        throw new Error('Cannot access local store in global context');
      }

      return store;
    } else {
      return undefined;
    }
  }
}
