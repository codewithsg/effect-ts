import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { User,TCreateUserInput } from "./model.ts";
import { UserAlreadyExistsError, UserDecodingError, UserNotFoundError } from "./error.ts";
import { dbQuery } from "../../db/db.ts";
import { DatabaseError } from "../../db/error.ts";

// Helper decoder for User Schema
const decodeUser = Schema.decodeUnknownEffect(User);
const decodeUserList = Schema.decodeUnknownEffect(Schema.Array(User));

export class Users extends Context.Service<Users, {
    readonly findById: (id: number) => Effect.Effect<User, UserNotFoundError | UserDecodingError | DatabaseError>;
    readonly create: (input: TCreateUserInput) => Effect.Effect<User, UserAlreadyExistsError | UserDecodingError | DatabaseError>;
    readonly list: () => Effect.Effect<readonly User[], UserDecodingError | DatabaseError>;
}>()(
    "Users"
) {}

export const UsersLive = Layer.effect(
    Users,
    Effect.gen(function * (){
        const sql = yield* SqlClient.SqlClient;

        return Users.of({
            create: (input)=> Effect.gen(function* (){
                const existing = yield* dbQuery((sql)=> 
                    sql<{count: number}>`SELECT count(*)::int as count FROM users WHERE email= ${input.email}`,
                'Failed to check whether user already exists'
                );

                if(existing[0]?.count > 0) {
                    return yield* new UserAlreadyExistsError({email: input.email});
                }

                const insertedUser = yield* dbQuery((sql)=> sql<User>`
                INSERT INTO users (name,email,role,isVerified)
                VALUES (${input.name}, ${input.email}, ${input.role}, ${input.isVerified}) RETURNING *
                `,
            'Failed to insert user.');

                return yield* decodeUser(insertedUser[0]).pipe(
                    Effect.mapError((cause)=>new UserDecodingError({
                        message: 'Failed to decode user returned from database',
                        cause
                    }))
                )
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
                        cause
                    }))
                );
            }).pipe(Effect.provideService(SqlClient.SqlClient, sql)),
            list:()=>Effect.gen(function* () {
                const data = yield* dbQuery((sql)=> sql<User[]>`SELECT * FROM users ORDER BY created_at desc`,
            'Failed to list users');

                return yield* decodeUserList(data).pipe(
                    Effect.mapError((cause)=>new UserDecodingError({
                        message: 'Failed to decode user returned from database',
                        cause
                    }))
                );
            }).pipe(Effect.provideService(SqlClient.SqlClient, sql)) 
        })
    })
)

