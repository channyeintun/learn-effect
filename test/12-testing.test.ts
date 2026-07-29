/**
 * Lab 12 — Testing Effect code
 *
 *   npm test
 *
 * Every test here runs in milliseconds, including the ones that "wait" hours.
 */

import { assert, describe, it } from "@effect/vitest"
import {
  Arbitrary,
  Data,
  Effect,
  Exit,
  FastCheck,
  Fiber,
  Layer,
  Ref,
  Schedule,
  Schema,
  TestClock,
} from "effect"

// ─────────────────────────────────────────────────────────────────────────────
// Code under test
// ─────────────────────────────────────────────────────────────────────────────

class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly id: string
}> {}

class Unavailable extends Data.TaggedError("Unavailable")<{
  readonly attempt: number
}> {}

interface User {
  readonly id: string
  readonly name: string
}

class Users extends Effect.Service<Users>()("app/Users", {
  succeed: {
    byId: (id: string): Effect.Effect<User, UserNotFound> =>
      id === "u_1"
        ? Effect.succeed({ id, name: "Ada" })
        : Effect.fail(new UserNotFound({ id })),
  },
}) {}

const greet = (id: string) =>
  Effect.gen(function* () {
    const users = yield* Users
    const user = yield* users.byId(id)
    return `Hello, ${user.name}`
  })

// ─────────────────────────────────────────────────────────────────────────────
// 1. it.effect — the basic unit
// ─────────────────────────────────────────────────────────────────────────────

describe("it.effect", () => {
  // The test body IS an Effect. No async/await, no manual runPromise.
  it.effect("resolves a known user", () =>
    Effect.gen(function* () {
      const message = yield* greet("u_1")
      assert.strictEqual(message, "Hello, Ada")
    }).pipe(Effect.provide(Users.Default)),
  )

  // Assert on failures as VALUES rather than with rejects.toThrow.
  it.effect("fails with a typed error for an unknown user", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(greet("nope"))
      assert.isTrue(result._tag === "Left")
      if (result._tag === "Left") {
        assert.strictEqual(result.left._tag, "UserNotFound")
        assert.strictEqual(result.left.id, "nope")
      }
    }).pipe(Effect.provide(Users.Default)),
  )

  // Exit gives you the whole outcome, including defects and interruption.
  it.effect("exit carries the full cause", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(greet("nope"))
      assert.isTrue(Exit.isFailure(exit))
    }).pipe(Effect.provide(Users.Default)),
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Swapping layers instead of mocking modules
// ─────────────────────────────────────────────────────────────────────────────

