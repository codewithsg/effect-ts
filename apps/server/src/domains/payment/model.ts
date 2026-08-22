import { Schema } from 'effect';

export enum PAYMENT_STATUS {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed'
}

export class PaymentItem extends Schema.Class<PaymentItem>('PaymentItem')({
    id: Schema.Number,
    paymentId: Schema.Number,
    productId: Schema.Number,
    quantity: Schema.Number,
    unitPrice: Schema.Number,
    totalPrice: Schema.Number,
}) {}

export class Payment extends Schema.Class<Payment>('Payment')({
    id: Schema.Number,
    userId: Schema.Number,
    totalAmount: Schema.Number,
    status: Schema.Enum(PAYMENT_STATUS),
    createdAt: Schema.Date,
    updatedAt: Schema.Date,
}) {}

export class PaymentWithItems extends Payment.extend<PaymentWithItems>("PaymentWithItems")({
    items: Schema.Array(PaymentItem)
}) {}

export const CheckoutInputSchema = Schema.Struct({
    userId: Schema.Number,
    products: Schema.NonEmptyArray(Schema.Struct({
        id: Schema.Number,
        quantity: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)))
    }))
});

export type TCheckoutInput = typeof CheckoutInputSchema.Type;
