# Module 6 — Scheduling, Retry & Repeat

> **Lab:** `npm run lab src/06-scheduling.ts`
> **Time:** ~50 minutes · **Prerequisites:** [Modules 1–5](./01-core-concepts.md)

---

## A `Schedule` is a value

Most languages bury retry logic inside the retry function: `retry(fn, { attempts: 3, delay: 100 })`. Effect makes the *policy* a first-class value you can name, compose, share, and unit-test.

```
Schedule<Out, In, R>
         │    │   └── services it needs
         │    └────── what it inspects each step (the error, for retry)
         └─────────── what it produces each step (attempt count, delay…)
```

```typescript
// A policy your whole team can import
export const standardBackoff = Schedule.exponential("50 millis", 2).pipe(
  Schedule.jittered,
  Schedule.either(Schedule.spaced("400 millis")),
  Schedule.compose(Schedule.recurs(4)),
)
```

That value is now testable in isolation, reusable across services, and reviewable in a pull request — none of which is true of an options bag inlined at a call site.

---

## `retry` vs `repeat`

The single most common confusion, and it's simple:

| | `Effect.retry` | `Effect.repeat` |
|---|---|---|
| Re-runs on | **Failure** | **Success** |
| Stops when | It succeeds, or the schedule ends | It fails, or the schedule ends |
| Schedule's `In` | The error `E` | The success value `A` |
| For | Flaky operations | Polling, heartbeats, cron jobs |

```typescript
Effect.retry(apiCall, backoff)              // keep trying until it works
Effect.repeat(healthCheck, Schedule.spaced("30 seconds"))  // keep doing it
```

> `repeat` runs the effect **once first**, then once more per schedule step. `Effect.repeat(e, Schedule.recurs(3))` runs `e` **four** times. The lab prints exactly this.

---

## Built-in schedules

| Schedule | Behaviour |
|---|---|
| `Schedule.once` | Exactly one recurrence |
| `Schedule.recurs(n)` | At most `n` recurrences |
| `Schedule.forever` | Unbounded |
| `Schedule.spaced(d)` | Fixed gap **between** runs |
| `Schedule.fixed(d)` | Fixed gap **from start to start** (catches up after slow runs) |
| `Schedule.exponential(base, factor?)` | `base`, `base×f`, `base×f²`, … |
| `Schedule.fibonacci(base)` | Fibonacci delays |
| `Schedule.cron("0 9 * * 1")` | Cron expression |
| `Schedule.stop` | Never recurs |

> **`spaced` vs `fixed` matters for polling.** `spaced("1 second")` waits one second *after each run finishes*. `fixed("1 second")` fires on the second, regardless of how long the run took — and if a run overruns, the next fires immediately to catch up.

---

## Combinators

| Combinator | Meaning |
|---|---|
| `Schedule.intersect(a, b)` | **AND** — continue while both do; delay = **max** |
| `Schedule.either(a, b)` / `union` | **OR** — continue while either does; delay = **min** |
| `Schedule.andThen(a, b)` | Run `a` to exhaustion, then `b` |
| `Schedule.compose(a, b)` | Feed `a`'s output into `b` — the usual way to add a limit |
| `Schedule.jittered` | Randomise each delay |
| `Schedule.upTo(d)` | Stop after `d` total elapsed |
| `Schedule.whileInput(pred)` | Continue only while the error matches |
| `Schedule.whileOutput(pred)` | Continue only while the output matches |
| `Schedule.tapOutput(f)` | Side effect each step (log the attempt) |
| `Schedule.modifyDelay(f)` | Transform each computed delay |
| `Schedule.delays(s)` | Turn a schedule into one that *outputs* its delays |

### The two you'll actually reach for

**`either` caps growth.** Because it takes the *minimum* delay, intersecting an unbounded exponential with a fixed `spaced` clamps it:

```typescript
Schedule.exponential("100 millis").pipe(Schedule.either(Schedule.spaced("400 millis")))
// 100ms, 200ms, 400ms, 400ms, 400ms, …
```

**`compose` adds a limit.** `recurs` counts recurrences regardless of input, so composing with it bounds any schedule:

```typescript
anySchedule.pipe(Schedule.compose(Schedule.recurs(4)))
```

---

## The production retry policy

Here's the recipe, and why each line is there:

```typescript
const backoff = Schedule.exponential("50 millis", 2).pipe(
  Schedule.jittered,                              // 1
  Schedule.either(Schedule.spaced("400 millis")), // 2
  Schedule.compose(Schedule.recurs(4)),           // 3
)
```

1. **Jitter is not optional.** Plain exponential backoff synchronises every client that failed at the same moment into retry *waves*. Your service recovers, gets hit by 10,000 simultaneous retries, and falls over again. Randomising each delay spreads the load. If you take one thing from this module, take this.
2. **Cap the delay**, or your 9th retry is 12.8 seconds away and the user has left.
3. **Give up eventually.** Unbounded retry against a permanently-broken dependency turns one outage into a resource exhaustion incident.

