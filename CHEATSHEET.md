# Effect Cheat Sheet

Quick reference for `effect@3.22.x`. Every entry links back to the module that explains it.

---

## The type

```
Effect<A, E, R>
       │  │  └── R — services required (default: never)
       │  └───── E — recoverable failures, as a union (default: never)
       └──────── A — success value
```

`never` in `E` proves it cannot fail. `never` in `R` proves it needs nothing. **Your job is to shrink both to `never`.**

---

## Creating · [M1](./modules/01-core-concepts.md)

| Want | Use |
|---|---|
| A value you have | `Effect.succeed(v)` |
| A failure | `Effect.fail(e)` |
| Sync, can't throw | `Effect.sync(() => …)` |
| Sync, can throw | `Effect.try({ try, catch })` |
| Promise, can't reject | `Effect.promise(() => p)` |
| Promise, can reject | `Effect.tryPromise({ try, catch })` |
| Callback API | `Effect.async((resume) => …)` |
| Nothing | `Effect.void` |
| A defect | `Effect.die(e)` |
| Never completes | `Effect.never` |

---

## Composing · [M1](./modules/01-core-concepts.md)

```typescript
Effect.gen(function* () {          // default for dependent steps
  const a = yield* first
  return yield* second(a)
})

effect.pipe(                       // default for operator chains
  Effect.map(f),
  Effect.tap(observe),             // side effect, value unchanged
  Effect.flatMap(g),
  Effect.as(constant),             // replace the value
  Effect.andThen(next),            // sequence, discard previous
)
```

| async/await | Effect.gen |
|---|---|
| `await p` | `yield* effect` |
| `throw e` | `yield* Effect.fail(e)` or `yield* new MyError({})` |
| `try/catch` | `Effect.catchTag` |
| `finally` | `Effect.ensuring` |

---

## Running · [M1](./modules/01-core-concepts.md)

| Runner | Returns |
|---|---|
| `Effect.runSync(e)` | `A` — throws; sync only |
| `Effect.runPromise(e)` | `Promise<A>` — the normal entry point |
| `Effect.runSyncExit(e)` | `Exit<A, E>` |
| `Effect.runPromiseExit(e)` | `Promise<Exit<A, E>>` |
| `Effect.runFork(e)` | `RuntimeFiber<A, E>` |
| `NodeRuntime.runMain(e)` | Adds signal handling + graceful shutdown |

---

## Errors · [M2](./modules/02-error-handling.md)

```typescript
class NotFound extends Data.TaggedError("NotFound")<{ id: string }> {}
class Rate extends Schema.TaggedError<Rate>()("Rate", { after: Schema.Number }) {}
```

| Operator | Effect on `E` |
|---|---|
| `catchTag(tag, f)` | Removes one member |
| `catchTags({…})` | Removes several |
| `catchAll(f)` | `E → never` |
| `catchIf(pred, f)` | Narrows by predicate |
| `orElse(() => other)` | Falls back |
| `orElseSucceed(() => v)` | `E → never` |
| `orDie` | `E → never`, becomes a defect |
| `mapError(f)` | Replaces `E` |
| `tapError(f)` / `tapErrorTag(tag, f)` | Unchanged — logs only |
| `retry(policy)` | Unchanged |

**Failures as values**

```typescript
Effect.either(e)   // Effect<Either<A, E>, never>
Effect.option(e)   // Effect<Option<A>, never>
Effect.exit(e)     // Effect<Exit<A, E>, never>
```

**Cause**

```typescript
Cause.isDie(c) · isFailure(c) · isInterrupted(c) · failures(c) · defects(c) · pretty(c)
```

**Accumulating**

```typescript
Effect.all(xs, { mode: "either" })   // every outcome
Effect.validateAll(xs, f)            // all errors
Effect.partition(xs, f)              // [failures, successes]
```

---

## Services & Layers · [M3](./modules/03-services-and-layers.md)

```typescript
// Default choice
class Cache extends Effect.Service<Cache>()("app/Cache", {
  effect: Effect.gen(function* () { … }),
  dependencies: [Other.Default],
  accessors: true,
}) {}
// → Cache, Cache.Default, Cache.DefaultWithoutDependencies

// When many implementations exist
class Users extends Context.Tag("app/Users")<Users, { byId: … }>() {}
```

