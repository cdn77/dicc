---
title: 'Getting Started'
---

DICC is a Dependency Injection Container Compiler for TypeScript. It analyses
one or more of your project's source files and produces a new TypeScript file,
which exports a DI container class configured to create your project services
and autowire dependencies between them.


## Installation

DICC is split into two packages, because the compiler depends on TypeScript
and ts-morph, which are probably both something you want to be able to prune
from your production node modules. The runtime package is tiny and doesn't have
any other dependencies.

### Build-time dependency:

```bash
# Compile-time dependency:
npm i --save-dev dicc-cli

# Runtime dependency:
npm i --save dicc
```


## User documentation

- [Intro to Dependency Injection](/user/intro-to-di/) - a general overview 
  of core dependency injection principles
- [Intro to DICC](/user/intro-to-dicc/) - basic introduction to DICC and how 
  it was designed to work
- [Implicit services](/user/implicit-services/) - how to define the most 
  common type of services
- [Explicit service definitions](/user/explicit-definitions/) - how to tweak 
  service definitions when more control is needed
- [Injection patterns](/user/injection-patterns/) - all the ways services 
  can depend on each other
- [Auto-generated factories](/user/auto-factories/) - save yourself some 
  keystrokes
- [Service decorators](/user/service-decorators/) - augment multiple service 
  definitions at once
- [Merging containers](/user/merging-containers/) - split your application 
  container into multiple parts and then merge them back together
- [Config and compilation](/user/config-and-compilation/) - how to configure 
  the compiler, how to compile a container and how to use the container at 
  runtime

## Integration recipes

- [Express](/recipes/express/)

## Developer documentation

This section will detail DICC internals for developers who wish to contribute
to DICC or to extend it with custom functionality. Coming soon!
