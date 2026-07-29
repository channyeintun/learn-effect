/** Solution 10 — Observability */
import { Console, Data, Effect, Logger, LogLevel, Metric } from "effect"

class Failed extends Data.TaggedError("Failed")<{ readonly id: string }> {}

// trace and debug are hidden by default; info and above are shown.
const allLevels = Effect.gen(function* () {
  yield* Effect.logTrace("trace")
  yield* Effect.logDebug("debug")
  yield* Effect.logInfo("info")
  yield* Effect.logWarning("warning")
  yield* Effect.logError("error")
  yield* Effect.logFatal("fatal")
})

const inner = Effect.logInfo("deep inside")
const annotated = Effect.gen(function* () {
  yield* Effect.logInfo("outer")
  yield* inner   // carries requestId too, without being passed anything
}).pipe(Effect.annotateLogs({ requestId: "req_1" }))

const loadUser = Effect.fn("loadUser")(function* (id: string) {
  yield* Effect.annotateCurrentSpan("user.id", id)
  yield* Effect.sleep("10 millis")
  return { id }
})

const handle = Effect.fn("handle")(function* (id: string) {
  const user = yield* loadUser(id)
  return user.id
})

const requests = Metric.counter("requests")
const latency = Metric.timerWithBoundaries("latency_ms", [1, 10, 100])

const timedWork = Effect.sleep("15 millis").pipe(
  Metric.trackDuration(latency),
  Effect.tap(() => Metric.increment(requests)),
)

const failing = Effect.fail(new Failed({ id: "x" })).pipe(
  Effect.tapErrorTag("Failed", (e) => Effect.logError(`failed ${e.id}`)),
)

const main = Effect.gen(function* () {
  yield* Console.log("1. default level (trace/debug hidden):"); yield* allLevels
  yield* Console.log("1. debug level:")
  yield* allLevels.pipe(Logger.withMinimumLogLevel(LogLevel.Debug))

  yield* Console.log("2. annotated:"); yield* annotated
  yield* Console.log(`3. handled: ${yield* handle("u_1")}`)

  yield* timedWork
  yield* Console.log(`4. requests=${(yield* Metric.value(requests)).count}, latency samples=${(yield* Metric.value(latency)).count}`)

  yield* Console.log("5. json logger:")
  yield* Effect.logInfo("structured").pipe(Effect.provide(Logger.json))

  yield* Console.log(`6. still propagates: ${(yield* Effect.either(failing))._tag}`)
})

Effect.runPromise(main).catch(console.error)
