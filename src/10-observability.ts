/**
 * Lab 10 — Observability: logging, tracing, metrics
 *
 *   npm run lab src/10-observability.ts
 */

import {
  Console,
  Data,
  Effect,
  Logger,
  LogLevel,
  Metric,
  MetricBoundaries,
} from "effect"

// ─────────────────────────────────────────────────────────────────────────────
// 1. Logging is built in and structured
// ─────────────────────────────────────────────────────────────────────────────

class OrderFailed extends Data.TaggedError("OrderFailed")<{
  readonly orderId: string
}> {}

const levels = Effect.gen(function* () {
  yield* Effect.logTrace("trace — hidden by default")
  yield* Effect.logDebug("debug — hidden by default")
  yield* Effect.logInfo("info")
  yield* Effect.logWarning("warning")
  yield* Effect.logError("error")
})

// Annotations attach structured key/values to every log inside the scope —
// this is how you get a request id onto every line without threading it.
const annotated = Effect.gen(function* () {
  yield* Effect.logInfo("processing order")
  yield* Effect.logInfo("charged card")
}).pipe(
  Effect.annotateLogs({ requestId: "req_42", userId: "u_1" }),
)

// Log spans measure elapsed time and appear in the output automatically.
const timed = Effect.gen(function* () {
  yield* Effect.sleep("60 millis")
  yield* Effect.logInfo("done")
}).pipe(Effect.withLogSpan("checkout"))

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tracing: spans that nest automatically
// ─────────────────────────────────────────────────────────────────────────────

// `Effect.fn` names a function AND makes it a span in one step. The stack of
// spans mirrors your call graph, so a trace reads like a flame graph.
const loadUser = Effect.fn("loadUser")(function* (id: string) {
  yield* Effect.annotateCurrentSpan("user.id", id)
  yield* Effect.sleep("20 millis")
  return { id, name: "Ada" }
})

const loadOrders = Effect.fn("loadOrders")(function* (userId: string) {
  yield* Effect.annotateCurrentSpan("user.id", userId)
  yield* Effect.sleep("30 millis")
  return [{ id: "o_1" }, { id: "o_2" }]
})

const handleRequest = Effect.fn("handleRequest")(function* (id: string) {
  const user = yield* loadUser(id)
  const orders = yield* loadOrders(user.id)
  yield* Effect.annotateCurrentSpan("order.count", orders.length)
  return { user, orders }
})

// `withSpan` is the manual form, for when you're not wrapping a function.
const manualSpan = Effect.sleep("10 millis").pipe(
  Effect.withSpan("manual-work", { attributes: { kind: "demo" } }),
)

// ─────────────────────────────────────────────────────────────────────────────
// 3. Metrics
// ─────────────────────────────────────────────────────────────────────────────

const ordersProcessed = Metric.counter("orders_processed", {
  description: "Total orders processed",
})

const queueDepth = Metric.gauge("queue_depth", {
  description: "Items waiting to be processed",
})

// A histogram of raw numbers…
const payloadBytes = Metric.histogram(
  "payload_bytes",
  MetricBoundaries.exponential({ start: 64, factor: 2, count: 10 }),
)

// …and a *timer*, which accepts Durations. This is the one `trackDuration`
// wants; a plain number histogram will not typecheck there.
const requestLatency = Metric.timerWithBoundaries(
  "request_latency_ms",
  [1, 5, 10, 25, 50, 100, 250, 500, 1000],
)

const doWork = (n: number) =>
  Effect.gen(function* () {
    yield* Effect.sleep(`${n} millis`)
    return n
  }).pipe(
    // `Metric.trackDuration` times the effect and records it, with no manual
    // start/stop bookkeeping to get wrong.
    Metric.trackDuration(requestLatency),
    Effect.tap(() => Metric.increment(ordersProcessed)),
    Effect.tap((size) => Metric.update(payloadBytes, size * 100)),
  )

// ─────────────────────────────────────────────────────────────────────────────
// 4. Errors carry their context
// ─────────────────────────────────────────────────────────────────────────────

const failing = Effect.gen(function* () {
  yield* Effect.logInfo("about to fail")
  return yield* new OrderFailed({ orderId: "o_99" })
}).pipe(
  Effect.withSpan("failing-operation"),
  Effect.annotateLogs({ requestId: "req_43" }),
  // tapErrorTag logs without recovering — the error keeps propagating.
  Effect.tapErrorTag("OrderFailed", (e) =>
    Effect.logError(`order ${e.orderId} failed`),
  ),
)

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const main = Effect.gen(function* () {
  yield* Console.log("── 1a. log levels (trace/debug hidden) ──")
  yield* levels

  yield* Console.log("\n── 1b. same code at Debug level ──")
  yield* levels.pipe(Logger.withMinimumLogLevel(LogLevel.Debug))

  yield* Console.log("\n── 1c. annotations ──")
  yield* annotated

  yield* Console.log("\n── 1d. log spans measure elapsed time ──")
  yield* timed

  yield* Console.log("\n── 2. tracing ──")
  const result = yield* handleRequest("u_1")
  yield* Console.log(`  loaded ${result.orders.length} orders for ${result.user.name}`)
  yield* manualSpan
  yield* Console.log("  (spans are recorded; add @effect/opentelemetry to export them)")

  yield* Console.log("\n── 3. metrics ──")
  yield* Effect.forEach([5, 10, 20, 40], doWork, { concurrency: "unbounded" })
  yield* Metric.set(queueDepth, 7)
  yield* Console.log(`  orders_processed:   ${(yield* Metric.value(ordersProcessed)).count}`)
  yield* Console.log(`  queue_depth:        ${(yield* Metric.value(queueDepth)).value}`)
  yield* Console.log(`  latency samples:    ${(yield* Metric.value(requestLatency)).count}`)

  yield* Console.log("\n── 4. failure with context ──")
  yield* Effect.either(failing)

  yield* Console.log("\n── 5. structured JSON logs (what you ship to prod) ──")
  yield* Effect.logInfo("service started").pipe(
    Effect.annotateLogs({ version: "1.0.0" }),
    Effect.provide(Logger.json),
  )
})

Effect.runPromise(main).catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})
