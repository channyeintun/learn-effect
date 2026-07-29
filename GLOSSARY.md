# Glossary

Effect's vocabulary is small but precise, and several terms mean something narrower than their everyday sense. Where a distinction matters, it's called out.

---

### Accessor
A generated helper that lets you call a service method without first retrieving the service: `Logger.info("hi")` instead of `const l = yield* Logger; yield* l.info("hi")`. Enabled with `accessors: true` on `Effect.Service`. → [M3](./modules/03-services-and-layers.md)

### Cause
The complete description of *how* an effect ended unsuccessfully. Richer than an error: it can represent a typed **Fail**, a **Die** (defect), an **Interrupt**, and — crucially — **Parallel** and **Sequential** combinations. Two fibers failing at once produce a `Cause` holding both; a plain `Error` would discard one. → [M2](./modules/02-error-handling.md)

### Chunk
An immutable, array-like collection optimised for the append/concat patterns streams use. `Stream` moves data in `Chunk`s rather than one element at a time, which is why pull-based streaming isn't slow. `Chunk.toArray` converts.

### Context
The typed map of services available to a running effect. The `R` type parameter describes what a program needs from it. You rarely touch `Context` directly — layers build it for you.

### Defect
An **unexpected** error: a bug, a broken invariant, something no caller can meaningfully handle. Not tracked in `E`. Created by `Effect.die`, or by a `throw` inside `Effect.sync`. Contrast **Failure**. The deciding question: *does someone fix the code, or does the program carry on?* → [M2](./modules/02-error-handling.md)

### Deferred
A one-shot, fiber-safe promise: one fiber awaits it, another completes it exactly once. → [M11](./modules/11-state-and-coordination.md)

### Effect
A **value describing work**, not the work itself. `Effect<A, E, R>` — succeeds with `A`, may fail with `E`, requires `R`. Nothing happens until a runtime interprets it. → [M1](./modules/01-core-concepts.md)

### Exit
The final outcome of a fiber: either `Success<A>` or `Failure<Cause<E>>`. `Effect.exit` turns any effect into one that always succeeds with its `Exit`. → [M2](./modules/02-error-handling.md)

### Failure
An **expected** error, part of your domain, tracked in the `E` channel, created with `Effect.fail`. Contrast **Defect**. → [M2](./modules/02-error-handling.md)

### Fiber
A lightweight thread of execution managed by Effect's runtime. Cheap enough to have millions of, and — unlike a Promise — **interruptible** and arranged in a parent/child tree. → [M5](./modules/05-concurrency.md)

### Finalizer
Cleanup registered against a `Scope`, guaranteed to run when that scope closes, on **every** exit path including interruption. → [M4](./modules/04-resource-management.md)

### Interruption
Effect's cancellation. Signals a fiber at its next suspension point, unwinds its scopes running every finalizer, propagates to all descendants, and waits for that to finish. Appears in `Cause`, never in `E`. → [M5](./modules/05-concurrency.md)

### Layer
A **recipe for constructing services**. `Layer<ROut, E, RIn>` — builds `ROut`, may fail with `E`, needs `RIn`. Composed with `merge`, `provide`, `provideMerge`. Memoized **by reference**, so the same layer value yields one shared instance. → [M3](./modules/03-services-and-layers.md)

### ManagedRuntime
A pre-built runtime carrying a constructed layer graph, so long-lived applications don't rebuild dependencies per request. `dispose()` closes everything. → [M3](./modules/03-services-and-layers.md), [M15](./modules/15-interop.md)

### Memoization (of layers)
A layer is built once per graph and shared. Keyed on the layer **value**, not the tag — so defining the same layer twice gives you two instances. → [M3](./modules/03-services-and-layers.md)

### Micro
A much smaller subset of Effect for bundle-size-sensitive contexts. Keeps typed errors, interruption and composition; drops layers, tracing and metrics. → [M15](./modules/15-interop.md)

### `never`
In `E`: a **proof** that the effect cannot fail. In `R`: that it needs no services. Not "unknown" — "impossible". → [M1](./modules/01-core-concepts.md)

### Pipe
Left-to-right function application. Available as a standalone `pipe(value, f, g)` or a method, `effect.pipe(f, g)`. The method form usually infers better.

### PubSub
Broadcast: **every** subscriber receives **every** message. Contrast **Queue**, where each item goes to exactly one consumer. → [M11](./modules/11-state-and-coordination.md)

### Queue
A fiber-safe work queue. `bounded` applies **backpressure** — producers suspend when full. `dropping` and `sliding` discard instead; `unbounded` is usually a memory leak. → [M11](./modules/11-state-and-coordination.md)

### Redacted
A wrapper that prints as `<redacted>` in logs, errors, and `JSON.stringify`. Extract deliberately with `Redacted.value`. → [M9](./modules/09-configuration.md)

### Ref
Atomic mutable state, safe across fibers. `Ref.modify` computes a result and the next state in one atomic step. → [M11](./modules/11-state-and-coordination.md)

### Schedule
A **first-class value** describing when and how often to repeat something. `Schedule<Out, In, R>`. Composable, inspectable, and unit-testable in isolation. → [M6](./modules/06-scheduling.md)

### Schema
A **bidirectional codec**: `Schema<Type, Encoded, R>`. Decodes `unknown` → typed domain value and encodes back. One declaration also yields JSON Schema, generators, pretty printers and equivalences. → [M8](./modules/08-schema.md)

### Scope
A lifetime that finalizers attach to. Appearing as `Scope` in `R` means "this effect needs someone to own its cleanup". Discharged by `Effect.scoped` or `Layer.scoped`. → [M4](./modules/04-resource-management.md)

### Semaphore
Limits concurrent access to a resource across the whole application, versus the `concurrency` option which bounds one operation. `withPermits` returns permits on success, failure, and interruption. → [M11](./modules/11-state-and-coordination.md)

### Service
A capability your code depends on: an interface plus a `Tag` to look it up. Declared with `Effect.Service` (usual) or `Context.Tag` (when many implementations exist). → [M3](./modules/03-services-and-layers.md)

### Span
A traced unit of work. `Effect.fn("name")` creates one per call; spans nest automatically along the call graph. → [M10](./modules/10-observability.md)

### Stream
`Stream<A, E, R>` — zero or more values over time. **Pull-based**, so a slow consumer paces a fast producer automatically. → [M7](./modules/07-streams.md)

### Structured concurrency
The guarantee that a child fiber cannot outlive its parent. When a parent ends or is interrupted, all descendants are interrupted and their finalizers run. Makes fiber leaks impossible by accident. → [M5](./modules/05-concurrency.md)

### Tag
A type-safe key identifying a service in the `Context`. The string is for debugging and must be unique across your whole graph — namespace it (`"@myapp/Database"`). → [M3](./modules/03-services-and-layers.md)

### TestClock
A virtual clock provided by `it.effect`. `TestClock.adjust("1 hour")` advances time instantly, so sleeps, timeouts, retries and schedules complete without waiting. → [M12](./modules/12-testing.md)

### `_tag`
The discriminant field on tagged unions, which `catchTag` and `Match` use to narrow. Added automatically by `Data.TaggedError`, `Schema.TaggedError`, and `Data.TaggedClass`.

### Yieldable
A value that can be `yield*`-ed directly inside `Effect.gen` without a wrapper. `Data.TaggedError` instances are yieldable, so `yield* new NotFound({ id })` works like `throw`. → [M2](./modules/02-error-handling.md)
