# Module 12 — Testing Effect Code

> **Lab:** `npm test` (source: [`test/12-testing.test.ts`](../test/12-testing.test.ts))
> **Time:** ~50 minutes · **Prerequisites:** [Modules 3, 5, 6](./03-services-and-layers.md)

The whole suite in this module runs in about 150ms — including a test that waits an hour and one that verifies four exponential-backoff delays.

---

## What's normally hard

| Problem | The usual workaround | Why it's bad |
|---|---|---|
| Code depends on a database | `jest.mock("./db")` | Patches module resolution; nothing type-checks the mock |
| Code sleeps or retries | `jest.useFakeTimers()` | Global, leaky, breaks anything else using timers |
| Assert an error was thrown | `expect(fn).rejects.toThrow()` | Matches on a string; no type safety |
| Config comes from env | `process.env.X = "…"` | Global mutable state; tests can't run in parallel |
| Test a resource is cleaned up | Hope | — |

Effect removes each one, not with a testing library but because dependencies, time, and randomness were **already** services you can substitute.

---

## Setup

```bash
npm i -D @effect/vitest vitest
```

```typescript
import { assert, describe, it } from "@effect/vitest"
```

---

## `it.effect` — the test body *is* an Effect

```typescript
it.effect("resolves a known user", () =>
  Effect.gen(function* () {
    const message = yield* greet("u_1")
    assert.strictEqual(message, "Hello, Ada")
  }).pipe(Effect.provide(Users.Default)),
)
```

No `async`, no `await`, no manual `runPromise`. And because it's an Effect, everything you know applies inside a test — `Effect.either`, layers, spans, `TestClock`.

| Variant | For |
|---|---|
| `it.effect` | The default. Runs with the **TestContext** (virtual clock, deterministic random) |
| `it.live` | Real clock and real services |
| `it.scoped` | The test body gets a `Scope`; finalizers run at the end |
| `it.effect.each([...])` | Table-driven tests |
| `it.flakyTest` | Retry a genuinely non-deterministic test |

---

## Assert on failures as values

```typescript
it.effect("fails with a typed error", () =>
  Effect.gen(function* () {
    const result = yield* Effect.either(greet("nope"))
    assert.isTrue(result._tag === "Left")
    if (result._tag === "Left") {
      assert.strictEqual(result.left._tag, "UserNotFound")
      assert.strictEqual(result.left.id, "nope")   // ← typed field access
    }
  }).pipe(Effect.provide(Users.Default)),
)
```

Compare `expect(fn).rejects.toThrow(/not found/)`, which passes just as happily when the message changes for an unrelated reason. Here you're asserting on a **typed value**, and `result.left.id` is checked by the compiler.

Use `Effect.exit` when you need to distinguish a failure from a defect or an interruption:

```typescript
const exit = yield* Effect.exit(program)
assert.isTrue(Exit.isFailure(exit))
// Cause.isDie(exit.cause), Cause.isInterrupted(exit.cause), …
```

---

## Substituting dependencies

No module mocking. Provide a different layer:

```typescript
Effect.provide(
  Layer.succeed(Users, new Users({
    byId: (id) => Effect.succeed({ id, name: "Stub" }),
  })),
)
```

**The stub is type-checked against the real interface.** Add a method to `Users` and this line stops compiling — which is exactly the signal you want, and precisely what `jest.mock` cannot give you.

### Spies are just a `Ref`

```typescript
const calls = yield* Ref.make<Array<string>>([])

const Spy = Layer.succeed(Users, new Users({
  byId: (id) => Ref.update(calls, (c) => [...c, id]).pipe(
    Effect.as({ id, name: "Spy" }),
  ),
}))

yield* greet("u_1").pipe(Effect.provide(Spy))
assert.deepStrictEqual(yield* Ref.get(calls), ["u_1"])
```

No framework needed. It's a real implementation that happens to record.

---

## `TestClock` — time becomes an input

This is the feature that changes how you write tests.

```typescript
it.effect("a long sleep costs no real time", () =>
  Effect.gen(function* () {
    const done = yield* Ref.make(false)
    const fiber = yield* Effect.fork(
      Effect.sleep("1 hour").pipe(Effect.andThen(Ref.set(done, true))),
    )

    assert.isFalse(yield* Ref.get(done))   // virtual time hasn't moved

    yield* TestClock.adjust("1 hour")      // ← instant
    yield* Fiber.join(fiber)

    assert.isTrue(yield* Ref.get(done))
  }),
)
```

