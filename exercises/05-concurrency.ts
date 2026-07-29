/**
 * Exercise 05 — Concurrency & Fibers
 *
 *   npm run lab exercises/05-concurrency.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/05-concurrency.ts
 */

import { Console, Data, Effect, Fiber } from "effect"

const t0 = Date.now()
const log = (m: string) => Console.log(`[${String(Date.now() - t0).padStart(4)}ms] ${m}`)

const task = (name: string, ms: number) =>
  Effect.gen(function* () {
    yield* Effect.sleep(`${ms} millis`)
    yield* log(`  ${name} done`)
    return name
  })

// ── 1. Run three 300ms tasks sequentially, then concurrently. ─────────────
const sequential = Effect.all([task("a", 300), task("b", 300), task("c", 300)])
// TODO: add { concurrency: "unbounded" }
const concurrent = Effect.all([task("x", 300), task("y", 300), task("z", 300)])

// ── 2. Fetch 20 items with concurrency: 4. ───────────────────────────────
const ids = Array.from({ length: 20 }, (_, i) => i + 1)
const bounded = Effect.forEach(ids, (i) => task(`item-${i}`, 50), {
  // TODO: concurrency: 4
  discard: true,
})

// ── 3. Race, and prove the loser is cancelled with onInterrupt. ──────────
const raced = Effect.race(
  task("fast", 50),
  task("slow", 5_000).pipe(
    // TODO: Effect.onInterrupt(() => log("  slow was cancelled"))
  ),
)

// ── 4. Fork, sleep, interrupt. Confirm cleanup runs BEFORE interrupt returns.
const forkInterrupt = Effect.gen(function* () {
  const fiber = yield* Effect.fork(
    task("doomed", 5_000).pipe(Effect.onInterrupt(() => log("  doomed cleaned up"))),
  )
  yield* Effect.sleep("50 millis")
  yield* Fiber.interrupt(fiber)
  yield* log("  interrupt returned")
})

// ── 5. Make one of five concurrent tasks fail; watch siblings die. ───────
class Boom extends Data.TaggedError("Boom")<{ readonly which: string }> {}
const failFast = Effect.all(
  [
    task("survivor", 3_000).pipe(Effect.onInterrupt(() => log("  survivor cancelled"))),
    Effect.sleep("50 millis").pipe(Effect.andThen(Effect.fail(new Boom({ which: "b" })))),
  ],
  { concurrency: "unbounded" },
)
// TODO: then switch to { concurrency: "unbounded", mode: "either" }

const main = Effect.gen(function* () {
  yield* log("1a. sequential"); yield* sequential
  yield* log("1b. concurrent");  yield* concurrent
  yield* log("2. bounded");      yield* bounded
  yield* log("3. race");         yield* raced
  yield* log("4. interrupt");    yield* forkInterrupt
  yield* log("5. fail-fast");    yield* Effect.either(failFast)
})

Effect.runPromise(main).catch(console.error)
