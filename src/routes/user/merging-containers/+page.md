---
title: Merging containers
---

You can easily create multiple containers simply by defining them as appropriate
in your DICC config file; this will be covered in the next chapter. And while
that in an of itself can be pretty useful, DICC also allows you to _merge_
containers, wiring up some services in-between them.

To merge two containers in this manner, simply define the container you wish to
merge _from_ (the _child container_) as a service within the container you wish
to merge _into_ (the _parent container_). The DICC compiler will recognise that
the service is a container, and on top of its regular autowiring duties, the
following will happen:
- DICC will set up an `onFork` hook for the child container service, so
  that the child container's lifecycle is kept in sync with the parent.
- Any public services of the _child container_ will become available for
  injection into services inside the _parent container_; if the child container
  itself is registered as a public service of the parent, its public services
  will also become public in the parent. Inside the parent container, public
  services of public child container services will have their IDs prefixed with
  the ID of the child container service.
- Any dynamic services in the _child container_ will be automatically injected
  with any matching services from the _parent container_. Thus, the child
  container can specify its external dependencies using dynamic services.

Public services merged into the parent container will have their scope set to
`private` in the parent container, which will cause the parent container to
never store instances of those services and instead always ask the child
container for them, thus delegating the management of merged services' scope to
their original container. Starting an async local scope using `parent.run()`
will also propagate to all of its child containers.

Merging containers allows you to e.g. define separate containers for DDD bounded
contexts and then merge them into a core container, propagating globally shared
services such as a global event dispatcher down into the BC containers, and
well-defined surface services (such as controllers / GraphQL resolvers) back
into the core container.
