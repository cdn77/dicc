import { AsyncLocalStorage } from 'async_hooks';
import { Store } from './store';
import {
  CompiledAsyncServiceDefinition,
  CompiledServiceDefinition,
  CompiledServiceDefinitionMap,
  CompiledServiceForkHook,
  CompiledSyncServiceDefinition,
  ContainerParameters,
  FindResult,
  GetResult,
  InvalidParameterPathError,
  IterateResult,
  Parameter,
  ServiceMap,
  ServiceScope,
  UnknownParameterError,
} from './types';
import {
  createAsyncIterator,
  createIterator,
  isPromiseLike,
} from './utils';

export class Container<Services extends Record<string, any> = {}, Parameters extends ContainerParameters = {}> {
  readonly [ServiceMap]?: Services;

  private readonly parameters: Parameters;
  private readonly definitions: Map<string, CompiledServiceDefinition<any, Services, Parameters>> = new Map();
  private readonly aliases: Map<string, string[]> = new Map();
  private readonly globalServices: Store = new Store();
  private readonly localServices: AsyncLocalStorage<Store> = new AsyncLocalStorage();
  private readonly forkHooks: [string, CompiledServiceForkHook<any, Services, Parameters>][] = [];
  private readonly creating: Set<string> = new Set();

  constructor(parameters: Parameters, definitions: CompiledServiceDefinitionMap<Services, Parameters>) {
    this.parameters = parameters;
    this.importDefinitions(definitions);
  }

  get<Id extends keyof Services>(id: Id): GetResult<Services, Id, true>;
  get<Id extends keyof Services, Need extends boolean>(id: Id, need: Need): GetResult<Services, Id, Need>;
  get(id: string, need: boolean = true): any {
    return this.getOrCreate(this.resolve(id), need);
  }

  iterate<Id extends keyof Services>(alias: Id): IterateResult<Services, Id>;
  iterate(alias: string): Iterable<any> | AsyncIterable<any> {
    const ids = this.resolve(alias, false);
    const async = ids.some((id) => this.definitions.get(id)?.async);
    return async
      ? createAsyncIterator(ids, async (id) => this.getOrCreate(id, false))
      : createIterator(ids, (id) => this.getOrCreate(id, false));
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

  register<Id extends keyof Services>(alias: Id, service: Services[Id], force?: boolean): PromiseLike<void> | void;
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

  getParameters(): Parameters {
    return this.parameters;
  }

  resolveParameter<P extends string>(path: P, need?: true): Parameter<Parameters, P>;
  resolveParameter<P extends string>(path: P, need: false): Parameter<Parameters, P> | undefined;
  resolveParameter<P extends string>(path: P, need?: boolean): Parameter<Parameters, P> | undefined {
    try {
      return this.doResolveParameter(path);
    } catch (e: unknown) {
      if (e instanceof UnknownParameterError && need === false) {
        return undefined;
      }

      throw e;
    }
  }

  expand(value: string, need?: true): string;
  expand(value: string, need: false): string | undefined;
  expand(value: string, need?: boolean): string | undefined {
    try {
      return value.replace(/%([a-z0-9_.]+)%/gi, (_, path) => this.doResolveParameter(path));
    } catch (e: unknown) {
      if (e instanceof UnknownParameterError && need === false) {
        return undefined;
      }

      throw e;
    }
  }

  private doResolveParameter(path: string): any {
    const tokens = path.split(/\./g);
    let cursor: any = this.parameters;

    for (let i = 0; i < tokens.length; ++i) {
      const token = tokens[i];

      if (typeof cursor !== 'object' || cursor === null) {
        throw new InvalidParameterPathError(tokens.slice(0, i).join('.'));
      }

      if (!(token in cursor)) {
        throw new UnknownParameterError(tokens.slice(0, i).join('.'));
      }

      cursor = cursor[token];
    }

    return this.expandTree(cursor);
  }

  private expandTree(value: any): any {
    if (typeof value === 'string') {
      return this.expand(value);
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.expandTree(v));
    }

    if (typeof value !== 'object' || value === null) {
      return value;
    }

    return Object.fromEntries(Object.entries(value).map(([k, v]) => [
      this.expand(k),
      this.expandTree(v),
    ]));
  }

  async fork<R>(cb: () => Promise<R>): Promise<R> {
    const parent = this.currentStore;
    const store = new Store(parent);
    const chain = this.forkHooks.reduceRight((next, [id, hook]) => {
      return async () => {
        const callback = async (fork?: any) => {
          fork && store.set(id, fork);
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

  private importDefinitions(definitions: CompiledServiceDefinitionMap<Services, Parameters>): void {
    for (const [id, definition] of Object.entries(definitions)) {
      this.definitions.set(id, definition)
      this.aliases.set(id, [id]);

      if (definition.container) {
        this.forkHooks.push([id, (cb, svc) => svc.fork(cb)])
      } else if (definition.onFork) {
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

  private createInstanceSync<T>(id: string, definition: CompiledSyncServiceDefinition<T, Services, Parameters>, need: boolean = true): T | undefined {
    const service = definition.factory(this);
    this.getStore(definition.scope)?.set(id, service);
    service && definition.onCreate && definition.onCreate(service, this);
    this.creating.delete(id);

    if (!service && need) {
      throw new Error(`Unable to create required service '${id}'`);
    }

    return service;
  }

  private createInstanceAsync<T>(id: string, definition: CompiledAsyncServiceDefinition<T, Services, Parameters>, need: boolean = true): Promise<T | undefined> {
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
