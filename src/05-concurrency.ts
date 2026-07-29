/**
 * Lab 05 — Concurrency & Fibers
 *
 *   npm run lab src/05-concurrency.ts
 *
 * Watch the timings. They are the lesson.
 */

import { Console, Data, Effect, Fiber, Duration } from "effect"

const start = Date.now()
const at = () => `${String(Date.now() - start).padStart(4, " ")}ms`
const log = (message: string) => Console.log(`[${at()}] ${message}`)

// A task that takes a known amount of time.
const task = (name: string, millis: number) =>
  Effect.gen(function* () {
    yield* log(`  ${name} started`)
    yield* Effect.sleep(Duration.millis(millis))
    yield* log(`  ${name} finished`)
    return name
  })

// ─────────────────────────────────────────────────────────────────────────────
// 1. Sequential is the default — and that is deliberate
// ─────────────────────────────────────────────────────────────────────────────

// Concurrency is opt-in, so you never get accidental parallelism.
const sequential = Effect.all([task("a", 100), task("b", 100), task("c", 100)])
// ≈300ms

// ─────────────────────────────────────────────────────────────────────────────
// 2. Opting in to concurrency
// ─────────────────────────────────────────────────────────────────────────────

const unbounded = Effect.all([task("x", 100), task("y", 100), task("z", 100)], {
  concurrency: "unbounded",
})
// ≈100ms

// A number is the important option in production: it bounds how much load you
// put on the thing you're calling. "unbounded" over 10k items is a DoS on your
// own database.
const bounded = Effect.all(
  [task("p", 60), task("q", 60), task("r", 60), task("s", 60)],
  { concurrency: 2 },
)
// ≈120ms — two at a time

// ─────────────────────────────────────────────────────────────────────────────
// 3. Fibers: fork / join / interrupt
// ─────────────────────────────────────────────────────────────────────────────

const forkJoin = Effect.gen(function* () {
  // fork returns immediately with a handle; the task runs concurrently.
  const fiber = yield* Effect.fork(task("background", 150))

  yield* log("  main is free to do other work")
  yield* Effect.sleep("50 millis")
  yield* log("  main did some work")

  // join waits for the result and re-raises its failure into this fiber.
  const result = yield* Fiber.join(fiber)
  yield* log(`  joined: ${result}`)
})

const forkInterrupt = Effect.gen(function* () {
  const fiber = yield* Effect.fork(task("doomed", 10_000))
  yield* Effect.sleep("50 millis")
  yield* log("  interrupting…")
  // Interrupt is graceful: it unwinds the fiber, running every finalizer, and
  // waits for that unwinding to complete.
  yield* Fiber.interrupt(fiber)
  yield* log("  interrupted, and cleanup is already done")
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Racing — the loser is interrupted, not abandoned
// ─────────────────────────────────────────────────────────────────────────────

const raced = Effect.race(task("fast", 50), task("slow", 5_000))
// Note the output: "slow finished" never prints. The loser is actually
// cancelled, so an HTTP request behind it is aborted rather than left running.

// ─────────────────────────────────────────────────────────────────────────────
// 5. Structured concurrency: children cannot outlive their parent
// ─────────────────────────────────────────────────────────────────────────────

const withCleanup = (name: string, millis: number) =>
  task(name, millis).pipe(
    Effect.onInterrupt(() => log(`  ${name} was interrupted and cleaned up`)),
  )

const structured = Effect.gen(function* () {
  // `forkScoped` ties the child's lifetime to the enclosing scope.
  yield* Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.forkScoped(withCleanup("scoped-child", 5_000))
      yield* Effect.sleep("50 millis")
      yield* log("  scope is closing…")
    }),
  )
  yield* log("  scope closed — the child above was interrupted, not leaked")

  // Interrupting a parent interrupts everything it forked, recursively.
  const parent = yield* Effect.fork(
    Effect.gen(function* () {
      yield* Effect.fork(withCleanup("grandchild", 5_000))
      yield* Effect.sleep("5 seconds")
    }),
  )
  yield* Effect.sleep("50 millis")
  yield* Fiber.interrupt(parent)
  yield* log("  parent interrupted — its grandchild went with it")
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Failure semantics under concurrency
// ─────────────────────────────────────────────────────────────────────────────

class Boom extends Data.TaggedError("Boom")<{ readonly which: string }> {}

const failFast = Effect.all(
  [
    task("survivor", 5_000),
    Effect.sleep("50 millis").pipe(Effect.andThen(Effect.fail(new Boom({ which: "b" })))),
  ],
  { concurrency: "unbounded" },
)
// The first failure interrupts its siblings. `survivor` is cancelled at ~50ms
// rather than running for 5 seconds.

// ─────────────────────────────────────────────────────────────────────────────
// 7. forEach — the workhorse
// ─────────────────────────────────────────────────────────────────────────────

const ids = [1, 2, 3, 4, 5, 6]

const mapped = Effect.forEach(ids, (id) => task(`item-${id}`, 40), {
  concurrency: 3,
})

// discard: true avoids building the result array — matters for large inputs.
const _fireAndCollectNothing = Effect.forEach(ids, (id) => Effect.void, {
  concurrency: "unbounded",
  discard: true,
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Timeouts
// ─────────────────────────────────────────────────────────────────────────────

// `Effect.timeout` adds TimeoutException to the ERROR channel (it does not
// return an Option — that is `timeoutOption`).
const willTimeout = Effect.timeout(task("sluggish", 5_000), "80 millis")
//  ^ Effect<string, TimeoutException>

const timeoutAsOption = Effect.timeoutOption(task("sluggish2", 5_000), "80 millis")
//  ^ Effect<Option<string>, never>

const timeoutAsDomainError = Effect.timeoutFail(task("sluggish3", 5_000), {
  duration: "80 millis",
  onTimeout: () => new Boom({ which: "timeout" }),
})

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const main = Effect.gen(function* () {
  yield* log("── 1. sequential (expect ~300ms) ──")
  yield* sequential

  yield* log("\n── 2a. unbounded (expect ~100ms) ──")
  yield* unbounded

  yield* log("\n── 2b. concurrency: 2 (expect ~120ms) ──")
  yield* bounded

  yield* log("\n── 3a. fork + join ──")
  yield* forkJoin

  yield* log("\n── 3b. fork + interrupt ──")
  yield* forkInterrupt

  yield* log("\n── 4. race (loser is interrupted) ──")
  yield* log(`  winner: ${yield* raced}`)

  yield* log("\n── 5. structured concurrency ──")
  yield* structured

  yield* log("\n── 6. fail-fast interrupts siblings ──")
  yield* Effect.either(failFast)

  yield* log("\n── 7. forEach with concurrency: 3 ──")
  yield* log(`  got ${(yield* mapped).length} results`)

  yield* log("\n── 8. timeouts ──")
  const t1 = yield* Effect.either(willTimeout)
  yield* log(`  timeout      → ${t1._tag === "Left" ? t1.left._tag : "ok"}`)
  const t2 = yield* timeoutAsOption
  yield* log(`  timeoutOption→ ${t2._tag}`)
  const t3 = yield* Effect.either(timeoutAsDomainError)
  yield* log(`  timeoutFail  → ${t3._tag === "Left" ? t3.left.which : "ok"}`)
})

Effect.runPromise(main).catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})
