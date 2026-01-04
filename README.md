# Effect.ts Complete Learning Curriculum 📚

A visual, hands-on curriculum for mastering Effect.ts.

## 🎯 Quick Start

```bash
# Install dependencies
npm init -y
npm install effect typescript ts-node @types/node

# Run the examples
npx ts-node examples.ts
```

## 📖 Modules

| Module | Topic | Key Concepts |
|--------|-------|--------------|
| [01](./01-core-concepts.md) | **Core Concepts** | Effect type, A/E/R parameters, Effect.gen |
| [02](./02-error-handling.md) | **Error Handling** | Typed errors, catchTag, error composition |
| [03](./03-dependency-injection.md) | **Services** | Context.Tag, provideService, layers |
| [04](./04-resource-management.md) | **Resources** | Scope, acquireRelease, guaranteed cleanup |
| [05](./05-concurrency.md) | **Concurrency** | Fibers, fork/join, parallel execution |
| [06](./06-scheduling.md) | **Scheduling** | Retry, repeat, exponential backoff |
| [07](./07-streams.md) | **Streams** | Data pipelines, transformation, running |
| [08](./08-patterns.md) | **Patterns** | Architecture, layers, testing, best practices |

## 🧠 Mental Model Summary

```
Effect = Recipe (description of what to do)
Runtime = Cook (actually executing it)

Effect<A, E, R> = Success type | Error type | Requirements
```

```
Create → Compose → Run
         ↑
     Effect.gen
```

## 📊 Core Cheat Sheet

| What You Want | Effect Function |
|---------------|-----------------|
| Wrap a value | `Effect.succeed(value)` |
| Create an error | `Effect.fail(error)` |
| Wrap sync code | `Effect.try(...)` |
| Wrap async code | `Effect.tryPromise(...)` |
| Compose effects | `Effect.gen(function* () {...})` |
| Transform success | `Effect.map(effect, fn)` |
| Chain effects | `Effect.flatMap(effect, fn)` |
| Handle errors | `Effect.catchAll / catchTag` |
| Run sync | `Effect.runSync(effect)` |
| Run async | `Effect.runPromise(effect)` |
| Parallel execution | `Effect.all([...], { concurrency: "unbounded" })` |
| Race | `Effect.race(effect1, effect2)` |
| Retry | `Effect.retry(effect, Schedule.recurs(3))` |

## 🚀 Progression Path

1. **Start here**: Read [Core Concepts](./01-core-concepts.md)
2. **Learn errors**: [Error Handling](./02-error-handling.md)
3. **Build real apps**: [Dependency Injection](./03-dependency-injection.md)
4. **Advanced topics**: Modules 4-7
5. **Put it together**: [Patterns](./08-patterns.md)

## 📚 Additional Resources

- [Official Documentation](https://effect.website/docs)
- [Effect GitHub](https://github.com/Effect-TS/effect)
- [Effect Discord](https://discord.gg/effect-ts)

---

Happy learning! 🎉
