/**
 * Lab 11 — State & Coordination
 *
 *   npm run lab src/11-state-and-coordination.ts
 */

import {
  Chunk,
  Console,
  Deferred,
  Effect,
  Fiber,
  PubSub,
  Queue,
  Ref,
  Stream,
  SynchronizedRef,
} from "effect"

const log = Console.log

// ─────────────────────────────────────────────────────────────────────────────
// 1. Why a plain `let` is not enough
// ─────────────────────────────────────────────────────────────────────────────

// Effect's scheduler interleaves fibers at suspension points, so read-modify-
// write on a plain variable is a genuine race — not a theoretical one.
const racyCounter = Effect.gen(function* () {
  let count = 0
  yield* Effect.forEach(
    Array.from({ length: 100 }, (_, i) => i),
    () =>
      Effect.gen(function* () {
        const current = count
        yield* Effect.yieldNow() // a suspension point, like any real I/O
        count = current + 1 // stale write
      }),
    { concurrency: "unbounded" },
  )
  return count
})

// Ref makes read-modify-write atomic.
const safeCounter = Effect.gen(function* () {
  const count = yield* Ref.make(0)
  yield* Effect.forEach(
    Array.from({ length: 100 }, (_, i) => i),
    () =>
      Effect.gen(function* () {
        yield* Effect.yieldNow()
        yield* Ref.update(count, (n) => n + 1)
      }),
    { concurrency: "unbounded" },
  )
  return yield* Ref.get(count)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Ref operations
// ─────────────────────────────────────────────────────────────────────────────

const refOps = Effect.gen(function* () {
  const ref = yield* Ref.make({ hits: 0, misses: 0 })

  yield* Ref.update(ref, (s) => ({ ...s, hits: s.hits + 1 }))
  yield* Ref.update(ref, (s) => ({ ...s, misses: s.misses + 1 }))

  // updateAndGet / getAndUpdate return a value atomically with the update.
  const after = yield* Ref.updateAndGet(ref, (s) => ({ ...s, hits: s.hits + 1 }))

  // modify computes a result AND the new state in one atomic step — this is
  // how you write "take one item and report what you took" without a race.
  const taken = yield* Ref.modify(ref, (s) => [s.hits, { ...s, hits: 0 }])

  yield* log(`  after update: ${JSON.stringify(after)}`)
  yield* log(`  modify took ${taken}, state is now ${JSON.stringify(yield* Ref.get(ref))}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. SynchronizedRef — when the update itself is effectful
// ─────────────────────────────────────────────────────────────────────────────

// `Ref.update` takes a pure function. If refreshing state requires I/O, use
// SynchronizedRef: it serialises the effectful update so two fibers can't both
// decide the cache is stale and both refetch.
const cacheRefresh = Effect.gen(function* () {
  const cache = yield* SynchronizedRef.make<string | null>(null)
  let fetches = 0

  const get = SynchronizedRef.updateAndGetEffect(cache, (current) =>
    current !== null
      ? Effect.succeed(current)
      : Effect.gen(function* () {
          fetches++
          yield* Effect.sleep("20 millis")
          return "fetched-value"
        }),
  )

  // Ten fibers all want the value at once.
  yield* Effect.all(Array.from({ length: 10 }, () => get), {
    concurrency: "unbounded",
  })

  yield* log(`  10 concurrent readers caused ${fetches} fetch(es)`)
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Queue — a work queue with backpressure
// ─────────────────────────────────────────────────────────────────────────────

const workQueue = Effect.gen(function* () {
  // Bounded: `offer` suspends when full, which is backpressure on the producer.
  const queue = yield* Queue.bounded<number>(4)

  const producer = Effect.forEach(
    [1, 2, 3, 4, 5, 6, 7, 8],
    (n) =>
      Effect.gen(function* () {
        yield* Queue.offer(queue, n)
        yield* log(`  → offered ${n} (queue size ${yield* Queue.size(queue)})`)
      }),
    { discard: true },
  )

  const consumer = Effect.forEach(
    [1, 2, 3, 4, 5, 6, 7, 8],
    () =>
      Effect.gen(function* () {
        const n = yield* Queue.take(queue)
        yield* Effect.sleep("15 millis")
        yield* log(`  ← consumed ${n}`)
      }),
    { discard: true },
  )

  yield* Effect.all([producer, consumer], { concurrency: "unbounded" })
  yield* Queue.shutdown(queue)
})

// Other strategies: `Queue.dropping` (discard new when full),
// `Queue.sliding` (discard oldest), `Queue.unbounded` (no backpressure).

// ─────────────────────────────────────────────────────────────────────────────
// 5. PubSub — broadcast to every subscriber
// ─────────────────────────────────────────────────────────────────────────────

const broadcast = Effect.gen(function* () {
  const pubsub = yield* PubSub.bounded<string>(8)

  const subscriber = (name: string) =>
    Effect.gen(function* () {
      const subscription = yield* PubSub.subscribe(pubsub)
      return yield* Stream.fromQueue(subscription).pipe(
        Stream.take(3),
        Stream.tap((event) => log(`  [${name}] ${event}`)),
        Stream.runCollect,
      )
    })

  const subscribers = yield* Effect.forEach(["A", "B"], (n) => Effect.fork(Effect.scoped(subscriber(n))), {
    concurrency: "unbounded",
  })

  yield* Effect.sleep("20 millis") // let them subscribe
  yield* PubSub.publishAll(pubsub, ["tick-1", "tick-2", "tick-3"])

  yield* Effect.forEach(subscribers, Fiber.join, { discard: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Semaphore — limit access to something scarce
// ─────────────────────────────────────────────────────────────────────────────

const rateLimited = Effect.gen(function* () {
  const semaphore = yield* Effect.makeSemaphore(2) // 2 permits
  const t0 = Date.now()

  const useResource = (n: number) =>
    semaphore.withPermits(1)(
      Effect.gen(function* () {
        // Watch the timestamps: tasks 3-5 wait for a permit to be released.
        yield* log(`  [+${String(Date.now() - t0).padStart(3)}ms] task ${n} acquired a permit`)
        yield* Effect.sleep("30 millis")
      }),
    )

  yield* Effect.forEach([1, 2, 3, 4, 5], useResource, {
    concurrency: "unbounded",
    discard: true,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Deferred — a promise you fulfil once, from another fiber
// ─────────────────────────────────────────────────────────────────────────────

const handshake = Effect.gen(function* () {
  const ready = yield* Deferred.make<string>()

  const waiter = yield* Effect.fork(
    Effect.gen(function* () {
      yield* log("  waiter: blocking until the signal")
      const value = yield* Deferred.await(ready)
      yield* log(`  waiter: got "${value}"`)
    }),
  )

  yield* Effect.sleep("30 millis")
  yield* log("  signaller: releasing")
  yield* Deferred.succeed(ready, "go")

  yield* Fiber.join(waiter)
})

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const main = Effect.gen(function* () {
  yield* log("── 1. lost updates vs Ref ──")
  yield* log(`  plain let: ${yield* racyCounter} (expected 100)`)
  yield* log(`  Ref:       ${yield* safeCounter} (expected 100)`)

  yield* log("\n── 2. Ref operations ──")
  yield* refOps

  yield* log("\n── 3. SynchronizedRef prevents duplicate work ──")
  yield* cacheRefresh

  yield* log("\n── 4. bounded Queue (capacity 4) ──")
  yield* workQueue

  yield* log("\n── 5. PubSub broadcast ──")
  yield* broadcast

  yield* log("\n── 6. Semaphore with 2 permits ──")
  yield* rateLimited

  yield* log("\n── 7. Deferred handshake ──")
  yield* handshake

  yield* log(`\n(chunk helper kept for reference: ${Chunk.size(Chunk.make(1, 2))})`)
})

Effect.runPromise(main).catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})
