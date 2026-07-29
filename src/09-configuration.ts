/**
 * Lab 09 — Configuration
 *
 *   npm run lab src/09-configuration.ts
 *
 * Try it with a bad environment to see the error report:
 *   PORT=abc npm run lab src/09-configuration.ts
 */

import { Config, ConfigProvider, Console, Effect, Layer, Redacted } from "effect"

const log = Console.log

// ─────────────────────────────────────────────────────────────────────────────
// 1. A Config is a description of a value you need from the environment
// ─────────────────────────────────────────────────────────────────────────────

// Like Effect, a Config is a *value*. It is not read until it is run, and it
// carries its own validation and documentation.
const port = Config.number("PORT").pipe(Config.withDefault(3000))
const host = Config.string("HOST").pipe(Config.withDefault("0.0.0.0"))

// Redacted keeps the value out of logs, stack traces and JSON.stringify.
const dbPassword = Config.redacted("PASSWORD")

// ─────────────────────────────────────────────────────────────────────────────
// 2. Composing configs
// ─────────────────────────────────────────────────────────────────────────────

const ServerConfig = Config.all({
  host,
  port,
  logLevel: Config.literal("debug", "info", "warn", "error")("LOG_LEVEL").pipe(
    Config.withDefault("info" as const),
  ),
})

// `Config.nested` prefixes every key inside it: DB_HOST, DB_PORT, DB_PASSWORD.
const DatabaseConfig = Config.all({
  host: Config.string("HOST"),
  port: Config.integer("PORT").pipe(Config.withDefault(5432)),
  password: dbPassword,
  poolSize: Config.integer("POOL_SIZE").pipe(
    Config.withDefault(10),
    // Validation lives with the config, not in a startup check you forget.
    Config.validate({
      message: "POOL_SIZE must be between 1 and 100",
      validation: (n) => n >= 1 && n <= 100,
    }),
  ),
}).pipe(Config.nested("DB"))

const AppConfig = Config.all({ server: ServerConfig, database: DatabaseConfig })

// ─────────────────────────────────────────────────────────────────────────────
// 3. Configuration as a service
// ─────────────────────────────────────────────────────────────────────────────

// Reading config once at startup and exposing it as a service means the rest of
// your code never touches process.env, and tests never mutate global state.
class Settings extends Effect.Service<Settings>()("app/Settings", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    yield* log(`  loaded config for ${config.server.host}:${config.server.port}`)
    return config
  }),
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Testing: swap the provider, don't mutate process.env
// ─────────────────────────────────────────────────────────────────────────────

// `pathDelim: "_"` makes `Config.nested("DB")` resolve to DB_HOST, DB_PORT…
// which is how environment variables are actually named.
const TestEnv = ConfigProvider.fromMap(
  new Map([
    ["HOST", "localhost"],
    ["PORT", "8080"],
    ["LOG_LEVEL", "debug"],
    ["DB_HOST", "db.internal"],
    ["DB_PASSWORD", "hunter2"],
    ["DB_POOL_SIZE", "25"],
  ]),
  { pathDelim: "_" },
)

const TestConfigLayer = Layer.setConfigProvider(TestEnv)

// A provider that will fail validation, to show the error report.
const BrokenEnv = ConfigProvider.fromMap(
  new Map([
    ["DB_HOST", "db.internal"],
    ["DB_PASSWORD", "hunter2"],
    ["DB_POOL_SIZE", "5000"], // out of range
  ]),
  { pathDelim: "_" },
)

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const program = Effect.gen(function* () {
  const settings = yield* Settings

  yield* log(`  server:   ${settings.server.host}:${settings.server.port}`)
  yield* log(`  logLevel: ${settings.server.logLevel}`)
  yield* log(`  db host:  ${settings.database.host}`)
  yield* log(`  poolSize: ${settings.database.poolSize}`)

  // A Redacted prints as <redacted> everywhere — logs, errors, stringify.
  yield* log(`  password (logged):  ${settings.database.password}`)
  yield* log(`  password (unwrapped): ${Redacted.value(settings.database.password)}`)
})

const main = Effect.gen(function* () {
  yield* log("── 1. loading from a test provider ──")
  yield* program.pipe(
    Effect.provide(Settings.Default),
    Effect.provide(TestConfigLayer),
  )

  yield* log("\n── 2. a validation failure is a structured, readable error ──")
  const broken = yield* Effect.either(
    Effect.gen(function* () {
      return yield* Settings
    }).pipe(Effect.provide(Settings.Default), Effect.provide(Layer.setConfigProvider(BrokenEnv))),
  )
  if (broken._tag === "Left") {
    yield* log(`  ${String(broken.left).split("\n").slice(0, 3).join("\n  ")}`)
  }

  yield* log("\n── 3. real environment (falls back to defaults) ──")
  const live = yield* Effect.either(Effect.provide(program, Settings.Default))
  yield* log(
    live._tag === "Left"
      ? `  as expected, DB_HOST/DB_PASSWORD are unset: ${String(live.left).split("\n")[0]}`
      : "  loaded from process.env",
  )
})

Effect.runPromise(main).catch((error) => {
  console.error("Program failed:", error)
  process.exitCode = 1
})
