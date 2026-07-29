# Module 9 — Configuration

> **Lab:** `npm run lab src/09-configuration.ts`
> **Time:** ~30 minutes · **Prerequisites:** [Module 3](./03-services-and-layers.md)

---

## The problem with `process.env`

```typescript
const port = Number(process.env.PORT) || 3000
const dbUrl = process.env.DATABASE_URL!
```

Four defects in two lines:

1. `PORT=abc` silently becomes `3000` — `Number("abc")` is `NaN`, `NaN || 3000` is `3000`.
2. The `!` on `DATABASE_URL` is a lie that surfaces as `undefined` in a connection string, at 3am.
3. Nothing tells you what the app needs. New developers discover config by crashing.
4. `process.env` is global mutable state, so tests fight each other.

`Config` fixes all four.

---

## A `Config` is a value

Same shape as `Effect`: a description, evaluated later, composable.

```typescript
const port = Config.number("PORT").pipe(Config.withDefault(3000))
const dbPassword = Config.redacted("DB_PASSWORD")
```

```typescript
const ServerConfig = Config.all({
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port,
  logLevel: Config.literal("debug", "info", "warn", "error")("LOG_LEVEL").pipe(
    Config.withDefault("info" as const),
  ),
})
```

`Config.all` gives you one `Config` for the whole object, and — importantly — **it reports every missing or invalid key at once**, not one per restart:

```
(Missing data at DB.HOST: "Expected DB_HOST to exist in the process context")
and (Missing data at DB.PASSWORD: "Expected DB_PASSWORD to exist in the process context")
```

---

## The constructors

| Constructor | Reads |
|---|---|
| `Config.string(name)` | A string |
| `Config.number(name)` / `Config.integer(name)` | A number, **validated** |
| `Config.boolean(name)` | `true`/`false`/`yes`/`on`/`1`… |
| `Config.literal(...values)(name)` | One of a fixed set |
| `Config.redacted(name)` | A `Redacted<string>` — see below |
| `Config.array(config, name)` / `Config.hashSet` | Comma-separated lists |
| `Config.date(name)` | A `Date` |
| `Config.duration(name)` | A `Duration` |

| Modifier | Does |
|---|---|
| `Config.withDefault(value)` | Fall back if absent |
| `Config.option(config)` | `Option<A>` instead of failing |
| `Config.nested(prefix)` | Prefix every key inside |
| `Config.validate({ message, validation })` | Add a constraint |
| `Config.map` / `Config.mapAttempt` | Transform the parsed value |

### Validation belongs with the declaration

```typescript
poolSize: Config.integer("POOL_SIZE").pipe(
  Config.withDefault(10),
  Config.validate({
    message: "POOL_SIZE must be between 1 and 100",
    validation: (n) => n >= 1 && n <= 100,
  }),
)
```

The constraint travels with the config instead of living in a startup check somebody deletes during a refactor. `POOL_SIZE=5000` fails at boot with your message, not at 200 concurrent requests.

### `Config.nested` for grouping

```typescript
const DatabaseConfig = Config.all({
  host: Config.string("HOST"),
  port: Config.integer("PORT").pipe(Config.withDefault(5432)),
  password: Config.redacted("PASSWORD"),
}).pipe(Config.nested("DB"))
// reads DB_HOST, DB_PORT, DB_PASSWORD
```

---

## `Redacted` — secrets that don't leak

```typescript
const password = Config.redacted("DB_PASSWORD")
```

A `Redacted<string>` prints as `<redacted>` in **logs, stack traces, error messages, and `JSON.stringify`**. The lab shows both sides:

```
password (logged):    <redacted>
password (unwrapped): hunter2
```

You extract the real value with `Redacted.value(secret)` — a deliberate, greppable act. The default is safe; leaking requires you to ask.

> Use `Redacted` for every credential, token, and connection string. The most common way secrets end up in a log aggregator is an object being stringified by an error handler that never intended to.

---

## Configuration as a service

Read once at startup, expose as a service. Nothing downstream touches the environment:

```typescript
class Settings extends Effect.Service<Settings>()("app/Settings", {
  effect: AppConfig,
}) {}
```

Now `Settings` is an ordinary dependency: it appears in `R`, it's provided by a layer, and it's swappable in tests. The rest of your code has no idea environment variables exist.

---

## Testing: swap the provider

The `ConfigProvider` is a [default service](./03-services-and-layers.md#default-services-what-you-already-have), so you replace it rather than mutating global state:

```typescript
const TestEnv = ConfigProvider.fromMap(
  new Map([
    ["HOST", "localhost"],
    ["PORT", "8080"],
    ["DB_HOST", "db.internal"],
    ["DB_PASSWORD", "hunter2"],
  ]),
  { pathDelim: "_" },   // so Config.nested("DB") resolves to DB_HOST
)

program.pipe(Effect.provide(Layer.setConfigProvider(TestEnv)))
```

No `process.env.X = …` in a `beforeEach`, no cleanup to forget, no cross-test interference — tests run in parallel safely.

> **`pathDelim`** trips people up. `ConfigProvider.fromMap` defaults to `.` (so nested keys are `DB.HOST`). Environment variables use `_`. Pass `{ pathDelim: "_" }` and your test map matches production naming.

Other providers: `ConfigProvider.fromEnv()`, `ConfigProvider.fromJson(obj)`, and `ConfigProvider.orElse` to chain them (file, then env, then defaults).

---

## Pitfalls

### 1. Reading config deep in the call graph

```typescript
// ❌ a network handler that fails at request #4000 because a key is missing
const handler = Effect.gen(function* () {
  const timeout = yield* Config.number("TIMEOUT")
})
```

Load everything at startup. A missing key should stop the deploy, not one request.

### 2. `Config.string` for secrets

Use `Config.redacted`. Always.

### 3. Defaults that hide misconfiguration

`Config.withDefault` on `DATABASE_URL` means a typo silently connects you to localhost. Defaults are for genuinely optional tuning; required things should fail loudly.

### 4. Mutating `process.env` in tests

Works until tests run in parallel. Use `ConfigProvider.fromMap`.

---

## Practice

Work in [`exercises/09-configuration.ts`](../exercises/09-configuration.ts).

1. Build an `AppConfig` with a port (default 3000), a required API key as `Redacted`, and a log level literal.
2. Run it against an empty provider and read the error.
3. Provide a `ConfigProvider.fromMap` and confirm it loads.
4. Add a `validate` that rejects ports below 1024; trigger it.
5. Log the whole config object and confirm the API key shows as `<redacted>`.
6. Wrap it in an `Effect.Service` and use it from a function that never mentions env vars.

---

## Self-check

- [ ] Why is `Number(process.env.PORT) || 3000` a bug rather than a shortcut?
- [ ] What does `Config.all` do that reading keys one at a time doesn't?
- [ ] What exactly does `Redacted` protect you from, and how do you get the value out?
- [ ] Why swap the `ConfigProvider` instead of setting `process.env` in tests?
- [ ] When is `Config.withDefault` the wrong choice?

---

**← Previous:** [Schema](./08-schema.md) | **Next →** [Observability](./10-observability.md)
