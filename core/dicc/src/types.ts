import { Container } from './container';

export type Constructor<T = any> = { new (...args: any[]): T };
export type Factory<T = any> = { (...args: any[]): T };

export type Intersect<Types> =
  Types extends undefined ? any
  : Types extends [...any]
  ? Types extends [infer I, ...infer R] ? I & Intersect<R> : {}
  : Types;

export type MaybeOptional<T, Need extends boolean>
  = T extends undefined ? Need extends false ? T : Exclude<T, undefined> : Exclude<T, undefined>;
export type Resolved<T> = T extends Promise<infer V> ? V : T;

export type GetResult<Services extends Record<string, any>, K extends keyof Services, Need extends boolean>
  = Services[K] extends Promise<infer T> ? Promise<MaybeOptional<T, Need>> : MaybeOptional<Services[K], Need>;

export type FindResult<Services extends Record<string, any>, K extends keyof Services>
  = Extract<Services[K], Promise<any>> extends never
    ? Exclude<Services[K], undefined>[]
    : Promise<Exclude<Resolved<Services[K]>, undefined>[]>;

export type IterateResult<Services extends Record<string, any>, K extends keyof Services>
  = Extract<Services[K], Promise<any>> extends never
    ? Iterable<Exclude<Services[K], undefined>>
    : AsyncIterable<Exclude<Resolved<Services[K]>, undefined>>;

export type ServiceScope = 'global' | 'local' | 'private';
export type ServiceHook<T> = (service: T, ...args: any[]) => Promise<void> | void;
export type ServiceForkHook<T> = (callback: ServiceForkCallback<T, unknown>, service: T, ...args: any[]) => Promise<unknown> | unknown;
export type ServiceForkCallback<T, R> = (fork?: T | undefined) => Promise<R> | R;

export type ServiceDefinitionOptions<T = any> = {
  factory: Constructor<T> | Factory<Promise<T | undefined> | T | undefined> | undefined;
  args?: Record<string, any>;
  scope?: ServiceScope;
  anonymous?: boolean;
  onCreate?: ServiceHook<T>;
  onFork?: ServiceForkHook<T>;
  onDestroy?: ServiceHook<T>;
};

export type ServiceDefinition<T extends Intersect<A>, A = undefined> =
  | Constructor<T>
  | Factory<Promise<T | undefined> | T | undefined>
  | undefined
  | ServiceDefinitionOptions<T>;

export type ServiceDecorator<T> = {
  decorate?: <S extends T>(service: S, ...args: any[]) => Promise<S> | S;
  scope?: ServiceScope;
  onCreate?: ServiceHook<T>;
  onFork?: ServiceHook<T>;
  onDestroy?: ServiceHook<T>;
  priority?: number;
};

export type ServiceType<D> =
  D extends Factory<Promise<infer T> | infer T> ? T
  : D extends { factory: Factory<Promise<infer T> | infer T> } ? T
  : D extends ServiceDefinition<infer T> ? T
  : never;

export const ServiceMap = Symbol('ServiceMap');

export type ForeignServiceType<C extends Container<any, any>, Id extends string> =
  C extends {[ServiceMap]?: infer Map}
    ? Id extends keyof Map ? Map[Id] : never
    : never;

export interface ContainerParameters {
  [key: string]: any;
}

export type Parameter<Map extends Record<string, any>, Key extends string>
  = Key extends `${infer K}.${infer R}`
    ? K extends keyof Map
      ? Parameter<Map[K], R>
      : never
    : Key extends keyof Map
      ? Map[Key]
      : never;

export class ParameterExpansionError extends Error {}
export class UnknownParameterError extends ParameterExpansionError {
  constructor(path: string) {
    super(`Unknown parameter '${path}'`);
  }
}
export class InvalidParameterPathError extends ParameterExpansionError {
  constructor(path: string) {
    super(`Invalid parameter path '${path}', parent key is not an object`);
  }
}

export type CompiledServiceHook<T, Services extends Record<string, any> = {}, Parameters extends ContainerParameters = {}> = {
  (service: T, container: Container<Services, Parameters>): void;
};

export type CompiledAsyncServiceHook<T, Services extends Record<string, any> = {}, Parameters extends ContainerParameters = {}> = {
  (service: T, container: Container<Services, Parameters>): Promise<void> | void;
};

export type CompiledServiceForkHook<T, Services extends Record<string, any> = {}, Parameters extends ContainerParameters = {}> = {
  (callback: ServiceForkCallback<T, unknown>, service: T, container: Container<Services, Parameters>): Promise<unknown> | unknown;
};

export type CompiledServiceDefinitionOptions<T = any, Services extends Record<string, any> = {}, Parameters extends ContainerParameters = {}> = {
  aliases?: string[];
  container?: boolean;
  scope?: ServiceScope;
  onFork?: CompiledServiceForkHook<T, Services, Parameters>;
  onDestroy?: CompiledAsyncServiceHook<T, Services, Parameters>;
};

export type CompiledFactory<T, Services extends Record<string, any> = {}, Parameters extends ContainerParameters = {}> = {
  (container: Container<Services, Parameters>): T;
};

export type CompiledAsyncServiceDefinition<T = any, Services extends Record<string, any> = {}, Parameters extends ContainerParameters = {}>
  = CompiledServiceDefinitionOptions<NonNullable<T>, Services, Parameters> & {
    factory: CompiledFactory<Promise<T> | T, Services, Parameters>;
    async: true;
    onCreate?: CompiledAsyncServiceHook<NonNullable<T>, Services, Parameters>;
  };

export type CompiledSyncServiceDefinition<T = any, Services extends Record<string, any> = {}, Parameters extends ContainerParameters = {}>
  = CompiledServiceDefinitionOptions<NonNullable<T>, Services, Parameters> & {
    factory: CompiledFactory<T, Services, Parameters>;
    async?: false;
    onCreate?: CompiledServiceHook<NonNullable<T>, Services, Parameters>;
  };

export type CompiledDynamicServiceDefinition<T = any, Services extends Record<string, any> = {}, Parameters extends ContainerParameters = {}>
  = CompiledServiceDefinitionOptions<NonNullable<T>, Services, Parameters> & {
    factory: undefined;
    async?: boolean;
    onCreate?: CompiledAsyncServiceHook<NonNullable<T>, Services, Parameters>;
  };

export type CompiledServiceDefinition<T = any, Services extends Record<string, any> = {}, Parameters extends ContainerParameters = {}> =
  | CompiledAsyncServiceDefinition<T, Services, Parameters>
  | CompiledSyncServiceDefinition<T, Services, Parameters>
  | CompiledDynamicServiceDefinition<T, Services, Parameters>;

export type CompiledServiceDefinitionMap<Services extends Record<string, any> = {}, Parameters extends ContainerParameters = {}> = {
  [Id in keyof Services]?: Services[Id] extends Promise<infer S>
    ? CompiledAsyncServiceDefinition<S, Services, Parameters>
    : CompiledSyncServiceDefinition<Services[Id], Services, Parameters> | CompiledDynamicServiceDefinition<Services[Id], Services, Parameters>;
};
