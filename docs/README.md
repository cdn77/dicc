# DICC Documentation

DICC is a Dependency Injection Container Compiler for TypeScript. It analyses
one or more of your project's source files and produces a new TypeScript file,
which exports a DI container instance configured to create your project services
and autowire dependencies between them.


## Installation

DICC is split into two packages, because the compiler depends on TypeScript
and ts-morph, which are probably both something you want to be able to prune
from your production node modules. The runtime package is tiny and doesn't have
any other dependencies.

```shell
# Compile-time dependency:
npm i --save-dev dicc-cli

# Runtime dependency:
npm i --save dicc
```


## User documentation

 - [Intro to Dependency Injection][1] - a general overview of core dependency
   injection principles
 - [Intro to DICC][2] - basic introduction to DICC and how it was designed
   to work
 - [Services and dependencies][3] - how to write service definitions for the
   DICC compiler and how to specify dependencies
 - [Config and compilation][4] - how to configure the compiler, how to compile
   a container and how to use the container at runtime

## Integration recipes

 - [Express][5]

## Developer documentation

This section will detail DICC internals for developers who wish to contribute
to DICC or to extend it with custom functionality. Coming soon!


[1]: user/01-intro-to-di.md
[2]: user/02-intro-to-dicc.md
[3]: user/03-services-and-dependencies.md
[4]: user/04-config-and-compilation.md
[5]: recipes/01-express.md