`Clock` is a [default service](./03-services-and-layers.md#default-services-what-you-already-have), and `it.effect` provides the test version. **Nothing in your application code changes.** `Effect.sleep`, `Effect.timeout`, `Effect.retry`, `Schedule.spaced`, `Stream.throttle` — everything that touches time obeys the virtual clock.

### The payoff: asserting on real timing

You can now test that your backoff policy is actually exponential:

```typescript
const fiber = yield* Effect.fork(
  Effect.retry(flaky, Schedule.intersect(
    Schedule.exponential("1 second"),
    Schedule.recurs(3),
  )),
)

yield* TestClock.adjust("0 millis")
assert.strictEqual(yield* Ref.get(attempts), 1)   // immediate
yield* TestClock.adjust("1 second")
assert.strictEqual(yield* Ref.get(attempts), 2)   // +1s
yield* TestClock.adjust("2 seconds")
assert.strictEqual(yield* Ref.get(attempts), 3)   // +2s
yield* TestClock.adjust("4 seconds")
assert.strictEqual(yield* Ref.get(attempts), 4)   // +4s

assert.isTrue(Exit.isFailure(yield* Fiber.await(fiber)))  // then gives up
```

That's a precise assertion about production resilience behaviour, running in single-digit milliseconds. Writing the equivalent with `jest.useFakeTimers` is possible and miserable; most teams simply don't test this, and find out during an incident.

> **`TestClock.adjust` runs everything scheduled up to that point.** If a test hangs, you probably forgot to advance the clock — the fiber is genuinely waiting.

---

## `it.scoped` — resource lifecycles

```typescript
it.scoped("closes resources when the test ends", () =>
  Effect.gen(function* () {
    const released = yield* Ref.make(false)
    yield* Effect.acquireRelease(Effect.succeed("handle"), () => Ref.set(released, true))
    assert.isFalse(yield* Ref.get(released))
    // the finalizer runs after the body, when the scope closes
  }),
)
```

Real resources in tests, cleaned up deterministically, even when the test fails.

---

## Property-based testing, for free

Any `Schema` doubles as a generator ([Module 8](./08-schema.md)):

```typescript
const arbProduct = Arbitrary.make(Product)

it("decode(encode(x)) === x for every generated product", () => {
  FastCheck.assert(
    FastCheck.property(arbProduct, (product) => {
      const encoded = Schema.encodeSync(Product)(product)
      assert.deepStrictEqual(Schema.decodeUnknownSync(Product)(encoded), product)
    }),
  )
})
```

`FastCheck` ships inside `effect` — no extra dependency. Round-trip properties like this catch encoding bugs that example-based tests miss, because the generator explores boundaries you wouldn't think to write down.

---

## The testing pyramid, Effect edition

| Level | How |
|---|---|
| **Unit** | `it.effect` + stub layers. Fast, exhaustive, most of your suite |
| **Property** | `Arbitrary.make(schema)` + `FastCheck`. Invariants and round-trips |
| **Integration** | Real layers for some services, stubs for the rest — just a different `Layer.mergeAll` |
| **Contract** | `Schema` on both sides of a boundary; encode/decode is the contract |

The seam between unit and integration is *which layer you provide*, so moving a test up or down the pyramid is a one-line change rather than a rewrite.

---

## Pitfalls

### 1. `it` instead of `it.effect`

Plain `it` doesn't provide the `TestContext`, so `TestClock` isn't there and real sleeps really sleep.

### 2. Forgetting to advance the clock

The test hangs. It isn't broken — the fiber is genuinely waiting for time that never comes. `TestClock.adjust`.

### 3. `it.live` by default

Real time makes tests slow and flaky. Reach for `it.live` only when you're testing the real clock itself.

### 4. Providing layers per test when they're expensive

`it.layer(MyLayer)(…)` builds a layer once for a whole `describe` block, which matters for anything with real setup cost.

### 5. Asserting on error *messages*

```typescript
assert.match(String(error), /not found/)      // ❌ brittle
assert.strictEqual(error._tag, "UserNotFound") // ✅ typed
```

---

## Practice

Extend [`test/12-testing.test.ts`](../test/12-testing.test.ts) — it is both the lab and the exercise file. Run `npm run test:watch` while you work.

1. Write an `it.effect` test for a service, providing its `Default` layer.
2. Assert a typed failure with `Effect.either` and check a field on the error.
3. Swap in a stub layer; then add a method to the service and watch the stub fail to compile.
4. Test a 24-hour scheduled job with `TestClock.adjust`.
5. Assert the exact delays of a jittered backoff using `Schedule.delays` + `Schedule.run`.
6. Write a round-trip property test for one of your schemas.
7. Use `it.scoped` to prove a finalizer runs when the test body fails.

---

## Self-check

- [ ] Why doesn't Effect need `jest.mock`?
- [ ] What makes a stub layer safer than a hand-written mock object?
- [ ] How can a test that "sleeps an hour" finish in a millisecond?
- [ ] Your test hangs after adding a `sleep`. What did you forget?
- [ ] Where do property-test generators come from without writing them?
- [ ] What's the difference between `it.effect`, `it.live`, and `it.scoped`?

---

**← Previous:** [State & Coordination](./11-state-and-coordination.md) | **Next →** [Building a Real Application](./13-building-an-app.md)
