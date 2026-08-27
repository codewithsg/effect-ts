import { Context, Effect, Layer, Schema, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Users } from "../user/service.ts";
import { Products } from "../product/service.ts";
import { TCheckoutInput, PaymentWithItems, PAYMENT_STATUS, Payment, PaymentItem } from "./model.ts";
import { UserNotFoundError, UserDecodingError } from "../user/error.ts";
import { ProductNotFoundError, ProductDecodingError, ProductInactiveError, ProductInSufficientStockError } from "../product/error.ts";
import { InsufficientBalanceError, PaymentDatabaseError, PaymentDecodingError, PaymentFailedError, PaymentGatewayError, PaymentGatewayTimeoutError } from "./error.ts";
import { DatabaseError } from "../../db/error.ts";
import { dbQuery } from "../../db/db.ts";
import { PRODUCT_STATUS } from "../product/model.ts";
import { log } from "../../utils/logger.ts";

const decodePaymentBase = Schema.decodeUnknownEffect(Payment);
const decodePayment = (row: any) => decodePaymentBase({
    ...row,
    totalAmount: typeof row.totalAmount === 'string' ? Number(row.totalAmount) : row.totalAmount
});

export class PaymentService extends Context.Service<PaymentService, {
    readonly checkout: (input: TCheckoutInput) => Effect.Effect<
        PaymentWithItems,
        UserNotFoundError | UserDecodingError | ProductNotFoundError | ProductDecodingError | ProductInactiveError | ProductInSufficientStockError | InsufficientBalanceError | PaymentDatabaseError | PaymentDecodingError | PaymentFailedError | DatabaseError
    >
}>()("PaymentService") { }

const mockPaymentGateway = (paymentId: number, userId: number) => Effect.gen(function* () {
    yield* Effect.sleep("100 millis");
    // Simulate a payment gateway failure for every 5th user to test error logging reliably
    if (userId % 5 === 0) {
        return yield* Effect.fail("Gateway rejected the transaction for testing purposes (simulated)");
    }
    return true;
}).pipe(
    Effect.timeout("3 seconds"),
    Effect.catchTag("TimeoutError", () => Effect.fail(new PaymentGatewayTimeoutError({ userId, message: "Payment gateway timeout" })))
);

// ── Extracted to a named function so TypeScript can check the return type
//    top-down instead of inferring bottom-up from a complex generator.
//    Effect.gen with many yield* error types collapses to `unknown` without this.
type CheckoutError =
    | UserNotFoundError | UserDecodingError
    | ProductNotFoundError | ProductDecodingError | ProductInactiveError | ProductInSufficientStockError
    | InsufficientBalanceError
    | PaymentDatabaseError | PaymentDecodingError | PaymentFailedError
    | DatabaseError;

