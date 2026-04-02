# Zod → Valibot Complete API Reference

## Primitive schemas

| Zod | Valibot |
|-----|---------|
| `z.string()` | `v.string()` |
| `z.number()` | `v.number()` |
| `z.boolean()` | `v.boolean()` |
| `z.bigint()` | `v.bigint()` |
| `z.date()` | `v.date()` |
| `z.symbol()` | `v.symbol()` |
| `z.null()` | `v.null()` |
| `z.undefined()` | `v.undefined()` |
| `z.any()` | `v.any()` |
| `z.unknown()` | `v.unknown()` |
| `z.never()` | `v.never()` |
| `z.void()` | `v.void()` |
| `z.nan()` | `v.nan()` |
| `z.literal('foo')` | `v.literal('foo')` |

## Object schemas

| Zod | Valibot | Note |
|-----|---------|------|
| `z.object({})` | `v.object({})` | Both strip unknown keys by default |
| `z.object({}).strict()` | `v.strictObject({})` | Separate function, not a method |
| `z.object({}).passthrough()` | `v.looseObject({})` | Separate function, not a method |
| `z.object({}).catchall(schema)` | `v.objectWithRest({}, schema)` | |
| `schema.extend({ a: z.string() })` | `v.object({ ...schema.entries, a: v.string() })` | No `.extend()` method |
| `schemaA.merge(schemaB)` | `v.object({ ...schemaA.entries, ...schemaB.entries })` | No `.merge()` method |
| `schema.pick({ a: true })` | `v.pick(schema, ['a'])` | Array not object |
| `schema.omit({ b: true })` | `v.omit(schema, ['b'])` | Array not object |
| `schema.partial()` | `v.partial(schema)` | Cannot apply to piped schema |
| `schema.partial({ a: true })` | `v.partial(schema, ['a'])` | |
| `schema.required()` | `v.required(schema)` | |
| `schema.keyof()` | `v.keyof(schema)` | Returns picklist, not enum |

## Collection schemas

| Zod | Valibot |
|-----|---------|
| `z.array(s)` | `v.array(s)` |
| `z.tuple([a, b])` | `v.tuple([a, b])` |
| `z.tuple([a]).rest(s)` | `v.tupleWithRest([a], s)` |
| `z.record(v)` | `v.record(v.string(), v)` — key schema required |
| `z.record(k, v)` | `v.record(k, v)` |
| `z.map(k, v)` | `v.map(k, v)` |
| `z.set(v)` | `v.set(v)` |

## Union / intersection

| Zod | Valibot |
|-----|---------|
| `z.union([a, b])` | `v.union([a, b])` |
| `z.discriminatedUnion('type', [...])` | `v.variant('type', [...])` |
| `z.intersection(a, b)` | `v.intersect([a, b])` — array arg |
| `a.or(b)` | `v.union([a, b])` |
| `a.and(b)` | `v.intersect([a, b])` |

## Enum schemas

| Zod | Valibot | Note |
|-----|---------|------|
| `z.enum(['a', 'b'])` | `v.picklist(['a', 'b'])` | **Name swap** |
| `z.nativeEnum(MyEnum)` | `v.enum(MyEnum)` | **Name swap** |

## Optional / nullable / default

| Zod | Valibot |
|-----|---------|
| `z.optional(s)` | `v.optional(s)` |
| `s.optional()` | `v.optional(s)` |
| `z.nullable(s)` | `v.nullable(s)` |
| `s.nullable()` | `v.nullable(s)` |
| `s.nullish()` | `v.nullish(s)` |
| `s.default('x')` | `v.optional(s, 'x')` |
| `s.catch(val)` | `v.fallback(s, val)` |

## Misc schemas

| Zod | Valibot |
|-----|---------|
| `z.instanceof(Cls)` | `v.instance(Cls)` |
| `z.custom<T>(fn)` | `v.custom<T>(fn)` |
| `z.lazy(() => s)` | `v.lazy(() => s)` |
| `z.function()` | `v.function()` |
| `z.promise(s)` | `v.promise(s)` |

## String validations

| Zod | Valibot |
|-----|---------|
| `z.string().email()` | `v.pipe(v.string(), v.email())` |
| `z.string().url()` | `v.pipe(v.string(), v.url())` |
| `z.string().uuid()` | `v.pipe(v.string(), v.uuid())` |
| `z.string().cuid2()` | `v.pipe(v.string(), v.cuid2())` |
| `z.string().regex(r)` | `v.pipe(v.string(), v.regex(r))` |
| `z.string().min(n)` | `v.pipe(v.string(), v.minLength(n))` |
| `z.string().max(n)` | `v.pipe(v.string(), v.maxLength(n))` |
| `z.string().length(n)` | `v.pipe(v.string(), v.length(n))` |
| `z.string().nonempty()` | `v.pipe(v.string(), v.nonEmpty())` |
| `z.string().startsWith(s)` | `v.pipe(v.string(), v.startsWith(s))` |
| `z.string().endsWith(s)` | `v.pipe(v.string(), v.endsWith(s))` |
| `z.string().includes(s)` | `v.pipe(v.string(), v.includes(s))` |
| `z.string().trim()` | `v.pipe(v.string(), v.trim())` |
| `z.string().toLowerCase()` | `v.pipe(v.string(), v.toLowerCase())` |
| `z.string().toUpperCase()` | `v.pipe(v.string(), v.toUpperCase())` |
| `z.string().datetime()` | `v.pipe(v.string(), v.isoDateTime())` |
| `z.string().ip()` | `v.pipe(v.string(), v.ipv4())` or `v.ipv6()` |

