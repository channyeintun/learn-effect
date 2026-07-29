# Learn Effect

A hands-on curriculum for **[Effect](https://www.effect.website/)**, the TypeScript library for building reliable production systems.

Sixteen modules, sixteen runnable labs, twelve exercise sets with worked solutions, and a complete HTTP service you can `curl`. **Every code sample in this repository typechecks and runs** — it's all in `src/`, checked by `tsc` in CI-able form, not pasted from memory.

> **Targets `effect@3.22.0`** (the current stable release, July 2026). Effect 4.0 is in beta — [Module 16](./modules/16-effect-v4.md) covers what's changing and how to prepare.

---

## Quick start

```bash
git clone https://github.com/channyeintun/learn-effect && cd learn-effect && npm install
```

Then run the first lab:

```bash
npm run lab src/01-core-concepts.ts
```

| Command | Does |
|---|---|
| `npm run lab src/<file>.ts` | Run any lab or exercise |
| `npm run check` | Typecheck everything |
| `npm test` | Run the test suite (Module 12) |
| `npm run verify` | Both of the above |

**Prerequisites:** Node 20+, TypeScript familiarity, comfort with `async/await`. No functional-programming background needed — this course doesn't assume you know what a monad is, and never requires you to.

**Strongly recommended:** the [Effect LSP / VS Code extension](https://effect.website/docs/getting-started/devtools/). It catches the single most common beginner mistake (a missing `yield*`) and makes Effect's types readable.

---

## Why Effect?

Here's a function that looks completely ordinary:

```typescript
async function chargeCustomer(id: string, cents: number): Promise<Receipt>
```

Using only that type, answer: What can go wrong? What does it need to run? What happens if the caller cancels? Can you test it without a real Stripe account?

The type answers **none** of them — `Promise<A>` has one type parameter, so there's nowhere to put the answers.

```typescript
const chargeCustomer: (id: string, cents: number) =>
  Effect<Receipt, CustomerNotFound | CardDeclined, Database | PaymentGateway>
```

Now they answer themselves. Everything in this course follows from that one idea.

---

## The curriculum

### Part I — Foundations

| # | Module | You'll learn |
|---|---|---|
| 1 | [Core Concepts](./modules/01-core-concepts.md) | The `Effect<A, E, R>` type, laziness, `Effect.gen`, running at the edge |
| 2 | [Error Handling](./modules/02-error-handling.md) | Typed errors, failures vs defects, `Cause`, error accumulation |
| 3 | [Services & Layers](./modules/03-services-and-layers.md) | Dependency injection, `Effect.Service`, layer composition, memoization |
| 4 | [Resource Management](./modules/04-resource-management.md) | `Scope`, guaranteed cleanup on **every** exit path, LIFO release |

### Part II — Concurrency & Data

| # | Module | You'll learn |
|---|---|---|
| 5 | [Concurrency & Fibers](./modules/05-concurrency.md) | Fibers, interruption, racing, structured concurrency |
| 6 | [Scheduling & Retry](./modules/06-scheduling.md) | `Schedule` as a value, backoff with jitter, `retry` vs `repeat` |
| 7 | [Streams](./modules/07-streams.md) | Pull-based backpressure, batching, paginated APIs, ETL pipelines |
| 8 | [Schema](./modules/08-schema.md) | Bidirectional codecs, branded types, deriving JSON Schema and generators |

### Part III — Production

| # | Module | You'll learn |
|---|---|---|
| 9 | [Configuration](./modules/09-configuration.md) | Validated config, `Redacted` secrets, swappable providers |
| 10 | [Observability](./modules/10-observability.md) | Structured logs, automatic span nesting, metrics, OpenTelemetry |
| 11 | [State & Coordination](./modules/11-state-and-coordination.md) | `Ref`, `Queue`, `PubSub`, `Semaphore`, `Deferred` |
| 12 | [Testing](./modules/12-testing.md) | `@effect/vitest`, `TestClock`, layer stubs, property-based tests |
| 13 | [Building a Real App](./modules/13-building-an-app.md) | A complete HTTP API with generated OpenAPI docs |

### Part IV — Judgement

| # | Module | You'll learn |
|---|---|---|
| 14 | [Patterns & Anti-Patterns](./modules/14-patterns.md) | Architecture, ten common mistakes, when *not* to use Effect |
| 15 | [Interop & Adoption](./modules/15-interop.md) | Adding Effect to an existing codebase, `ManagedRuntime` |
| 16 | [Effect 4.0](./modules/16-effect-v4.md) | What's changing, and how to write v3 code that migrates cleanly |

**Also here:** [Visual Guide](./VISUAL-GUIDE.md) · [Cheat Sheet](./CHEATSHEET.md) · [Glossary](./GLOSSARY.md) · [Exercises](./exercises/README.md)

---

## Suggested paths

**The full course** — Modules 1→16 in order, doing every exercise. Roughly 15 hours. This is the one to pick if you intend to use Effect at work.

**The fast track (weekend)** — Modules 1, 2, 3, 5, then 13. You'll be able to read and write real Effect code; come back for the rest as you need it.

**"I just need to fix this bug"** — [Cheat Sheet](./CHEATSHEET.md), then the relevant module's *Pitfalls* section. Every module has one.

**Evaluating Effect for a team** — Module 1 (the case for it), Module 12 (`TestClock` in 3ms), Module 13 (a real API in 150 lines), Module 14's [*When not to use Effect*](./modules/14-patterns.md#when-not-to-use-effect).

---

## How each module is built

Every module follows the same shape, so you always know where to look:

1. **The problem** — what breaks without this feature, in code you recognise
2. **The mental model** — an analogy and a diagram
3. **The mechanics** — API tables and verified examples
4. **Real output** — actual terminal output from the lab, not idealised
5. **Pitfalls** — the mistakes people actually make
6. **Practice** — exercises with solutions
7. **Self-check** — questions to answer before moving on

---

## The thirty-second version

```typescript
import { Effect, Data } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{ id: string }> {}

// A description of work. Nothing runs yet.
const getUser = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Database              // dependency, tracked in the type
    const user = yield* db.find(id)
    if (!user) return yield* new NotFound({ id })   // typed failure
    return user
  })
// Effect<User, NotFound | DbError, Database>

// Compose behaviour without touching the logic
const resilient = getUser("u_1").pipe(
  Effect.retry({ times: 3, schedule: backoff }),
  Effect.timeout("5 seconds"),
  Effect.withSpan("getUser"),
  Effect.catchTag("NotFound", () => Effect.succeed(guestUser)),
)

// Run once, at the edge
Effect.runPromise(resilient.pipe(Effect.provide(AppLayer)))
```

Retry, timeout, tracing, typed recovery, and dependency injection — five lines, no new abstractions, and the compiler checked all of it.

---

## Official resources

- [effect.website](https://www.effect.website/) — docs, blog, podcast
- [Effect Playground](https://effect.website/play) — try it in the browser
- [Discord](https://discord.gg/effect-ts) — where the maintainers answer questions
- [GitHub](https://github.com/Effect-TS/effect)

---

## Contributing

Found an error, or an API that's moved? Open an issue or a PR. The rule for this repo: **if it's in a code block, it must typecheck** — add it to `src/` or `exercises/` and make `npm run verify` pass.

MIT licensed.
