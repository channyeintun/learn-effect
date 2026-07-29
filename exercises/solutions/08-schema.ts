/** Solution 08 — Schema */
import { Console, Effect, JSONSchema, ParseResult, Schema } from "effect"

const Sku = Schema.String.pipe(
  Schema.minLength(3),
  Schema.brand("Sku"),
  Schema.annotations({ identifier: "Sku", message: () => "SKU must be at least 3 characters" }),
)

const Product = Schema.Struct({
  sku: Sku,
  price: Schema.Number.pipe(
    Schema.positive(),
    Schema.annotations({ message: () => "price must be greater than 0" }),
  ),
  description: Schema.optional(Schema.String),
  createdAt: Schema.Date,
})

const decode = Schema.decodeUnknown(Product)
const encode = Schema.encode(Product)

const valid = { sku: "abc", price: 10, createdAt: "2026-07-30T09:00:00.000Z" }
const invalid = { sku: "x", price: -5, createdAt: "not-a-date" }

const reportAll = (input: unknown) =>
  decode(input, { errors: "all" }).pipe(
    Effect.catchTag("ParseError", (e) =>
      ParseResult.ArrayFormatter.formatError(e).pipe(
        Effect.flatMap((issues) =>
          Effect.forEach(issues, (i) =>
            Console.log(`   ✗ ${i.path.join(".") || "(root)"}: ${i.message}`),
          ),
        ),
        Effect.as("invalid"),
      ),
    ),
  )

const jsonSchema = JSONSchema.make(Product)

const main = Effect.gen(function* () {
  const ok = yield* decode(valid)
  yield* Console.log(`2. valid: ${ok.sku}, createdAt is a Date: ${ok.createdAt instanceof Date}`)

  const bad = yield* Effect.either(decode(invalid))
  if (bad._tag === "Left") {
    yield* Console.log("2. tree (first error only — short-circuits):")
    yield* Console.log(`   ${ParseResult.TreeFormatter.formatErrorSync(bad.left).split("\n")[0]}`)
  }

  yield* Console.log("3. every error:")
  yield* reportAll(invalid)

  yield* Console.log(`5. encoded: ${JSON.stringify(yield* encode(ok))}`)
  yield* Console.log(`6. json schema: ${JSON.stringify(jsonSchema).slice(0, 140)}…`)
})

Effect.runPromise(main).catch(console.error)
