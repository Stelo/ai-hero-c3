---
name: zod-to-valibot
description: Migrates a TypeScript codebase from Zod v3 to Valibot v1. Handles schema conversion, pipe() rewrites, import changes, safeParse output shape differences, error handling, and type inference. Use when the user asks to migrate from Zod to Valibot, replace Zod, or convert validation schemas.
---

# Zod → Valibot Migration

## Quick start

### Step 0 — Install Valibot

Before editing any files, check whether `valibot` is already installed and install it if not:

```bash
# Detect package manager and check for valibot
if [ -f pnpm-lock.yaml ]; then PM=pnpm; elif [ -f yarn.lock ]; then PM=yarn; else PM=npm; fi
$PM list valibot 2>/dev/null | grep valibot || $PM add valibot
```

Or use the Bash tool to check `package.json` directly:
```bash
grep '"valibot"' package.json || pnpm add valibot   # adjust PM as needed
```

Do **not** remove `zod` until every file in scope has been migrated.

```bash
# Optional automated codemod (partial coverage — review all output)
npx @valibot/zod-to-valibot "src/**/*.ts"
```

Then apply the manual migration steps below. The codemod handles simple schemas but misses complex patterns.

## Migration workflow

### Step 1 — Audit

Find all files with Zod usage:
```bash
grep -rl "from 'zod'\|from \"zod\"" src/ app/ --include="*.ts" --include="*.tsx"
```

Categorise what you find:
- Schema definitions (`z.object`, `z.string`, etc.)
- `.parse()` / `.safeParse()` call sites
- `z.infer<typeof schema>` type annotations
- Error handling (`result.error`, `ZodError`, `.flatten()`)
- Utility schemas (`z.ZodType`, `z.ZodTypeAny`)

### Step 2 — Replace imports

```ts
// Before
import { z } from 'zod';
import type { z } from 'zod';

// After (namespace — easiest migration path)
import * as v from 'valibot';
```

### Step 3 — Convert schemas

The biggest architectural shift: **Zod chains methods on schemas; Valibot uses `pipe()`**.

```ts
// Zod
const schema = z.string().min(3).max(100).email();

// Valibot
const schema = v.pipe(v.string(), v.minLength(3), v.maxLength(100), v.email());
```

Key schema renames (see [REFERENCE.md](REFERENCE.md) for full table):
| Zod | Valibot | Note |
|-----|---------|------|
| `z.enum(['a','b'])` | `v.picklist(['a','b'])` | **Name swap** |
| `z.nativeEnum(MyEnum)` | `v.enum(MyEnum)` | **Name swap** |
| `z.discriminatedUnion(k,[...])` | `v.variant(k,[...])` | |
| `z.intersection(a,b)` | `v.intersect([a,b])` | Array arg |
| `z.instanceof(Cls)` | `v.instance(Cls)` | |
| `z.object({}).strict()` | `v.strictObject({})` | Separate function |
| `z.object({}).passthrough()` | `v.looseObject({})` | Separate function |
| `z.object({}).catchall(s)` | `v.objectWithRest({}, s)` | |

Object spread replaces `.extend()` / `.merge()`:
```ts
// Zod
const Extended = BaseSchema.extend({ newField: z.string() });
const Merged = SchemaA.merge(SchemaB);

// Valibot
const Extended = v.object({ ...BaseSchema.entries, newField: v.string() });
const Merged = v.object({ ...SchemaA.entries, ...SchemaB.entries });
```

### Step 4 — Fix `.safeParse()` call sites

**Critical**: Valibot's `safeParse` returns a different shape.

```ts
// Zod
const result = schema.safeParse(data);
if (result.success) {
  result.data;          // ✅ Zod uses .data
} else {
  result.error.issues;  // ✅ Zod wraps in .error
}

// Valibot
const result = v.safeParse(schema, data);
if (result.success) {
  result.output;        // ✅ Valibot uses .output
} else {
  result.issues;        // ✅ Valibot has .issues directly on result
}
```

### Step 5 — Fix `.parse()` call sites

```ts
// Zod
const value = schema.parse(data);

// Valibot
const value = v.parse(schema, data);
```

### Step 6 — Fix error handling

```ts
// Zod
import { ZodError } from 'zod';
catch (e) {
  if (e instanceof ZodError) {
    e.issues;
    e.flatten().fieldErrors;
  }
}

// Valibot
import { ValiError, isValiError, flatten } from 'valibot';
catch (e) {
  if (isValiError(e)) {
    e.issues;
    v.flatten(e.issues).nested; // 'nested' ≈ Zod's 'fieldErrors'
  }
}
```

`flatten()` shape differences:
```ts
// Zod flatten()
{ formErrors: string[], fieldErrors: Record<string, string[]> }

// Valibot flatten()
{ root?: string[], nested?: Record<string, string[]>, other?: string[] }
// 'root'   = top-level errors (≈ Zod's formErrors)
// 'nested' = field errors    (≈ Zod's fieldErrors)
```

