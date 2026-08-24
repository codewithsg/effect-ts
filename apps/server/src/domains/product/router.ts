import { Rpc, RpcGroup, RpcServer } from "effect/unstable/rpc";
import { CreateProductInputSchema, GetProductByIdInputSchema, Product, UpdateProductSchema } from "./model.ts";
import { Effect, Layer, Schema } from "effect";
import { ProductAlreadyExistsError, ProductDecodingError, ProductNotFoundError } from "./error.ts";
import { DatabaseError } from "../../db/error.ts";
import { Products } from "./service.ts";

export class CreateProductRouter extends RpcGroup.make(
    Rpc.make('CreateProduct', {
        payload: CreateProductInputSchema,
        success: Product,
        error: Schema.Union([ProductAlreadyExistsError, ProductDecodingError, DatabaseError])
    })
) { }

export class GetProductByIdRouter extends RpcGroup.make(
    Rpc.make('GetProductById', {
        payload: GetProductByIdInputSchema,
        success: Product,
        error: Schema.Union([ProductNotFoundError, ProductDecodingError, DatabaseError])
    })
) { }

export class UpdateProductRouter extends RpcGroup.make(
    Rpc.make('UpdateProduct', {
        payload: UpdateProductSchema,
        success: Product,
        error: Schema.Union([ProductNotFoundError, ProductDecodingError, DatabaseError])
    })
) { }

// RPC handler implementations
const CreateProductHandlerLive = CreateProductRouter.toLayer(
    Effect.gen(function* () {
        const products = yield* Products;
        return { CreateProduct: (input) => products.create(input) }
    })
)

const GetProductByIdHandlerLive = GetProductByIdRouter.toLayer(
    Effect.gen(function* () {
        const products = yield* Products;
        return { GetProductById: (input) => products.findById(input.id) }
    })
)

const UpdateProductHandlerLive = UpdateProductRouter.toLayer(
    Effect.gen(function* () {
        const products = yield* Products;
        return { UpdateProduct: (input) => products.updateProduct(input) }
    })
)

// Auto-register HTTP routes for each RPC group
const CreateProductHttpRoute = RpcServer.layerHttp({
    group: CreateProductRouter,
    path: "/rpc/product/create",
    protocol: "http"
});

const GetProductByIdHttpRoute = RpcServer.layerHttp({
    group: GetProductByIdRouter,
    path: "/rpc/product/get",
    protocol: "http"
});

const UpdateProductHttpRoute = RpcServer.layerHttp({
    group: UpdateProductRouter,
    path: "/rpc/product/update",
    protocol: "http"
});

// Single export: handlers + routes
export const ProductRouterLive = Layer.mergeAll(
    CreateProductHandlerLive,
    GetProductByIdHandlerLive,
    UpdateProductHandlerLive,
    CreateProductHttpRoute,
    GetProductByIdHttpRoute,
    UpdateProductHttpRoute
)