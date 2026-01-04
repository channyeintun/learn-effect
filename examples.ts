/**
 * Effect.ts Hands-On Examples 🎯
 * 
 * Run these examples to build your intuition!
 * 
 * Setup:
 *   npm init -y
 *   npm install effect typescript ts-node @types/node
 *   npx ts-node examples.ts
 */

import { Effect, pipe, Console } from "effect"

// ============================================
// 1️⃣ BASIC: Success and Failure
// ============================================

// The simplest success - just wraps a value
const simpleSuccess = Effect.succeed(42)

// The simplest failure - just wraps an error
const simpleFailure = Effect.fail("Something went wrong")

// Run and see results
console.log("--- Basic Success ---")
console.log("Result:", Effect.runSync(simpleSuccess)) // 42

console.log("\n--- Basic Failure ---")
try {
  Effect.runSync(simpleFailure)
} catch (e) {
  console.log("Caught failure:", e)
}

// ============================================
// 2️⃣ ERROR TRACKING: The Power of Types
// ============================================

// Custom error class for type safety
class DivisionError {
  readonly _tag = "DivisionError"
  constructor(readonly message: string) {}
}

// This function's TYPES tell you exactly what can happen:
// - Success: number
// - Error: DivisionError
// - Requirements: never (none needed)
const divide = (a: number, b: number): Effect.Effect<number, DivisionError> =>
  b === 0
    ? Effect.fail(new DivisionError("Cannot divide by zero"))
    : Effect.succeed(a / b)

console.log("\n--- Error Tracking ---")
// Success case
Effect.runPromise(divide(10, 2)).then(r => console.log("10 / 2 =", r))

// Error case - but handled gracefully!
pipe(
  divide(10, 0),
  Effect.catchAll((error) => Effect.succeed(`Handled: ${error.message}`)),
  Effect.runPromise
).then(console.log)

// ============================================
// 3️⃣ GENERATORS: The async/await of Effect
// ============================================

// Helper effects (simulating async operations)
const fetchUserId = Effect.succeed(123)
const fetchUserName = (id: number) => Effect.succeed(`User ${id}`)
const fetchUserPosts = (id: number) => Effect.succeed([
  `Post 1 by user ${id}`,
  `Post 2 by user ${id}`,
])

// Compose them with generators - looks like async/await!
const program = Effect.gen(function* () {
  console.log("Starting program...")
  
  const userId = yield* fetchUserId
  console.log("Got user ID:", userId)
  
  const userName = yield* fetchUserName(userId)
  console.log("Got user name:", userName)
  
  const posts = yield* fetchUserPosts(userId)
  console.log("Got posts:", posts)
  
  return { userId, userName, posts }
})

console.log("\n--- Generators ---")
Effect.runPromise(program).then(result => {
  console.log("Final result:", result)
})

// ============================================
// 4️⃣ PIPE: Transforming Effects
// ============================================

console.log("\n--- Pipe Transformations ---")

const transformed = pipe(
  Effect.succeed(5),           // Start with 5
  Effect.map(x => x * 2),      // Transform: 10
  Effect.map(x => x + 3),      // Transform: 13
  Effect.tap(x => Console.log(`Current value: ${x}`)), // Log without transforming
  Effect.map(x => `The answer is ${x}`) // Final string
)

Effect.runPromise(transformed).then(console.log)

// ============================================
// 5️⃣ FLATMAP: Chaining Effects
// ============================================

console.log("\n--- FlatMap Chaining ---")

const getUser = Effect.succeed({ id: 1, name: "Alice" })
const getUserPosts = (userId: number) => Effect.succeed([
  { id: 101, title: "First post", userId },
  { id: 102, title: "Second post", userId },
])

// flatMap lets you chain effects where the next effect depends on the previous result
const userWithPosts = pipe(
  getUser,
  Effect.flatMap(user => 
    pipe(
      getUserPosts(user.id),
      Effect.map(posts => ({ user, posts }))
    )
  )
)

Effect.runPromise(userWithPosts).then(result => {
  console.log("User with posts:", JSON.stringify(result, null, 2))
})

// ============================================
// 6️⃣ ERROR HANDLING
// ============================================

console.log("\n--- Error Handling ---")

class NetworkError {
  readonly _tag = "NetworkError"
  constructor(readonly message: string) {}
}

class ParseError {
  readonly _tag = "ParseError"  
  constructor(readonly message: string) {}
}

const fetchData = Effect.fail(new NetworkError("Connection failed"))

// Handle specific error types
const handled = pipe(
  fetchData,
  Effect.catchTag("NetworkError", (e) => 
    Effect.succeed(`Recovered from network error: ${e.message}`)
  )
)

Effect.runPromise(handled).then(console.log)

// ============================================
// 7️⃣ TRY: Wrapping Unsafe Code
// ============================================

console.log("\n--- Wrapping Unsafe Code ---")

const parseJson = (input: string) => Effect.try({
  try: () => JSON.parse(input),
  catch: (error) => new ParseError(`Failed to parse: ${error}`)
})

// Valid JSON
Effect.runPromise(parseJson('{"name": "Alice"}')).then(r => 
  console.log("Parsed:", r)
)

// Invalid JSON - safely caught
pipe(
  parseJson('not valid json'),
  Effect.catchAll((error) => Effect.succeed({ error: error.message })),
  Effect.runPromise
).then(console.log)

// ============================================
// 🎯 THE KEY MENTAL MODEL
// ============================================

/*
Remember:

1. Effect is LAZY - nothing runs until you call runSync/runPromise
   
2. Effect<A, E, R> tells you:
   - A: What you get on success
   - E: What errors can happen (visible in types!)
   - R: What dependencies are needed

3. Creating effects: succeed, fail, try, tryPromise
4. Composing effects: map, flatMap, gen
5. Running effects: runSync, runPromise (at the "edge" of your app)

Think of it as:
- Effect = Recipe (description of what to do)
- runSync/runPromise = Cooking (actually doing it)
*/

console.log("\n✅ All examples completed!")
