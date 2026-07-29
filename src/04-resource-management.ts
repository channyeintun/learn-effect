/**
 * Lab 04 — Resource Management
 *
 *   npm run lab src/04-resource-management.ts
 */

import { Console, Data, Effect, Exit, Fiber, Scope } from "effect"

// A fake resource we can watch open and close.
let nextId = 1
const openConnection = (label: string) =>
  Effect.sync(() => {
    const id = nextId++
    console.log(`  ⬆ open  ${label}#${id}`)
    return {
      id,
      label,
      query: (sql: string) => Effect.succeed(`${label}#${id}: ${sql}`),
    }
  })

const closeConnection = (c: { label: string; id: number }) =>
  Effect.sync(() => console.log(`  ⬇ close ${c.label}#${c.id}`))

// ─────────────────────────────────────────────────────────────────────────────
// 1. acquireRelease — the core primitive
// ─────────────────────────────────────────────────────────────────────────────

// The release action is registered with the enclosing Scope the instant the
// acquire succeeds. Nothing can run between "acquired" and "registered":
// acquire is uninterruptible, so a resource can never leak in that window.
const connection = (label: string) =>
  Effect.acquireRelease(openConnection(label), closeConnection)
//  ^ Effect<Connection, never, Scope>   — the Scope requirement is the point

// `Effect.scoped` supplies a Scope and closes it when the effect finishes.
const useOnce = Effect.scoped(
  Effect.gen(function* () {
    const db = yield* connection("db")
    return yield* db.query("SELECT 1")
  }),
)
//  ^ Effect<string, never, never>   — Scope discharged

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cleanup happens on EVERY exit path
// ─────────────────────────────────────────────────────────────────────────────

class QueryFailed extends Data.TaggedError("QueryFailed")<{ readonly sql: string }> {}

const failsMidway = Effect.scoped(
  Effect.gen(function* () {
    yield* connection("will-fail")
    yield* Effect.fail(new QueryFailed({ sql: "SELECT boom" }))
    return "unreachable"
  }),
)

const diesMidway = Effect.scoped(
  Effect.gen(function* () {
    yield* connection("will-die")
    return yield* Effect.sync((): string => {
      throw new Error("defect!")
    })
  }),
)

const interruptedMidway = Effect.gen(function* () {
  const fiber = yield* Effect.fork(
    Effect.scoped(
      Effect.gen(function* () {
        yield* connection("will-interrupt")
        yield* Effect.sleep("10 seconds")
      }),
    ),
  )
  yield* Effect.sleep("20 millis")
  // Interrupting the fiber unwinds its scope, running every finalizer, and
  // `Fiber.interrupt` waits for that unwinding to finish before returning.
  yield* Fiber.interrupt(fiber)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Release order is LIFO
// ─────────────────────────────────────────────────────────────────────────────

const nested = Effect.scoped(
  Effect.gen(function* () {
    const a = yield* connection("first")
    const b = yield* connection("second")
    const c = yield* connection("third")
    return [a.id, b.id, c.id]
  }),
)
// closes third, second, first — the reverse of acquisition, so a resource is
// never released while something acquired later still depends on it.

// ─────────────────────────────────────────────────────────────────────────────
// 4. The other finalizer operators
// ─────────────────────────────────────────────────────────────────────────────

const finalizerVariants = Effect.scoped(
  Effect.gen(function* () {
    // addFinalizer — cleanup not tied to a specific acquired value.
    yield* Effect.addFinalizer((exit) =>
      Console.log(`  [addFinalizer] scope closing, exit=${exit._tag}`),
    )

    // ensuring — runs on any completion, no Scope needed.
    yield* Console.log("  working").pipe(
      Effect.ensuring(Console.log("  [ensuring] always runs")),
    )

    // onExit — same, but you get the Exit.
    yield* Effect.succeed(1).pipe(
      Effect.onExit((exit) => Console.log(`  [onExit] ${exit._tag}`)),
    )

    // onInterrupt — only when cancelled. Ideal for "abandon in-flight work".
    yield* Effect.succeed(1).pipe(
      Effect.onInterrupt(() => Console.log("  [onInterrupt] never fires here")),
    )
  }),
)

// ─────────────────────────────────────────────────────────────────────────────
// 5. Manual scopes — when the lifetime isn't lexical
// ─────────────────────────────────────────────────────────────────────────────

const manualScope = Effect.gen(function* () {
  const scope = yield* Scope.make()

  const db = yield* Scope.extend(connection("manual"), scope)
  yield* Console.log(`  using ${yield* db.query("SELECT 2")}`)

  // You decide when it closes — and with what Exit.
  yield* Scope.close(scope, Exit.void)
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Layer.scoped — resources that live as long as the application
// ─────────────────────────────────────────────────────────────────────────────

class Database extends Effect.Service<Database>()("app/Database", {
  scoped: Effect.gen(function* () {
    const conn = yield* connection("app-db")
    return { query: conn.query }
  }),
}) {}

// The connection opens when the layer is built and closes when the runtime
// shuts down. No shutdown hook to remember, no leak on crash.
const layerDemo = Effect.gen(function* () {
  const db = yield* Database
  yield* Console.log(`  ${yield* db.query("SELECT 3")}`)
}).pipe(Effect.provide(Database.Default))

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const main = Effect.gen(function* () {
  yield* Console.log("── 1. happy path ──")
  yield* Console.log(`  ${yield* useOnce}`)

  yield* Console.log("\n── 2a. cleanup on typed failure ──")
  yield* Effect.either(failsMidway)

  yield* Console.log("\n── 2b. cleanup on defect ──")
  yield* Effect.exit(diesMidway)

  yield* Console.log("\n── 2c. cleanup on interruption ──")
  yield* interruptedMidway

  yield* Console.log("\n── 3. LIFO release order ──")
  yield* nested

  yield* Console.log("\n── 4. finalizer operators ──")
  yield* finalizerVariants

  yield* Console.log("\n── 5. manual scope ──")
  yield* manualScope

  yield* Console.log("\n── 6. Layer.scoped ──")
  yield* layerDemo
})

Effect.runPromise(main).catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})
