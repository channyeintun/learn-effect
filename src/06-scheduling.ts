/**
 * Lab 06 — Scheduling, Retry & Repeat
 *
 *   npm run lab src/06-scheduling.ts
 */

import { Console, Data, Effect, Ref, Schedule } from "effect"

const start = Date.now()
const at = () => `${String(Date.now() - start).padStart(5, " ")}ms`
const log = (message: string) => Console.log(`[${at()}] ${message}`)

class ServiceUnavailable extends Data.TaggedError("ServiceUnavailable")<{
  readonly attempt: number
}> {}

class BadRequest extends Data.TaggedError("BadRequest")<{
  readonly reason: string
}> {}

/** Fails `failures` times, then succeeds. */
const flaky = (failures: number) =>
  Effect.gen(function* () {
    const attempts = yield* Ref.make(0)
    return Effect.gen(function* () {
      const n = yield* Ref.updateAndGet(attempts, (x) => x + 1)
      yield* log(`  attempt ${n}`)
      if (n <= failures) {
        return yield* new ServiceUnavailable({ attempt: n })
      }
      return `succeeded on attempt ${n}`
    })
  })

// ─────────────────────────────────────────────────────────────────────────────
// 1. retry — re-run on FAILURE
// ─────────────────────────────────────────────────────────────────────────────

const simpleRetry = Effect.gen(function* () {
  const call = yield* flaky(2)
  return yield* Effect.retry(call, { times: 5 })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. The production retry policy
// ─────────────────────────────────────────────────────────────────────────────

// Exponential backoff alone synchronises every client into retry waves after an
// outage ("thundering herd"). Jitter is what actually spreads them out; it is
// not optional in production.
const backoff = Schedule.exponential("50 millis", 2).pipe(
  Schedule.jittered, // randomise each delay
  Schedule.either(Schedule.spaced("400 millis")), // cap the growth
  Schedule.compose(Schedule.recurs(4)), // and give up eventually
)

const productionRetry = Effect.gen(function* () {
  const call = yield* flaky(3)
  return yield* Effect.retry(call, backoff)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Retry only what is worth retrying
// ─────────────────────────────────────────────────────────────────────────────

// Retrying a 400 Bad Request just wastes time and money. Filter by error.
const selective = Effect.gen(function* () {
  const attempts = yield* Ref.make(0)
  const call = Effect.gen(function* () {
    const n = yield* Ref.updateAndGet(attempts, (x) => x + 1)
    yield* log(`  attempt ${n} (will fail with BadRequest)`)
    return yield* new BadRequest({ reason: "malformed" })
  })

  return yield* Effect.retry(call, {
    while: (e: BadRequest | ServiceUnavailable) => e._tag === "ServiceUnavailable",
    times: 5,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. repeat — re-run on SUCCESS
// ─────────────────────────────────────────────────────────────────────────────

const polling = Effect.gen(function* () {
  const ticks = yield* Ref.make(0)
  const check = Effect.gen(function* () {
    const n = yield* Ref.updateAndGet(ticks, (x) => x + 1)
    yield* log(`  health check #${n}`)
    return n
  })

  // `repeat` runs the effect once, then again for each schedule step.
  // `intersect` = AND: continue while BOTH agree, and wait the LONGER delay.
  yield* Effect.repeat(
    check,
    Schedule.intersect(Schedule.spaced("60 millis"), Schedule.recurs(3)),
  )
  return yield* Ref.get(ticks)
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Schedules are values you can inspect and compose
// ─────────────────────────────────────────────────────────────────────────────

// `Schedule.delays` turns any schedule into one that OUTPUTS its delays, and
// `Schedule.run` executes it against fake input without waiting for real time.
// This is how you unit-test a retry policy in microseconds.
const inspectPolicy = Effect.gen(function* () {
  const plain = yield* Schedule.run(
    Schedule.delays(Schedule.exponential("100 millis")),
    0,
    [0, 0, 0, 0, 0],
  )
  yield* log(`  exponential:        ${Array.from(plain).map(String).join(", ")}`)

  const capped = yield* Schedule.run(
    Schedule.delays(
      Schedule.exponential("100 millis").pipe(Schedule.either(Schedule.spaced("400 millis"))),
    ),
    0,
    [0, 0, 0, 0, 0],
  )
  yield* log(`  capped at 400ms:    ${Array.from(capped).map(String).join(", ")}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Combining a schedule with recovery
// ─────────────────────────────────────────────────────────────────────────────

const giveUpGracefully = Effect.gen(function* () {
  const call = yield* flaky(99) // never succeeds
  return yield* Effect.retry(call, {
    schedule: Schedule.spaced("30 millis"),
    times: 2,
  }).pipe(
    Effect.catchTag("ServiceUnavailable", (e) =>
      Effect.succeed(`gave up after ${e.attempt} attempts, using cached value`),
    ),
  )
})

// `retryOrElse` does the same in one operator.
const withFallback = Effect.gen(function* () {
  const call = yield* flaky(99)
  return yield* Effect.retryOrElse(
    call,
    Schedule.recurs(2),
    (e) => Effect.succeed(`fallback after ${e.attempt} attempts`),
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const main = Effect.gen(function* () {
  yield* log("── 1. retry until success ──")
  yield* log(`  ${yield* simpleRetry}`)

  yield* log("\n── 2. exponential + jitter + cap + limit ──")
  yield* log(`  ${yield* productionRetry}`)

  yield* log("\n── 3. only retry retryable errors ──")
  const s = yield* Effect.either(selective)
  yield* log(`  stopped immediately: ${s._tag === "Left" ? s.left._tag : "ok"}`)

  yield* log("\n── 4. repeat on success (polling) ──")
  yield* log(`  ran ${yield* polling} times total`)

  yield* log("\n── 5. inspecting a schedule without waiting ──")
  yield* inspectPolicy

  yield* log("\n── 6. giving up gracefully ──")
  yield* log(`  ${yield* giveUpGracefully}`)
  yield* log(`  ${yield* withFallback}`)
})

Effect.runPromise(main).catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})
