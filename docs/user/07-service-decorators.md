# Service decorators

The service decorator pattern can be used to augment existing service
definitions without actually modifying their code. In DICC, you can use service
decorators to change services' scope, add additional lifecycle hooks, and even
to wrap service factories with callbacks, giving you access to - and control
over - service instances before they're registered in the container. Let's take
a look at an example - imagine we have a bunch of services implementing a common
interface defined somewhere, and we want to change all of their scopes to
`private`:

```typescript
import { ServiceDecorator } from 'dicc';

export const setCommonScope = {
  scope: 'private',
} satisfies ServiceDecorator<CommonInterface>;
```

If you look at the compiled container, in this case the decorator won't be
referenced anywhere explicitly, because the compiler can simply set the `scope`
property of the affected services directly. But what if you wanted to add an
`onCreate` hook in order to get notified when one of the target services is
created?

```typescript
interface CommonInterface {
  sayHi(): string;
}

export const notifyCreated = {
  // 'service' is correctly typed as a 'CommonInterface' instance, courtesy of
  // the 'satisfies' expression; 'logger' will be injected by the compiler:
  onCreate(service, logger: Logger) {
    logger.log(`CommonInterface instance created, says ${service.sayHi()}`);
  },
} satisfies ServiceDecorator<CommonInterface>;
```

Service decorators can add any of the three service lifecycle hooks; the
`onCreate` and `onDestroy` hooks follow the same semantics as if they were
registered on the service definitions, but the `onFork` hook works slightly
differently: if the service definition has an `onFork` hook which returns a
forked instance of the service, all the service's decorators will receive that
instance instead of the original service, and the decorators' `onFork` hooks'
return values are ignored, meaning a decorator's `onFork` hook cannot be used
to create a forked service instance.

Service decorators can also be applied to the output of service factories:

```typescript
export const withLoggedMethodCalls = {
  decorate(service, logger: MethodCallLoggerInterface) {
    return new Proxy(service, logger.createProxyHandlers(service));
  },
} satisfies ServiceDecorator<SomeInterface>;
```

Currently, the `decorate` hook must return either an instance of the same class
as the original service which was passed in, or a `Proxy` for the same. In the
future, decorators might possibly be given the ability to completely override
the service's type, although I will have to think hard on all the ramifications
of such a capability.

Decorators may be given a numeric _priority_ to influence the order in which
they are applied to decorated services. The `priority` option defaults to zero,
and decorators are applied in descending order of priority. There are no
predetermined priority levels, you can simply choose whichever numbers make
sense for your use case. You can e.g. use negative numbers for decorators which
need to run later than any default-priority decorators etc. The order of
decorators with the same priority is undefined.


**Next**: [Container parameters][1]

[1]: ./08-container-parameters.md
