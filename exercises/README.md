# Exercises

Each file is a **runnable scaffold**. It compiles and runs as-is, so you can execute it at any point and see how far you've got. Replace every `TODO`.

```bash
npm run lab exercises/01-core-concepts.ts
```

Solutions are in [`solutions/`](./solutions). Every one of them typechecks and runs — read the comments, they explain *why*, not just *what*.

| # | Exercise | Module |
|---|---|---|
| 01 | [Core concepts](./01-core-concepts.ts) | [Module 1](../modules/01-core-concepts.md) |
| 02 | [Error handling](./02-error-handling.ts) | [Module 2](../modules/02-error-handling.md) |
| 03 | [Services & layers](./03-services-and-layers.ts) | [Module 3](../modules/03-services-and-layers.md) |
| 04 | [Resource management](./04-resource-management.ts) | [Module 4](../modules/04-resource-management.md) |
| 05 | [Concurrency](./05-concurrency.ts) | [Module 5](../modules/05-concurrency.md) |
| 06 | [Scheduling](./06-scheduling.ts) | [Module 6](../modules/06-scheduling.md) |
| 07 | [Streams](./07-streams.ts) | [Module 7](../modules/07-streams.md) |
| 08 | [Schema](./08-schema.ts) | [Module 8](../modules/08-schema.md) |
| 09 | [Configuration](./09-configuration.ts) | [Module 9](../modules/09-configuration.md) |
| 10 | [Observability](./10-observability.ts) | [Module 10](../modules/10-observability.md) |
| 11 | [State & coordination](./11-state-and-coordination.ts) | [Module 11](../modules/11-state-and-coordination.md) |
| 12 | Testing — extend [`test/12-testing.test.ts`](../test/12-testing.test.ts) | [Module 12](../modules/12-testing.md) |
| 13 | Building an app — extend [`src/13-building-an-app.ts`](../src/13-building-an-app.ts) | [Module 13](../modules/13-building-an-app.md) |
| 15 | [Interop](./15-interop.ts) | [Module 15](../modules/15-interop.md) |

## How to get the most out of these

1. **Predict before you run.** Write down the type you expect, then hover to check. The gap between the two is the learning.
2. **Read the type errors properly.** Effect's errors are long but precise — the useful part is usually the last few lines.
3. **Break things deliberately.** Remove a `yield*`, drop a layer, change `concurrency`. Understanding the failure mode is worth more than the passing case.
4. **Only then** open the solution, and compare *approaches*, not just answers.