## Number validations

| Zod | Valibot |
|-----|---------|
| `z.number().min(n)` / `.gte(n)` | `v.pipe(v.number(), v.minValue(n))` |
| `z.number().max(n)` / `.lte(n)` | `v.pipe(v.number(), v.maxValue(n))` |
| `z.number().gt(n)` | `v.pipe(v.number(), v.gtValue(n))` |
| `z.number().lt(n)` | `v.pipe(v.number(), v.ltValue(n))` |
| `z.number().int()` | `v.pipe(v.number(), v.integer())` |
| `z.number().finite()` | `v.pipe(v.number(), v.finite())` |
| `z.number().positive()` | `v.pipe(v.number(), v.minValue(0))` |
| `z.number().negative()` | `v.pipe(v.number(), v.maxValue(0))` |
| `z.number().multipleOf(n)` | `v.pipe(v.number(), v.multipleOf(n))` |
| `z.number().safe()` | `v.pipe(v.number(), v.safeInteger())` |

## Array validations

| Zod | Valibot |
|-----|---------|
| `z.array(s).min(n)` | `v.pipe(v.array(s), v.minLength(n))` |
| `z.array(s).max(n)` | `v.pipe(v.array(s), v.maxLength(n))` |
| `z.array(s).length(n)` | `v.pipe(v.array(s), v.length(n))` |
| `z.array(s).nonempty()` | `v.pipe(v.array(s), v.nonEmpty())` |

## Transforms and coerce

| Zod | Valibot |
|-----|---------|
| `s.transform(fn)` | `v.pipe(s, v.transform(fn))` |
| `z.coerce.string()` | `v.pipe(v.unknown(), v.transform(String))` |
| `z.coerce.number()` | `v.pipe(v.string(), v.decimal(), v.transform(Number))` |
| `z.coerce.boolean()` | `v.pipe(v.unknown(), v.transform(Boolean))` |
| `z.coerce.date()` | `v.pipe(v.string(), v.isoDate(), v.transform(s => new Date(s)))` |
| `z.preprocess(fn, s)` | `v.pipe(v.unknown(), v.transform(fn), s)` |

## Refinements

| Zod | Valibot |
|-----|---------|
| `s.refine(fn, msg)` | `v.pipe(s, v.check(fn, msg))` |
| `s.superRefine(fn)` | `v.pipe(s, v.rawCheck(fn))` |

`rawCheck` receives `{ dataset, addIssue }` instead of `(val, ctx)`:
```ts
// Zod superRefine
(val, ctx) => { ctx.addIssue({ code: z.ZodIssueCode.custom, message: '...' }); }

// Valibot rawCheck
({ dataset, addIssue }) => { addIssue({ message: '...' }); }
```

## Parse functions

| Zod | Valibot |
|-----|---------|
| `schema.parse(data)` | `v.parse(schema, data)` |
| `schema.safeParse(data)` | `v.safeParse(schema, data)` |
| `schema.parseAsync(data)` | `v.parseAsync(schema, data)` |
| `schema.safeParseAsync(data)` | `v.safeParseAsync(schema, data)` |
| `result.data` (success) | `result.output` |
| `result.error.issues` (failure) | `result.issues` |

## Error handling

| Zod | Valibot |
|-----|---------|
| `ZodError` | `ValiError` |
| `e instanceof ZodError` | `isValiError(e)` |
| `error.flatten()` | `v.flatten(issues)` |
| `flatten().formErrors` | `v.flatten(issues).root` |
| `flatten().fieldErrors` | `v.flatten(issues).nested` |
| `error.format()` | No equivalent — use `v.flatten()` |
| `z.setErrorMap(fn)` | `v.setGlobalMessage(fn)` |

## Type inference

| Zod | Valibot |
|-----|---------|
| `z.infer<typeof s>` | `v.InferOutput<typeof s>` |
| `z.input<typeof s>` | `v.InferInput<typeof s>` |
| `z.output<typeof s>` | `v.InferOutput<typeof s>` |
| `z.ZodType` (constraint) | `v.GenericSchema` |
| `z.ZodTypeAny` | `v.GenericSchema` |

## Metadata / branding

| Zod | Valibot |
|-----|---------|
| `s.describe('desc')` | `v.pipe(s, v.description('desc'))` |
| `s.brand<'MyType'>()` | `v.pipe(s, v.brand('MyType'))` |
| `s.readonly()` | `v.pipe(s, v.readonly())` |
