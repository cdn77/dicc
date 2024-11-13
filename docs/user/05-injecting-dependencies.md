# Injecting dependencies

As explained in the previous chapters, DICC will analyse the constructor or
factory of each defined service and attempt to inject the correct values into
its arguments when the service is being created. There are several ways services
can depend on other services. We'll explore all the options using some examples.
The first thing we'll look at is simply injecting a single instance of a
dependency directly.

```typescript
// no constructor, or a constructor with no arguments, means no dependencies
export class ServiceOne {}

// a similar example, but with an async factory, making ServiceTwo async:
export class ServiceTwo {
  static async create(): Promise<ServiceTwo> {
    // probably do some useful async stuff here
    return new ServiceTwo();
  }
}

// ServiceThree depends on both services directly - it doesn't care if either
// service it depends on is async, it just wants the resolved instances; the
// compiled factory for ServiceThree would therefore be async in order to be
// able to resolve the promise for ServiceTwo, but ServiceThree itself doesn't
// need to know or care:
export class ServiceThree {
  constructor(
    readonly one: ServiceOne,
    readonly two: ServiceTwo,
  ) {}
}

// ServiceFour is an example where a promise for ServiceTwo needs to be injected
// and it's then ServiceFour's job to await it when it needs access to the
// ServiceTwo instance; it adds some complexity to ServiceFour, but it means
// that it can be created synchronously, even though it depends on an async
// service, which may be useful in some situations:
export class ServiceFour {
  constructor(readonly two: Promise<ServiceTwo>) {}
}

// ServiceFive shows an example of depending on optional services.
// Let's first imagine an optional service:
export class ServiceBar {
  create(): ServiceBar | undefined {
    return process.env.WITH_BAR ? new ServiceBar() : undefined;
  }
}

export class ServiceFive {
  constructor(
    readonly one?: ServiceOne, // would inject ServiceOne
    readonly foo?: ServiceFoo, // would inject undefined - no such service exists
    readonly bar?: ServiceBar, // would inject ServiceBar | undefined
                               // based on what ServiceBar.create() returns
  ) {}
}
```


## Advanced injection patterns

This covers the most common and most simple injection modes, but DICC can do
a lot more than that. For example, you can depend on an _accessor_ for a
service - a callback with no arguments which will return the requested service.
This can be useful to break cyclic dependencies (an accessor is not a direct
dependency), or to let a potentially heavy service be initialised lazily only
when it's needed:

```typescript
export class ServiceFive {
  constructor(
    readonly getOne: () => ServiceOne,
    readonly getTwo: () => Promise<ServiceTwo>, // accessor for an async service
  ) {}
}
```

We've mentioned dynamic services before - services whose type the compiler knows
(and therefore can autowire as dependencies into other services), but which the
runtime container cannot create, relying instead on your code to register the
service instance when appropriate. This may induce you to think that *some*
part of your code would indeed need to know that there is a DI container, in
order to register the dynamic service into the container. But fear not! DICC has
even that base covered: similarly to service accessors, you can have DICC inject
a so-called _service injector_, which is a callback accepting a single typed
argument and returning `void`, like this:

```typescript
export class RequestDispatcher {
  constructor(
    private readonly registerHttpRequest: (request: HttpRequest) => void,
  ) {}

  dispatch(request: HttpRequest): void {
    this.registerHttpRequest(request);
    // now the dynamic service HttpReqeuest is properly registered
    // in the container
  }
}
```

Another thing DICC allows you to do is define (directly or via aliases)
multiple services of the same type and then to inject all services of a given
type as an array:

```typescript
export interface LogWriter {
  write(message: string): void;
}

export class ConsoleWriter implements LogWriter {
  write(message: string): void {
    console.log(message);
  }
}

export class FileWriter implements LogWriter {
  private readonly file: WritableStream;

  write(message: string): void {
    this.file.getWriter().write(message);
  }
}

// The Logger service will get all the services with the LogWriter alias:
export class Logger {
  constructor(private readonly writers: LogWriter[]) {}

  log(message: string): void {
    for (const writer of this.writers) {
      writer.write(message);
    }
  }
}
```

If one or more of the services of the type you wish to inject is async, but you
want to handle resolving the Promises yourself, you can ask DICC to inject
a Promise for the array, e.g.:

```typescript
export class Logger {
  constructor(private readonly writers: Promise<LogWriter[]>) {}
}
```

You can combine accessor and array injection:

```typescript
export class Logger {
  constructor(
    // for sync services:
    private readonly getWriters: () => LogWriter[],
    // if one or more of the services is async:
    private readonly getWritersEventually: () => Promise<LogWriter[]>,
  ) {}
}
```

Similarly to arrays, you can inject _iterables_ - this also allows you to inject
a bunch of services of the same type, but unlike injecting an array (or an
accessor for an array), each service in the iterable will be lazily resolved
when the iterable reaches it. Works for sync and async services:

```typescript
export class Logger {
  constructor(
    // for sync services:
    private readonly writers: Iterable<LogWriter>,
    // if one or more of the services is async:
    private readonly asyncWriters: AsyncIterable<LogWriter>,
  ) {}
}
```

Note that accessors and iterables in combination with async services can break
one of the core DI concepts - that services shouldn't care how their
dependencies are created. If you need to inject an accessor or an iterable, you
need to know whether (one or more of) the injected service(s) is async - e.g.
service X, which needs to have an accessor for service Y, needs to type the
accessor according to the definition (and dependencies) of service Y - the
accessor must either return `Y`, or `Promise<Y>`, but X shouldn't have to deal
with that. But I don't know of any mechanism which could circumvent this. At
least it isn't a dependency on the DI framework itself - the requirement to
appropriately pick whether X should depend on `() => Y` or `() => Promise<Y>`
arises from application code, and as far as I can tell, there is no way this
could be resolved in _any_ framework which allows async services (well, not
unless other contracts are broken - such as accessors and iterables being lazy,
which seems like a more important feature). In any case, you don't have to
_think_ about it too much, because DICC will throw an error during compilation
if you try to inject a non-async accessor or iterable for something which _is_
async.


## Injecting the container

Simply put, injecting the container into a service is intentionally impossible
in DICC. "Container-aware" services are a direct breach of the entire reason
for DICC to exist. But you don't need that: you can inject service accessors
and injectors instead of using container methods manually. The only remaining
reason for accessing the container directly in application code outside of
application entrypoints would be to call the `container.run()` method at the
start of e.g. HTTP requests; and to that end, you can instead declare
a dependency on a service implementing the `ScopedRunner` interface exported
from `dicc`; this interface declares the `run()` method with the same signature
as the container's, and the compiler will inject an appropriate implementation
into such a dependency, leaving the container safely separate from your code.


**Next**: [Auto-generated service factories][1]


[1]: ./06-auto-factories.md
