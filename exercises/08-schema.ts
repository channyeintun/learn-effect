/**
 * Exercise 08 — Schema
 *
 *   npm run lab exercises/08-schema.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/08-schema.ts
 */

import { Console, Effect, JSONSchema, ParseResult, Schema } from "effect"

// ── 1. Model a Product: branded Sku, positive price, optional description. ─
const Sku = Schema.String.pipe(Schema.minLength(3), Schema.brand("Sku"))

const Product = Schema.Struct({
  sku: Sku,
  // TODO: price must be a positive number
  price: Schema.Number,
  // TODO: description is optional
  // TODO (4): add createdAt: Schema.Date
})

const decode = Schema.decodeUnknown(Product)

// ── 2. Decode a valid payload and an invalid one; print with TreeFormatter.
const valid = { sku: "abc", price: 10 }
const invalid = { sku: "x", price: -5 }

// ── 3. Switch to { errors: "all" } + ArrayFormatter. ─────────────────────
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

// ── 5. Encode back and confirm you get the wire representation. ──────────
const encode = Schema.encode(Product)

// ── 6. Generate the JSON Schema. ────────────────────────────────────────
const jsonSchema = JSONSchema.make(Product)

// ── 7. Add a custom `message` to one refinement and see it in the output. ─

const main = Effect.gen(function* () {
  yield* Console.log(`2. valid:   ${JSON.stringify(yield* Effect.either(decode(valid)))}`)
  const bad = yield* Effect.either(decode(invalid))
  if (bad._tag === "Left") {
    yield* Console.log(`2. tree:\n${ParseResult.TreeFormatter.formatErrorSync(bad.left)}`)
  }
  yield* Console.log("3. all errors:")
  yield* reportAll(invalid)
  const ok = yield* decode(valid)
  yield* Console.log(`5. encoded: ${JSON.stringify(yield* encode(ok))}`)
  yield* Console.log(`6. schema:  ${JSON.stringify(jsonSchema).slice(0, 120)}…`)
})

Effect.runPromise(main).catch(console.error)
