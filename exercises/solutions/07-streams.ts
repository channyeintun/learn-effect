/** Solution 07 — Streams */
import { Chunk, Console, Data, Effect, Option, Schedule, Stream } from "effect"

const sum = Stream.range(1, 100).pipe(
  Stream.filter((n) => n % 2 === 0),
  Stream.map((n) => n * 2),
  Stream.runFold(0, (a, b) => a + b),
)

const fetchPage = (cursor: number | null) =>
  Effect.gen(function* () {
    const page = cursor ?? 0
    yield* Console.log(`   fetched page ${page}`)
    return { items: [`p${page}-a`, `p${page}-b`], next: page < 3 ? page + 1 : null }
  })

const paginated = Stream.paginateChunkEffect(null as number | null, (cursor) =>
  fetchPage(cursor).pipe(
    Effect.map((p) => [Chunk.fromIterable(p.items), Option.fromNullable(p.next)] as const),
  ),
)

const work = (n: number) => Effect.sleep("30 millis").pipe(Effect.as(n))

const concurrent = Stream.range(1, 20).pipe(
  Stream.mapEffect(work, { concurrency: 5 }),
  Stream.runCount,
)

const batched = Stream.range(1, 20).pipe(
  Stream.grouped(7),
  Stream.mapEffect((batch) => Console.log(`   batch of ${Chunk.size(batch)}`)),
  Stream.runDrain,
)

// A slow source: the timeout fires before a full batch of 100 accumulates.
const timedBatches = Stream.range(1, 5).pipe(
  Stream.schedule(Schedule.spaced("20 millis")),
  Stream.groupedWithin(100, "50 millis"),
  Stream.mapEffect((b) => Console.log(`   flushed ${Chunk.size(b)} on timeout`)),
  Stream.runDrain,
)

class ItemFailed extends Data.TaggedError("ItemFailed")<{ readonly n: number }> {}

const terminates = Stream.range(1, 10).pipe(
  Stream.mapEffect((n): Effect.Effect<number, ItemFailed> =>
    n === 5 ? Effect.fail(new ItemFailed({ n })) : Effect.succeed(n),
  ),
  Stream.runCount,
)

// Handling per element keeps the stream alive and skips only the bad one.
const process = (n: number): Effect.Effect<number, ItemFailed> =>
  n === 5 ? Effect.fail(new ItemFailed({ n })) : Effect.succeed(n)

const skips = Stream.range(1, 10).pipe(
  Stream.mapEffect((n) =>
    process(n).pipe(
      Effect.catchTag("ItemFailed", () => Effect.succeed(null)),
    ),
  ),
  Stream.filter((n): n is number => n !== null),
  Stream.runCount,
)

const main = Effect.gen(function* () {
  yield* Console.log(`1. sum: ${yield* sum}`)
  yield* Console.log("2. paginated (take 3) — page 2 is never fetched:")
  const first3 = yield* paginated.pipe(Stream.take(3), Stream.runCollect)
  yield* Console.log(`   ${Chunk.toArray(first3).join(", ")}`)

  const t = Date.now()
  yield* Console.log(`3. ${yield* concurrent} items in ${Date.now() - t}ms (~120ms, not 600ms)`)

  yield* Console.log("4. batches:");      yield* batched
  yield* Console.log("5. timed batches:"); yield* timedBatches
  yield* Console.log(`6a. terminates: ${(yield* Effect.either(terminates))._tag}`)
  yield* Console.log(`6b. skips:      ${yield* skips} items survived`)
})

Effect.runPromise(main).catch(console.error)
