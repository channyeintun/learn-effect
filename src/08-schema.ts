/**
 * Lab 08 — Schema: parsing, validation and encoding
 *
 *   npm run lab src/08-schema.ts
 */

import { Console, Effect, JSONSchema, ParseResult, Schema } from "effect"

const log = Console.log

// ─────────────────────────────────────────────────────────────────────────────
// 1. A schema is a bidirectional codec
// ─────────────────────────────────────────────────────────────────────────────

// Schema<Type, Encoded, Requirements>
//   Type    — what your program works with
//   Encoded — what the wire/database looks like
// Most schemas have Type === Encoded; the interesting ones don't.

const Person = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
})

const decodePerson = Schema.decodeUnknownEither(Person)
const encodePerson = Schema.encodeEither(Person)

// ─────────────────────────────────────────────────────────────────────────────
// 2. Refinements narrow a type; they do not change the encoding
// ─────────────────────────────────────────────────────────────────────────────

const Email = Schema.String.pipe(
  Schema.pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
  Schema.annotations({
    identifier: "Email",
    // The message users actually see. Worth writing for every public field.
    message: () => "must be a valid email address",
  }),
)

const Age = Schema.Number.pipe(
  Schema.int(),
  Schema.between(0, 150),
  Schema.annotations({ identifier: "Age" }),
)

// ─────────────────────────────────────────────────────────────────────────────
// 3. Branded types make illegal states unrepresentable
// ─────────────────────────────────────────────────────────────────────────────

// `UserId` and `OrderId` are both strings at runtime but are NOT interchangeable
// at compile time. This kills a whole category of argument-order bugs.
const UserId = Schema.String.pipe(Schema.brand("UserId"))
const OrderId = Schema.String.pipe(Schema.brand("OrderId"))
type UserId = Schema.Schema.Type<typeof UserId>

const _greet = (id: UserId) => `hello ${id}`
// _greet("raw string")            // ❌ compile error — good
// _greet(OrderId.make("o_1"))     // ❌ compile error — good
const _ok = _greet(UserId.make("u_1")) // ✅

// ─────────────────────────────────────────────────────────────────────────────
// 4. Transformations: the Type and the Encoded side genuinely differ
// ─────────────────────────────────────────────────────────────────────────────

// JSON has no Date. `Schema.Date` decodes an ISO string into a real Date and
// encodes it back — so the boundary conversion happens exactly once, in one
// place, instead of being scattered as `new Date(x)` calls.
const Event = Schema.Struct({
  id: UserId,
  name: Schema.NonEmptyString,
  occurredAt: Schema.Date, // Type: Date        Encoded: string
  attendees: Schema.Array(Email),
  tags: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  priority: Schema.Literal("low", "normal", "high"),
})

type Event = Schema.Schema.Type<typeof Event>
type EventEncoded = Schema.Schema.Encoded<typeof Event>

const decodeEvent = Schema.decodeUnknown(Event)
const encodeEvent = Schema.encode(Event)

// ─────────────────────────────────────────────────────────────────────────────
// 5. Reporting every error, not just the first
// ─────────────────────────────────────────────────────────────────────────────

const badInput = {
  id: "u_1",
  name: "",
  occurredAt: "not-a-date",
  attendees: ["nope", "ada@example.com"],
  priority: "urgent",
}

// `errors: "all"` collects every problem — what a form needs.
// `ArrayFormatter` gives you a flat list of { path, message } you can map
// straight onto form fields.
const validateAll = decodeEvent(badInput, { errors: "all" }).pipe(
  Effect.catchTag("ParseError", (e) =>
    ParseResult.ArrayFormatter.formatError(e).pipe(
      Effect.flatMap((issues) =>
        Effect.forEach(issues, (issue) =>
          log(`  ✗ ${issue.path.join(".") || "(root)"}: ${issue.message}`),
        ),
      ),
      Effect.as("invalid"),
    ),
  ),
)

// ─────────────────────────────────────────────────────────────────────────────
// 6. Class APIs: a schema and a domain type in one declaration
// ─────────────────────────────────────────────────────────────────────────────

class User extends Schema.Class<User>("User")({
  id: UserId,
  email: Email,
  age: Age,
}) {
  // Methods live on the decoded value. This is a real class.
  get isAdult(): boolean {
    return this.age >= 18
  }
}

// Errors that survive serialisation — see Module 2.
class ValidationFailed extends Schema.TaggedError<ValidationFailed>()(
  "ValidationFailed",
  { field: Schema.String, message: Schema.String },
) {}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Deriving other artefacts from the same schema
// ─────────────────────────────────────────────────────────────────────────────

// One declaration → validation, types, AND an OpenAPI-ready JSON Schema.
// They cannot drift apart, because there is only one source.
const jsonSchema = JSONSchema.make(Schema.Struct({ email: Email, age: Age }))

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const main = Effect.gen(function* () {
  yield* log("── 1. decode / encode round trip ──")
  const p = decodePerson({ name: "Ada", age: 36 })
  yield* log(`  decoded: ${JSON.stringify(p)}`)
  yield* log(`  encoded: ${JSON.stringify(encodePerson({ name: "Ada", age: 36 }))}`)
  const wrong = decodePerson({ name: "Ada", age: "36" })
  yield* log(`  wrong type rejected: ${wrong._tag === "Left"}`)

  yield* log("\n── 4. transformation: string ⇄ Date ──")
  const event: Event = yield* decodeEvent({
    id: "u_1",
    name: "Launch",
    occurredAt: "2026-07-30T09:00:00.000Z",
    attendees: ["ada@example.com"],
    priority: "high",
  })
  yield* log(`  occurredAt is a real Date: ${event.occurredAt instanceof Date}`)
  yield* log(`  tags defaulted to: ${JSON.stringify(event.tags)}`)

  const backOnTheWire: EventEncoded = yield* encodeEvent(event)
  yield* log(`  re-encoded occurredAt: ${backOnTheWire.occurredAt}`)

  yield* log("\n── 5. all errors at once ──")
  yield* validateAll

  yield* log("\n── 6. class API ──")
  const user = yield* Schema.decodeUnknown(User)({
    id: "u_9",
    email: "grace@example.com",
    age: 45,
  })
  yield* log(`  ${user.email} isAdult=${user.isAdult}`)
  yield* log(`  error tag: ${new ValidationFailed({ field: "email", message: "bad" })._tag}`)

  yield* log("\n── 7. derived JSON Schema ──")
  yield* log(`  ${JSON.stringify(jsonSchema).slice(0, 160)}…`)
})

Effect.runPromise(main).catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})