const makeCheckout = (
    users: InstanceType<typeof Users>,
    products: InstanceType<typeof Products>,
    sql: SqlClient.SqlClient,
    input: TCheckoutInput
) =>
    (Effect.gen(function* () {
        const startTime = Date.now();
        const user = yield* users.findById(input.userId);

        let totalAmount = 0;
        const itemsToPurchase: { productId: number; quantity: number; unitPrice: number; totalPrice: number }[] = [];

        for (const item of input.products) {
            const product = yield* products.findById(item.id);

            if (product.status === PRODUCT_STATUS.INACTIVE) {
                yield* Effect.logWarning("Checkout blocked — inactive product").pipe(Effect.annotateLogs({
                    event: "checkout",
                    outcome: "error",
                    "error.type": "ProductInactiveError",
                    "error.code": "product_inactive",
                    "error.retriable": false,
                    "user.id": user.id,
                    "cart.item_count": input.products.length,
                    "product.id": product.id,
                    duration_ms: Date.now() - startTime,
                }));
                return yield* new ProductInactiveError({ productId: product.id });
            }
            if (product.stock < item.quantity) {
                yield* Effect.logWarning("Checkout blocked — insufficient stock").pipe(Effect.annotateLogs({
                    event: "checkout",
                    outcome: "error",
                    "error.type": "ProductInSufficientStockError",
                    "error.code": "insufficient_stock",
                    "error.retriable": false,
                    "user.id": user.id,
                    "cart.item_count": input.products.length,
                    "product.id": product.id,
                    "product.requested_stock": item.quantity,
                    "product.available_stock": product.stock,
                    duration_ms: Date.now() - startTime,
                }));
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
            // ── Wide event: insufficient balance ────────────────────────────
            yield* Effect.logWarning("Checkout blocked — insufficient balance").pipe(Effect.annotateLogs({
                event: "checkout",
                outcome: "error",
                "error.type": "InsufficientBalanceError",
                "error.code": "insufficient_balance",
                "error.retriable": false,
                "user.id": user.id,
                "user.available_amount": user.availableAmount,
                "cart.item_count": input.products.length,
                "cart.total_cents": totalAmount,
                duration_ms: Date.now() - startTime,
            }));
            return yield* new InsufficientBalanceError({
                userId: user.id,
                requiredAmount: totalAmount,
                availAmount: user.availableAmount
            });
        }

        const paymentResult = yield* sql.withTransaction(Effect.gen(function* () {
            const insertedPaymentData = yield* dbQuery((sql) => sql<Payment>`
                INSERT INTO payments ("userId", "totalAmount", status)
                VALUES (${user.id}, ${totalAmount}, ${PAYMENT_STATUS.PROCESSING}) RETURNING *
            `, "Failed to insert pending payment");

            const payment = yield* decodePayment(insertedPaymentData[0]).pipe(
                Effect.mapError((cause) => new PaymentDecodingError({ userId: user.id, message: 'Failed to decode payment', cause: String(cause) })),
                // Log the decoding error before it propagates — this path was silently missing from the log file.
                Effect.tapErrorTag("PaymentDecodingError", (err) =>
                    Effect.logError("Checkout failed — payment record could not be decoded").pipe(
                        Effect.annotateLogs({
                            event: "checkout",
                            outcome: "error",
                            "error.type": "PaymentDecodingError",
                            "error.code": "decoding_failure",
                            "error.retriable": false,
                            "error.cause": err.cause ?? "unknown",
                            "user.id": user.id,
                            "cart.item_count": input.products.length,
                            "cart.total_cents": totalAmount,
                            duration_ms: Date.now() - startTime,
                        })
                    )
                )
            );

            const insertedItemsData: PaymentItem[] = [];
            for (const item of itemsToPurchase) {
                const itemData = yield* dbQuery((sql) => sql<PaymentItem>`
                    INSERT INTO payment_items ("paymentId", "productId", quantity, "unitPrice", "totalPrice")
                    VALUES (${payment.id}, ${item.productId}, ${item.quantity}, ${item.unitPrice}, ${item.totalPrice}) RETURNING *
                `, "Failed to insert payment item");
                const itemRow = itemData[0];
                insertedItemsData.push({
                    ...itemRow,
                    unitPrice: typeof itemRow.unitPrice === 'string' ? Number(itemRow.unitPrice) : itemRow.unitPrice,
                    totalPrice: typeof itemRow.totalPrice === 'string' ? Number(itemRow.totalPrice) : itemRow.totalPrice,
                });
            }

            return { ...payment, items: insertedItemsData };
        })).pipe(
            Effect.catchTag("DatabaseError", (e) => Effect.fail(new DatabaseError({ message: "Transaction failed", cause: String(e) })))
        );

        const payment = paymentResult;
        const { items } = paymentResult;

        const gatewayStart = Date.now();
        const gatewayCall = Effect.retry(mockPaymentGateway(payment.id, user.id), { times: 5 });

        const gatewayResult = yield* gatewayCall.pipe(
            Effect.match({
                onSuccess: () => true,
                onFailure: (e) => e
            })
        );
        const gatewayLatencyMs = Date.now() - gatewayStart;

        if (gatewayResult === true) {
            yield* sql.withTransaction(Effect.gen(function* () {
                yield* dbQuery((sql) => sql`
                    UPDATE users SET "availableAmount" = "availableAmount" - ${totalAmount} WHERE id = ${user.id}
                `, "Failed to deduct user balance");

                yield* dbQuery((sql) => sql`
                    UPDATE payments SET status = ${PAYMENT_STATUS.COMPLETED} WHERE id = ${payment.id}
                `, "Failed to update payment status to completed");
            })).pipe(
                Effect.catchTag("DatabaseError", (e) => Effect.fail(new DatabaseError({ message: "Transaction failed", cause: String(e) })))
            );

            const paymentResultObj = {
                ...payment,
                status: PAYMENT_STATUS.COMPLETED,
                items
            } as PaymentWithItems;

            // ── Wide event: successful checkout ─────────────────────────────
            // One canonical log line per request with ALL context attached.
            // Following loggingsucks.com: high-cardinality, high-dimensionality.
            yield* Effect.logInfo("Checkout completed").pipe(
                Effect.annotateLogs({
                    event: "checkout",
                    outcome: "success",
                    "user.id": user.id,
                    "user.available_amount_before": user.availableAmount,
                    "cart.item_count": input.products.length,
                    "cart.total_cents": totalAmount,
                    "payment.id": payment.id,
                    "payment.status": PAYMENT_STATUS.COMPLETED,
                    "payment.method": "card",
                    "payment.provider": "mock_gateway",
                    "payment.latency_ms": gatewayLatencyMs,
                    duration_ms: Date.now() - startTime,
                })
            );

            return paymentResultObj;

        } else {
            yield* dbQuery((sql) => sql`
                UPDATE payments SET status = ${PAYMENT_STATUS.FAILED} WHERE id = ${payment.id}
            `, "Failed to update payment status to failed").pipe(Effect.provideService(SqlClient.SqlClient, sql));

            // ── Wide event: gateway failure ──────────────────────────────────
            yield* Effect.logError("Checkout failed — payment gateway rejected").pipe(
                Effect.annotateLogs({
                    event: "checkout",
                    outcome: "error",
                    "error.type": "PaymentFailedError",
                    "error.code": "gateway_rejection",
                    "error.retriable": false,
                    "error.cause": String(gatewayResult),
                    "user.id": user.id,
                    "cart.item_count": input.products.length,
                    "cart.total_cents": totalAmount,
                    "payment.id": payment.id,
                    "payment.status": PAYMENT_STATUS.FAILED,
                    "payment.latency_ms": gatewayLatencyMs,
                    duration_ms: Date.now() - startTime,
                })
            );

            return yield* new PaymentFailedError({
                paymentId: payment.id,
                userId: user.id,
                message: "Payment provider failed after retries",
                cause: String(gatewayResult)
            });
        }
    // TypeScript's generator inference collapses to `unknown` when yield* chains
    // are too complex (nested generators, 10+ error types, conditional branches).
    // Cast here — before .pipe() — so tapErrorTag can see the full CheckoutError union.
    }) as unknown as Effect.Effect<PaymentWithItems, CheckoutError, SqlClient.SqlClient>).pipe(
            // ── Log ALL typed errors that weren't already logged inline ──────────
            // These bubble up via yield* from sub-services without any Effect.log* call,
            // so they'd be invisible in the log file (seen only by the web client).
            Effect.tapErrorTag("UserNotFoundError", (err) =>
                Effect.logError("Checkout failed — user not found").pipe(Effect.annotateLogs({
                        event: "checkout", outcome: "error",
                        "error.type": "UserNotFoundError", "error.code": "user_not_found",
                        "error.retriable": false, "user.id": input.userId,
                }))
            ),
            Effect.tapErrorTag("UserDecodingError", (err) =>
                Effect.logError("Checkout failed — user record could not be decoded").pipe(Effect.annotateLogs({
                        event: "checkout", outcome: "error",
                        "error.type": "UserDecodingError", "error.code": "user_decoding_failure",
                        "error.retriable": false, "error.cause": String(err.cause),
                }))
            ),
            Effect.tapErrorTag("ProductNotFoundError", (err) =>
                Effect.logError("Checkout failed — product not found").pipe(Effect.annotateLogs({
                        event: "checkout", outcome: "error",
                        "error.type": "ProductNotFoundError", "error.code": "product_not_found",
                        "error.retriable": false, "product.id": err.id,
                }))
            ),
            Effect.tapErrorTag("ProductDecodingError", (err) =>
                Effect.logError("Checkout failed — product record could not be decoded").pipe(Effect.annotateLogs({
                        event: "checkout", outcome: "error",
                        "error.type": "ProductDecodingError", "error.code": "product_decoding_failure",
                        "error.retriable": false, "error.cause": String(err.cause),
                }))
            ),
            Effect.tapErrorTag("DatabaseError", (err) =>
                Effect.logError("Checkout failed — database error").pipe(Effect.annotateLogs({
                        event: "checkout", outcome: "error",
                        "error.type": "DatabaseError", "error.code": "database_failure",
                        "error.retriable": true, "error.cause": err.cause ?? err.message,
                }))
            ),
            Effect.provideService(SqlClient.SqlClient, sql),
            // Effect 4.x uses `catchDefect` (not the removed `catchAllDefect`).
            // Instead of re-dying, log the defect as a wide event so it lands in the log file.
            Effect.catchDefect((defect) => Effect.gen(function* () {
                yield* Effect.logError("Unexpected defect in checkout — programming error or runtime fault").pipe(Effect.annotateLogs({
                        event: "checkout",
                        outcome: "defect",
                        "error.type": "Defect",
                        "error.kind": defect instanceof Error ? defect.name : "UnknownDefect",
                        "error.message": defect instanceof Error ? defect.message : String(defect),
                        "error.retriable": false,
                        "user.id": input.userId,
                        "cart.item_count": input.products.length,
                }));
                return yield* Effect.fail(new PaymentFailedError({
                    paymentId: -1,
                    userId: input.userId,
                    message: `Unexpected defect: ${defect instanceof Error ? defect.message : String(defect)}`,
                    cause: defect instanceof Error ? defect.stack : String(defect),
                }));
            })));

export const PaymentLive = Layer.effect(
    PaymentService,
    Effect.gen(function* () {
        const users = yield* Users;
        const products = yield* Products;
        const sql = yield* SqlClient.SqlClient;

        return PaymentService.of({
            // Clean one-liner: type is already checked inside makeCheckout
            checkout: (input) => makeCheckout(users, products, sql, input)
        });
    })
);
