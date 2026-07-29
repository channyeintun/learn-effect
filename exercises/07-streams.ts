/**
 * Exercise 07 — Streams
 *
 *   npm run lab exercises/07-streams.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/07-streams.ts
 */

import { Chunk, Console, Data, Effect, Option, Stream } from "effect"

// ── 1. 1–100, keep evens, double, sum with runFold. ──────────────────────
const sum = Stream.range(1, 100).pipe(
  // TODO: Stream.filter / Stream.map
  Stream.runFold(0, (a, b) => a + b),
)

// ── 2. A fake paginated API as a stream; take(3) must not fetch page 2. ──
const fetchPage = (cursor: number | null) =>
  Effect.gen(function* () {
    const page = cursor ?? 0
    yield* Console.log(`   fetched page ${page}`)
    return { items: [`p${page}-a`, `p${page}-b`], next: page < 3 ? page + 1 : null }
  })

const paginated = Stream.paginateChunkEffect(null as number | null, (cursor) =>
  fetchPage(cursor).pipe(
    Effect.map(
      (p) => [Chunk.fromIterable(p.items), Option.fromNullable(p.next)] as const,
    ),
  ),
)

// ── 3. 20 items with mapEffect at concurrency 5. Compare to sequential. ──
const work = (n: number) => Effect.sleep("30 millis").pipe(Effect.as(n))
const concurrent = Stream.range(1, 20).pipe(
  // TODO: Stream.mapEffect(work, { concurrency: 5 })
  Stream.mapEffect(work),
  Stream.runCount,
)

// ── 4. Batch into groups of 7 and log each batch size. ──────────────────
const batched = Stream.range(1, 20).pipe(
  // TODO: Stream.grouped(7)
  Stream.mapEffect((batch) => Console.log(`   batch of ${Chunk.size(Chunk.of(batch))}`)),
  Stream.runDrain,
)

// ── 5. groupedWithin(100, "1 second") on a slow source. ─────────────────
// TODO

// ── 6. Make element 5 fail; first terminate, then skip instead. ─────────
class ItemFailed extends Data.TaggedError("ItemFailed")<{ readonly n: number }> {}
const risky = Stream.range(1, 10).pipe(
  Stream.mapEffect((n) =>
    n === 5 ? Effect.fail(new ItemFailed({ n })) : Effect.succeed(n),
  ),
  // TODO: Stream.catchTag("ItemFailed", () => Stream.empty)
  Stream.runCount,
)

const main = Effect.gen(function* () {
  yield* Console.log(`1. sum: ${yield* sum}`)
  yield* Console.log("2. paginated (take 3):")
  const first3 = yield* paginated.pipe(Stream.take(3), Stream.runCollect)
  yield* Console.log(`   ${Chunk.toArray(first3).join(", ")}`)
  const t = Date.now()
  yield* Console.log(`3. processed ${yield* concurrent} in ${Date.now() - t}ms`)
  yield* Console.log("4. batches:")
  yield* batched
  yield* Console.log(`6. survived: ${JSON.stringify(yield* Effect.either(risky))}`)
})

Effect.runPromise(main).catch(console.error)
