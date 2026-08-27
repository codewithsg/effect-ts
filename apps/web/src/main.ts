import { Effect, Stream, Schedule } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { FetchHttpClient } from "effect/unstable/http";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { CreateUserRouter } from "../../server/src/domains/user/router.ts";
import { USER_ROLE } from "../../server/src/domains/user/model.ts";
import { CreateProductRouter } from "../../server/src/domains/product/router.ts";
import { PRODUCT_STATUS } from "../../server/src/domains/product/model.ts";
import { CheckoutRouter } from "../../server/src/domains/payment/router.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────
const randomInt = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const randomName = (index: number) => {
    const firstNames = [
        'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank',
        'Ivy', 'Jack', 'Karen', 'Leo', 'Mona', 'Nick', 'Olivia', 'Paul',
        'Quinn', 'Rita', 'Sam', 'Tina', 'Uma', 'Vince', 'Wendy', 'Xander',
        'Yara', 'Zack', 'Aria', 'Blake', 'Cora', 'Dean'
    ];
    const lastNames = [
        'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
        'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
        'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'
    ];
    const first = firstNames[index % firstNames.length];
    const last = lastNames[Math.floor(index / firstNames.length) % lastNames.length];
    return `${first} ${last} ${index}`;
};

const randomProductName = (index: number) => {
    const adjectives = [
        'Premium', 'Ultra', 'Mega', 'Super', 'Hyper', 'Elite', 'Pro',
        'Advanced', 'Classic', 'Modern', 'Smart', 'Eco', 'Deluxe', 'Prime', 'Turbo'
    ];
    const nouns = [
        'Widget', 'Gadget', 'Tool', 'Device', 'Module', 'Sensor', 'Board',
        'Kit', 'Pack', 'Unit', 'Component', 'Adapter', 'Cable', 'Hub', 'Shield'
    ];
    const adj = adjectives[index % adjectives.length];
    const noun = nouns[Math.floor(index / adjectives.length) % nouns.length];
    return `${adj} ${noun} ${index + 1}`;
};

// ─── Web & Seed Pipeline ────────────────────────────────────────────────────
const program = Effect.gen(function* () {
    yield* Effect.logInfo('🌱 Starting web app & executing RPC client seed...');

    const REQS_PER_SEC = 10;
    const TOTAL_REQUESTS = 100; // Reduced for faster checkout testing
    const delayMillis = Math.floor(1000 / REQS_PER_SEC);

    // Initialize clients
    const userClient = yield* RpcClient.make(CreateUserRouter).pipe(
        Effect.provide(RpcClient.layerProtocolHttp({ url: "http://localhost:8848/rpc/user/create" }))
    );

    const productClient = yield* RpcClient.make(CreateProductRouter).pipe(
        Effect.provide(RpcClient.layerProtocolHttp({ url: "http://localhost:8848/rpc/product/create" }))
    );

    const checkoutClient = yield* RpcClient.make(CheckoutRouter).pipe(
        Effect.provide(RpcClient.layerProtocolHttp({ url: "http://localhost:8848/rpc/payment" }))
    );

    // Seed Users
    yield* Effect.logInfo(`Seeding ${TOTAL_REQUESTS} users via RPC...`);
    const userPayloads = Array.from({ length: TOTAL_REQUESTS }).map((_, i) => ({
        name: randomName(i),
        email: `user${i}@example.com`,
        role: USER_ROLE.USER,
        isVerified: true,
        availableAmount: randomInt(1000, 50000) // Increased to ensure enough funds for checkouts
    }));

    yield* Stream.fromIterable(userPayloads).pipe(
        Stream.schedule(Schedule.spaced(`${delayMillis} millis`)),
        Stream.mapEffect(payload => userClient.CreateUser(payload).pipe(
            Effect.match({
                onFailure: (err) => console.error(`❌ Failed to seed user ${payload.email}:`, err),
                onSuccess: (res) => console.log(`✅ Successfully seeded user ${res.id}`)
            })
        ), { concurrency: REQS_PER_SEC }),
        Stream.runDrain
    );
    yield* Effect.logInfo(`${TOTAL_REQUESTS} users seeded via RPC.`);

    // Seed Products
    const totalProducts = Math.floor(TOTAL_REQUESTS / 2); // More products for variety
    yield* Effect.logInfo(`Seeding ${totalProducts} products via RPC...`);
    const productPayloads = Array.from({ length: totalProducts }).map((_, i) => {
        const name = randomProductName(i);
        return {
            name,
            description: `High-quality ${name.toLowerCase()} for professional use.`,
            price: randomInt(10, 100), // Lower prices to allow multiple checkouts
            stock: randomInt(100, 1000), // High stock so they don't run out easily
            status: PRODUCT_STATUS.ACTIVE
        };
    });

    yield* Stream.fromIterable(productPayloads).pipe(
        Stream.schedule(Schedule.spaced(`${delayMillis} millis`)),
        Stream.mapEffect(payload => productClient.CreateProduct(payload).pipe(
            Effect.match({
                onFailure: (err) => console.error(`❌ Failed to seed product ${payload.name}:`, err),
                onSuccess: (res) => console.log(`✅ Successfully seeded product ${res.id}`)
            })
        ), { concurrency: REQS_PER_SEC }),
        Stream.runDrain
    );
    yield* Effect.logInfo(`${totalProducts} products seeded via RPC.`);

    // Simulate Carts and Checkouts
    const totalCheckouts = 50000;
    yield* Effect.logInfo(`Simulating ${totalCheckouts} carts & checkouts...`);

    const checkoutPayloads = Array.from({ length: totalCheckouts }).map(() => {
        // Pick a random user (IDs start at 1 based on DB seeding logic usually)
        const userId = randomInt(1, TOTAL_REQUESTS);
        // Pick 1 to 5 random products for this "cart"
        const numItemsInCart = randomInt(1, 5);
        const products = Array.from({ length: numItemsInCart }).map(() => ({
            id: randomInt(1, totalProducts),
            quantity: randomInt(1, 3)
        }));

        return { userId, products: products as [any, ...any[]] }; // Type cast for NonEmptyArray
    });

    yield* Stream.fromIterable(checkoutPayloads).pipe(
        // Removed rate limit to hit API as much as possible
        Stream.mapEffect(payload => checkoutClient.Checkout(payload).pipe(
            // Effect.match returns Effect<void, never> — both paths handled, nothing left to catch.
            Effect.match({
                onFailure: (err) => console.error(`❌ Checkout failed for user ${payload.userId}:`, err),
                onSuccess: (res) => console.log(`🛒 Checkout completed for user ${payload.userId}, payment ${res.id}`)
            })
        ), { concurrency: 100 }), // Increased concurrency for maximum hits
        Stream.runDrain
    );
    yield* Effect.logInfo(`${totalCheckouts} checkouts completed via RPC.`);

    yield* Effect.logInfo('✅ RPC seed completed successfully! Web app ready.');

    Deno.serve(
        {
            port: 8849,
            onListen: () => console.log("running web on localhost:8849")
        },
        () => new Response("Web running on 8849 with RPC clients initialized")
    );
}).pipe(Effect.withSpan("Web.startup"));

Effect.runPromise(
    program.pipe(
        Effect.scoped,
        Effect.provide(FetchHttpClient.layer),
        Effect.provide(RpcSerialization.layerJson),
        Effect.provide(DevTools.layer())
    )
).catch(console.error);