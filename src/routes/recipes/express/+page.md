---
title: Using `container.run()` with Express
---

The sadly ubiquitous Express HTTP server doesn't mesh well with async code.
This means some care must be taken when integrating DICC into an Express-based
application, otherwise the async context tracking within the `container.run()`
callback required to make locally-scoped services possible simply won't work.

## TL;DR - how do I use DICC with Express?

Just use the following code snippet as your very first middleware:

```typescript
app.use((req, res, next) => {
  container.run(async () => {
    next();

    if (!res.closed) {
      await new Promise((resolve) => {
        res.on('close', resolve);
      });
    }
  });
});
```

## Why?

The problem is that the return value of Express middlewares is completely
ignored. This means that any middleware which is `async` will not be properly
awaited, and so calling `next()` in a middleware will return as soon as all
subsequent middlewares run their _synchronous_ code - but tracking the end of
any _asynchronous_ execution spawned from middlewares is impossible from the
point of a preceding middleware. The problem is illustrated by the following
snippet:

```typescript
import express from 'express';

const app = express();

app.use(async (req, res, next) => {
  console.log('mw 1 start');
  await next();
  console.log('mw 1 end');
});

app.use(async (req, res, next) => {
  console.log('mw 2 start');
  await next();
  console.log('mw 2 end');
});

app.use(async (req, res, next) => {
  console.log('mw 3 start');
  await new Promise((r) => setTimeout(r, 250));
  res.end('hello world');
  console.log('mw 3 end');
});

app.listen(8000);
```

The script will output the following sequence when a request is handled:

```
mw 1 start
mw 2 start
mw 3 start
mw 2 end
mw 1 end
mw 3 end
```

Notice the first and second middlewares log the end of their execution _before_
the last middleware finishes executing, even though each middleware awaits the
`next()` call. This means that `mw 1` has no direct way of telling when `mw 3`
(or any other middleware) finished handling the request. If we were to naively
use something like `container.run(next)` in `mw 1`, the local context would
only be available during the synchronous part of the subsequent middlewares,
because the `run()` method awaits the provided callback and cleans up the
local context when the callback resolves - but as we've seen, `next()` doesn't
return a Promise, so it will resolve immediately when all synchronous code has
been executed.

The snippet at the beginning of this recipe works by waiting for the response
stream to be closed before returning from the callback. Unless the app crashes
catastrophically, this will ensure that the local DI context will stay alive
for the entire duration of the request handling pipeline.
