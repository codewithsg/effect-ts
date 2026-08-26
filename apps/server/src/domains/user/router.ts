import { Rpc, RpcGroup, RpcServer } from 'effect/unstable/rpc';
import { CreateUserInputSchema, GetUserByIdInputSchema, User, UpdateUserInputSchema } from "./model.ts";
import { UserAlreadyExistsError, UserDecodingError, UserNotFoundError } from "./error.ts";
import { Effect, Layer, Schema } from "effect";
import { Users } from "./service.ts";
import { DatabaseError } from "../../db/error.ts";

export class CreateUserRouter extends RpcGroup.make(
    Rpc.make('CreateUser', {
        payload: CreateUserInputSchema,
        success: User,
        error: Schema.Union([UserAlreadyExistsError, UserDecodingError, DatabaseError])
    })
) { }

export class GetUserByIdRouter extends RpcGroup.make(
    Rpc.make('GetUserById', {
        payload: GetUserByIdInputSchema,
        success: User,
        error: Schema.Union([UserNotFoundError, UserDecodingError, DatabaseError])
    })
) { }

export class UpdateUserRouter extends RpcGroup.make(
    Rpc.make('UpdateUser', {
        payload: UpdateUserInputSchema,
        success: User,
        error: Schema.Union([UserNotFoundError, UserDecodingError, DatabaseError])
    })
) { }

export class ListUsersRouter extends RpcGroup.make(
    Rpc.make('ListUsers', {
        payload: Schema.Void,
        success: Schema.Array(User),
        error: Schema.Union([UserDecodingError, DatabaseError])
    })
) { }

// RPC handler implementations
const CreateUserHandlerLive = CreateUserRouter.toLayer(
    Effect.gen(function* () {
        const users = yield* Users;
        return { CreateUser: (input) => users.create(input) }
    })
)

const GetUserByIdHandlerLive = GetUserByIdRouter.toLayer(
    Effect.gen(function* () {
        const users = yield* Users;
        return { GetUserById: ({ id }) => users.findById(id) }
    })
)

const UpdateUserHandlerLive = UpdateUserRouter.toLayer(
    Effect.gen(function* () {
        const users = yield* Users;
        return { UpdateUser: (input) => users.update(input) }
    })
)

const ListUsersHandlerLive = ListUsersRouter.toLayer(
    Effect.gen(function* () {
        const users = yield* Users;
        return { ListUsers: () => users.list() }
    })
)

// Auto-register HTTP routes for each RPC group
// Each route layer must have its handler layer provided to it
const CreateUserHttpRoute = RpcServer.layerHttp({
    group: CreateUserRouter,
    path: "/rpc/user/create",
    protocol: "http"
}).pipe(Layer.provide(CreateUserHandlerLive));

const GetUserByIdHttpRoute = RpcServer.layerHttp({
    group: GetUserByIdRouter,
    path: "/rpc/user/get",
    protocol: "http"
}).pipe(Layer.provide(GetUserByIdHandlerLive));

const UpdateUserHttpRoute = RpcServer.layerHttp({
    group: UpdateUserRouter,
    path: "/rpc/user/update",
    protocol: "http"
}).pipe(Layer.provide(UpdateUserHandlerLive));

const ListUsersHttpRoute = RpcServer.layerHttp({
    group: ListUsersRouter,
    path: "/rpc/user/list",
    protocol: "http"
}).pipe(Layer.provide(ListUsersHandlerLive));

// Single export: routes (handlers are already wired into each route layer)
export const UserRouterLive = Layer.mergeAll(
    CreateUserHttpRoute,
    GetUserByIdHttpRoute,
    UpdateUserHttpRoute,
    ListUsersHttpRoute
)