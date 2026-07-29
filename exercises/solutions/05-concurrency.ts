/** Solution 05 — Concurrency & Fibers */
import { Console, Data, Effect, Fiber } from "effect"

const t0 = Date.now()
const log = (m: string) => Console.log(`[${String(Date.now() - t0).padStart(4)}ms] ${m}`)

const task = (name: string, ms: number) =>
  Effect.gen(function* () {
    yield* Effect.sleep(`${ms} millis`)
    yield* log(`  ${name} done`)
    return name
  })

const sequential = Effect.all([task("a", 300), task("b", 300), task("c", 300)])
const concurrent = Effect.all([task("x", 300), task("y", 300), task("z", 300)], {
  concurrency: "unbounded",
})

const ids = Array.from({ length: 20 }, (_, i) => i + 1)
const bounded = Effect.forEach(ids, (i) => task(`item-${i}`, 50), {
  concurrency: 4,
  discard: true,
})

const raced = Effect.race(
  task("fast", 50),
  task("slow", 5_000).pipe(Effect.onInterrupt(() => log("  slow was cancelled"))),
)

const forkInterrupt = Effect.gen(function* () {
  const fiber = yield* Effect.fork(
    task("doomed", 5_000).pipe(Effect.onInterrupt(() => log("  doomed cleaned up"))),
  )
  yield* Effect.sleep("50 millis")
  // Cleanup finishes BEFORE this returns.
  yield* Fiber.interrupt(fiber)
  yield* log("  interrupt returned")
})

class Boom extends Data.TaggedError("Boom")<{ readonly which: string }> {}

const failFast = Effect.all(
  [
    task("survivor", 3_000).pipe(Effect.onInterrupt(() => log("  survivor cancelled"))),
    Effect.sleep("50 millis").pipe(Effect.andThen(Effect.fail(new Boom({ which: "b" })))),
  ],
  { concurrency: "unbounded" },
)

// mode: "either" lets everything finish and collects each outcome.
const collectAll = Effect.all(
  [
    task("also-survives", 100),
    Effect.sleep("50 millis").pipe(Effect.andThen(Effect.fail(new Boom({ which: "c" })))),
  ],
  { concurrency: "unbounded", mode: "either" },
)

const main = Effect.gen(function* () {
  yield* log("1a. sequential (~900ms)"); yield* sequential
  yield* log("1b. concurrent (~300ms)"); yield* concurrent
  yield* log("2. bounded at 4");         yield* bounded
  yield* log("3. race");                 yield* raced
  yield* log("4. interrupt");            yield* forkInterrupt
  yield* log("5a. fail-fast");           yield* Effect.either(failFast)
  yield* log("5b. mode: either")
  const results = yield* collectAll
  yield* log(`  outcomes: ${results.map((r) => r._tag).join(", ")}`)
})

Effect.runPromise(main).catch(console.error)