| Layer | Meaning |
|---|---|
| `Layer.succeed(Tag, impl)` | A ready value |
| `Layer.effect(Tag, eff)` | Effectful construction |
| `Layer.scoped(Tag, eff)` | Owns a resource |
| `Layer.merge(a, b)` / `mergeAll(…)` | Side by side |
| `Layer.provide(inner, outer)` | `outer` consumed and hidden |
| `Layer.provideMerge(inner, outer)` | `outer` consumed and kept |

```typescript
program.pipe(Effect.provide(AppLayer))
const runtime = ManagedRuntime.make(AppLayer)   // long-lived apps
await runtime.dispose()
```

> Layers are memoized **by reference**. Define once, export, reuse.

---

## Resources · [M4](./modules/04-resource-management.md)

```typescript
Effect.acquireRelease(acquire, release)      // needs Scope
Effect.acquireUseRelease(acq, use, rel)      // no Scope in the type
Effect.scoped(effect)                        // supply + close a Scope
Effect.addFinalizer((exit) => …)
Effect.ensuring(f) · onExit(f) · onError(f) · onInterrupt(f)
```

Release order is **LIFO**. Cleanup runs on success, failure, defect, and interruption.

---

## Concurrency · [M5](./modules/05-concurrency.md)

```typescript
Effect.all(effects, { concurrency: 10 })
Effect.forEach(items, f, { concurrency: 10, discard: true })
Effect.race(a, b) · raceAll(effects)
```

| `concurrency` | Meaning |
|---|---|
| *(omitted)* | Sequential |
| `"unbounded"` | All at once |
| `n` | **What you want in production** |
| `"inherit"` | Ambient limit |

```typescript
Effect.fork(e)        // tied to the parent fiber
Effect.forkScoped(e)  // tied to the Scope
Effect.forkDaemon(e)  // tied to the global scope
Fiber.join(f) · Fiber.await(f) · Fiber.interrupt(f)
Effect.uninterruptible(e) · uninterruptibleMask((restore) => …)
```

**Timeouts**

```typescript
Effect.timeout(e, "5 seconds")       // E | TimeoutException  ← not Option!
Effect.timeoutOption(e, "5 seconds") // Option<A>
Effect.timeoutFail(e, { duration, onTimeout })
```

---

## Scheduling · [M6](./modules/06-scheduling.md)

```typescript
Effect.retry(e, { times: 3, schedule, while: pred, until: pred })
Effect.repeat(e, schedule)     // runs once, THEN per schedule step
Effect.retryOrElse(e, schedule, fallback)
```

| Schedule | |
|---|---|
| `recurs(n)` · `forever` · `once` | Counting |
| `spaced(d)` | Gap **between** runs |
| `fixed(d)` | Gap **start to start** |
| `exponential(base, factor?)` · `fibonacci(base)` | Growth |
| `cron("0 9 * * 1-5")` | Cron |

| Combinator | |
|---|---|
| `intersect(a, b)` | AND — max delay |
| `either(a, b)` | OR — **min delay → caps growth** |
| `compose(a, b)` | Feed output → input; adds a limit |
| `jittered` | **Not optional in production** |
| `upTo(d)` · `whileInput(p)` · `tapOutput(f)` | |
| `delays(s)` | Outputs the delays — for testing |

**The production policy**

```typescript
Schedule.exponential("50 millis", 2).pipe(
  Schedule.jittered,
  Schedule.either(Schedule.spaced("400 millis")),
  Schedule.compose(Schedule.recurs(4)),
)
```

---

## Streams · [M7](./modules/07-streams.md)

```typescript
Stream.make(…) · fromIterable(a) · range(1, 10) · fromEffect(e)
Stream.iterate(0, f) · repeatEffect(e) · async((emit) => …)
Stream.paginateChunkEffect(seed, f)          // paginated APIs
```

