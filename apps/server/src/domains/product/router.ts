import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { CreateProductInputSchema, GetProductByIdInputSchema, Product, UpdateProductSchema } from "./model.ts";
import { Effect, Schema } from "effect";
import { ProductAlreadyExistsError, ProductDecodingError, ProductNotFoundError } from "./error.ts";
import { DatabaseError } from "../../db/error.ts";
import { Products } from "./service.ts";

export class ProductRouter extends RpcGroup.make(
    Rpc.make('CreateProduct', {
        payload: CreateProductInputSchema,
        success: Product,
        error: Schema.Union([ProductAlreadyExistsError, ProductDecodingError,DatabaseError])
    }),
    Rpc.make('GetProductById',{
        payload: GetProductByIdInputSchema,
        success: Product,
        error: Schema.Union([ProductNotFoundError, ProductDecodingError, DatabaseError])
    }),
    Rpc.make('UpdateProduct',{
        payload: UpdateProductSchema,
        success: Product,
        error: Schema.Union([ProductNotFoundError,ProductDecodingError,DatabaseError])
    })
){}

export const ProductRouterLive = ProductRouter.toLayer(
    Effect.gen(function* (){
        const products = yield* Products;

        return {
            CreateProduct: (input)=> products.create(input),
            GetProductById:(input)=> products.findById(input.id),
            UpdateProduct:(input)=> products.updateProduct(input)
        }
    })
)