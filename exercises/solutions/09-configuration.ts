/** Solution 09 — Configuration */
import { Config, ConfigProvider, Console, Effect, Layer } from "effect"

const AppConfig = Config.all({
  port: Config.number("PORT").pipe(
    Config.withDefault(3000),
    Config.validate({
      message: "PORT must be >= 1024",
      validation: (n) => n >= 1024,
    }),
  ),
  apiKey: Config.redacted("API_KEY"),
  logLevel: Config.literal("debug", "info", "warn", "error")("LOG_LEVEL").pipe(
    Config.withDefault("info" as const),
  ),
})

const TestEnv = ConfigProvider.fromMap(
  new Map([
    ["PORT", "8080"],
    ["API_KEY", "sk-secret"],
    ["LOG_LEVEL", "debug"],
  ]),
  { pathDelim: "_" },
)

const BadPort = ConfigProvider.fromMap(
  new Map([["PORT", "80"], ["API_KEY", "sk-secret"]]),
  { pathDelim: "_" },
)

class Settings extends Effect.Service<Settings>()("app/Settings", {
  effect: AppConfig,
}) {}

const main = Effect.gen(function* () {
  const empty = yield* Effect.either(
    AppConfig.pipe(
      Effect.provide(Layer.setConfigProvider(ConfigProvider.fromMap(new Map()))),
    ),
  )
  yield* Console.log(
    `2. empty provider → ${empty._tag === "Left" ? String(empty.left).slice(0, 70) : "?"}`,
  )

  yield* Effect.gen(function* () {
    const s = yield* Settings
    // The API key prints as <redacted> even inside a stringified object.
    yield* Console.log(`3/5. ${JSON.stringify(s)}`)
    yield* Console.log(`     port=${s.port} logLevel=${s.logLevel}`)
  }).pipe(Effect.provide(Settings.Default), Effect.provide(Layer.setConfigProvider(TestEnv)))

  const bad = yield* Effect.either(
    AppConfig.pipe(Effect.provide(Layer.setConfigProvider(BadPort))),
  )
  yield* Console.log(
    `4. port 80 → ${bad._tag === "Left" ? String(bad.left).slice(0, 60) : "accepted (wrong!)"}`,
  )
})

Effect.runPromise(main).catch(console.error)
