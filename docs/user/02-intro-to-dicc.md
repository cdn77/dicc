# Intro to DICC

In [the previous chapter][1] we've talked about dependency injection in general
terms; in this chapter, we'll tackle the basics of how dependency injection
works in DICC.

Let's begin with defining some terminology that we'll use throughout the rest
of this documentation:

 - A **service** can be almost anything, but typically they will be classes
   or objects. Scalar values explicitly cannot be services; and values which
   have a call signature (typically functions) may in some cases introduce
   issues with dependency detection, so they're best avoided as services, too.
 - A **service factory** is either a constructor or a function which creates
   an instance of a particular service.
 - A **dependency** is any argument of a service factory.
 - **Autowiring** is the process of analysing the dependencies of each service
   and looking up other services within the same container which would satisfy
   those dependencies.
 - A **service definition** is a piece of TypeScript code that describes the
   identity and the dependencies of a particular service. Service definitions
   can be either _implicit_ or _explicit_.
 - **Implicit** service definitions are classes, interfaces, or functions which
   return a service. In other words, most of your regular code is already a
   service definition!
 - **Explicit** definitions are special `satisfies` expressions which allow you
   to specify extra options for service definitions.
 - Services can be either **public** or **anonymous**. Public services are those
   with a known _service ID_. All services have a unique service ID, but for
   anonymous services this ID is generated and should be considered opaque. Each
   container must have at least one public service. Implicit service definitions
   are always anonymous; explicit definitions are public by default, but can be
   made anonymous using an optional flag.
 - **Dynamic** services are services which don't have a factory. The container
   won't be able to create instances of such services at runtime; instead, you
   will need to register them manually. But other services can still depend on
   them.
 - A **resource file** (or just "resource" for short) is any TypeScript file
   within your project that exports one or more service definitions.
 - Service **aliases** are extra types which you want DICC to take into account
   while autowiring service dependencies. By default, if a service is a class or
   an interface, all of its ancestor classes and extended / implemented
   interfaces will automatically be added as the service's aliases.
 - Service **decorators** (not to be confused with `@decorators`) are
   a mechanism which you can use to augment the definitions of all services
   matching a given type.
 - A service's **scope** dictates when will the runtime container create
   new instances of the service:
   - _Global_ services will be instantiated _at most once_ per container, making
     them akin to _singletons_ (although unlike singletons, this is enforced by
     the container, and not the service itself). All services which depend on a
     global service will receive the same instance of that service.
   - _Private_ services are the polar opposite: they are instantiated every time
     they are requested from the container, meaning each service which depends
     on a private service will receive a fresh instance of that service.
   - _Local_ services are services which are only available within
     an asynchronous execution context started by calling the container's
     `.run()` method. Each such execution context (also called a _fork_) will
     have its own instances of local services, and these instances will be
     destroyed and discarded at the end of the `.run()` call. This is useful for
     things like HTTP requests, where each request can have a set of
     request-specific services not shared with other concurrent requests.
 - Service **hooks** are callbacks defined using explicit service definitions
   and / or service decorators which are run at specific points in a service's
   lifecycle.
 - An **async** service is one which cannot be instantiated synchronously. This
   may be due to the service factory being async, or due to the factory
   depending on another service which is itself async (and must therefore be
   awaited before it can be passed to the factory), or due to some of the hooks,
   which can be attached to the service, being async. Most of the time you don't
   need to care too much about which services are async, because DICC will take
   care of awaiting them as appropriate.


## DICC is a DI Container _Compiler_

DICC works by statically analysing your resource files to discover service
definitions. It then analyses these definitions, starting with public services
and working its way through their dependencies. Then it generates a container
class, which includes all the code needed to instantiate services and their
dependencies at runtime.

Due to the fact that service analysis begins with public services and follows
their dependency chains, any anonymous service definitions which aren't part of
a public service's dependency chain are excluded from the compiled container,
because they are effectively unreachable at runtime.

Typically, your container will only need a handful of public services, which
will serve as entrypoints for your application. Outside application entrypoints,
you should never need to know service IDs or have direct access to the container
instance.

Since autowiring is resolved during container compilation, any unmet service
dependencies will result in an error at compile time. Similarly, unbroken cyclic
dependencies can be detected at compile time and will likewise result in an
error.


**Next**: [Implicit services][2]

[1]: ./01-intro-to-di.md
[2]: ./03-implicit-services.md