```typescript
Stream.map · filter · take · drop · takeWhile · scan · flatMap
Stream.mapEffect(f, { concurrency: 10 })
Stream.grouped(n) · groupedWithin(n, duration)
Stream.merge · concat · zip · throttle · debounce · rechunk
```

| Run | |
|---|---|
| `runDrain` | **Default** — constant memory |
| `runCollect` | `Chunk<A>` — bounded streams only |
| `runFold(z, f)` · `runCount` · `runHead` · `runLast` | |

---

## Schema · [M8](./modules/08-schema.md)

```typescript
const User = Schema.Struct({
  id: Schema.String.pipe(Schema.brand("UserId")),
  age: Schema.Number.pipe(Schema.int(), Schema.between(0, 150)),
  createdAt: Schema.Date,                       // Date ⇄ ISO string
  tags: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
})

Schema.decodeUnknown(User)(input)                    // unknown → User
Schema.decodeUnknown(User)(input, { errors: "all" }) // report everything
Schema.encode(User)(user)                            // User → wire
ParseResult.ArrayFormatter.formatError(e)            // [{ path, message }]
```

**Derive** — `JSONSchema.make(S)` · `Arbitrary.make(S)` · `Pretty.make(S)` · `Schema.standardSchemaV1(S)`

---

## Config · [M9](./modules/09-configuration.md)

```typescript
Config.string · number · integer · boolean · date · duration
Config.literal("a", "b")("KEY") · Config.redacted("SECRET")
Config.withDefault(v) · option · nested("DB") · validate({ message, validation })
Config.all({ … })

Layer.setConfigProvider(ConfigProvider.fromMap(map, { pathDelim: "_" }))
Redacted.value(secret)
```

---

## Observability · [M10](./modules/10-observability.md)

```typescript
Effect.logInfo/logWarning/logError/logDebug/logTrace/logFatal
Effect.annotateLogs({ requestId })       // every nested log carries it
Effect.withLogSpan("checkout")
Logger.withMinimumLogLevel(LogLevel.Debug) · Logger.json · Logger.pretty

const load = Effect.fn("loadUser")(function* (id: string) { … })   // auto span
Effect.withSpan("name", { attributes }) · Effect.annotateCurrentSpan(k, v)

Metric.counter(n) · gauge(n) · timerWithBoundaries(n, bounds) · frequency(n)
Metric.increment(m) · Metric.trackDuration(timerMetric)
```

---

## State · [M11](./modules/11-state-and-coordination.md)

```typescript
Ref.make(v) · get · set · update(f) · updateAndGet · getAndUpdate
Ref.modify((s) => [result, newState])       // atomic read+write
SynchronizedRef.updateAndGetEffect(ref, f)  // effectful updates

Queue.bounded(n) / dropping / sliding / unbounded · offer · take · shutdown
PubSub.bounded(n) · publish · subscribe     // scoped
Effect.makeSemaphore(n).withPermits(1)(e)
Deferred.make() · await · succeed · fail
```

---

## Testing · [M12](./modules/12-testing.md)

```typescript
import { assert, describe, it } from "@effect/vitest"

it.effect("…", () => Effect.gen(function* () { … }).pipe(Effect.provide(Test)))
it.scoped · it.live · it.effect.each([…]) · it.layer(L)(…)

yield* TestClock.adjust("1 hour")           // instant
Effect.provide(Layer.succeed(Tag, new Svc({ … })))   // typed stub
FastCheck.assert(FastCheck.property(Arbitrary.make(S), (x) => …))
```

---

## Pitfall quick-scan

| Symptom | Cause |
|---|---|
| A step silently doesn't run | Missing `yield*` |
| `AsyncFiberException` | `runSync` on async work |
| Types lose `E` / `R` | `strict: true` not set |
| Test hangs | Forgot `TestClock.adjust` |
| Two connection pools | Same layer defined twice |
| Retry does nothing | It's a defect, not a failure |
| `Effect<A, E, Scope>` won't run | Missing `Effect.scoped` or `Layer.scoped` |
| Logs immediately at import | `Effect.succeed(sideEffect())` |
| Slow, then production melts | `concurrency: "unbounded"` |
| Retry storms after an outage | Backoff without `jittered` |
