/**
 * Lab 07 — Streams
 *
 *   npm run lab src/07-streams.ts
 */

import { Chunk, Console, Data, Effect, Option, Schedule, Stream } from "effect"

const start = Date.now()
const at = () => `${String(Date.now() - start).padStart(5, " ")}ms`
const log = (message: string) => Console.log(`[${at()}] ${message}`)

// ─────────────────────────────────────────────────────────────────────────────
// 1. Creating streams
// ─────────────────────────────────────────────────────────────────────────────

const fromValues = Stream.make(1, 2, 3)
const fromArray = Stream.fromIterable([1, 2, 3, 4, 5])
const counted = Stream.range(1, 5)
const fromOne = Stream.fromEffect(Effect.succeed("just one"))

// Infinite. Perfectly safe — nothing is produced until something pulls.
const naturals = Stream.iterate(0, (n) => n + 1)

// ─────────────────────────────────────────────────────────────────────────────
// 2. Streams are pull-based, which is where backpressure comes from
// ─────────────────────────────────────────────────────────────────────────────

// `naturals` is infinite, but `take(5)` only ever pulls five elements, so the
// producer only ever produces five. A fast producer can never overwhelm a slow
// consumer, because the consumer is the one asking.
const backpressure = naturals.pipe(
  Stream.tap((n) => log(`  produced ${n}`)),
  Stream.take(5),
  Stream.tap(() => Effect.sleep("30 millis")), // slow consumer
  Stream.runDrain,
)

// ─────────────────────────────────────────────────────────────────────────────
// 3. A realistic source: a paginated API
// ─────────────────────────────────────────────────────────────────────────────

interface Page {
  readonly items: ReadonlyArray<string>
  readonly nextCursor: string | null
}

const fetchPage = (cursor: string | null): Effect.Effect<Page> =>
  Effect.gen(function* () {
    yield* Effect.sleep("20 millis") // pretend network
    const page = cursor === null ? 0 : Number(cursor)
    yield* log(`  fetched page ${page}`)
    return {
      items: [`item-${page}a`, `item-${page}b`],
      nextCursor: page < 3 ? String(page + 1) : null,
    }
  })

// `paginateChunkEffect` expresses "keep fetching until there's no next cursor"
// as a stream. Downstream sees a flat stream of items and never knows about
// pages — and pages are only fetched as items are consumed.
const allItems = Stream.paginateChunkEffect(null as string | null, (cursor) =>
  fetchPage(cursor).pipe(
    Effect.map(
      (page) =>
        [
          Chunk.fromIterable(page.items),
          Option.fromNullable(page.nextCursor),
        ] as const,
    ),
  ),
)

// ─────────────────────────────────────────────────────────────────────────────
// 4. Transforming
// ─────────────────────────────────────────────────────────────────────────────

const transformed = Stream.range(1, 10).pipe(
  Stream.filter((n) => n % 2 === 0), // 2 4 6 8 10
  Stream.map((n) => n * 10), // 20 40 60 80 100
  Stream.takeWhile((n) => n < 100), // 20 40 60 80
  Stream.scan(0, (total, n) => total + n), // running total
)

// ─────────────────────────────────────────────────────────────────────────────
// 5. Concurrency inside a pipeline
// ─────────────────────────────────────────────────────────────────────────────

const enrich = (id: number) =>
  Effect.gen(function* () {
    yield* Effect.sleep("50 millis")
    return `enriched-${id}`
  })

// Bounded concurrency, applied per element, without losing the pipeline shape.
const concurrentPipeline = Stream.range(1, 8).pipe(
  Stream.mapEffect(enrich, { concurrency: 4 }),
  Stream.runCollect,
)
// ≈100ms rather than ≈400ms

// ─────────────────────────────────────────────────────────────────────────────
// 6. Batching — the reason streams beat forEach for bulk work
// ─────────────────────────────────────────────────────────────────────────────

const saveBatch = (batch: Chunk.Chunk<number>) =>
  log(`  INSERT ${Chunk.size(batch)} rows: [${Chunk.toArray(batch).join(", ")}]`)

const batched = Stream.range(1, 11).pipe(
  Stream.grouped(4), // fixed-size batches
  Stream.mapEffect(saveBatch),
  Stream.runDrain,
)

// `groupedWithin` also flushes on a timeout, so a trickle of events still gets
// written promptly instead of waiting for a full batch.
const batchedWithTimeout = Stream.range(1, 5).pipe(
  Stream.schedule(Schedule.spaced("15 millis")),
  Stream.groupedWithin(10, "40 millis"),
  Stream.mapEffect((batch) => log(`  flushed ${Chunk.size(batch)} (timeout-triggered)`)),
  Stream.runDrain,
)

// ─────────────────────────────────────────────────────────────────────────────
// 7. Errors and retries
// ─────────────────────────────────────────────────────────────────────────────

class ItemFailed extends Data.TaggedError("ItemFailed")<{ readonly id: number }> {}

const riskyPipeline = Stream.range(1, 5).pipe(
  Stream.mapEffect((n) =>
    n === 3 ? Effect.fail(new ItemFailed({ id: n })) : Effect.succeed(n),
  ),
  // A failure terminates the stream by default. Decide what you want instead:
  Stream.catchTag("ItemFailed", (e) =>
    Stream.fromEffect(log(`  skipped failing item ${e.id}`)).pipe(Stream.drain),
  ),
  Stream.runCollect,
)

// ─────────────────────────────────────────────────────────────────────────────
// 8. Consuming
// ─────────────────────────────────────────────────────────────────────────────

const consuming = Effect.gen(function* () {
  yield* log(`  runCollect: ${Chunk.toArray(yield* Stream.runCollect(fromValues))}`)
  yield* log(`  runFold:    ${yield* Stream.runFold(fromArray, 0, (a, b) => a + b)}`)
  yield* log(`  runCount:   ${yield* Stream.runCount(counted)}`)
  const head = yield* Stream.runHead(fromOne)
  yield* log(`  runHead:    ${Option.getOrElse(head, () => "none")}`)
  // runDrain: run for the side effects, keep nothing. The right choice for
  // pipelines over data too big to hold in memory.
})

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const main = Effect.gen(function* () {
  yield* log("── 2. pull-based backpressure ──")
  yield* backpressure

  yield* log("\n── 3. paginated API as a stream (first 5 items only) ──")
  const firstFive = yield* allItems.pipe(Stream.take(5), Stream.runCollect)
  yield* log(`  got: ${Chunk.toArray(firstFive).join(", ")}`)
  yield* log("  note: page 3 was never fetched — we stopped pulling")

  yield* log("\n── 4. transforming ──")
  const t = yield* Stream.runCollect(transformed)
  yield* log(`  running totals: ${Chunk.toArray(t).join(", ")}`)

  yield* log("\n── 5. concurrency: 4 (expect ~100ms, not ~400ms) ──")
  const c = yield* concurrentPipeline
  yield* log(`  ${Chunk.size(c)} results`)

  yield* log("\n── 6a. fixed-size batching ──")
  yield* batched

  yield* log("\n── 6b. batching with a timeout flush ──")
  yield* batchedWithTimeout

  yield* log("\n── 7. error handling ──")
  const r = yield* riskyPipeline
  yield* log(`  survived with ${Chunk.size(r)} items`)

  yield* log("\n── 8. consuming ──")
  yield* consuming
})

Effect.runPromise(main).catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})
