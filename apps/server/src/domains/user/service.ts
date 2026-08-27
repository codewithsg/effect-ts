import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { User,TCreateUserInput, TUpdateUserInput } from "./model.ts";
import { UserAlreadyExistsError, UserDecodingError, UserNotFoundError } from "./error.ts";
import { dbQuery } from "../../db/db.ts";
import { DatabaseError } from "../../db/error.ts";
import { log } from "../../utils/logger.ts";

// Helper decoder for User Schema
const decodeUserBase = Schema.decodeUnknownEffect(User);
const decodeUserListBase = Schema.decodeUnknownEffect(Schema.Array(User));

const decodeUser = (row: any) => {
    if (row === undefined || row.availableAmount === undefined) {
        Effect.logError("🔥🔥 decodeUser row is invalid:").pipe(Effect.annotateLogs({ row }));
    }
    return decodeUserBase({
        ...row,
        availableAmount: typeof row?.availableAmount === 'string' ? parseFloat(row.availableAmount) : row?.availableAmount
    });
};

const decodeUserList = (rows: readonly any[]) => decodeUserListBase(rows.map(row => ({
    ...row,
    availableAmount: typeof row?.availableAmount === 'string' ? parseFloat(row.availableAmount) : row?.availableAmount
})));

export class Users extends Context.Service<Users, {
    readonly findById: (id: number) => Effect.Effect<User, UserNotFoundError | UserDecodingError | DatabaseError>;
    readonly create: (input: TCreateUserInput) => Effect.Effect<User, UserAlreadyExistsError | UserDecodingError | DatabaseError>;
    readonly list: () => Effect.Effect<readonly User[], UserDecodingError | DatabaseError>;
    readonly update: (input: TUpdateUserInput) => Effect.Effect<User, UserNotFoundError | UserDecodingError | DatabaseError>;
}>()(
    "Users"
) {}

export const UsersLive = Layer.effect(
    Users,
    Effect.gen(function * (){
        const sql = yield* SqlClient.SqlClient;

        return Users.of({
            create: (input)=> Effect.gen(function* (){
                const startTime = Date.now();
                const existing = yield* dbQuery((sql)=> 
                    sql<{count: number}>`SELECT count(*)::int as count FROM users WHERE email= ${input.email}`,
                'Failed to check whether user already exists'
                );

                if(existing[0]?.count > 0) {
                    // ── Wide event: user already exists ──────────────────────
                    yield* Effect.logWarning("User creation blocked — email already registered").pipe(Effect.annotateLogs({
                        event: "user.create",
                        outcome: "error",
                        "error.type": "UserAlreadyExistsError",
                        "error.code": "email_conflict",
                        "error.retriable": false,
                        "user.email": input.email,
                        duration_ms: Date.now() - startTime,
                    }));
                    return yield* new UserAlreadyExistsError({email: input.email, name: input.name});
                }

                const insertedUser = yield* dbQuery((sql)=> sql<User>`
                INSERT INTO users (name, email, role, "isVerified", "availableAmount")
                VALUES (${input.name}, ${input.email}, ${input.role}, ${input.isVerified}, ${input.availableAmount}) RETURNING *
                `,
            'Failed to insert user.');

                const user = yield* decodeUser(insertedUser[0]).pipe(
                    Effect.mapError((cause)=>new UserDecodingError({
                        message: 'Failed to decode user returned from database',
                        cause: String(cause)
                    }))
                );

                // ── Wide event: user created ──────────────────────────────
                yield* Effect.logInfo("User created").pipe(Effect.annotateLogs({
                    event: "user.create",
                    outcome: "success",
                    "user.id": user.id,
                    "user.email": user.email,
                    "user.role": user.role,
                    duration_ms: Date.now() - startTime,
                }));

                return user;
            }).pipe(Effect.provideService(SqlClient.SqlClient, sql)),
            findById: (id)=> Effect.gen(function* () {
                const data = yield* dbQuery((sql)=> sql<User>`SELECT * FROM users where id=${id} LIMIT 1`,
            'Failed to find user');
                const user = Option.fromNullOr(data[0]);
                if(Option.isNone(user)) {
                    return yield* new UserNotFoundError({id})
                }

                return yield* decodeUser(user.value).pipe(
                    Effect.mapError((cause)=>new UserDecodingError({
                        message: 'Failed to decode user returned from database',
                        cause: String(cause)
                    }))
                );
            }).pipe(Effect.provideService(SqlClient.SqlClient, sql)),
            list:()=>Effect.gen(function* () {
                const data = yield* dbQuery((sql)=> sql<User>`SELECT * FROM users ORDER BY "createdAt" desc`,
            'Failed to list users');

                return yield* decodeUserList(data).pipe(
                    Effect.mapError((cause)=>new UserDecodingError({
                        message: 'Failed to decode user returned from database',
                        cause: String(cause)
                    }))
                );
            }).pipe(Effect.provideService(SqlClient.SqlClient, sql)),
            update: (input)=> Effect.gen(function* (){
                const existingUser = yield* dbQuery((sql)=> sql<User>`
                SELECT * FROM users WHERE id=${input.id}`,
                'Failed to check whether user already exists'
            );

            const user = Option.fromNullOr(existingUser[0]);

            if(Option.isNone(user)){
                return yield* new UserNotFoundError({id:input.id});
            }

            const updatedUser = yield* dbQuery((sql)=> sql<User>`
            UPDATE users SET name=${input.name ?? user.value.name}, role=${input.role ?? user.value.role}, "isVerified"=${input.isVerified ?? user.value.isVerified}, "availableAmount"=${input.availableAmount ?? user.value.availableAmount}
            WHERE id=${input.id} RETURNING *`,
            'Failed to update user'
            );

            return yield* decodeUser(updatedUser[0]).pipe(
                Effect.mapError((cause)=>new UserDecodingError({
                    message: 'Failed to decode user returned from database',
                    cause: String(cause)
                }))
            );  
            }).pipe(Effect.provideService(SqlClient.SqlClient, sql))
        })
    })
)
