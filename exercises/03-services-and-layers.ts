/**
 * Exercise 03 — Services & Layers
 *
 *   npm run lab exercises/03-services-and-layers.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/03-services-and-layers.ts
 */

import { Console, Context, Data, Effect, Layer, Ref } from "effect"

interface User { readonly id: string; readonly name: string }

class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly id: string
}> {}

// ── 1. A Cache service built with Effect.Service and a Ref. ────────────────
class Cache extends Effect.Service<Cache>()("app/Cache", {
  effect: Effect.gen(function* () {
    const store = yield* Ref.make(new Map<string, User>())
    return {
      // TODO: implement get (returns User | undefined) and set
      get: (_key: string) => Effect.succeed(undefined as User | undefined),
      set: (_key: string, _value: User) => Effect.void,
    }
  }),
}) {}

// ── 2. Users as a Context.Tag (two implementations will exist). ────────────
class Users extends Context.Tag("app/Users")<
  Users,
  { readonly byId: (id: string) => Effect.Effect<User, UserNotFound> }
>() {}

// ── 3. Check the cache, fall back to Users, store the result. ─────────────
//      What is the inferred R of this function?
const getUserCached = (id: string) =>
  Effect.gen(function* () {
    const cache = yield* Cache
    const users = yield* Users
    // TODO: cache lookup, fall back to users.byId, then cache.set
    return yield* users.byId(id)
  })

// ── 4. A live layer wiring both together. ─────────────────────────────────
const UsersLive = Layer.succeed(Users, {
  byId: (id: string) => Effect.succeed({ id, name: `User ${id}` }),
})

const AppLive = Layer.mergeAll(Cache.Default, UsersLive)

// ── 5. A test layer that counts calls; prove the cache prevents the 2nd. ──
const makeCountingLayer = Effect.gen(function* () {
  const calls = yield* Ref.make(0)
  const layer = Layer.succeed(Users, {
    byId: (id: string) =>
      Ref.update(calls, (n) => n + 1).pipe(Effect.as({ id, name: "counted" })),
  })
  return { calls, layer }
})

const main = Effect.gen(function* () {
  yield* Console.log(`4. ${JSON.stringify(yield* getUserCached("u_1").pipe(Effect.provide(AppLive)))}`)

  const { calls, layer } = yield* makeCountingLayer
  const testLayer = Layer.mergeAll(Cache.Default, layer)
  yield* Effect.gen(function* () {
    yield* getUserCached("u_1")
    yield* getUserCached("u_1")
  }).pipe(Effect.provide(testLayer))

  yield* Console.log(`5. upstream called ${yield* Ref.get(calls)} time(s) — should be 1`)
})

Effect.runPromise(main).catch(console.error)
