/** Solution 01 — Core Concepts */
import { Console, Data, Effect, pipe } from "effect"

const myName: Effect.Effect<string> = Effect.succeed("Ada Lovelace")

class DivisionByZero extends Data.TaggedError("DivisionByZero")<{
  readonly numerator: number
}> {}

const safeDivide = (a: number, b: number): Effect.Effect<number, DivisionByZero> =>
  b === 0 ? Effect.fail(new DivisionByZero({ numerator: a })) : Effect.succeed(a / b)

class JsonParseError extends Data.TaggedError("JsonParseError")<{
  readonly input: string
}> {}

const parseJson = (input: string): Effect.Effect<unknown, JsonParseError> =>
  Effect.try({
    try: () => JSON.parse(input) as unknown,
    catch: () => new JsonParseError({ input }),
  })

// Inferred: Effect<number, DivisionByZero | JsonParseError>
const program = Effect.gen(function* () {
  const parsed = yield* parseJson('{"a": 10}')
  const a = (parsed as { a: number }).a
  return yield* safeDivide(a, 2)
})

// JsonParseError is discharged; only DivisionByZero remains.
const recovered = program.pipe(Effect.catchTag("JsonParseError", () => Effect.succeed(0)))

const upperName = pipe(myName, Effect.map((n) => n.toUpperCase()))

const main = Effect.gen(function* () {
  yield* Console.log(`1. name:      ${yield* myName}`)
  yield* Console.log(`2. 10 / 2:    ${yield* safeDivide(10, 2)}`)
  const byZero = yield* Effect.either(safeDivide(10, 0))
  yield* Console.log(`2. 10 / 0:    ${byZero._tag === "Left" ? byZero.left._tag : "?"}`)
  yield* Console.log(`3. parsed:    ${JSON.stringify(yield* parseJson('{"ok":true}'))}`)
  yield* Console.log(`4. program:   ${yield* program}`)
  yield* Console.log(`6. recovered: ${yield* recovered}`)
  yield* Console.log(`7. upper:     ${yield* upperName}`)
})

Effect.runPromise(main).catch(console.error)
