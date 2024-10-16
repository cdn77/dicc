# DICC config and compilation

In previous chapters we've talked about the code you need to write; now we'll
look into how to compile that code into a working container usable at runtime,
and how to actually use that container.

## `dicc.yaml`

The DICC config file is a simple YAML file with only a couple of options. The
following snippet gives a complete reference, along with defaults where
applicable:

```yaml
# path to your project's tsconfig.json:
project: './tsconfig.json'

# required; a map of containers you wish to compile,
# with path to the generated file as the key and the
# container options as the value:
containers:
  src/bootstrap/container.ts: # for example
    # any text to add at the beginning of the compiled
    # output file; useful for e.g. an eslint-disable comment:
    preamble: ~

    # the class name of the compiled container;
    # use 'default' to make the class the default export:
    className: 'AppContainer'

    # whether to type-check the generated container after compilation:
    typeCheck: true

    # required; a map of <path>: [options] pairs:
    resources:
      # a single file with no options;
      'src/example.ts': ~
      # multiple files can be selected using globs:
      'src/examples/**/*.ts':
        # exclude files or exported paths from scanning:
        exclude:
          - '**/__tests__/**'  # you can exclude by file path or glob
          - 'path.to.ExcludedClass'  # or by object path
```

## Compiling a container

Whenever you change service definitions you must re-run the compiler in order
to get a matching container. This is done using the `dicc` executable shipped
with DICC. The executable has the following options:

```
dicc [-v|--verbose] [-c <file>|--config <file>]

 -v, --verbose
   Toggle verbose output. Can be specified multiple times to make output even
   more verbose.
 -c <file>, --config <file>
   Load the specified config file, instead of looking for one of the default
   config files. Config files are always resolved from the current working
   directory; the default files are 'dicc.yaml', 'dicc.yml', '.dicc.yaml', and
   '.dicc.yml', in this order.
```

The compiled container should be a deterministic product of your definitions,
so you can safely exclude it from version control. But versioning it probably
won't hurt anything, either; that way, you can speed up build times, and you'll
be able to see changes between compilations.


## Obtaining services

Ideally, you should write your code so that the only places where you explicitly
touch the container are the entrypoints of your application. For example, your
`app.ts` could look something like this:

```typescript
import { AppContainer } from './bootstrap';

const container = new AppContainer();

container.get('application').run();
```

Remember, a key attribute of dependency injection is that code doesn't know
that there _is_ a DI container, and that includes obtaining services from the
container. So the ideal way to write code is to wrap everything in services,
specify inter-service dependencies as constructor arguments and have DICC
inject the dependencies wherever you need them.
