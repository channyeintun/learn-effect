/**
 * Exercise 15 — Interop & Incremental Adoption
 *
 *   npm run lab exercises/15-interop.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/15-interop.ts
 */

import { Cause, Console, Data, Effect, Exit, Layer, ManagedRuntime, Ref } from "effect"

class ApiError extends Data.TaggedError("ApiError")<{ readonly cause: unknown }> {}

// ── 1. Wrap a rejecting Promise with a typed error. ─────────────────────
const legacy = async (id: string) => {
  if (id === "bad") throw new Error("legacy failed")
  return { id }
}

const wrapped = (id: string) =>
  // TODO: Effect.tryPromise({ try, catch })
  Effect.promise(() => legacy(id))

// ── 2. Wrap a Node-style callback API with Effect.async. ───────────────
const callbackApi = (input: string, cb: (e: Error | null, v?: string) => void) =>
  setTimeout(() => (input === "bad" ? cb(new Error("nope")) : cb(null, input.toUpperCase())), 5)

const fromCallback = (input: string): Effect.Effect<string, ApiError> =>
  // TODO: Effect.async<string, ApiError>((resume) => { ... })
  Effect.succeed(input)

// ── 3. A ManagedRuntime shared by two async functions. ────────────────
class Counter extends Effect.Service<Counter>()("app/Counter", {
  effect: Effect.gen(function* () {
    const ref = yield* Ref.make(0)
    return { bump: Ref.updateAndGet(ref, (n) => n + 1) }
  }),
}) {}

const runtime = ManagedRuntime.make(Layer.mergeAll(Counter.Default))

const handlerA = async () => runtime.runPromise(Effect.flatMap(Counter, (c) => c.bump))
const handlerB = async () => runtime.runPromise(Effect.flatMap(Counter, (c) => c.bump))

// ── 4. A boundary helper that throws Cause.pretty. ────────────────────
const boundary = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  // TODO: runPromiseExit + Cause.pretty
  Effect.runPromise(effect)

const main = async () => {
  console.log(`1. ok:   ${JSON.stringify(await Effect.runPromise(Effect.either(wrapped("u_1"))))}`)
  console.log(`2. cb:   ${await Effect.runPromise(fromCallback("hello"))}`)
  console.log(`3. shared instance: ${await handlerA()} then ${await handlerB()} (want 1 then 2)`)
  await boundary(Effect.sync((): string => { throw new Error("defect") })).catch((e: Error) =>
    console.log(`4. caught: ${e.message.split("\n")[0]}`),
  )
  // ── 6. Prove a finalizer runs on dispose. ──────────────────────────
  await runtime.dispose()
  console.log("6. disposed")
}

main().catch(console.error)

export const _unused = { Console, Exit, Cause }
