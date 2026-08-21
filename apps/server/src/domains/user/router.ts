import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { CreateUserInputSchema, GetUserByIdInputSchema, User } from "./model.ts";
import { UserAlreadyExistsError, UserDecodingError, UserNotFoundError } from "./error.ts";
import { Effect, Schema } from "effect";
import { Users } from "./service.ts";
import { DatabaseError } from "../../db/error.ts";

export class UserRouter extends RpcGroup.make(
    Rpc.make('CreateUser', {
        payload: CreateUserInputSchema,
        success: User,
        error: Schema.Union([UserAlreadyExistsError, UserDecodingError, DatabaseError])
    }),
    Rpc.make('GetUserById', {
        payload: GetUserByIdInputSchema,
        success: User,
        error: Schema.Union([UserNotFoundError, UserDecodingError, DatabaseError])
    }),
    Rpc.make('ListUsers',{
        payload:Schema.Void,
        success: Schema.Array(User),
        error: Schema.Union([UserDecodingError, DatabaseError])
    })
) { }

export const UserRouterLive = UserRouter.toLayer(
    Effect.gen(function* () {
        const users = yield* Users;

        return {
            CreateUser: (input)=>users.create(input),
            GetUserById: ({id})=>users.findById(id),
            ListUsers:()=>users.list()
        }
    })
)