/**
 * Exercise 10 — Observability
 *
 *   npm run lab exercises/10-observability.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/10-observability.ts
 */

import { Console, Data, Effect, Logger, LogLevel, Metric } from "effect"

class Failed extends Data.TaggedError("Failed")<{ readonly id: string }> {}

// ── 1. Log at all six levels. Which are hidden by default? ──────────────
const allLevels = Effect.gen(function* () {
  yield* Effect.logTrace("trace")
  yield* Effect.logDebug("debug")
  yield* Effect.logInfo("info")
  // TODO: warning, error, fatal
})

// ── 2. Annotate with a requestId; verify nested logs carry it. ──────────
const inner = Effect.logInfo("deep inside")
const annotated = Effect.gen(function* () {
  yield* Effect.logInfo("outer")
  yield* inner
})
// TODO: .pipe(Effect.annotateLogs({ requestId: "req_1" }))

// ── 3. Convert these to Effect.fn and check the span nesting. ──────────
const loadUser = (id: string) =>
  Effect.gen(function* () {
    yield* Effect.sleep("10 millis")
    return { id }
  })

const handle = (id: string) =>
  Effect.gen(function* () {
    const user = yield* loadUser(id)
    return user.id
  })

// ── 4. Add a counter and a timer; print their values. ─────────────────
const requests = Metric.counter("requests")
// TODO: const latency = Metric.timerWithBoundaries("latency_ms", [1, 10, 100])

// ── 6. Log a failure without recovering, and prove it propagates. ─────
const failing = Effect.fail(new Failed({ id: "x" })).pipe(
  // TODO: Effect.tapErrorTag("Failed", (e) => Effect.logError(`failed ${e.id}`))
)

const main = Effect.gen(function* () {
  yield* Console.log("1. default level:"); yield* allLevels
  yield* Console.log("1. debug level:");   yield* allLevels.pipe(Logger.withMinimumLogLevel(LogLevel.Debug))
  yield* Console.log("2. annotated:");     yield* annotated
  yield* Console.log(`3. handled: ${yield* handle("u_1")}`)
  yield* Metric.increment(requests)
  yield* Console.log(`4. requests: ${(yield* Metric.value(requests)).count}`)
  // ── 5. Switch to Logger.json and diff the output. ──────────────────
  yield* Effect.logInfo("json?").pipe(Effect.provide(Logger.json))
  yield* Console.log(`6. propagated: ${(yield* Effect.either(failing))._tag}`)
})

Effect.runPromise(main).catch(console.error)
