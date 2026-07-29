/** Solution 11 — State & Coordination */
import { Console, Deferred, Effect, Fiber, Queue, Ref, SynchronizedRef } from "effect"

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
  yield* Effect.forEach(
    Array.from({ length: 100 }, (_, i) => i),
    () => Effect.gen(function* () {
      yield* Effect.yieldNow()
      yield* Ref.update(ref, (n) => n + 1)
    }),
    { concurrency: "unbounded" },
  )
  return yield* Ref.get(ref)
})

const counter = Effect.gen(function* () {
  const ref = yield* Ref.make({ hits: 0, misses: 0 })
  yield* Ref.update(ref, (s) => ({ ...s, hits: s.hits + 3 }))
  // Report and reset in ONE atomic step.
  const reported = yield* Ref.modify(ref, (s) => [s.hits, { ...s, hits: 0 }])
  return { reported, after: yield* Ref.get(ref) }
})

const cache = Effect.gen(function* () {
  const ref = yield* SynchronizedRef.make<string | null>(null)
  let fetches = 0

  const get = SynchronizedRef.updateAndGetEffect(ref, (current) =>
    current !== null
      ? Effect.succeed(current)
      : Effect.gen(function* () {
          fetches++
          yield* Effect.sleep("10 millis")
          return "value"
        }),
  )

  yield* Effect.all(Array.from({ length: 20 }, () => get), { concurrency: "unbounded" })
  return fetches
})

const queued = Effect.gen(function* () {
  const q = yield* Queue.bounded<number>(3)
  const produce = Effect.forEach(
    [1, 2, 3, 4, 5, 6],
    (n) => Queue.offer(q, n).pipe(
      Effect.andThen(Queue.size(q).pipe(Effect.flatMap((s) => Console.log(`   → ${n} (size ${s})`)))),
    ),
    { discard: true },
  )
  const consume = Effect.forEach(
    [1, 2, 3, 4, 5, 6],
    () => Queue.take(q).pipe(
      Effect.tap((n) => Console.log(`   ← ${n}`)),
      Effect.andThen(Effect.sleep("10 millis")),
    ),
    { discard: true },
  )
  yield* Effect.all([produce, consume], { concurrency: "unbounded" })
  yield* Queue.shutdown(q)
})

const limited = Effect.gen(function* () {
  const sem = yield* Effect.makeSemaphore(3)
  const t0 = Date.now()
  yield* Effect.forEach(
    [1, 2, 3, 4, 5, 6],
    (n) => sem.withPermits(1)(
      Console.log(`   [+${String(Date.now() - t0).padStart(3)}ms] call ${n}`).pipe(
        Effect.andThen(Effect.sleep("30 millis")),
      ),
    ),
    { concurrency: "unbounded", discard: true },
  )
})

const startTogether = Effect.gen(function* () {
  const gate = yield* Deferred.make<void>()
  const t0 = Date.now()
  const fibers = yield* Effect.forEach(
    Array.from({ length: 5 }, (_, i) => i),
    (i) => Effect.fork(
      Deferred.await(gate).pipe(
        Effect.andThen(Console.log(`   [+${Date.now() - t0}ms] fiber ${i} go`)),
      ),
    ),
  )
  yield* Effect.sleep("20 millis")
  yield* Deferred.succeed(gate, void 0)
  yield* Effect.forEach(fibers, Fiber.join, { discard: true })
})

const main = Effect.gen(function* () {
  yield* Console.log(`1. racy: ${yield* racy} | safe: ${yield* safe} (want 100)`)
  yield* Console.log(`2. counter: ${JSON.stringify(yield* counter)}`)
  yield* Console.log(`3. fetches: ${yield* cache} (want 1)`)
  yield* Console.log("4. queue backpressure:"); yield* queued
  yield* Console.log("5. semaphore (3 permits):"); yield* limited
  yield* Console.log("6. deferred gate:"); yield* startTogether
})

Effect.runPromise(main).catch(console.error)
