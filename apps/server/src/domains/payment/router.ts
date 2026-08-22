import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Effect, Schema } from 'effect';
import { CheckoutInputSchema, PaymentWithItems } from './model.ts';
import { PaymentService } from './service.ts';
import { UserNotFoundError, UserDecodingError } from '../user/error.ts';
import { ProductNotFoundError, ProductDecodingError, ProductInactiveError, ProductInSufficientStockError } from '../product/error.ts';
import { InsufficientBalanceError, PaymentDatabaseError, PaymentDecodingError, PaymentFailedError } from './error.ts';
import { DatabaseError } from '../../db/error.ts';

export class PaymentRouter extends RpcGroup.make(
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

export const PaymentRouterLive = PaymentRouter.toLayer(
    Effect.gen(function* () {
        const paymentService = yield* PaymentService;

        return {
            Checkout: (input) => paymentService.checkout(input)
        }
    })
)
