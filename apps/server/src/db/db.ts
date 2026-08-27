import { PgClient } from '@effect/sql-pg'
import { Effect, Redacted } from 'effect'
import { SqlClient, SqlError } from 'effect/unstable/sql'
import { retryable } from "../utils/retry.ts";
import { DatabaseError } from "./error.ts";
import { log } from "../utils/logger.ts";

export const sqlConnection = PgClient.layer({
    url: Redacted.make(Deno.env.get("DATABASE_URL")!)
})

export const checkDatabaseHealth = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    yield* retryable(sql`SELECT 1`, 10);

    yield* Effect.sync(() => log.info('Database connected successfully...'))
})

export const dbQuery = <A>(
    query:(sql: SqlClient.SqlClient)=>Effect.Effect<A,SqlError.SqlError>,
    errorMessage: string
): Effect.Effect<A, DatabaseError, SqlClient.SqlClient>=>
    Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        return yield* query(sql).pipe(
            Effect.mapError(
                (cause)=> new DatabaseError({
                    message: errorMessage || 'Database query failed',
                    cause: cause instanceof Error ? `${cause.name}: ${cause.message} - ${(cause as any).cause || ''}` : String(cause)
                })
            )
        )
    })