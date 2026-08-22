import {Schema} from 'effect';

export class ProductNotFoundError extends Schema.TaggedError<ProductNotFoundError>()(
    'ProductNotFoundError',
    {id:Schema.Number}
){}

export class ProductAlreadyExistsError extends Schema.TaggedError<ProductAlreadyExistsError>()(
    'ProductAlreadyExistsError',
    {name:Schema.String}
){}

export class ProductDecodingError extends Schema.TaggedError<ProductDecodingError>()(
    'ProductDecodingError',
    {
        message:Schema.String,
        cause: Schema.Unknown
    }
){}

export class ProductInSufficientStockError extends Schema.TaggedError<ProductInSufficientStockError>()(
    'ProductInSufficientStockError',
    {
        productId: Schema.Number,
        requestedStock: Schema.Number,
        availableStock: Schema.Number
    }
){}

export class ProductInactiveError extends Schema.TaggedError<ProductInactiveError>()(
    'ProductInactiveError',
    {
        productId: Schema.Number
    }
){}