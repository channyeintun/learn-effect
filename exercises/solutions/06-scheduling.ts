/** Solution 06 — Scheduling, Retry & Repeat */
import { Console, Data, Effect, Ref, Schedule } from "effect"

class Unavailable extends Data.TaggedError("Unavailable")<{ readonly n: number }> {}
class BadRequest extends Data.TaggedError("BadRequest")<{ readonly why: string }> {}

const threeTimes = Schedule.intersect(Schedule.spaced("1 second"), Schedule.recurs(3))

const backoff = Schedule.exponential("100 millis").pipe(
  Schedule.either(Schedule.spaced("5 seconds")),   // cap
  Schedule.compose(Schedule.recurs(6)),            // limit
)

const jittered = backoff.pipe(Schedule.jittered)

const selective = Effect.gen(function* () {
  const attempts = yield* Ref.make(0)
  const call: Effect.Effect<never, BadRequest | Unavailable> = Effect.gen(function* () {
    const n = yield* Ref.updateAndGet(attempts, (x) => x + 1)
    return yield* new BadRequest({ why: `attempt ${n}` })
  })
  yield* Effect.either(
    Effect.retry(call, { while: (e) => e._tag === "Unavailable", times: 5 }),
  )
  return yield* Ref.get(attempts)
})

const polling = Effect.gen(function* () {
  const n = yield* Ref.make(0)
  const tick = Ref.updateAndGet(n, (x) => x + 1)
  return yield* Effect.repeat(tick, {
    schedule: Schedule.spaced("100 millis"),
    until: (v) => v >= 5,
  })
})

// Per-attempt timeout inside, retry around it, overall deadline outside.
const layered = Effect.timeout(
  Effect.retry(Effect.timeout(Effect.sleep("10 seconds"), "200 millis"), { times: 3 }),
  "2 seconds",
)

const main = Effect.gen(function* () {
  const d1 = yield* Schedule.run(Schedule.delays(threeTimes), 0, [0, 0, 0, 0])
  yield* Console.log(`1. delays:   ${Array.from(d1).map(String).join(", ")}`)

  const d2 = yield* Schedule.run(Schedule.delays(backoff), 0, [0, 0, 0, 0, 0, 0, 0])
  yield* Console.log(`2. capped:   ${Array.from(d2).map(String).join(", ")}`)

  const d3 = yield* Schedule.run(Schedule.delays(jittered), 0, [0, 0, 0, 0])
  yield* Console.log(`3. jittered: ${Array.from(d3).map(String).join(", ")}`)

  yield* Console.log(`4. attempts: ${yield* selective} (BadRequest is not retried)`)
  yield* Console.log(`5. polled to: ${yield* polling}`)
  yield* Console.log(`6. layered:  ${(yield* Effect.either(layered))._tag}`)
})

Effect.runPromise(main).catch(console.error)
