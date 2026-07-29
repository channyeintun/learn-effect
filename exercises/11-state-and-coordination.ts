/**
 * Exercise 11 — State & Coordination
 *
 *   npm run lab exercises/11-state-and-coordination.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/11-state-and-coordination.ts
 */

import { Console, Deferred, Effect, Fiber, Queue, Ref, SynchronizedRef } from "effect"

// ── 1. Reproduce the lost update, then fix it with Ref. ─────────────────
const racy = Effect.gen(function* () {
  let count = 0
  yield* Effect.forEach(
    Array.from({ length: 100 }, (_, i) => i),
    () => Effect.gen(function* () {
      const c = count
      yield* Effect.yieldNow()
      count = c + 1
    }),
    { concurrency: "unbounded" },
  )
  return count
})

const safe = Effect.gen(function* () {
  const ref = yield* Ref.make(0)
  // TODO: same loop, but with Ref.update
  return yield* Ref.get(ref)
})

// ── 2. A hit/miss counter that reports AND resets atomically. ──────────
const counter = Effect.gen(function* () {
  const ref = yield* Ref.make({ hits: 0, misses: 0 })
  yield* Ref.update(ref, (s) => ({ ...s, hits: s.hits + 3 }))
  // TODO: use Ref.modify to return the hits and reset them to 0
  return yield* Ref.get(ref)
})

// ── 3. 20 concurrent readers should cause exactly ONE fetch. ──────────
const cache = Effect.gen(function* () {
  const ref = yield* SynchronizedRef.make<string | null>(null)
  let fetches = 0
  // TODO: SynchronizedRef.updateAndGetEffect
  const get = Effect.gen(function* () {
    fetches++
    return "value"
  })
  yield* Effect.all(Array.from({ length: 20 }, () => get), { concurrency: "unbounded" })
  return fetches
})

// ── 4. Bounded queue, fast producer, slow consumer. Watch backpressure. ─
const queued = Effect.gen(function* () {
  const q = yield* Queue.bounded<number>(3)
  const produce = Effect.forEach([1, 2, 3, 4, 5, 6], (n) => Queue.offer(q, n), { discard: true })
  const consume = Effect.forEach([1, 2, 3, 4, 5, 6], () =>
    Queue.take(q).pipe(Effect.tap(() => Effect.sleep("10 millis"))), { discard: true })
  yield* Effect.all([produce, consume], { concurrency: "unbounded" })
})

// ── 5. Limit an "external API" to 3 concurrent calls. ─────────────────
const limited = Effect.gen(function* () {
  const sem = yield* Effect.makeSemaphore(3)
  const t0 = Date.now()
  yield* Effect.forEach(
    [1, 2, 3, 4, 5, 6],
    (n) => sem.withPermits(1)(
      Console.log(`   [+${Date.now() - t0}ms] call ${n}`).pipe(
        Effect.andThen(Effect.sleep("30 millis")),
      ),
    ),
    { concurrency: "unbounded", discard: true },
  )
})

// ── 6. Use a Deferred to start ten fibers simultaneously. ─────────────
const startTogether = Effect.gen(function* () {
  const gate = yield* Deferred.make<void>()
  const fibers = yield* Effect.forEach(
    Array.from({ length: 3 }, (_, i) => i),
    (i) => Effect.fork(Deferred.await(gate).pipe(Effect.andThen(Console.log(`   fiber ${i} go`)))),
  )
  yield* Effect.sleep("20 millis")
  yield* Deferred.succeed(gate, void 0)
  yield* Effect.forEach(fibers, Fiber.join, { discard: true })
})

const main = Effect.gen(function* () {
  yield* Console.log(`1. racy: ${yield* racy} | safe: ${yield* safe} (want 100)`)
  yield* Console.log(`2. counter: ${JSON.stringify(yield* counter)}`)
  yield* Console.log(`3. fetches: ${yield* cache} (want 1)`)
  yield* Console.log("4. queue:");  yield* queued
  yield* Console.log("5. semaphore:"); yield* limited
  yield* Console.log("6. deferred:");  yield* startTogether
})

Effect.runPromise(main).catch(console.error)
