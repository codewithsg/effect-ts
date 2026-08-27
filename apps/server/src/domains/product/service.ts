import { Context, Effect, Layer, Option, Schema } from "effect";
import { Product, TCreateProductInput, TUpdateProductInput } from "./model.ts";
import { ProductAlreadyExistsError, ProductDecodingError, ProductNotFoundError } from "./error.ts";
import { DatabaseError } from "../../db/error.ts";
import { dbQuery } from "../../db/db.ts";
import { SqlClient } from "effect/unstable/sql";

const decodeProductBase = Schema.decodeUnknownEffect(Product);
const decodeProductListBase = Schema.decodeUnknownEffect(Schema.Array(Product));

const decodeProduct = (row: any) => decodeProductBase({
    ...row,
    price: typeof row.price === 'string' ? parseFloat(row.price) : row.price
});

const decodeProductList = (rows: readonly any[]) => decodeProductListBase(rows.map(row => ({
    ...row,
    price: typeof row.price === 'string' ? parseFloat(row.price) : row.price
})));

export class Products extends Context.Service<Products,{
    readonly create: (input: TCreateProductInput) => Effect.Effect<Product, ProductAlreadyExistsError | ProductDecodingError | DatabaseError>;
    readonly findById: (id:number) => Effect.Effect<Product, ProductNotFoundError | ProductDecodingError | DatabaseError>
    readonly updateProduct: (input:TUpdateProductInput) => Effect.Effect<Product,ProductNotFoundError | ProductDecodingError | DatabaseError>;
    
}>()('Products'){}

export const ProductsLive = Layer.effect(
    Products,
    Effect.gen(function * (){
        const sql = yield* SqlClient.SqlClient;

        return Products.of({
            create: (input) => Effect.gen(function* (){
                const startTime = Date.now();
                const existing = yield* dbQuery((sql)=>
                sql<{count:number}>`SELECT count(*)::int as count FROM products WHERE name=${input.name}`,
                'Failed to check whether product already exists'
                );

                if(existing[0]?.count > 0) {
                    // ── Wide event: product name conflict ─────────────────────
                    yield* Effect.logWarning("Product creation blocked — name already exists").pipe(
                        Effect.annotateLogs({
                            event: "product.create",
                            outcome: "error",
                            "error.type": "ProductAlreadyExistsError",
                            "error.code": "name_conflict",
                            "error.retriable": false,
                            "product.name": input.name,
                            duration_ms: Date.now() - startTime,
                        })
                    );
                    return yield* new ProductAlreadyExistsError({name: input.name});
                }

                const insertedProduct = yield* dbQuery((sql)=> sql<Product>`
                INSERT INTO products (name,description,price,stock,status)
                VALUES (${input.name}, ${input.description}, ${input.price}, ${input.stock}, ${input.status})
                RETURNING *`,
                'Failed to create product'
            );

            const product = yield* decodeProduct(insertedProduct[0]).pipe(
                Effect.mapError((cause)=>new ProductDecodingError({
                    message: 'Failed to decode product returned from database',
                    cause
                }))
            );

            // ── Wide event: product created ────────────────────────────
            yield* Effect.logInfo("Product created").pipe(
                Effect.annotateLogs({
                    event: "product.create",
                    outcome: "success",
                    "product.id": product.id,
                    "product.name": product.name,
                    "product.price": product.price,
                    "product.stock": product.stock,
                    "product.status": product.status,
                    duration_ms: Date.now() - startTime,
                })
            );

            return product;
            }).pipe(Effect.provideService(SqlClient.SqlClient, sql)),
            findById: (id)=> Effect.gen(function* (){
                const data = yield* dbQuery((sql)=> sql<Product>`SELECT * FROM products WHERE id=${id}`,
            'Failed to fetch product');
            const product = Option.fromNullOr(data[0]);
            if(Option.isNone(product)){
                return yield* new ProductNotFoundError({id})
            }

            return yield* decodeProduct(product.value).pipe(
                Effect.mapError((cause)=>new ProductDecodingError({
                    message: 'Failed to decode product returned from database',
                    cause
                }))
            );
            }).pipe(Effect.provideService(SqlClient.SqlClient,sql)),
            updateProduct: (input:TUpdateProductInput) => Effect.gen(function* (){
                const existingProduct = yield* dbQuery((sql)=> sql<Product>
                `SELECT count(*)::int as count,* FROM products WHERE id=${input.id}`,
                'Failed to check whether product already exists'
            );

            const product = Option.fromNullOr(existingProduct[0]);

            if(Option.isNone(product)){
                return yield* new ProductNotFoundError({id:input.id});
            }

            const updatedProduct = yield* dbQuery((sql)=> sql<Product>`
            UPDATE products SET name=${input.name ?? product.value.name}, description=${input.description ?? product.value.description}, price=${input.price ?? product.value.price}, stock=${input.stock ?? product.value.stock}, status=${input.status ?? product.value.status}
            WHERE id=${input.id} RETURNING *`,
            'Failed to update product'
            );

            return yield* decodeProduct(updatedProduct[0]).pipe(
                Effect.mapError((cause)=>new ProductDecodingError({
                    message: 'Failed to decode product returned from database',
                    cause
                }))
            );  
            }).pipe(Effect.provideService(SqlClient.SqlClient,sql))
        })
    })
)