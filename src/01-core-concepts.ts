/**
 * Lab 01 — Core Concepts
 *
 *   npm run lab src/01-core-concepts.ts
 *
 * Read top to bottom. Every section prints something; change a line, re-run,
 * and see what happens. That loop is the whole point of this file.
 */

import { Console, Data, Effect, pipe } from "effect"

// ─────────────────────────────────────────────────────────────────────────────
// 1. An Effect is a description, not an execution
// ─────────────────────────────────────────────────────────────────────────────

// Nothing is logged when this line is evaluated. `greeting` is a *value* that
// describes "log a greeting". It is inert until a runtime interprets it.
const greeting = Console.log("Hello from an Effect")

console.log("Constructed the effect — notice nothing was logged yet.")

// This is the line that actually does the work.
Effect.runSync(greeting)

// The practical consequence: effects are reusable. Running the same value
// twice runs the work twice — unlike a Promise, which caches its result.
Effect.runSync(greeting)

// ─────────────────────────────────────────────────────────────────────────────
// 2. The three type parameters: Effect<A, E, R>
// ─────────────────────────────────────────────────────────────────────────────

//                                       ┌─ A: success value
//                                       │       ┌─ E: recoverable failure
//                                       │       │      ┌─ R: services required
//                                       ▼       ▼      ▼
const alwaysWorks: Effect.Effect<number, never, never> = Effect.succeed(42)

// `never` in the error slot is a *proof*: this effect cannot fail.
// `never` in the requirements slot means it needs nothing to run.

class DivisionByZero extends Data.TaggedError("DivisionByZero")<{
  readonly numerator: number
}> {}

// The signature now tells the truth about what can go wrong.
const divide = (
  numerator: number,
  denominator: number,
): Effect.Effect<number, DivisionByZero> =>
  denominator === 0
    ? Effect.fail(new DivisionByZero({ numerator }))
    : Effect.succeed(numerator / denominator)

// ─────────────────────────────────────────────────────────────────────────────
// 3. Creating effects
// ─────────────────────────────────────────────────────────────────────────────

// From a value that is already computed.
const fromValue = Effect.succeed({ id: 1, name: "Ada" })

// From a *lazy* synchronous computation that cannot throw.
const fromSync = Effect.sync(() => Math.floor(Date.now() / 1000))

// From synchronous code that CAN throw. `catch` turns the thrown value into a
// typed error, so the failure lands in the E channel instead of escaping.
class JsonParseError extends Data.TaggedError("JsonParseError")<{
  readonly input: string
}> {}

const parseJson = (input: string) =>
  Effect.try({
    try: () => JSON.parse(input) as unknown,
    catch: () => new JsonParseError({ input }),
  })

// From a Promise. Same idea, asynchronous.
class FetchError extends Data.TaggedError("FetchError")<{
  readonly cause: unknown
}> {}

const _fetchJson = (url: string) =>
  Effect.tryPromise({
    try: (signal) => fetch(url, { signal }).then((r) => r.json() as Promise<unknown>),
    catch: (cause) => new FetchError({ cause }),
  })
//   ^ note the `signal`: Effect hands you an AbortSignal so that interrupting
//     the effect actually cancels the in-flight HTTP request. With async/await
//     you have to thread cancellation through by hand.

// ─────────────────────────────────────────────────────────────────────────────
// 4. Composing: pipe vs Effect.gen
// ─────────────────────────────────────────────────────────────────────────────

// `pipe` reads left-to-right for straight-line transformations.
const piped = pipe(
  Effect.succeed(5),
  Effect.map((n) => n * 2), // 10
  Effect.tap((n) => Console.log(`  after map: ${n}`)),
  Effect.map((n) => `The answer is ${n + 3}`), // "The answer is 13"
)

// `Effect.gen` reads like async/await and is the better default whenever one
// step depends on the result of a previous one.
const generated = Effect.gen(function* () {
  const half = yield* divide(84, 2) // like `await`
  const quarter = yield* divide(half, 2)
  return { half, quarter }
})

// The same program written with pipe — this is why `gen` is the default.
const _generatedWithPipe = pipe(
  divide(84, 2),
  Effect.flatMap((half) =>
    pipe(
      divide(half, 2),
      Effect.map((quarter) => ({ half, quarter })),
    ),
  ),
)

// ─────────────────────────────────────────────────────────────────────────────
// 5. Errors are values, and they accumulate in the type
// ─────────────────────────────────────────────────────────────────────────────

// Effect<{...}, DivisionByZero | JsonParseError>
// Hover over `combined` in your editor: the union is inferred, not declared.
const combined = Effect.gen(function* () {
  const config = yield* parseJson('{"ratio": 4}')
  const value = yield* divide(100, 4)
  return { config, value }
})

// Recovering from one member of the union removes it from the type.
const recovered = combined.pipe(
  Effect.catchTag("JsonParseError", (e) =>
    Effect.succeed({ config: { fallback: true, input: e.input }, value: 0 }),
  ),
)
//    ^ Effect<..., DivisionByZero>  — JsonParseError is gone.

// ─────────────────────────────────────────────────────────────────────────────
// 6. Running at the edge
// ─────────────────────────────────────────────────────────────────────────────

const main = Effect.gen(function* () {
  yield* Console.log("\n── 4. Composing ──")
  yield* Console.log(yield* piped)
  yield* Console.log(JSON.stringify(yield* generated))

  yield* Console.log("\n── 5. Error channels ──")
  yield* Console.log(JSON.stringify(yield* recovered))

  // `Effect.either` moves the failure into the success channel as an Either,
  // which is how you inspect a failure without crashing the program.
  const attempt = yield* Effect.either(divide(1, 0))
  yield* Console.log(
    attempt._tag === "Left"
      ? `Recovered from: ${attempt.left._tag}`
      : `Got: ${attempt.right}`,
  )

  yield* Console.log("\n── 3. Wrapping unsafe code ──")
  const bad = yield* Effect.either(parseJson("definitely not json"))
  yield* Console.log(
    bad._tag === "Left" ? `Parse failed for input: ${bad.left.input}` : "parsed",
  )

  yield* Console.log(`\nfromValue: ${JSON.stringify(yield* fromValue)}`)
  yield* Console.log(`fromSync (unix seconds): ${yield* fromSync}`)
  yield* Console.log(`alwaysWorks: ${yield* alwaysWorks}`)
})

// `runPromise` is the async entry point. An application normally has exactly
// ONE of these, at the outermost boundary.
Effect.runPromise(main).catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})