### Step 7 — Fix type inference

```ts
// Zod
type User = z.infer<typeof UserSchema>;
type UserInput = z.input<typeof UserSchema>;

// Valibot
type User = v.InferOutput<typeof UserSchema>;
type UserInput = v.InferInput<typeof UserSchema>;
```

Replace generic constraints:
```ts
// Zod
function validate<T extends z.ZodType>(schema: T): z.infer<T> { ... }

// Valibot
function validate<T extends v.GenericSchema>(schema: T): v.InferOutput<T> { ... }
```

### Step 8 — Migrate refinements / transforms

```ts
// Zod .refine()
schema.refine(fn, 'message');

// Valibot
v.pipe(schema, v.check(fn, 'message'));

// Zod .superRefine()
schema.superRefine((val, ctx) => { ctx.addIssue({...}); });

// Valibot
v.pipe(schema, v.rawCheck(({ dataset, addIssue }) => { addIssue({...}); }));

// Zod .transform()
schema.transform(fn);

// Valibot
v.pipe(schema, v.transform(fn));
```

Cross-field validation with error forwarding:
```ts
// Zod
z.object({ pw1: z.string(), pw2: z.string() })
  .refine(d => d.pw1 === d.pw2, { message: 'Mismatch', path: ['pw2'] });

// Valibot
v.pipe(
  v.object({ pw1: v.string(), pw2: v.string() }),
  v.forward(
    v.partialCheck([['pw1'], ['pw2']], d => d.pw1 === d.pw2, 'Mismatch'),
    ['pw2']
  )
);
```

### Step 9 — Handle coerce and preprocess

Valibot has no `z.coerce.*` namespace. Use explicit transforms:
```ts
// Zod
z.coerce.number()
z.coerce.date()
z.preprocess(fn, schema)

// Valibot
v.pipe(v.string(), v.decimal(), v.transform(Number))
v.pipe(v.string(), v.isoDate(), v.transform(s => new Date(s)))
v.pipe(v.unknown(), v.transform(fn), schema)
```

### Step 10 — Migrate defaults and fallbacks

```ts
// Zod
z.string().default('hello')
schema.catch(fallbackValue)

// Valibot
v.optional(v.string(), 'hello')
v.fallback(schema, fallbackValue)
```

### Step 11 — Async validation

Valibot requires explicit async variants (Zod mixes them transparently):
```ts
// Only the async part needs Async suffix
const schema = v.objectAsync({
  username: v.pipeAsync(v.string(), v.checkAsync(checkDb, 'Taken')),
  email: v.pipe(v.string(), v.email()),  // stays sync
});
const result = await v.parseAsync(schema, data);
```

### Step 12 — Utility method patterns

`partial()`, `required()`, `pick()`, `omit()` **cannot** be applied to a piped schema:
```ts
// WRONG — runtime error
const piped = v.pipe(v.object({...}), v.check(...));
v.partial(piped);

// CORRECT — apply before piping
const base = v.object({...});
const partial = v.partial(base);
const piped = v.pipe(partial, v.check(...));
```

### Step 13 — Run tests

After completing all migrations, run the test suite to validate correctness:

```bash
# Detect package manager and run tests
if [ -f pnpm-lock.yaml ]; then PM=pnpm; elif [ -f yarn.lock ]; then PM=yarn; else PM=npm; fi
$PM test
```

Common failures to look for:
- `result.data` still referenced instead of `result.output` — search for `\.data\b` after a safeParse call
- `result.error` still referenced instead of `result.issues`
- `z.` prefix left in an unconverted schema
- `from 'zod'` import still present in a migrated file

Fix any failures before proceeding. Only remove `zod` from `package.json` once all tests pass.

## Gotcha checklist

- [ ] `result.data` → `result.output` (safeParse success)
- [ ] `result.error.issues` → `result.issues` (safeParse failure)
- [ ] `z.infer<>` → `v.InferOutput<>` (PascalCase)
- [ ] `z.enum(['a'])` → `v.picklist(['a'])` (name swapped)
- [ ] `z.nativeEnum(E)` → `v.enum(E)` (name swapped)
- [ ] `schema.parse(d)` → `v.parse(schema, d)` (standalone function)
- [ ] `.error.flatten().fieldErrors` → `v.flatten(issues).nested`
- [ ] `e instanceof ZodError` → `isValiError(e)`
- [ ] `.extend({})` / `.merge()` → spread `.entries`
- [ ] `z.object({}).strict()` → `v.strictObject({})`
- [ ] `z.object({}).passthrough()` → `v.looseObject({})`
- [ ] `z.ZodType` → `v.GenericSchema`

## Full API reference

See [REFERENCE.md](REFERENCE.md) for the complete Zod → Valibot mapping table.
