/**
 * Exercise 01 — Core Concepts
 *
 *   npm run lab exercises/01-core-concepts.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/01-core-concepts.ts
 */

import { Console, Data, Effect, pipe } from "effect"

// ── 1. Create an Effect that succeeds with your name. ───────────────────────
const myName: Effect.Effect<string> = Effect.succeed("TODO: your name")

// ── 2. Define a DivisionByZero error and a safeDivide that uses it. ─────────
class DivisionByZero extends Data.TaggedError("DivisionByZero")<{
  readonly numerator: number
}> {}

const safeDivide = (
  a: number,
  b: number,
): Effect.Effect<number, DivisionByZero> =>
  // TODO: fail with DivisionByZero when b is 0, otherwise succeed with a / b
  Effect.succeed(0)

// ── 3. Wrap JSON.parse so failures become a typed JsonParseError. ───────────
class JsonParseError extends Data.TaggedError("JsonParseError")<{
  readonly input: string
}> {}

const parseJson = (input: string): Effect.Effect<unknown, JsonParseError> =>
  // TODO: use Effect.try({ try, catch })
  Effect.succeed(null)

// ── 4. Compose: parse '{"a": 10}', divide `a` by 2, return the result. ──────
const program: Effect.Effect<number, DivisionByZero | JsonParseError> =
  Effect.gen(function* () {
    // TODO: yield* parseJson, narrow the shape, yield* safeDivide
    return 0
  })

// ── 5. What is the inferred error type of `program`? Hover to check. ────────

// ── 6. Recover from JsonParseError only. The type should shrink. ────────────
const recovered = program.pipe(
  // TODO: Effect.catchTag("JsonParseError", ...)
)

// ── 7. Bonus: uppercase myName with pipe + map. ─────────────────────────────
const upperName = pipe(
  myName,
  // TODO: Effect.map(...)
)

const main = Effect.gen(function* () {
  yield* Console.log(`1. name:      ${yield* myName}`)
  yield* Console.log(`2. 10 / 2:    ${yield* Effect.either(safeDivide(10, 2))}`)
  yield* Console.log(`2. 10 / 0:    ${JSON.stringify(yield* Effect.either(safeDivide(10, 0)))}`)
  yield* Console.log(`3. parsed:    ${JSON.stringify(yield* Effect.either(parseJson("{}")))}`)
  yield* Console.log(`4. program:   ${JSON.stringify(yield* Effect.either(program))}`)
  yield* Console.log(`6. recovered: ${JSON.stringify(yield* Effect.either(recovered))}`)
  yield* Console.log(`7. upper:     ${yield* upperName}`)
})

Effect.runPromise(main).catch(console.error)
