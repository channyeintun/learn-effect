/** Solution 03 — Services & Layers */
import { Console, Context, Data, Effect, Layer, Ref } from "effect"

interface User { readonly id: string; readonly name: string }

class UserNotFound extends Data.TaggedError("UserNotFound")<{ readonly id: string }> {}

class Cache extends Effect.Service<Cache>()("app/Cache", {
  effect: Effect.gen(function* () {
    const store = yield* Ref.make(new Map<string, User>())
    return {
      get: (key: string) => Ref.get(store).pipe(Effect.map((m) => m.get(key))),
      set: (key: string, value: User) => Ref.update(store, (m) => new Map(m).set(key, value)),
    }
  }),
}) {}

class Users extends Context.Tag("app/Users")<
  Users,
  { readonly byId: (id: string) => Effect.Effect<User, UserNotFound> }
>() {}

// Effect<User, UserNotFound, Cache | Users>
const getUserCached = (id: string) =>
  Effect.gen(function* () {
    const cache = yield* Cache
    const users = yield* Users

    const hit = yield* cache.get(id)
    if (hit !== undefined) return hit

    const user = yield* users.byId(id)
    yield* cache.set(id, user)
    return user
  })

const UsersLive = Layer.succeed(Users, {
  byId: (id: string) => Effect.succeed({ id, name: `User ${id}` }),
})

const AppLive = Layer.mergeAll(Cache.Default, UsersLive)

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

  // Both calls share ONE Cache instance because the layer is memoized.
  yield* Effect.gen(function* () {
    yield* getUserCached("u_1")
    yield* getUserCached("u_1")
  }).pipe(Effect.provide(testLayer))

  yield* Console.log(`5. upstream called ${yield* Ref.get(calls)} time(s) — should be 1`)
})

Effect.runPromise(main).catch(console.error)
