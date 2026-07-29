/**
 * Exercise 06 — Scheduling, Retry & Repeat
 *
 *   npm run lab exercises/06-scheduling.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/06-scheduling.ts
 */

import { Console, Data, Effect, Ref, Schedule } from "effect"

class Unavailable extends Data.TaggedError("Unavailable")<{ readonly n: number }> {}
class BadRequest extends Data.TaggedError("BadRequest")<{ readonly why: string }> {}

// ── 1. At most 3 retries, 1 second apart. Verify with Schedule.run. ───────
const threeTimes = Schedule.intersect(Schedule.spaced("1 second"), Schedule.recurs(3))

// ── 2. Exponential from 100ms, capped at 5s, giving up after 6 tries. ─────
const backoff = Schedule.exponential("100 millis").pipe(
  // TODO: cap with Schedule.either(Schedule.spaced("5 seconds"))
  // TODO: limit with Schedule.compose(Schedule.recurs(6))
)

// ── 3. Add jitter; run twice and notice the delays differ. ────────────────
const jittered = backoff.pipe(/* TODO: Schedule.jittered */)

// ── 4. Retry only Unavailable, never BadRequest. ─────────────────────────
const selective = Effect.gen(function* () {
  const attempts = yield* Ref.make(0)
  const call: Effect.Effect<never, BadRequest | Unavailable> = Effect.gen(function* () {
    const n = yield* Ref.updateAndGet(attempts, (x) => x + 1)
    return yield* new BadRequest({ why: `attempt ${n}` })
  })
  // TODO: Effect.retry(call, { while: (e) => e._tag === "Unavailable", times: 5 })
  yield* Effect.either(call)
  return yield* Ref.get(attempts)
})

// ── 5. Poll a counter every 100ms until it reaches 5. ────────────────────
const polling = Effect.gen(function* () {
  const n = yield* Ref.make(0)
  const tick = Ref.updateAndGet(n, (x) => x + 1)
  // TODO: Effect.repeat(tick, { schedule: Schedule.spaced("100 millis"), until: (v) => v >= 5 })
  return yield* tick
})

// ── 6. Combine a per-attempt timeout with a retry and an overall deadline.
const layered = Effect.timeout(
  Effect.retry(Effect.timeout(Effect.sleep("10 seconds"), "200 millis"), { times: 3 }),
  "2 seconds",
)

const main = Effect.gen(function* () {
  const d1 = yield* Schedule.run(Schedule.delays(threeTimes), 0, [0, 0, 0, 0])
  yield* Console.log(`1. delays: ${Array.from(d1).map(String).join(", ")}`)

  const d2 = yield* Schedule.run(Schedule.delays(backoff), 0, [0, 0, 0, 0, 0, 0, 0])
  yield* Console.log(`2. delays: ${Array.from(d2).map(String).join(", ")}`)

  const d3 = yield* Schedule.run(Schedule.delays(jittered), 0, [0, 0, 0, 0])
  yield* Console.log(`3. jittered: ${Array.from(d3).map(String).join(", ")}`)

  yield* Console.log(`4. attempts (should be 1): ${yield* selective}`)
  yield* Console.log(`5. polled to: ${yield* polling}`)
  yield* Console.log(`6. layered: ${(yield* Effect.either(layered))._tag}`)
})

Effect.runPromise(main).catch(console.error)
