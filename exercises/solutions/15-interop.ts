/** Solution 15 — Interop & Incremental Adoption */
import { Cause, Data, Effect, Exit, Layer, ManagedRuntime, Ref } from "effect"

class ApiError extends Data.TaggedError("ApiError")<{ readonly cause: unknown }> {}

const legacy = async (id: string) => {
  if (id === "bad") throw new Error("legacy failed")
  return { id }
}

const wrapped = (id: string) =>
  Effect.tryPromise({
    try: () => legacy(id),
    catch: (cause) => new ApiError({ cause }),
  })

const callbackApi = (input: string, cb: (e: Error | null, v?: string) => void) =>
  setTimeout(() => (input === "bad" ? cb(new Error("nope")) : cb(null, input.toUpperCase())), 5)

const fromCallback = (input: string): Effect.Effect<string, ApiError> =>
  Effect.async<string, ApiError>((resume) => {
    callbackApi(input, (err, value) =>
      resume(err ? Effect.fail(new ApiError({ cause: err })) : Effect.succeed(value!)),
    )
  })

class Counter extends Effect.Service<Counter>()("app/Counter", {
  // `scoped:` (not `effect:`) because we register a finalizer.
  scoped: Effect.gen(function* () {
    const ref = yield* Ref.make(0)
    yield* Effect.addFinalizer(() => Effect.sync(() => console.log("   [finalizer] counter closed")))
    return { bump: Ref.updateAndGet(ref, (n) => n + 1) }
  }),
}) {}

// Built ONCE at module scope — both handlers share the same Counter instance.
const runtime = ManagedRuntime.make(Layer.mergeAll(Counter.Default))

const handlerA = async () => runtime.runPromise(Effect.flatMap(Counter, (c) => c.bump))
const handlerB = async () => runtime.runPromise(Effect.flatMap(Counter, (c) => c.bump))

// Keeps defects, interruption and parallel failures that String(e) would drop.
const boundary = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) return exit.value
    throw new Error(Cause.pretty(exit.cause))
  })

const main = async () => {
  console.log(`1. ok:   ${JSON.stringify(await Effect.runPromise(wrapped("u_1")))}`)
  const bad = await Effect.runPromise(Effect.either(wrapped("bad")))
  console.log(`1. bad:  ${bad._tag === "Left" ? bad.left._tag : "?"}`)
  console.log(`2. cb:   ${await Effect.runPromise(fromCallback("hello"))}`)
  console.log(`3. shared instance: ${await handlerA()} then ${await handlerB()} (want 1 then 2)`)
  await boundary(Effect.sync((): string => { throw new Error("defect") })).catch((e: Error) =>
    console.log(`4. caught: ${e.message.split("\n")[0]}`),
  )
  await runtime.dispose()
  console.log("6. disposed")
}

main().catch(console.error)
