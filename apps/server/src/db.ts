import { PgClient } from '@effect/sql-pg'
import { Effect, Redacted } from 'effect'
import { SqlClient } from 'effect/unstable/sql'

export const sqlConnection = PgClient.layer({
    url: Redacted.make(Deno.env.get("DATABASE_URL")!)
})

export const checkDatabaseHealth = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT 1`;
    yield* Effect.logInfo('Database connected successfully...')
})