# Module 7 — Streams

> **Lab:** `npm run lab src/07-streams.ts`
> **Time:** ~60 minutes · **Prerequisites:** [Modules 1–6](./01-core-concepts.md)

---

## When you need a Stream

`Effect<A, E, R>` produces **one** value. `Stream<A, E, R>` produces **zero or more, over time**.

Use a Stream when any of these is true:

- The data doesn't fit in memory (a 4 GB CSV, a table with 50M rows).
- The data has no end (a WebSocket, a Kafka topic, a file tail).
- Elements arrive over time and you want to process them as they do.
- You need **backpressure** — a fast producer must not overwhelm a slow consumer.

Use `Effect.forEach` when the collection is in memory and bounded. It's simpler, and simpler is better.

| | `Effect.forEach` | `Stream` |
|---|---|---|
| Input | An array you already have | A source of unknown/unbounded size |
| Memory | Holds everything | Constant, element by element |
| Backpressure | N/A | Built in |
| Batching / windowing | Manual | `grouped`, `groupedWithin` |
| Early termination | Awkward | `take`, `takeWhile` — and the source stops producing |

---

## The idea that makes streams work: pull-based

Effect streams are **pull-based**. The consumer asks for the next element; the producer only produces when asked.

```typescript
const naturals = Stream.iterate(0, (n) => n + 1)   // infinite

naturals.pipe(
  Stream.tap((n) => log(`produced ${n}`)),
  Stream.take(5),
  Stream.tap(() => Effect.sleep("30 millis")),     // slow consumer
  Stream.runDrain,
)
```

The lab output:

```
[   4ms]   produced 0
[  37ms]   produced 1
[  69ms]   produced 2
[ 102ms]   produced 3
[ 134ms]   produced 4
```

An **infinite** producer produced exactly five elements, one every 30ms — pacing itself to the consumer. Nothing buffered, nothing overflowed, and nobody wrote any flow-control code.

This is what "backpressure" means concretely, and it's why a stream over a 4 GB file uses constant memory while `fs.readFile` + `.map()` uses 4 GB.

> Under the hood, streams move **chunks** (`Chunk<A>`), not single elements, so pull-based doesn't mean slow. `Stream.rechunk` tunes the chunk size when it matters.

---

## Creating streams

```typescript
Stream.make(1, 2, 3)                    // from values
Stream.fromIterable(array)              // from anything iterable
Stream.range(1, 100)                    // an inclusive range
Stream.fromEffect(effect)               // exactly one element
Stream.iterate(0, (n) => n + 1)         // unfold, infinite
Stream.repeatEffect(pollOnce)           // re-run an effect forever
Stream.fromAsyncIterable(asyncIter, onError)
Stream.async<A>((emit) => { … })        // bridge a callback/event API
```

### The one you'll actually need: paginated APIs

Almost every real integration is a cursor loop. Expressing it as a stream means callers see a flat sequence of items and never think about pages:

```typescript
const allItems = Stream.paginateChunkEffect(null as string | null, (cursor) =>
  fetchPage(cursor).pipe(
    Effect.map((page) => [
      Chunk.fromIterable(page.items),
      Option.fromNullable(page.nextCursor),   // None ends the stream
    ] as const),
  ),
)
```

And because it's lazy, this is genuinely efficient:

```typescript
yield* allItems.pipe(Stream.take(5), Stream.runCollect)
// fetched page 0
// fetched page 1
// fetched page 2
// ← page 3 was NEVER requested
```

`take(5)` stopped pulling, so the HTTP call for page 3 never happened. That falls out of the design; you didn't optimise anything.

---

## Transforming

```typescript
Stream.range(1, 10).pipe(
  Stream.filter((n) => n % 2 === 0),
  Stream.map((n) => n * 10),
  Stream.takeWhile((n) => n < 100),
  Stream.scan(0, (total, n) => total + n),   // emits a running total
)
```

| Operator | Does |
|---|---|
| `map` / `mapEffect` | Transform each element (the latter effectfully) |
| `filter` / `filterEffect` | Keep matching elements |
| `take` / `drop` / `takeWhile` / `dropWhile` | Slice the stream |
| `scan` | Emit every intermediate accumulation |
| `flatMap` | Replace each element with a sub-stream |
| `zip` / `zipWith` | Pair with another stream |
| `merge` | Interleave, as elements arrive |
| `concat` | One stream fully, then the next |
| `tap` | Observe without changing |
| `changes` | Drop consecutive duplicates |
| `throttle` | Rate-limit |
| `debounce` | Emit only after quiet time |

---

## Concurrency inside a pipeline

```typescript
Stream.range(1, 8).pipe(
  Stream.mapEffect(enrich, { concurrency: 4 }),
  Stream.runCollect,
)
// ~100ms instead of ~400ms, and still bounded at 4 in flight
```

