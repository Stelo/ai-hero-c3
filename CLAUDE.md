# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Writing Functions

When you have a function with more than one parameter with the same type, use an object parameter instead of positional parameters:

```
// BAD
const addUserToPost = (userId: string, postId: string) => {};`

// GOOD
const addUserToPost = (opts: { userId: string; postId: string }) => {};
```

## Creating new services
Any new services (by name of the file, for `example purposeService.ts`, or location in `/app/services`) should have tests written for them in an accompanying `.tests.ts` file.