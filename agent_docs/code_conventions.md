## Avoid Positional Parameters In Functions

When a function has more than one parameter of the same type, use an options object instead of positional parameters:

```ts
// BAD
const addUserToPost = (userId: string, postId: string) => {};

// GOOD
const addUserToPost = (opts: { userId: string; postId: string }) => {};
```

## Test New Services

Any new service file (named `*Service.ts` or placed in `app/services/`) must have an accompanying `.test.ts` file.
