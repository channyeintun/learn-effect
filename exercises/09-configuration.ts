/**
 * Exercise 09 — Configuration
 *
 *   npm run lab exercises/09-configuration.ts
 *
 * Replace every TODO. The file compiles as-is so you can run it at any point
 * and see how far you've got. Solution: exercises/solutions/09-configuration.ts
 */

import { Config, ConfigProvider, Console, Effect, Layer, Redacted } from "effect"

// ── 1. port (default 3000), required Redacted API key, log level literal. ─
const AppConfig = Config.all({
  port: Config.number("PORT").pipe(Config.withDefault(3000)),
  // TODO: apiKey as Config.redacted("API_KEY")
  apiKey: Config.string("API_KEY").pipe(Config.withDefault("TODO")),
  // TODO: logLevel via Config.literal("debug","info","warn","error")("LOG_LEVEL")
})

// ── 4. Add a validate that rejects ports below 1024. ─────────────────────
// TODO: Config.validate({ message, validation })

// ── 3. Provide a ConfigProvider.fromMap. ─────────────────────────────────
const TestEnv = ConfigProvider.fromMap(
  new Map([
    ["PORT", "8080"],
    ["API_KEY", "sk-secret"],
    ["LOG_LEVEL", "debug"],
  ]),
  { pathDelim: "_" },
)

// ── 6. Wrap it in an Effect.Service so callers never see env vars. ───────
class Settings extends Effect.Service<Settings>()("app/Settings", {
  effect: AppConfig,
}) {}

const main = Effect.gen(function* () {
  // ── 2. Run against an empty provider and read the error. ──────────────
  const empty = yield* Effect.either(
    AppConfig.pipe(Effect.provide(Layer.setConfigProvider(ConfigProvider.fromMap(new Map())))),
  )
  yield* Console.log(`2. empty provider: ${empty._tag}`)

  yield* Effect.gen(function* () {
    const s = yield* Settings
    // ── 5. Log the whole config; the key should print as <redacted>. ────
    yield* Console.log(`3/5. ${JSON.stringify(s)}`)
    yield* Console.log(`     port: ${s.port}`)
  }).pipe(Effect.provide(Settings.Default), Effect.provide(Layer.setConfigProvider(TestEnv)))
})

Effect.runPromise(main).catch(console.error)

export const _unused = Redacted
