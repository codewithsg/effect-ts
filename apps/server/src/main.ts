import { Effect, Layer } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { FileLoggerLive } from "./utils/logger.ts";
import { HttpRouter } from "effect/unstable/http";
import { RpcSerialization } from "effect/unstable/rpc";
import { DenoHttpServer } from "@effect/platform-deno";
import { MainRouterLive } from "./router.ts";
import { checkDatabaseHealth, sqlConnection } from "./db/db.ts";
import { seed } from "./db/seed.ts";
import { UsersLive } from "./domains/user/service.ts";
import { ProductsLive } from "./domains/product/service.ts";
import { PaymentLive } from "./domains/payment/service.ts";

const ServerLive = DenoHttpServer.layer({ port: 8848 });

const serverLayer = HttpRouter.serve(MainRouterLive).pipe(
    Layer.provide(ServerLive)
);

const program = Effect.gen(function* () {
    yield* checkDatabaseHealth;
    yield* seed;
    yield* Effect.logInfo("Server started on port 8848");
}).pipe(Effect.withSpan("Server.startup"));



const runnable = program.pipe(
    Effect.andThen(Layer.launch(serverLayer)),
    Effect.provide(PaymentLive),
    Effect.provide(ProductsLive),
    Effect.provide(UsersLive),
    Effect.provide(sqlConnection),
    Effect.provide(RpcSerialization.layerJson),
    Effect.provide(DevTools.layer()),
    Effect.provide(FileLoggerLive)
);

Effect.runPromise (runnable as any);