describe("layer substitution", () => {
  it.effect("uses whatever implementation you provide", () =>
    Effect.gen(function* () {
      const message = yield* greet("anything")
      assert.strictEqual(message, "Hello, Stub")
    }).pipe(
      Effect.provide(
        // An Effect.Service class is instantiated with `new`, so the stub is
        // checked against the real interface — add a method to the service and
        // this line stops compiling.
        Layer.succeed(Users, new Users({
          byId: (id) => Effect.succeed({ id, name: "Stub" }),
        })),
      ),
    ),
  )

  it.effect("can assert on interactions", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make<Array<string>>([])

      const Spy = Layer.succeed(
        Users,
        new Users({
          byId: (id: string) =>
            Ref.update(calls, (c) => [...c, id]).pipe(
              Effect.as({ id, name: "Spy" } as User),
            ),
        }),
      )

      yield* greet("u_1").pipe(Effect.provide(Spy))
      yield* greet("u_2").pipe(Effect.provide(Spy))

      assert.deepStrictEqual(yield* Ref.get(calls), ["u_1", "u_2"])
    }),
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. TestClock — time becomes an input you control
// ─────────────────────────────────────────────────────────────────────────────

describe("TestClock", () => {
  // This test involves a one-hour sleep and finishes instantly.
  it.effect("a long sleep costs no real time", () =>
    Effect.gen(function* () {
      const done = yield* Ref.make(false)

      const fiber = yield* Effect.fork(
        Effect.sleep("1 hour").pipe(Effect.andThen(Ref.set(done, true))),
      )

      // Nothing has happened yet — virtual time has not moved.
      assert.isFalse(yield* Ref.get(done))

      yield* TestClock.adjust("1 hour")
      yield* Fiber.join(fiber)

      assert.isTrue(yield* Ref.get(done))
    }),
  )

  it.effect("verifies a retry policy's real timing without waiting", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0)

      const flaky = Effect.gen(function* () {
        const n = yield* Ref.updateAndGet(attempts, (x) => x + 1)
        return yield* new Unavailable({ attempt: n })
      })

      const fiber = yield* Effect.fork(
        // intersect = continue while BOTH agree, wait the LONGER delay:
        // exponential supplies the timing, recurs supplies the limit.
        Effect.retry(
          flaky,
          Schedule.intersect(Schedule.exponential("1 second"), Schedule.recurs(3)),
        ),
      )

      // 1st attempt is immediate.
      yield* TestClock.adjust("0 millis")
      assert.strictEqual(yield* Ref.get(attempts), 1)

      // Then 1s, 2s, 4s.
      yield* TestClock.adjust("1 second")
      assert.strictEqual(yield* Ref.get(attempts), 2)
      yield* TestClock.adjust("2 seconds")
      assert.strictEqual(yield* Ref.get(attempts), 3)
      yield* TestClock.adjust("4 seconds")
      assert.strictEqual(yield* Ref.get(attempts), 4)

      // Schedule exhausted — it gives up rather than retrying forever.
      const exit = yield* Fiber.await(fiber)
      assert.isTrue(Exit.isFailure(exit))
    }),
  )

  it.effect("timeouts are testable too", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        Effect.timeout(Effect.sleep("10 minutes"), "30 seconds"),
      )
      yield* TestClock.adjust("30 seconds")
      const exit = yield* Fiber.await(fiber)
      assert.isTrue(Exit.isFailure(exit))
    }),
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. it.scoped — resources are acquired and released per test
// ─────────────────────────────────────────────────────────────────────────────

describe("it.scoped", () => {
  it.scoped("closes resources when the test ends", () =>
    Effect.gen(function* () {
      const released = yield* Ref.make(false)

      const resource = yield* Effect.acquireRelease(
        Effect.succeed("handle"),
        () => Ref.set(released, true),
      )

      assert.strictEqual(resource, "handle")
      assert.isFalse(yield* Ref.get(released))
      // …and the finalizer runs when this scope closes, after the test body.
    }),
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Property-based testing, derived from a Schema
// ─────────────────────────────────────────────────────────────────────────────

describe("property-based", () => {
  const Product = Schema.Struct({
    sku: Schema.String.pipe(Schema.minLength(1)),
    price: Schema.Number.pipe(Schema.int(), Schema.positive()),
    tags: Schema.Array(Schema.String),
  })

  // One declaration gives you validation AND a generator for it.
  const arbProduct = Arbitrary.make(Product)

  it("decode(encode(x)) === x for every generated product", () => {
    FastCheck.assert(
      FastCheck.property(arbProduct, (product) => {
        const encoded = Schema.encodeSync(Product)(product)
        const decoded = Schema.decodeUnknownSync(Product)(encoded)
        assert.deepStrictEqual(decoded, product)
      }),
    )
  })

  it("rejects every non-positive price", () => {
    FastCheck.assert(
      FastCheck.property(FastCheck.integer({ max: 0 }), (price) => {
        const result = Schema.decodeUnknownEither(Product)({
          sku: "x",
          price,
          tags: [],
        })
        assert.strictEqual(result._tag, "Left")
      }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. it.live — when you genuinely want the real clock
// ─────────────────────────────────────────────────────────────────────────────

describe("it.live", () => {
  it.live("uses real time (keep these rare and short)", () =>
    Effect.gen(function* () {
      const before = Date.now()
      yield* Effect.sleep("20 millis")
      assert.isAtLeast(Date.now() - before, 15)
    }),
  )
})
