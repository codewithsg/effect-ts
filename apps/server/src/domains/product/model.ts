import {Schema} from 'effect';

export enum PRODUCT_STATUS {
    ACTIVE = 'active',
    INACTIVE = 'inactive'
}

export class Product extends Schema.Class<Product>('Product')({
    id: Schema.Number,
    name: Schema.String,
    description: Schema.String,
    price: Schema.Number,
    stock: Schema.Number,
    status: Schema.Enum(PRODUCT_STATUS),
    createdAt: Schema.Date,
    updatedAt: Schema.Date
}){} 

export const CreateProductInputSchema = Schema.Struct({
    name: Schema.NonEmptyString,
    description: Schema.String,
    price: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
    stock: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
    status: Schema.Enum(PRODUCT_STATUS)
});

export type TCreateProductInput = typeof CreateProductInputSchema.Type;

export const UpdateProductSchema = Schema.Struct({
    id: Schema.Number,
    name: Schema.optional(Schema.NonEmptyString),
    description: Schema.optional(Schema.String),
    price: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)))),
    stock: Schema.optional(Schema.Number),
    status: Schema.optional(Schema.Enum(PRODUCT_STATUS))
});

export type TUpdateProductInput = typeof UpdateProductSchema.Type;

export const GetProductByIdInputSchema = Schema.Struct({
    id: Schema.Number
});

export type TGetProductBYIdInput = typeof GetProductByIdInputSchema.Type;