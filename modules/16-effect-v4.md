# Module 16 — Effect 4.0: What's Changing

> **Time:** ~25 minutes · **Status as of July 2026:** `effect@3.22.0` is stable, `effect@4.0.0-beta.102` is in beta

This module exists so the rest of the course doesn't age badly. Everything in Modules 1–15 is written against **Effect 3.x**, which is what you should use in production today. Here's what's coming and how to prepare.

> ⚠️ **Don't ship v4 yet.** The Effect team's own guidance is to stay on v3 for production while the beta stabilises. Betas may include breaking changes between releases. Use this module to make v3 decisions that will migrate cleanly, not to start a migration.

---

## Check the current state yourself

```bash
npm view effect dist-tags
```

At the time of writing that returns `latest: 3.22.0`, `beta: 4.0.0-beta.102`.

---

## What v4 changes, and why

### 1. A rewritten fiber runtime

The core has been rebuilt for lower memory overhead, faster execution, and simpler internals. **The programming model is unchanged** — `Effect.gen`, typed errors, layers, fibers, structured concurrency all work the way you've learned them.

### 2. Much smaller bundles

A minimal program using Effect + Stream + Schema goes from **~70 kB to ~20 kB**. This is the headline change for anyone shipping Effect to a browser, and it removes the main reason teams reached for `Micro`.

### 3. Unified versioning

Today's version skew is genuinely confusing:

```
effect@3.22.0   @effect/platform@0.97.0   @effect/sql@0.52.0   @effect/ai@0.37.0
```

In v4, **every package shares one version number** and they're released together. `effect@4.0.0` pairs with `@effect/sql-pg@4.0.0`. No more compatibility-matrix archaeology when a peer dependency warning appears.

### 4. Package consolidation

Much of what lives in separate packages today moves **into core**, under an `effect/unstable/*` namespace. From the beta package, those namespaces are:

```
ai  cli  cluster  devtools  encoding  eventlog  http  httpapi
observability  persistence  process  reactivity  rpc  schema
socket  sql  workers  workflow
```

So the HTTP server from [Module 13](./13-building-an-app.md) becomes `effect/unstable/httpapi` rather than `@effect/platform`. Only platform-, provider-, and technology-specific adapters stay separate: `@effect/platform-node`, `@effect/sql-pg`, `@effect/ai-openai`.

### 5. The `unstable` namespace

A deliberate contract: modules under `effect/unstable/*` **may break in minor releases**. Everything outside it follows semver strictly. This lets evolving APIs (RPC, cluster, AI) ship without freezing them prematurely — you opt into instability by importing from that path.

---

## Concrete API changes

Verified against `effect@4.0.0-beta.102`. Expect movement before release.

| v3 | v4 |
|---|---|
| `Context.Tag(...)` | `Context.Service(...)` / `Context.Key` |
| `Context.GenericTag` | `Context.Service` |
| `Either<R, L>` | **`Result<Success, Failure>`** — `Either` is gone |
| `Either.isRight` / `isLeft` | `Result.isSuccess` / `Result.isFailure` |
| `Option.fromNullable` | `Option.fromNullishOr` |
| `STM`, `TRef`, `TMap`, `TQueue` | `TxRef`, `TxHashMap`, `TxQueue`, … |
| `Schema.decodeUnknown` | `Schema.decodeUnknownEffect` |
| `Schema.nonNegative()` | `Schema.isGreaterThanOrEqualTo(0)` |
| `Schema.BigIntFromSelf` | `Schema.BigInt` (the `FromSelf` suffix is dropped) |
| `@effect/platform` (FileSystem, Path, Terminal) | core `effect` |
| `@effect/platform` HTTP | `effect/unstable/http`, `effect/unstable/httpapi` |
| `@effect/rpc`, `@effect/cluster`, `@effect/ai`, `@effect/sql` | `effect/unstable/*` |
| `JSONSchema` | `JsonSchema` |

New in v4: `Optic`, `Newtype`, `Filter`, `Combiner`, `Reducer`, `Crypto`, `JsonPatch`, and a first-class `Semaphore` / `Latch` in core.

`Effect.Service`, `Layer`, `Schedule`, `Stream`, `Ref`, `Scope` and the whole concurrency model carry over essentially unchanged.

---

## The `Either` → `Result` rename

This is the change most likely to touch your code, because `Effect.either` is everywhere in error-handling code:

```typescript
// v3
const result = yield* Effect.either(risky)
if (result._tag === "Left") { … result.left … }

// v4
const result = yield* Effect.result(risky)
if (Result.isFailure(result)) { … result.failure … }
```

The rename is a genuine improvement in readability — `Left`/`Right` never told anyone which side was the error — but it's a wide, mechanical change. The codemod handles it.

---

## Migrating, when the time comes

1. **Wait for stable.** There is no prize for being early here.
2. **Run the codemod.** An official `effect-v3-to-v4` codemod handles the mechanical renames and import moves. It won't do everything, but it does the boring 80%.
3. **Fix imports first**, then type errors. Most of the work is import paths.
4. **Expect Schema to need the most attention** — it has its own dedicated migration guide.
5. **Lean on your tests.** If you followed [Module 12](./12-testing.md), you have a suite that pins behaviour rather than implementation, which is exactly what makes a migration tractable.

---

## Writing v3 code today that migrates cleanly

None of these are speculative — they're good practice regardless, and they happen to reduce migration surface:

- [ ] **Prefer `Effect.Service` over raw `Context.Tag`.** It carries over; `Context.Tag` is renamed.
- [ ] **Centralise imports.** A `src/effect.ts` that re-exports what you use turns hundreds of import edits into one file.
- [ ] **Wrap platform APIs behind your own services.** If HTTP lives behind an interface you own, moving from `@effect/platform` to `effect/unstable/http` touches one layer.
- [ ] **Use `Data.TaggedError`, not hand-rolled `_tag` classes.**
- [ ] **Keep `Effect.either` usage in a few helpers** rather than scattered across every file.
- [ ] **Have tests.** Non-negotiable for any migration.

---

## What is *not* changing

Worth stating plainly, because "major version" sounds scarier than this is:

- The `Effect<A, E, R>` type and everything it means
- `Effect.gen`, `pipe`, and the operator vocabulary
- Typed errors, defects, `Cause`, `Exit`
- Layers, services, dependency injection
- Fibers, structured concurrency, interruption
- `Scope` and resource safety
- `Schedule`, retry, repeat
- `Stream` and its operators

**Everything you learned in Modules 1–15 remains correct.** v4 is a packaging, performance, and ergonomics release — not a redesign.

---

## Staying current

- [Effect blog](https://effect.website/blog) — release notes and *This Week in Effect*
- [Effect v4 beta announcement](https://www.effect.website/blog/releases/effect/40-beta)
- [Effect Discord](https://discord.gg/effect-ts) — where the team actually answers questions
- [GitHub releases](https://github.com/Effect-TS/effect/releases)

```bash
npm view effect dist-tags
```

Run that occasionally. When `latest` reads `4.x`, come back to this module.

---

## Self-check

- [ ] Which version should you use in production today?
- [ ] What are the four headline changes in v4?
- [ ] What does the `effect/unstable/*` namespace promise, and what does it not?
- [ ] Which v3 type is replaced by `Result`?
- [ ] Name three things you can do in v3 today that reduce migration cost later.
- [ ] What is explicitly *not* changing?

---

**← Previous:** [Interop & Incremental Adoption](./15-interop.md) | **Back to** [README](../README.md)
