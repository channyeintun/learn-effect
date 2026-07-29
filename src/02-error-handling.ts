/**
 * Lab 02 — Error Handling
 *
 *   npm run lab src/02-error-handling.ts
 */

import { Cause, Console, Data, Effect, Exit, Schema } from "effect"

// ─────────────────────────────────────────────────────────────────────────────
// 1. Defining errors
// ─────────────────────────────────────────────────────────────────────────────

// `Data.TaggedError` gives you, for free:
//   - a `_tag` discriminant (so `catchTag` can find it)
//   - a typed constructor taking the declared fields
//   - structural equality (`Equal.equals`)
//   - a real `Error` prototype, so stack traces work
//   - yieldability: `yield* new UserNotFound(...)` inside Effect.gen
class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly userId: string
}> {}

class InvalidEmail extends Data.TaggedError("InvalidEmail")<{
  readonly email: string
  readonly reason: string
}> {}

// For errors that cross a network or process boundary, make them a Schema so
// they can be serialised and revived on the other side with their type intact.
class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", {
  retryAfterSeconds: Schema.Number,
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Three outcomes, not two
// ─────────────────────────────────────────────────────────────────────────────

// Success — the A channel.
const ok = Effect.succeed(1)

// Failure ("expected error") — the E channel. Recoverable, in the type.
const failure = Effect.fail(new UserNotFound({ userId: "u_1" }))

// Defect ("unexpected error") — a bug. NOT in the type. Recovering from it is
// possible but is usually the wrong instinct: a defect means an invariant broke.
const defect = Effect.sync(() => {
  throw new Error("array index out of bounds")
})

// Interruption is a third kind of non-success that is neither of the above.
// It appears in `Cause`, never in `E`. Module 5 covers it.

// ─────────────────────────────────────────────────────────────────────────────
// 3. Recovering
// ─────────────────────────────────────────────────────────────────────────────

const findUser = (id: string): Effect.Effect<{ id: string; email: string }, UserNotFound> =>
  id === "u_1"
    ? Effect.succeed({ id, email: "ada@example.com" })
    : Effect.fail(new UserNotFound({ userId: id }))

const validateEmail = (email: string): Effect.Effect<string, InvalidEmail> =>
  email.includes("@")
    ? Effect.succeed(email)
    : Effect.fail(new InvalidEmail({ email, reason: "missing @" }))

// The union is inferred: UserNotFound | InvalidEmail
const loadContact = (id: string) =>
  Effect.gen(function* () {
    const user = yield* findUser(id)
    const email = yield* validateEmail(user.email)
    return { id: user.id, email }
  })

// catchTag narrows the union — one tag at a time.
const withFallbackUser = loadContact("nope").pipe(
  Effect.catchTag("UserNotFound", (e) =>
    Effect.succeed({ id: e.userId, email: "guest@example.com" }),
  ),
)
//  ^ Effect<..., InvalidEmail>   — UserNotFound has been discharged

// catchTags handles several at once and is exhaustiveness-checked.
const fullyHandled = loadContact("nope").pipe(
  Effect.catchTags({
    UserNotFound: (e) => Effect.succeed({ id: e.userId, email: "guest@example.com" }),
    InvalidEmail: (e) => Effect.succeed({ id: "invalid", email: e.email }),
  }),
)
//  ^ Effect<..., never>          — nothing left to fail

// ─────────────────────────────────────────────────────────────────────────────
// 4. Turning failures into values
// ─────────────────────────────────────────────────────────────────────────────

// Either: keeps the error, moves it into the success channel.
const asEither = Effect.either(findUser("nope"))
// Effect<Either<{...}, UserNotFound>, never>

// Option: discards the error detail. Use only when the detail truly is noise.
const asOption = Effect.option(findUser("nope"))

// Exit: the full outcome — success, or a Cause describing every way it ended.
const asExit = Effect.exit(findUser("nope"))

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cause: the part most tutorials skip
// ─────────────────────────────────────────────────────────────────────────────

// `E` tells you what a single failure looks like. `Cause<E>` tells you what
// *actually happened*, including defects, interruption, and parallel failures
// that happened at the same time.
const inspectCause = Effect.gen(function* () {
  const exit = yield* Effect.exit(defect)

  if (Exit.isFailure(exit)) {
    const cause = exit.cause
    yield* Console.log(`  is a defect?      ${Cause.isDie(cause)}`)
    yield* Console.log(`  is a failure?     ${Cause.isFailure(cause)}`)
    yield* Console.log(`  is interrupted?   ${Cause.isInterrupted(cause)}`)
    yield* Console.log(`  pretty:           ${Cause.pretty(cause).split("\n")[0]}`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Crossing the failure/defect boundary deliberately
// ─────────────────────────────────────────────────────────────────────────────

// orDie: "this error is unrecoverable here" — moves E into a defect and
// empties the error channel. Honest, and better than a fake fallback value.
const _mustSucceed = findUser("u_1").pipe(Effect.orDie)
// Effect<{...}, never>

// mapError: adapt a low-level error into your domain vocabulary at a boundary.
class ContactLoadFailed extends Data.TaggedError("ContactLoadFailed")<{
  readonly cause: UserNotFound | InvalidEmail
}> {}

const _domainError = loadContact("nope").pipe(
  Effect.mapError((cause) => new ContactLoadFailed({ cause })),
)

// ─────────────────────────────────────────────────────────────────────────────
// 7. Collecting errors instead of short-circuiting
// ─────────────────────────────────────────────────────────────────────────────

const emails = ["ada@example.com", "not-an-email", "grace@example.com", "nope"]

// Default: stops at the first failure.
const _firstFailure = Effect.all(emails.map(validateEmail))

// mode: "either" — never fails; every element becomes an Either.
const everyResult = Effect.all(emails.map(validateEmail), { mode: "either" })

// Effect.validateAll — fails with a NonEmptyArray of ALL errors. This is what
// you want for form validation, where reporting one error at a time is hostile.
const allErrors = Effect.validateAll(emails, validateEmail)

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const main = Effect.gen(function* () {
  yield* Console.log("── 3. Recovering ──")
  yield* Console.log(JSON.stringify(yield* withFallbackUser))
  yield* Console.log(JSON.stringify(yield* fullyHandled))

  yield* Console.log("\n── 4. Failures as values ──")
  const either = yield* asEither
  yield* Console.log(`either: ${either._tag === "Left" ? either.left._tag : "ok"}`)
  const option = yield* asOption
  yield* Console.log(`option: ${option._tag}`)
  const exit = yield* asExit
  yield* Console.log(`exit:   ${exit._tag}`)

  yield* Console.log("\n── 5. Cause ──")
  yield* inspectCause

  yield* Console.log("\n── 7. Accumulating errors ──")
  const results = yield* everyResult
  yield* Console.log(
    `mode:"either" → ${results.map((r) => (r._tag === "Right" ? "ok" : "err")).join(", ")}`,
  )
  const validated = yield* Effect.either(allErrors)
  yield* Console.log(
    validated._tag === "Left"
      ? `validateAll collected ${validated.left.length} errors: ${validated.left
          .map((e) => e.email)
          .join(", ")}`
      : "all valid",
  )

  yield* Console.log("\n── unused-but-typechecked bindings ──")
  yield* Console.log(`ok=${yield* ok}, rateLimited tag=${new RateLimited({ retryAfterSeconds: 30 })._tag}`)
  yield* Effect.either(failure)
})

Effect.runPromise(main).catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})
