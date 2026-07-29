/**
 * Exercise 04 — Resource Management
 *
 *   npm run lab exercises/04-resource-management.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/04-resource-management.ts
 */

import { Console, Effect } from "effect"

// ── 1. A timer resource that logs elapsed time on release. ────────────────
const timer = (label: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      console.log(`  ⬆ ${label} started`)
      return { label, start: Date.now() }
    }),
    // TODO: log `${label} ended after Nms`
    () => Effect.void,
  )

// ── 2. Acquire TWO resources in one scope. Predict the release order. ─────
const two = Effect.scoped(
  Effect.gen(function* () {
    yield* timer("outer")
    yield* timer("inner")
    yield* Effect.sleep("20 millis")
    return "done"
  }),
)

// ── 3. Make the body fail. Confirm both still release. ────────────────────
const failing = Effect.scoped(
  Effect.gen(function* () {
    yield* timer("a")
    yield* timer("b")
    // TODO: yield* Effect.fail("boom")
    return "unreachable"
  }),
)

// ── 4. Rewrite one with acquireUseRelease — Scope leaves the type. ────────
const oneShot = Effect.acquireUseRelease(
  Effect.sync(() => ({ start: Date.now() })),
  // TODO: use it
  () => Effect.succeed("used"),
  () => Console.log("  ⬇ oneShot released"),
)

// ── 5. Wrap the resource in a Layer.scoped service. ───────────────────────
class Session extends Effect.Service<Session>()("app/Session", {
  scoped: Effect.gen(function* () {
    yield* timer("session")
    return { id: "s_1" }
  }),
}) {}

// ── 6. Add an onInterrupt and trigger it by racing against a sleep. ───────
const interruptible = Effect.race(
  Effect.sleep("1 second").pipe(
    // TODO: Effect.onInterrupt(() => Console.log("  ⛔ loser cancelled"))
  ),
  Effect.sleep("30 millis"),
)

const main = Effect.gen(function* () {
  yield* Console.log("2. two resources:")
  yield* two
  yield* Console.log("3. failing body:")
  yield* Effect.either(failing)
  yield* Console.log("4. acquireUseRelease:")
  yield* oneShot
  yield* Console.log("5. layer-scoped service:")
  yield* Effect.gen(function* () {
    const s = yield* Session
    yield* Console.log(`   session ${s.id}`)
  }).pipe(Effect.provide(Session.Default))
  yield* Console.log("6. race:")
  yield* interruptible
})

Effect.runPromise(main).catch(console.error)
