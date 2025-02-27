---
title: Auto-generated service factories
---

Imagine you have a class which you need to instantiate possibly multiple times
with some arguments passed manually at the call site and others injected by the
DI container. For example:

```typescript
export class UserNotificationChannel {
  constructor(
    // we want the DI to inject this:
    private readonly transport: NotificationTransport,
    // but we need to pass this manually:
    private readonly username: string,
  ) {}
}
```

Some people would just inject `NotificationTransport` wherever they need to
create new instances of `UserNotificationChannel` and then create those
instances manually, but it's probably easy to see how that could become a chore
if `UserNotificationChannel` has multiple dependencies. You _could_ write
a factory service manually, e.g. like this:

```typescript
export class UserNotificationChannelFactory {
  constructor(
    // let's be extra lazy and ask for a _lazy accessor_ instead of the resolved instance:
    private readonly getTransport: () => NotificationTransport,
  ) {}

  create(username: string): UserNotificationChannel {
    return new UserNotificationChannel(this.getTransport(), username);
  }
}
```

... but that still means you have to manage the dependencies yourself at some
point. Instead, you can just declare the _interface_ for the factory service
with just the arguments you want to pass manually, and DICC will generate the
implementation for you and inject it where appropriate:

```typescript
export interface UserNotificationChannelFactory {
  create(username: string): UserNotificationChannel;
}
```

Some notes on how it works:
- Both the factory interface and the service class need to be registered as
  services, either implicitly by exporting them from a resource file, or
  explicitly using a `satisfies` expression.
- The arguments of the factory method or callback will be mapped to the target
  service's arguments _by name_ during compilation. This means that the
  factory's arguments' positions and order can be arbitrary - they don't have
  to be in the same order as the target service's arguments.
- The generated factory will attempt to resolve the target service's
  dependencies as lazily as possible; but if the `create()` method doesn't
  return a Promise and one or more of the target service's dependencies ends up
  being async, the factory service itself will be made async and the async
  dependencies will be resolved eagerly when creating an instance of the factory
  class, so that the `create()` method can stay synchronous.

Auto-generated factories can also be generated from abstract classes: if the
compiler encounters an abstract class with a single abstract `create()` method,
it will create a factory service by extending the class and implementing the
`create()` method using the same mechanism as for an interface. Such a factory
class can therefore serve other purposes than just creating an instance of the
target service: it can e.g. carry some metadata about the target service, so
that you can inject a list of factories and then determine at runtime which
target service you want to instantiate based on the metadata. This can be useful
e.g. for GraphQL class resolvers, where each resolver could have a corresponding
factory class which knows which operation the resolver belongs to, so that a
root resolver can examine the factory classes and instantiate the appropriate
resolver for an incoming GraphQL operation.

## Auto-implemented accessor services

A special case of auto-implemented factories are _accessor services_, which
are interfaces (or abstract classes) with a single (abstract) `get()` method
with no arguments. They behave exactly the same as auto-implemented factory
services, with the core distinction being that the target service isn't
unregistered from the container, and therefore its lifecycle can be managed
using the `scope` option as usual, instead of effectively making it `private`
as auto-factories do.

Since auto-implemented factories and accessors can be derived from abstract
classes (and therefore can carry additional data available before accessing the
target service), you can use them for similar purposes as you would use service
tags in other DI implementations, while retaining strict typing.