### Only retry what's retryable

Retrying a `400 Bad Request` will fail identically four more times, wasting latency budget and, on metered APIs, money.

```typescript
Effect.retry(call, {
  while: (e) => e._tag === "ServiceUnavailable",   // 503 yes, 400 no
  schedule: backoff,
})
```

The options form is usually the most readable entry point:

```typescript
Effect.retry(effect, {
  times: 3,                       // max attempts
  schedule: backoff,              // timing policy
  while: (e) => isTransient(e),   // retry while true
  until: (e) => isFatal(e),       // or stop when true
})
```

### Giving up gracefully

```typescript
// Handle the final failure after retries are exhausted
Effect.retry(call, backoff).pipe(
  Effect.catchTag("ServiceUnavailable", () => Effect.succeed(cachedValue)),
)

// Or in one operator
Effect.retryOrElse(call, backoff, (error) => Effect.succeed(cachedValue))
```

---

## Testing a schedule without waiting

Two techniques, both instant:

**`Schedule.delays` + `Schedule.run`** inspects the policy directly:

```typescript
yield* Schedule.run(Schedule.delays(policy), 0, [0, 0, 0, 0, 0])
// Duration(100ms), Duration(200ms), Duration(400ms), Duration(400ms), Duration(400ms)
```

That's a real assertion you can put in a unit test: *"our backoff never exceeds 400ms and gives up after 5 tries."*

**`TestClock`** runs the actual effect with virtual time — a 30-second poll loop completes in microseconds. See [Module 12](./12-testing.md).

---

## Timeouts and schedules together

Retry and timeout compose, but **order matters**:

```typescript
// Per-attempt timeout: each try gets 2s, then we retry
Effect.retry(Effect.timeout(call, "2 seconds"), backoff)

// Overall budget: the whole retry loop gets 10s
Effect.timeout(Effect.retry(call, backoff), "10 seconds")
```

Usually you want **both**: a per-attempt timeout so one hung request doesn't consume the budget, and an overall deadline so the caller gets an answer.

---

## Repeating: polling and background jobs

```typescript
// Poll every 30 seconds, forever
Effect.repeat(healthCheck, Schedule.spaced("30 seconds"))

// Every weekday at 09:00
Effect.repeat(sendDigest, Schedule.cron("0 9 * * 1-5"))

// Poll until a condition holds
Effect.repeat(checkStatus, {
  schedule: Schedule.spaced("1 second"),
  until: (status) => status === "ready",
})
```

Pair a long-running repeat with `Effect.forkScoped` so it's cancelled at shutdown ([Module 5](./05-concurrency.md)).

---

## Pitfalls

### 1. Exponential backoff without jitter

Covered above; it's the most consequential mistake in this module.

### 2. Retrying non-idempotent operations

```typescript
Effect.retry(chargeCreditCard(amount), backoff)   // ❌ may charge 4 times
```

A timeout doesn't tell you whether the operation completed. Retry only idempotent operations, or make them idempotent with a key the server deduplicates on.

### 3. Off-by-one on `repeat`

`Effect.repeat(e, Schedule.recurs(3))` runs `e` **four** times. If you want exactly three, use `Schedule.recurs(2)`.

### 4. `retry` on an effect that can't fail

`Effect<A, never>` with a retry policy compiles and does nothing. If your retry seems inert, check whether the failure is actually a *defect* — `retry` only sees the `E` channel. Use `Effect.retry` after converting, or handle the defect.

### 5. Unbounded `Schedule.forever` retry

One permanently-broken dependency, and you have a fiber spinning forever holding a connection. Always compose a bound.

---

## Practice

Work in [`exercises/06-scheduling.ts`](../exercises/06-scheduling.ts).

1. Build a policy: at most 3 retries, 1 second apart. Verify with `Schedule.run`.
2. Build exponential backoff from 100ms, capped at 5s, giving up after 6 tries. Print the delays.
3. Add jitter and observe the delays change between runs.
4. Retry only `ServiceUnavailable`, not `BadRequest`. Prove the second doesn't retry.
5. Poll a counter every 100ms until it reaches 5, using `repeat` with `until`.
6. Combine a 500ms per-attempt timeout with a 3-attempt retry and a 2s overall deadline.

---

## Self-check

- [ ] Which of `retry`/`repeat` reacts to success?
- [ ] Why is jitter essential rather than a nice-to-have?
- [ ] Which combinator caps a delay, and why does taking the *minimum* achieve that?
- [ ] How many times does `Effect.repeat(e, Schedule.recurs(3))` run `e`?
- [ ] How do you assert on a retry policy's delays without waiting in real time?
- [ ] What's the difference between wrapping timeout inside retry and outside it?

---

**← Previous:** [Concurrency & Fibers](./05-concurrency.md) | **Next →** [Streams](./07-streams.md)
