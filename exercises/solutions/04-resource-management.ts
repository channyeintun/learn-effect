/** Solution 04 — Resource Management */
import { Console, Effect } from "effect"

const timer = (label: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      console.log(`  ⬆ ${label} started`)
      return { label, start: Date.now() }
    }),
    (t) => Console.log(`  ⬇ ${t.label} ended after ${Date.now() - t.start}ms`),
  )

// Releases inner first, then outer — LIFO.
const two = Effect.scoped(
  Effect.gen(function* () {
    yield* timer("outer")
    yield* timer("inner")
    yield* Effect.sleep("20 millis")
    return "done"
  }),
)

const failing = Effect.scoped(
  Effect.gen(function* () {
    yield* timer("a")
    yield* timer("b")
    yield* Effect.fail("boom")
    return "unreachable"
  }),
)

// No Scope in the type — the lifetime is exactly this expression.
const oneShot = Effect.acquireUseRelease(
  Effect.sync(() => ({ start: Date.now() })),
  () => Console.log("  … using oneShot").pipe(Effect.as("used")),
  () => Console.log("  ⬇ oneShot released"),
)

class Session extends Effect.Service<Session>()("app/Session", {
  scoped: Effect.gen(function* () {
    yield* timer("session")
    return { id: "s_1" }
  }),
}) {}

const interruptible = Effect.race(
  Effect.sleep("1 second").pipe(
    Effect.onInterrupt(() => Console.log("  ⛔ loser cancelled")),
  ),
  Effect.sleep("30 millis"),
)

const main = Effect.gen(function* () {
  yield* Console.log("2. two resources:");    yield* two
  yield* Console.log("3. failing body:");     yield* Effect.either(failing)
  yield* Console.log("4. acquireUseRelease:"); yield* oneShot
  yield* Console.log("5. layer-scoped service:")
  yield* Effect.gen(function* () {
    const s = yield* Session
    yield* Console.log(`   session ${s.id}`)
  }).pipe(Effect.provide(Session.Default))
  yield* Console.log("6. race:");             yield* interruptible
})

Effect.runPromise(main).catch(console.error)
