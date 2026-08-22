import { Context, Effect, Layer, Schema, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Users } from "../user/service.ts";
import { Products } from "../product/service.ts";
import { retryable } from "../../utils/retry.ts";
import { TCheckoutInput, PaymentWithItems, PAYMENT_STATUS, Payment, PaymentItem } from "./model.ts";
import { UserNotFoundError, UserDecodingError } from "../user/error.ts";
import { ProductNotFoundError, ProductDecodingError, ProductInactiveError, ProductInSufficientStockError } from "../product/error.ts";
import { InsufficientBalanceError, PaymentDatabaseError, PaymentDecodingError, PaymentFailedError, PaymentGatewayError, PaymentGatewayTimeoutError } from "./error.ts";
import { DatabaseError } from "../../db/error.ts";
import { dbQuery } from "../../db/db.ts";
import { PRODUCT_STATUS } from "../product/model.ts";

const decodePayment = Schema.decodeUnknownEffect(Payment);

export class PaymentService extends Context.Service<PaymentService, {
    readonly checkout: (input: TCheckoutInput) => Effect.Effect<
        PaymentWithItems,
        UserNotFoundError | UserDecodingError | ProductNotFoundError | ProductDecodingError | ProductInactiveError | ProductInSufficientStockError | InsufficientBalanceError | PaymentDatabaseError | PaymentDecodingError | PaymentFailedError | DatabaseError
    >
}>()("PaymentService") {}

const mockPaymentGateway = (paymentId: number) => Effect.gen(function* () {
    yield* Effect.log(`Calling mock payment provider for payment ${paymentId}...`);
    // Random delay up to 4 seconds to test timeout
    const delay = Math.random() * 4000;
    yield* Effect.sleep(`${delay} millis`);
    
    // 20% chance of random gateway failure
    if (Math.random() < 0.2) {
        return yield* new PaymentGatewayError({ message: "Payment gateway internal error" });
    }
    
    yield* Effect.log(`Payment provider succeeded for payment ${paymentId}`);
    return true;
}).pipe(
    Effect.timeout("3 seconds"),
    Effect.catchTag("TimeoutError", () => Effect.fail(new PaymentGatewayTimeoutError({ message: "Payment gateway timeout" })))
);

export const PaymentLive = Layer.effect(
    PaymentService,
    Effect.gen(function* () {
        const users = yield* Users;
        const products = yield* Products;
        const sql = yield* SqlClient.SqlClient;

        return PaymentService.of({
            checkout: (input) => Effect.gen(function* () {
                const user = yield* users.findById(input.userId);

                let totalAmount = 0;
                const itemsToPurchase: { productId: number; quantity: number; unitPrice: number; totalPrice: number }[] = [];

                for (const item of input.products) {
                    const product = yield* products.findById(item.id);
                    
                    if (product.status === PRODUCT_STATUS.INACTIVE) {
                        return yield* new ProductInactiveError({ productId: product.id });
                    }
                    if (product.stock < item.quantity) {
                        return yield* new ProductInSufficientStockError({ 
                            productId: product.id, 
                            requestedStock: item.quantity, 
                            availableStock: product.stock 
                        });
                    }

                    const totalPrice = product.price * item.quantity;
                    totalAmount += totalPrice;

                    itemsToPurchase.push({
                        productId: product.id,
                        quantity: item.quantity,
                        unitPrice: product.price,
                        totalPrice
                    });
                }

                if (user.availableAmount < totalAmount) {
                    return yield* new InsufficientBalanceError({
                        userId: user.id,
                        requiredAmount: totalAmount,
                        availableAmount: user.availableAmount
                    });
                }

                const paymentResult = yield* sql.withTransaction(Effect.gen(function* () {
                    const insertedPaymentData = yield* dbQuery((sql) => sql<Payment>`
                        INSERT INTO payments (userId, totalAmount, status)
                        VALUES (${user.id}, ${totalAmount}, ${PAYMENT_STATUS.PROCESSING}) RETURNING *
                    `, "Failed to insert pending payment");
                    
                    const payment = yield* decodePayment(insertedPaymentData[0]).pipe(
                        Effect.mapError((cause) => new PaymentDecodingError({ message: 'Failed to decode payment', cause }))
                    );

                    const insertedItemsData: PaymentItem[] = [];
                    for (const item of itemsToPurchase) {
                        const itemData = yield* dbQuery((sql) => sql<PaymentItem>`
                            INSERT INTO payment_items (paymentId, productId, quantity, unitPrice, totalPrice)
                            VALUES (${payment.id}, ${item.productId}, ${item.quantity}, ${item.unitPrice}, ${item.totalPrice}) RETURNING *
                        `, "Failed to insert payment item");
                        insertedItemsData.push(itemData[0]);
                    }

                    return { payment, items: insertedItemsData };
                })).pipe(
                    Effect.catchTag("SqlError", (e) => Effect.fail(new DatabaseError({ message: "Transaction failed", cause: e })))
                );

                const { payment, items } = paymentResult;

                const gatewayCall = retryable(mockPaymentGateway(payment.id), 5);

                const gatewayResult = yield* gatewayCall.pipe(
                    Effect.match({
                        onSuccess: () => true,
                        onFailure: (e) => e
                    })
                );

                if (gatewayResult === true) {
                    yield* sql.withTransaction(Effect.gen(function* () {
                        yield* dbQuery((sql) => sql`
                            UPDATE users SET availableAmount = availableAmount - ${totalAmount} WHERE id = ${user.id}
                        `, "Failed to deduct user balance");

                        yield* dbQuery((sql) => sql`
                            UPDATE payments SET status = ${PAYMENT_STATUS.COMPLETED} WHERE id = ${payment.id}
                        `, "Failed to update payment status to completed");
                    })).pipe(
                        Effect.catchTag("SqlError", (e) => Effect.fail(new DatabaseError({ message: "Transaction failed", cause: e })))
                    );

                    return {
                        ...payment,
                        status: PAYMENT_STATUS.COMPLETED,
                        items
                    } as PaymentWithItems;

                } else {
                    yield* dbQuery((sql) => sql`
                        UPDATE payments SET status = ${PAYMENT_STATUS.FAILED} WHERE id = ${payment.id}
                    `, "Failed to update payment status to failed").pipe(Effect.provideService(SqlClient.SqlClient, sql));

                    return yield* new PaymentFailedError({
                        paymentId: payment.id,
                        message: "Payment provider failed after retries",
                        cause: gatewayResult
                    });
                }

            }).pipe(
                Effect.provideService(SqlClient.SqlClient, sql),
            )
        });
    })
);
