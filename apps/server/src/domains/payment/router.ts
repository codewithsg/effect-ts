import { Rpc, RpcGroup, RpcServer } from 'effect/unstable/rpc';
import { Effect, Layer, Schema } from 'effect';
import { CheckoutInputSchema, PaymentWithItems } from './model.ts';
import { PaymentService } from './service.ts';
import { UserNotFoundError, UserDecodingError } from '../user/error.ts';
import { ProductNotFoundError, ProductDecodingError, ProductInactiveError, ProductInSufficientStockError } from '../product/error.ts';
import { InsufficientBalanceError, PaymentDatabaseError, PaymentDecodingError, PaymentFailedError } from './error.ts';
import { DatabaseError } from '../../db/error.ts';

export class CheckoutRouter extends RpcGroup.make(
    Rpc.make('Checkout', {
        payload: CheckoutInputSchema,
        success: PaymentWithItems,
        error: Schema.Union([
            UserNotFoundError,
            UserDecodingError,
            ProductNotFoundError,
            ProductDecodingError,
            ProductInactiveError,
            ProductInSufficientStockError,
            InsufficientBalanceError,
            PaymentDatabaseError,
            PaymentDecodingError,
            PaymentFailedError,
            DatabaseError
        ])
    })
) {}

// RPC handler implementation
const CheckoutHandlerLive = CheckoutRouter.toLayer(
    Effect.gen(function* () {
        const paymentService = yield* PaymentService;
        return { Checkout: (input) => paymentService.checkout(input) }
    })
)

// Auto-registers POST /rpc/payment for the entire CheckoutRouter group
const PaymentHttpRoutes = RpcServer.layerHttp({
    group: CheckoutRouter,
    path: "/rpc/payment",
    protocol: "http"
});

// Single export: handlers + routes
export const PaymentRouterLive = Layer.mergeAll(
    CheckoutHandlerLive,
    PaymentHttpRoutes
)