You keep the pipeline shape *and* get bounded parallelism. The same `concurrency` option is on `filterEffect`, `flatMap`, `tap`, and friends. `{ unordered: true }` lets results emit as they finish rather than in input order.

---

## Batching: the reason to reach for streams in ETL

Inserting 10,000 rows one at a time is 10,000 round trips. Streams make batching a one-liner:

```typescript
Stream.grouped(500)              // fixed-size batches
Stream.groupedWithin(500, "5 seconds")   // …or flush after 5s, whichever first
```

`groupedWithin` is the one you want for anything event-driven. With plain `grouped`, a trickle of events sits in a half-full buffer indefinitely; the timeout guarantees a bound on latency:

```
flushed 2 (timeout-triggered)
flushed 2 (timeout-triggered)
flushed 1 (timeout-triggered)
```

The canonical ETL shape:

```typescript
const pipeline = source.pipe(
  Stream.map(normalize),
  Stream.filter(isValid),
  Stream.mapEffect(enrich, { concurrency: 10 }),
  Stream.groupedWithin(500, "5 seconds"),
  Stream.mapEffect(insertBatch),
  Stream.runDrain,      // ← constant memory over any input size
)
```

---

## Errors

A failure **terminates** the stream by default. That's usually right — but decide explicitly:

```typescript
Stream.catchTag("ItemFailed", (e) => fallbackStream)   // substitute a stream
Stream.catchAll((e) => Stream.empty)                   // stop quietly
Stream.retry(Schedule.exponential("1 second"))         // restart the source
Stream.either                                          // Stream<Either<A, E>, never>
```

To skip bad elements and keep going, handle the error **per element** rather than on the stream:

```typescript
Stream.mapEffect((item) =>
  process(item).pipe(Effect.catchAll((e) => Effect.logWarning(e).pipe(Effect.as(null)))),
).pipe(Stream.filter((x) => x !== null))
```

---

## Consuming

A stream does nothing until you run it:

| Runner | Gives |
|---|---|
| `Stream.runDrain` | `Effect<void>` — run for side effects, keep nothing |
| `Stream.runCollect` | `Effect<Chunk<A>>` — **only for bounded streams** |
| `Stream.runFold(z, f)` | `Effect<Z>` — reduce |
| `Stream.runHead` / `runLast` | `Effect<Option<A>>` |
| `Stream.runCount` | `Effect<number>` |
| `Stream.run(sink)` | `Effect<Z>` — a composable `Sink` |
| `Stream.toReadableStream` | A web `ReadableStream` |

> `runCollect` on an unbounded stream is how you OOM a production process. Default to `runDrain`.

---

## Resources in streams

Streams integrate with [Scope](./04-resource-management.md), so a source can own a resource for exactly as long as the stream is consumed:

```typescript
const lines = Stream.acquireRelease(openFile(path), (f) => f.close).pipe(
  Stream.flatMap((file) => file.lineStream),
)
// the file closes when the stream ends, fails, or is interrupted
```

---

## Pitfalls

### 1. `runCollect` on something unbounded

The single most common way to hurt yourself. `runDrain` unless you know the size.

### 2. Reaching for streams too early

An array of 200 IDs does not need a stream. `Effect.forEach(ids, f, { concurrency: 10 })` is clearer and does the same job.

### 3. Losing backpressure with an unbounded buffer

```typescript
Stream.buffer({ capacity: "unbounded" })   // ❌ this is just a memory leak with a queue
```

Buffers smooth out jitter; unbounded buffers defeat the entire point.

### 4. Forgetting a stream is lazy

Building a pipeline and never running it produces no error and no output — the same class of bug as forgetting `yield*`.

### 5. Not tuning chunk size for tiny elements

Per-element overhead dominates when elements are cheap. `Stream.rechunk(4096)` can be a large win in byte- or line-level pipelines.

---

## Practice

Work in [`exercises/07-streams.ts`](../exercises/07-streams.ts).

1. Stream 1–100, keep evens, double them, sum with `runFold`.
2. Turn a fake paginated API into a stream; `take(3)` and prove later pages aren't fetched.
3. Process 20 items with `mapEffect` at `concurrency: 5`; compare timings against sequential.
4. Batch a stream into groups of 7 and log each batch size.
5. Use `groupedWithin(100, "1 second")` on a slow source and watch the timeout flush.
6. Make element 5 fail; first let it terminate the stream, then make it skip instead.

---

## Self-check

- [ ] What does "pull-based" mean, and how does it produce backpressure?
- [ ] Give two situations where `Effect.forEach` is the better choice than a Stream.
- [ ] Why is `groupedWithin` usually better than `grouped` for event pipelines?
- [ ] When is `runCollect` dangerous?
- [ ] How do you skip a failing element instead of terminating the stream?
- [ ] Why did `take(5)` prevent the fourth page from being fetched?

---

**← Previous:** [Scheduling](./06-scheduling.md) | **Next →** [Schema](./08-schema.md)
