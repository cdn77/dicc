# Container parameters

It may be useful to define a set of parameters which must be provided at runtime
when creating a container, for example to pass environment configuration to
services. One way to do this is to simply define services which hold the
parameters, resolve the actual parameter values in the service factories, and
then inject these services wherever you need access to the parameters. But DICC
has another mechanism built in for this purpose: _container parameters_.

This feature is opt-in; to start using it, simply declare (and export from
one of your resource files) an interface which extends from the
`ContainerParameters` interface exported by `dicc`:

```typescript
// src/bootstrap/definitions/parameters.ts
import { ContainerParameters } from 'dicc';
import { DatabaseParameters } from '../../services/database/config';
import { MailerParameters } from '../../services/mailer/config';

export interface AppParameters extends ContainerParameters {
  database: DatabaseParameters;
  mailer: MailerParameters;
  runtime: {
    env: 'production' | 'development' | 'test';
    debug: boolean;
    cacheDir: string;
  };
}
```

> If you use other interfaces to define nested parameter types, be careful not
> to export those interfaces from your resource files, otherwise they will be
> registered as dynamic services, which will break injection.

The compiled Container class will now require a single constructor argument of
the type `AppParameters`:

```typescript
// src/bootstrap/container.ts
import * as parameters0 from './definitions/parameters';

interface Services {
  // ...
}

export class AppContainer extends Container<Services, parameters0.AppParameters> {
  constructor(parameters: parameters0.AppParameters) {
    super(parameters, { /* ... */ });
  }
}
```

When creating an instance of the container, you'll need to pass in an
appropriate object manually.

**But**: the DICC compiler will now be able to inject the parameters into your
services, as if they were themselves services - not only the root
`AppParameters` object, but also all named object types nested inside it (so
`DatabaseParameters` and `MailerParameters` in this example). And what's more,
you can use container parameters when overriding service factory arguments in
explicit service definitions:

```typescript
// src/bootstrap/definitions/caching.ts
import { ServiceDefinition } from 'dicc';
import { FileCache } from '../../services/caching';

export const imageCache = {
  factory: FileCache,
  args: {
    basePath: '%runtime.cacheDir%/images',
  },
} satisfies ServiceDefinition<FileCache>;
```

If the argument value is a string containing a single parameter expansion,
e.g. `'%runtime.debug%'`, the result will be strictly typed according to the
parameter interface declaration. If there are multiple parameter expansions,
or any other characters, the result will be a `string`. Parameter expansion
works recursively, so `%runtime.cacheDir%` could itself be set to something
like `%runtime.tempDir%/cache/%runtime.env%`.

**Next**: [Merging containers][1]

[1]: ./09-merging-containers.md
