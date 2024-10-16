# Merging containers

You can easily create multiple containers simply by defining them as appropriate
in your DICC config file; this will be covered in the next chapter. And while
that in an of itself can be pretty useful, DICC also allows you to _merge_
multiple containers, exposing public services of the merged container to the
parent container, which can then inject them into its own services.

To merge two containers in this manner, simply define the container you wish to
merge _from_ as a service within the container you wish to merge _into_; DICC
will take care of the rest. If the merged container is registered as a _public
service_ (that is, using an explicit definition without setting the `anonymous`
flag to `true`), its public services will also become public in the parent
container; their service IDs will be prefixed with the merged container's own
service ID. If the merged container is registered as an anonymous service, its
public services will be registered as anonymous in the parent container.

Merged services will have their scope set to `private` in the parent container,
which will cause the parent container to never store instances of those services
and instead always ask the merged container for them, thus delegating the
management of merged services' scope to their original container. Forking a
container will also fork all of its child containers.

Since the merged container is just another service from the parent container's
perspective, its factory will be injected as usual, whether it's the container
class itself, or a factory function - so if the merged container declares
runtime parameters as described in the previous chapter, you can either register
a service factory which provides the parameters in the parent container, or you
can include the parameters in the parent container's own parameter tree.

**Next**: [DICC config and compilation][1]

[1]: ./10-config-and-compilation.md
