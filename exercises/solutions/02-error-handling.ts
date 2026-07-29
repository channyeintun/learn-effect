/** Solution 02 — Error Handling */
import { Cause, Console, Data, Effect, Exit } from "effect"

interface User { readonly id: string; readonly role: string }

class AuthError extends Data.TaggedError("AuthError")<{ readonly token: string }> {}
class PermissionError extends Data.TaggedError("PermissionError")<{
  readonly action: string
  readonly role: string
}> {}

const authenticate = (token: string): Effect.Effect<User, AuthError> =>
  token === "good"
    ? Effect.succeed({ id: "u_1", role: "admin" })
    : Effect.fail(new AuthError({ token }))

const authorize = (user: User, action: string): Effect.Effect<void, PermissionError> =>
  user.role === "admin"
    ? Effect.void
    : Effect.fail(new PermissionError({ action, role: user.role }))

// Inferred: Effect<string, AuthError | PermissionError>
const program = (token: string, action: string) =>
  Effect.gen(function* () {
    const user = yield* authenticate(token)
    yield* authorize(user, action)
    return `${user.id} may ${action}`
  })

// Only PermissionError remains.
const partiallyHandled = program("bad", "delete").pipe(
  Effect.catchTag("AuthError", (e) => Effect.succeed(`guest (rejected token ${e.token})`)),
)

const dying = Effect.sync((): number => {
  throw new Error("invariant violated")
})

const tokens = ["good", "bad", "good", "worse"]
const validateAll = Effect.validateAll(tokens, authenticate)

const main = Effect.gen(function* () {
  yield* Console.log(`4. ok:     ${yield* program("good", "read")}`)
  yield* Console.log(`5. auth:   ${yield* partiallyHandled}`)

  const exit = yield* Effect.exit(dying)
  if (Exit.isFailure(exit)) {
    yield* Console.log(`6. defect? ${Cause.isDie(exit.cause)}`)
    yield* Console.log(`6. cause:  ${Cause.pretty(exit.cause).split("\n")[0]}`)
  }

  const validated = yield* Effect.either(validateAll)
  yield* Console.log(
    validated._tag === "Left"
      ? `7. collected ${validated.left.length} errors: ${validated.left.map((e) => e.token).join(", ")}`
      : "7. all valid",
  )
})

Effect.runPromise(main).catch(console.error)
