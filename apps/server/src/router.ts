import { Layer } from "effect";
import { UserRouterLive } from "./domains/user/router.ts";
import { ProductRouterLive } from "./domains/product/router.ts";
import { PaymentRouterLive } from "./domains/payment/router.ts";

export const MainRouterLive = Layer.mergeAll(
    UserRouterLive,
    ProductRouterLive,
    PaymentRouterLive
);
