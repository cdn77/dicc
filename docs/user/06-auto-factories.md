# Auto-generated service factories

Imagine you have a class which you need to instantiate possibly multiple times
with some arguments passed manually at the call site and others injected by the
DI container. For example:

```typescript
export class UserNotificationChannel {
  constructor(
    private readonly transport: NotificationTransport, // we want the DI to inject this
    private readonly username: string, // we need to pass this manually
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

// or alternatively just as a call signature:
export interface UserNotificationChannelFactory {
  (username: string): UserNotificationChannel;
}
```

Some notes on how it works:
- You need to register both the interface and the target class as services;
  the target class service will be automatically unregistered, but DICC still
  needs this in order to be able to figure out how to instantiate the service
  in the generated factory.
- The arguments of the factory method or callback will be mapped to the target
  service's arguments _by name_ during compilation. This means that the
  factory's arguments' positions and order can be arbitrary - they don't have
  to be in the same order as the target service's arguments.
- The generated factory will resolve dependencies of the target service lazily
  when creating an instance of the target service; this means that if either
  the target service itself or any of its dependencies is async, the factory
  needs to return a Promise for the target service. An error will be thrown
  during compilation if this requirement is not satisfied.

**Next**: [Service decorators][1]

[1]: ./07-service-decorators.md
