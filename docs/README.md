# DICC Documentation

DICC is a Dependency Injection Container Compiler for TypeScript. It analyses
one or more of your project's source files and produces a new TypeScript file,
which exports a DI container class configured to create your project services
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
 - [Simple services][3] - how to define the most common type of services
 - [Explicit service definitions][4] - how to tweak service definitions when
   more control is needed
 - [Injecting dependencies][5] - all the ways services can depend on each other
 - [Auto-generated factories][6] - save yourself some keystrokes
 - [Service decorators][7] - augment multiple service definitions at once
 - [Container parameters][8] - define runtime parameters for the entire
   container
 - [Merging containers][9] - split your application container into multiple
   parts and then merge them back together
 - [Config and compilation][10] - how to configure the compiler, how to compile
   a container and how to use the container at runtime

## Integration recipes

 - [Express][11]

## Developer documentation

This section will detail DICC internals for developers who wish to contribute
to DICC or to extend it with custom functionality. Coming soon!


[1]: user/01-intro-to-di.md
[2]: user/02-intro-to-dicc.md
[3]: user/03-simple-services.md
[4]: user/04-explicit-definitions.md
[5]: user/05-injecting-dependencies.md
[6]: user/06-auto-factories.md
[7]: user/07-service-decorators.md
[8]: user/08-container-parameters.md
[9]: user/09-merging-containers.md
[10]: user/10-config-and-compilation.md
[11]: recipes/01-express.md
