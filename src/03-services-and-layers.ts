/**
 * Lab 03 — Services & Layers
 *
 *   npm run lab src/03-services-and-layers.ts
 */

import { Console, Context, Data, Effect, Layer, Ref } from "effect"

// ─────────────────────────────────────────────────────────────────────────────
// 1. The primitive: Context.Tag
// ─────────────────────────────────────────────────────────────────────────────

// A Tag is a type-safe key into a Context (a typed map of services).
// The string is only for debugging and must be unique across your app —
// prefix it with your package name to avoid collisions.
class Clock extends Context.Tag("app/Clock")<
  Clock,
  { readonly now: Effect.Effect<number> }
>() {}

// Requiring a service: `yield*` the Tag. It lands in the R channel.
const stamp = Effect.gen(function* () {
  const clock = yield* Clock
  return `at ${yield* clock.now}`
})
//  ^ Effect<string, never, Clock>   — not runnable until Clock is provided

// ─────────────────────────────────────────────────────────────────────────────
// 2. The ergonomic default: Effect.Service
// ─────────────────────────────────────────────────────────────────────────────

class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly key: string
}> {}

// Effect.Service declares the Tag, the implementation, and the Layer in one go.
class AppConfig extends Effect.Service<AppConfig>()("app/AppConfig", {
  sync: () => ({
    greeting: "Hello",
    retries: 3,
    require: (key: string) =>
      key === "known"
        ? Effect.succeed("value")
        : Effect.fail(new ConfigError({ key })),
  }),
}) {}
// Gives you: the tag `AppConfig`, and `AppConfig.Default` (a Layer).

// A service that depends on another service. Note `dependencies` — the
// generated `AppConfig.Default` is baked into `Logger.Default`, so callers
// never have to know Logger needs a config.
class Logger extends Effect.Service<Logger>()("app/Logger", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    return {
      info: (message: string) => Console.log(`${config.greeting} [info] ${message}`),
    }
  }),
  dependencies: [AppConfig.Default],
  accessors: true, // lets you call `Logger.info(...)` without yielding the tag
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// 3. A stateful service, and why `effect:` is lazy per-layer-build
// ─────────────────────────────────────────────────────────────────────────────

class Metrics extends Effect.Service<Metrics>()("app/Metrics", {
  effect: Effect.gen(function* () {
    // This runs ONCE per layer construction, not once per use.
    const counts = yield* Ref.make(new Map<string, number>())
    return {
      increment: (name: string) =>
        Ref.update(counts, (m) => new Map(m).set(name, (m.get(name) ?? 0) + 1)),
      snapshot: Ref.get(counts),
    }
  }),
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Business logic depends on interfaces, never on implementations
// ─────────────────────────────────────────────────────────────────────────────

interface User {
  readonly id: string
  readonly name: string
}

class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly id: string
}> {}

class Users extends Context.Tag("app/Users")<
  Users,
  { readonly byId: (id: string) => Effect.Effect<User, UserNotFound> }
>() {}

// Pure domain logic. Its type documents exactly what it touches.
const describeUser = (id: string) =>
  Effect.gen(function* () {
    const users = yield* Users
    const metrics = yield* Metrics

    yield* metrics.increment("describeUser")
    const user = yield* users.byId(id)
    yield* Logger.info(`resolved ${user.name}`)

    return `${user.name} (${user.id})`
  })
//  ^ Effect<string, UserNotFound, Users | Metrics | Logger>

// ─────────────────────────────────────────────────────────────────────────────
// 5. Layers: constructors for services
// ─────────────────────────────────────────────────────────────────────────────

// Layer<ROut, E, RIn>  —  "builds ROut, may fail with E, needs RIn"

// Layer.succeed — a value that is already available.
const ClockLive = Layer.succeed(Clock, { now: Effect.sync(() => Date.now()) })

// Layer.effect — construction that itself needs effects or other services.
const UsersInMemory = Layer.effect(
  Users,
  Effect.gen(function* () {
    const logger = yield* Logger
    const table = new Map<string, User>([
      ["u_1", { id: "u_1", name: "Ada Lovelace" }],
      ["u_2", { id: "u_2", name: "Grace Hopper" }],
    ])

    yield* logger.info(`seeded ${table.size} users`)

    return {
      byId: (id: string) => {
        const found = table.get(id)
        return found ? Effect.succeed(found) : Effect.fail(new UserNotFound({ id }))
      },
    }
  }),
)
//  ^ Layer<Users, never, Logger>   — the requirement is tracked

// Layer.scoped — for services that own a resource. See Module 4.
const _ClockScoped = Layer.scoped(
  Clock,
  Effect.acquireRelease(
    Console.log("  [clock] opened").pipe(Effect.as({ now: Effect.succeed(0) })),
    () => Console.log("  [clock] closed"),
  ),
)

// ─────────────────────────────────────────────────────────────────────────────
// 6. Wiring: provide vs provideMerge vs merge
// ─────────────────────────────────────────────────────────────────────────────

// `Layer.provide(inner, outer)` — outer satisfies inner's requirements and is
// then HIDDEN. `Layer.provideMerge` does the same but keeps outer visible too.
const AppLayer = Layer.mergeAll(
  UsersInMemory.pipe(Layer.provide(Logger.Default)),
  Metrics.Default,
  Logger.Default,
  ClockLive,
)
//  ^ Layer<Users | Metrics | Logger | Clock, never, never>  — fully closed

// ─────────────────────────────────────────────────────────────────────────────
// 7. Memoization: one instance per layer graph
// ─────────────────────────────────────────────────────────────────────────────

// `Logger.Default` appears twice above, but it is built ONCE: layers are
// memoized by reference within a single build. That is why the "seeded 2 users"
// message and the counters below share one Metrics instance.

// ─────────────────────────────────────────────────────────────────────────────
// 8. Testing: swap the layer, keep the logic
// ─────────────────────────────────────────────────────────────────────────────

const UsersAlwaysMissing = Layer.succeed(Users, {
  byId: (id: string) => Effect.fail(new UserNotFound({ id })),
})

const TestLayer = Layer.mergeAll(
  UsersAlwaysMissing,
  Metrics.Default,
  Logger.Default,
  ClockLive,
)

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const program = Effect.gen(function* () {
  yield* Console.log("── production wiring ──")
  yield* Console.log(yield* describeUser("u_1"))
  yield* Console.log(yield* describeUser("u_2"))

  const missing = yield* Effect.either(describeUser("u_404"))
  yield* Console.log(
    missing._tag === "Left" ? `expected failure: ${missing.left._tag}` : "unexpected",
  )

  const metrics = yield* Metrics
  yield* Console.log(`metrics: ${JSON.stringify([...(yield* metrics.snapshot)])}`)

  yield* Console.log(`\nstamp: ${yield* stamp}`)
})

const testProgram = Effect.gen(function* () {
  yield* Console.log("\n── test wiring (same logic, different layer) ──")
  const result = yield* Effect.either(describeUser("u_1"))
  yield* Console.log(
    result._tag === "Left" ? `stub always fails: ${result.left._tag}` : "unexpected",
  )
})

const main = Effect.gen(function* () {
  yield* program.pipe(Effect.provide(AppLayer))
  yield* testProgram.pipe(Effect.provide(TestLayer))
})

Effect.runPromise(main).catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})
