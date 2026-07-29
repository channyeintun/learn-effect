/**
 * Exercise 02 — Error Handling
 *
 *   npm run lab exercises/02-error-handling.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/02-error-handling.ts
 */

import { Cause, Console, Data, Effect, Exit } from "effect"

interface User { readonly id: string; readonly role: string }

// ── 1. Define AuthError and PermissionError with Data.TaggedError. ──────────
class AuthError extends Data.TaggedError("AuthError")<{
  readonly token: string
}> {}

// TODO: define PermissionError with `action` and `role` fields
class PermissionError extends Data.TaggedError("PermissionError")<{
  readonly action: string
}> {}

// ── 2. authenticate: fails with AuthError unless the token is "good". ───────
const authenticate = (token: string): Effect.Effect<User, AuthError> =>
  // TODO
  Effect.succeed({ id: "u_1", role: "viewer" })

// ── 3. authorize: fails with PermissionError unless role is "admin". ───────
const authorize = (user: User, action: string): Effect.Effect<void, PermissionError> =>
  // TODO
  Effect.void

// ── 4. Compose them. What is the inferred error type? ──────────────────────
const program = (token: string, action: string) =>
  Effect.gen(function* () {
    const user = yield* authenticate(token)
    yield* authorize(user, action)
    return `${user.id} may ${action}`
  })

// ── 5. Handle only AuthError. What error type is left? ─────────────────────
const partiallyHandled = program("bad", "delete").pipe(
  // TODO: Effect.catchTag("AuthError", ...)
)

// ── 6. Print the Cause of a program that dies. ─────────────────────────────
const dying = Effect.sync((): number => {
  throw new Error("invariant violated")
})

// ── 7. Validate a list of tokens, reporting EVERY failure. ─────────────────
const tokens = ["good", "bad", "good", "worse"]
const validateAll = Effect.validateAll(tokens, authenticate)

const main = Effect.gen(function* () {
  yield* Console.log(`4. ok:    ${JSON.stringify(yield* Effect.either(program("good", "read")))}`)
  yield* Console.log(`5. auth:  ${JSON.stringify(yield* Effect.either(partiallyHandled))}`)

  const exit = yield* Effect.exit(dying)
  if (Exit.isFailure(exit)) {
    yield* Console.log(`6. cause: ${Cause.pretty(exit.cause).split("\n")[0]}`)
  }

  const validated = yield* Effect.either(validateAll)
  yield* Console.log(
    `7. errors: ${validated._tag === "Left" ? validated.left.length : 0}`,
  )
})

Effect.runPromise(main).catch(console.error)
