# Explicit service definitions

As briefly mentioned before, an explicit service definition is a special
`satisfies` expression. This is what it looks like:

```typescript
import { ServiceDefinition } from 'dicc';

// the simplest kind of definition - an instantiable class service;
// note that this would be almost equivalent to just `export { ServiceOne }`,
// except that no aliases are automatically registered:
export const one = ServiceOne satisfies ServiceDefinition<ServiceOne>;

// a definition with an alias:
export const twoWithOneAlias = ServiceTwo satisfies ServiceDefinition<ServiceTwo, AliasOne>;
// multiple aliases can be specified as a tuple:
export const twoWithMultipleAliases = ServiceTwo satisfies ServiceDefinition<ServiceTwo, [AliasOne, AliasTwo]>;

// a definition using a factory function:
export const three = (() => new ServiceThree()) satisfies ServiceDefinition<ServiceThree>;
export const alsoThree = ServiceThree.create satisfies ServiceDefinition<ServiceThree>;

// a definition using an object literal, allowing us to specify other options:
export const four = {
  factory: ServiceFour,
  onCreate() { console.log('Four created!') },
} satisfies ServiceDefinition<ServiceFour>;

// a factory function can be async:
export const five = (async () => new ServiceFive()) satisfies ServiceDefinition<ServiceFive>;
export const alsoFive = {
  async factory() { return new ServiceFive() },
  onCreate(service) { console.log(`Five says: ${service.sayHello()}`) }
} satisfies ServiceDefinition<ServiceFive>;

// factories may return undefined if a service cannot be created:
export const maybeSix = (
  () => process.env.WITH_SIX ? new ServiceSix() : undefined
) satisfies ServiceDefinition<ServiceSix>;

// factories themselves can be undefined - this makes the service dynamic,
// that is, the compiler can include code to inject it as a dependency to other
// services, but the runtime container can't create it and instead you need to
// register it manually:
export const seven = undefined satisfies ServiceDefinition<ServiceSeven>;
export const alsoSeven = {
  factory: undefined,
  onCreate() { console.log('Seven registered in the container!') },
} satisfies ServiceDefinition<ServiceSeven>;

// an explicit service definition can override factory arguments by name;
// this is useful if you just need to override one or two arguments and
// avoid repeating the full factory signature:
export const overrideArgs = {
  factory: ServiceWithSomeArgs,
  args: {
    // you can inject static values,
    staticValue: 3.1415926535,
    // or you can specify a callback which will be invoked inside
    // the service factory and its return value will be used:
    injectedValue: (other: OtherService) => other.getValue(),
  },
} satisfies ServiceDefinition<ServiceWithSomeArgs>;
```

Formally, the object literal form of the service definition has the following
shape:

```typescript
type Constructor<T> = { new (...args: any[]): T };
type Factory<T> = { (...args: any[]): T };
type MaybePromise<T> = Promise<T> | T;

export type ServiceDefinitionObject<T> = {
  // class, factory function, or undefined
  factory: Constructor<T> | Factory<MaybePromise<T | undefined>> | undefined;

  // map of factory argument overrides
  args?: Record<string, any>;

  // service scope; defaults to 'global'
  scope?: 'global' | 'local' | 'private';

  // allows to make an explicit service definition anonymous
  anonymous?: boolean;

  // hooks for service lifecycle events
  onCreate?: (service: T, ...args: any[]) => Promise<void> | void;
  onFork?: <R>(callback: (forkedService?: T) => R, service: T, ...args: any[]) => Promise<R> | R;
  onDestroy?: (service: T, ...args: any[]) => Promise<void> | void;
}
```

A definition file can re-export definitions from other files:

```typescript
// logger.ts
export const logger = { ...definition };

// orm.ts
export const repository = {
  author: { ...definition },
  book: { ...definition },
};

// controllers/admin.ts
export namespace controllers {
  export const createBook = { ...definition };
  export const deleteBook = { ...definition };
}

// controllers/public.ts
export namespace controllers {
  export const listBooks = { ...definition };
}

// controllers/index.ts
export * from './admin';
export * from './public';

// definitions.ts
export * from './logger';
export * as orm from './orm';
export * from './controllers';

// exported service definition tree would look like this:
const defs = {
  logger: { ...definition },
  orm: {
    repository: {
      author: { ...definition },
      book: { ...definition },
    },
  },
  controllers: {
    createBook: { ...definition },
    deleteBook: { ...definition },
    listBooks: { ...definition },
  },
};

// this, in turn, would result in the following flattened service IDs:
container.get('logger');
container.get('orm.repository.author');
container.get('controllers.listBooks');
// etc
```

> An explicit service definition overrides a simple class or interface export of
> the same type, so you can simply `export * from '../services'` at the start of
> a resource file, and then follow that with explicit definitions for services
> which need some tweaks - such services won't be registered twice. If you do
> need to register a given service multiple times, you must provide explicit
> definitions for each registration.

Now that we know how to tell DICC about services, let's see how we can tell it
what those services depend on.

**Next**: [Injecting dependencies][1]

[1]: ./05-injecting-dependencies.md
