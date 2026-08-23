import { Effect } from "effect";
import { checkDatabaseHealth, sqlConnection } from "./db/db.ts";
import { MainRouterLive } from "./router.ts";
import { UsersLive } from "./domains/user/service.ts";
import { ProductsLive } from "./domains/product/service.ts";
import { PaymentLive } from "./domains/payment/service.ts";

const program = Effect.gen(function* () {
    yield* checkDatabaseHealth;
});

Effect.runPromise(
    program.pipe(
        Effect.provide(MainRouterLive),
        Effect.provide(PaymentLive),
        Effect.provide(ProductsLive),
        Effect.provide(UsersLive),
        Effect.provide(sqlConnection)
    )
);