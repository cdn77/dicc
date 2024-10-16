# Intro to Dependency Injection

In this section we'll set up some commonly understood terms, outline some
general best practices and basically have a jolly good time. The topics
covered in this chapter aren't specific to DICC; if you're a veteran dependency
injection practitioner, feel free to skip ahead to the [next chapter][1].


## What is dependency injection?

In the most abstract sense, the term _dependency injection_ is used to describe
a programming pattern wherein different parts of code state what they depend on,
but don't try to resolve these dependencies by themselves, instead relying on
the user to provide them. The user can do this manually, but even in small
applications this quickly becomes cumbersome. This is where dependency injection
frameworks and libraries come into play - it's their job to figure out, with as
little manual input as possible, how to create each service and how to obtain
and inject its dependencies.

A number of injection mechanisms exist. The most commonly used is the so-called
_constructor injection_, where each service is a class which specifies its
dependencies as arguments of its constructor; the user (or the DI framework)
provides the dependencies simply by passing them as arguments when creating an
instance of the service. This is the only mechanism that DICC supports.

Other mechanisms include _setter injection_ (where the service exposes one or
more `setX(x: X)` methods that the user or DI framework must call, passing in
the appropriate value for `x`) and _property injection_ (where the service class
simply declares typed properties such as `public x: X` and the user / framework
sets their value directly). These mechanisms have the benefit of breaking up
potentially huge constructor signatures, which may improve readability, but it
comes at a cost - dependencies injected using these mechanisms aren't
enforceable, meaning the service may be created without injecting them, which
would most probably break the service; and it may become less obvious what the
dependencies actually are, as other setters and / or properties may be mixed in
with the dependencies.


## Services and dependencies

A _service_ is a logical piece of code which performs a specific function and
which we typically want to share around the codebase. An example might be a
database connection - we usually don't want each place in the application which
needs to access the database to create its own connection. Another example might
be a class which facilitates sending an e-mail - it might accept some common
configuration as a constructor argument (e.g. the SMTP server connection
options) and then expose a method which just accepts e.g. a list of
recipients, a subject and a message body. Being able to somehow get a configured
instance of this class would allow other code to send an e-mail without caring
about _how_ the e-mail is actually sent. A slightly less obvious example might
be application configuration - when you think about it, the e-mail sender
service from the previous example does _depend_ on the appropriate configuration
being passed into its constructor.

Basically, almost anything can be turned into a service, and services typically
delegate to other services under the hood to do some (or most) of the actual
work. For example, you can have a generic alerting service for sending messages
to users when something interesting happens, and this service might internally
use e.g. an e-mail sender service and a Slack integration service to actually
deliver the messages. Such a generic service might create its own instances of
the internal services, but that would mean it can never send alerts e.g. via
text messages, unless you modify its code - which is something you usually want
to avoid. A better approach would be to specify the internal services as
dependencies and inject them when creating the alerting service.

An important aspect of service design is that it should be possible to swap in
different implementations of a service's dependencies. This comes in extra handy
in tests, but it's also a very useful feature during refactoring or when
extending existing functionality and many other tasks. In general, you need to
do two things to achieve this: design your service APIs well, so that they are
generic enough that a different implementation of the same _semantic function_
would still make sense (e.g. a service which sends alerts might have a
`sendMessage()` method, rather than `sendEmail()`, because you might want to
switch to e.g. Slack or text messages in the future, and then the API wouldn't
make sense). The second thing is that it's generally a good idea to specify
dependencies using _interfaces_, rather than depending on a specific
implementation of that interface - so instead of depending on e.g.
`EmailAlertSender`, you'd depend on something like `AlertSenderInterface`, and
the `EmailAlertSender` class would implement this interface.

**Next**: [Intro to DICC][1]

[1]: ./02-intro-to-dicc.md
