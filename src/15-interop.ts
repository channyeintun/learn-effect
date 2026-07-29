/**
 * Lab 15 — Interop & incremental adoption
 *
 *   npm run lab src/15-interop.ts
 */

import { Console, Data, Effect, Exit, Cause, ManagedRuntime, Layer, Ref, Runtime } from "effect"

const log = Console.log

// ─────────────────────────────────────────────────────────────────────────────
// 1. Promise → Effect
// ─────────────────────────────────────────────────────────────────────────────

class ApiError extends Data.TaggedError("ApiError")<{ readonly cause: unknown }> {}

// Existing async function you don't want to rewrite yet.
const legacyFetchUser = async (id: string): Promise<{ id: string; name: string }> => {
  if (id === "bad") throw new Error("legacy blew up")
  return { id, name: "Ada" }
}

// Wrap it once, at the seam. Note `signal`: interruption propagates into the
// legacy call if it accepts an AbortSignal.
const fetchUser = (id: string) =>
  Effect.tryPromise({
    try: () => legacyFetchUser(id),
    catch: (cause) => new ApiError({ cause }),
  })

// ─────────────────────────────────────────────────────────────────────────────
// 2. Effect → Promise (for callers that can't be Effects yet)
// ─────────────────────────────────────────────────────────────────────────────

const effectfulWork = Effect.gen(function* () {
  yield* Effect.sleep("10 millis")
  return "done"
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. ManagedRuntime — the right seam for an existing server
// ─────────────────────────────────────────────────────────────────────────────

class Counter extends Effect.Service<Counter>()("app/Counter", {
  effect: Effect.gen(function* () {
    const ref = yield* Ref.make(0)
    return {
      bump: Ref.updateAndGet(ref, (n) => n + 1),
      value: Ref.get(ref),
    }
  }),
}) {}

// Build the layer graph ONCE. In an Express/Fastify/Next app this lives at
// module scope and every handler reuses it.
const AppLayer = Layer.mergeAll(Counter.Default)
const runtime = ManagedRuntime.make(AppLayer)

// A handler that looks like ordinary async code to the framework…
const handler = async (userId: string): Promise<string> => {
  // …but is a proper Effect inside, with full DI and error typing.
  return runtime.runPromise(
    Effect.gen(function* () {
      const counter = yield* Counter
      const n = yield* counter.bump
      const user = yield* fetchUser(userId)
      return `${user.name} (request #${n})`
    }).pipe(
      Effect.catchTag("ApiError", () => Effect.succeed("anonymous (upstream failed)")),
    ),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Callbacks → Effect
// ─────────────────────────────────────────────────────────────────────────────

const legacyCallbackApi = (
  input: string,
  cb: (err: Error | null, value?: string) => void,
) => {
  setTimeout(() => (input === "bad" ? cb(new Error("nope")) : cb(null, input.toUpperCase())), 5)
}

const fromCallback = (input: string) =>
  Effect.async<string, ApiError>((resume) => {
    legacyCallbackApi(input, (err, value) => {
      resume(err ? Effect.fail(new ApiError({ cause: err })) : Effect.succeed(value!))
    })
  })

// ─────────────────────────────────────────────────────────────────────────────
// 5. Don't lose the Cause at the boundary
// ─────────────────────────────────────────────────────────────────────────────

const boundary = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) return exit.value
    // Cause.pretty keeps defects, interruption and parallel failures that
    // `String(error)` would throw away.
    throw new Error(Cause.pretty(exit.cause))
  })

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const main = async () => {
  console.log("── 1/2. Promise ⇄ Effect ──")
  console.log(`  effect → promise: ${await Effect.runPromise(effectfulWork)}`)

  console.log("\n── 3. ManagedRuntime inside a Promise-shaped handler ──")
  console.log(`  ${await handler("u_1")}`)
  console.log(`  ${await handler("u_2")}`)
  console.log(`  ${await handler("bad")}   ← recovered inside Effect`)

  console.log("\n── 4. callback → Effect ──")
  console.log(`  ${await Effect.runPromise(fromCallback("hello"))}`)

  console.log("\n── 5. boundary that preserves the Cause ──")
  await boundary(Effect.sync((): string => {
    throw new Error("a defect")
  })).catch((e: Error) => console.log(`  caught: ${e.message.split("\n")[0]}`))

  // Shutting the runtime down closes every scope and drains every resource.
  await runtime.dispose()
  console.log("\n  runtime disposed — all finalizers ran")
}

main().catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})

// Keeps `log`/`Runtime` referenced so the imports are meaningful in the lab.
export const _unused = { log, Runtime }
