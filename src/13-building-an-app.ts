/**
 * Lab 13 — Building a real application
 *
 *   npm run lab src/13-building-an-app.ts
 *   curl localhost:3000/todos
 *   curl -X POST localhost:3000/todos -d '{"title":"Learn Effect"}' -H 'content-type: application/json'
 *   curl localhost:3000/todos/1
 *   open http://localhost:3000/docs      ← generated OpenAPI UI
 *
 * Everything below is the whole application: schema, errors, service, HTTP
 * layer and entry point. Read it as a template.
 */

import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSwagger,
  HttpMiddleware,
} from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Layer, Ref, Schema } from "effect"
import { createServer } from "node:http"

// ─────────────────────────────────────────────────────────────────────────────
// 1. Domain — schemas and errors first
// ─────────────────────────────────────────────────────────────────────────────

const TodoId = Schema.Number.pipe(Schema.int(), Schema.positive(), Schema.brand("TodoId"))
type TodoId = Schema.Schema.Type<typeof TodoId>

const Todo = Schema.Struct({
  id: TodoId,
  title: Schema.NonEmptyString,
  done: Schema.Boolean,
  createdAt: Schema.Date,
})
type Todo = Schema.Schema.Type<typeof Todo>

const CreateTodo = Schema.Struct({
  title: Schema.NonEmptyString.pipe(Schema.maxLength(200)),
})

// A Schema error can be encoded onto the wire and decoded by a typed client
// with its shape intact — the HTTP status is part of the declaration.
class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
  id: Schema.Number,
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Service — business logic, independent of HTTP
// ─────────────────────────────────────────────────────────────────────────────

class Todos extends Effect.Service<Todos>()("app/Todos", {
  effect: Effect.gen(function* () {
    const store = yield* Ref.make(new Map<number, Todo>())
    const nextId = yield* Ref.make(1)

    return {
      list: Ref.get(store).pipe(Effect.map((m) => Array.from(m.values()))),

      byId: (id: number) =>
        Ref.get(store).pipe(
          Effect.flatMap((m) => {
            const found = m.get(id)
            return found ? Effect.succeed(found) : Effect.fail(new TodoNotFound({ id }))
          }),
        ),

      create: (title: string) =>
        Effect.gen(function* () {
          const id = yield* Ref.getAndUpdate(nextId, (n) => n + 1)
          const todo: Todo = {
            id: TodoId.make(id),
            title,
            done: false,
            createdAt: new Date(),
          }
          yield* Ref.update(store, (m) => new Map(m).set(id, todo))
          yield* Effect.logInfo("todo created").pipe(Effect.annotateLogs({ todoId: id }))
          return todo
        }),

      complete: (id: number) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(store)
          const found = current.get(id)
          if (!found) return yield* new TodoNotFound({ id })
          const updated: Todo = { ...found, done: true }
          yield* Ref.update(store, (m) => new Map(m).set(id, updated))
          return updated
        }),
    }
  }),
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// 3. API definition — one declaration, four artefacts
// ─────────────────────────────────────────────────────────────────────────────

// From this single description you get: request validation, response encoding,
// an OpenAPI document, a Swagger UI, and (with HttpApiClient) a typed client.
const todosGroup = HttpApiGroup.make("todos")
  .add(HttpApiEndpoint.get("list", "/todos").addSuccess(Schema.Array(Todo)))
  .add(
    HttpApiEndpoint.get("byId", "/todos/:id")
      .setPath(Schema.Struct({ id: Schema.NumberFromString }))
      .addSuccess(Todo)
      .addError(TodoNotFound, { status: 404 }),
  )
  .add(
    HttpApiEndpoint.post("create", "/todos")
      .setPayload(CreateTodo)
      .addSuccess(Todo, { status: 201 }),
  )
  .add(
    HttpApiEndpoint.post("complete", "/todos/:id/complete")
      .setPath(Schema.Struct({ id: Schema.NumberFromString }))
      .addSuccess(Todo)
      .addError(TodoNotFound, { status: 404 }),
  )

const api = HttpApi.make("todos-api").add(todosGroup)

// ─────────────────────────────────────────────────────────────────────────────
// 4. Handlers — the compiler checks each against its endpoint
// ─────────────────────────────────────────────────────────────────────────────

const TodosLive = HttpApiBuilder.group(api, "todos", (handlers) =>
  Effect.gen(function* () {
    const todos = yield* Todos
    return handlers
      .handle("list", () => todos.list)
      .handle("byId", ({ path }) => todos.byId(path.id))
      .handle("create", ({ payload }) => todos.create(payload.title))
      .handle("complete", ({ path }) => todos.complete(path.id))
  }),
)

// ─────────────────────────────────────────────────────────────────────────────
// 5. Wiring — every dependency resolved once, at the edge
// ─────────────────────────────────────────────────────────────────────────────

const ApiLive = HttpApiBuilder.api(api).pipe(Layer.provide(TodosLive))

const ServerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const port = yield* Config.number("PORT").pipe(Config.withDefault(3000))
    yield* Effect.logInfo(`listening on http://localhost:${port}`)
    return NodeHttpServer.layer(createServer, { port })
  }),
)

const MainLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(HttpApiSwagger.layer({ path: "/docs" })),
  Layer.provide(ApiLive),
  Layer.provide(Todos.Default),
  Layer.provide(ServerLive),
)

// ─────────────────────────────────────────────────────────────────────────────
// 6. Entry point
// ─────────────────────────────────────────────────────────────────────────────

// `NodeRuntime.runMain` installs signal handlers, so Ctrl-C closes every scope,
// drains every pool, and runs every finalizer before the process exits.
NodeRuntime.runMain(Layer.launch(MainLive))
