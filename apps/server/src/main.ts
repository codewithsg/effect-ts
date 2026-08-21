import { Effect } from "effect";
import { checkDatabaseHealth, sqlConnection } from "./db/db.ts";

const program = Effect.gen(function* () {
    yield* checkDatabaseHealth;
});

Effect.runPromise(program.pipe(Effect.provide(sqlConnection)));