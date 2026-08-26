import { Schema } from 'effect';

export class InsufficientBalanceError extends Schema.TaggedError<InsufficientBalanceError>()(
    'InsufficientBalanceError',
    {
        userId: Schema.Number,
        requiredAmount: Schema.Number,
        availableAmount: Schema.Number
    }
) {}

export class PaymentFailedError extends Schema.TaggedError<PaymentFailedError>()(
    'PaymentFailedError',
    {
        paymentId: Schema.Number,
        userId: Schema.Number,
        message: Schema.String,
        cause: Schema.optional(Schema.Unknown)
    }
) {}

export class PaymentDatabaseError extends Schema.TaggedError<PaymentDatabaseError>()(
    'PaymentDatabaseError',
    {
        userId: Schema.optional(Schema.Number),
        message: Schema.String,
        cause: Schema.optional(Schema.Unknown)
    }
) {}

export class PaymentDecodingError extends Schema.TaggedError<PaymentDecodingError>()(
    'PaymentDecodingError',
    {
        userId: Schema.optional(Schema.Number),
        message: Schema.String,
        cause: Schema.optional(Schema.Unknown)
    }
) {}

export class PaymentGatewayError extends Schema.TaggedError<PaymentGatewayError>()(
    'MockPaymentGatewayError',
    {
        userId: Schema.Number,
        message: Schema.String
    }
) {}

export class PaymentGatewayTimeoutError extends Schema.TaggedError<PaymentGatewayTimeoutError>()(
    'PaymentGatewayTimeoutError',
    {
        userId: Schema.Number,
        message: Schema.String
    }
) {}
