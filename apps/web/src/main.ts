import { Effect, Stream, Schedule } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { CreateUserRouter } from "../../server/src/domains/user/router.ts";
import { USER_ROLE } from "../../server/src/domains/user/model.ts";
import { CreateProductRouter } from "../../server/src/domains/product/router.ts";
import { PRODUCT_STATUS } from "../../server/src/domains/product/model.ts";

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
    const TOTAL_REQUESTS = 1000;
    const delayMillis = Math.floor(1000 / REQS_PER_SEC);

    // Initialize clients
    const userClient = yield* RpcClient.make(CreateUserRouter).pipe(
        Effect.provide(RpcClient.layerProtocolHttp({ url: "http://localhost:8848/rpc/user/create" }))
    );
    
    const productClient = yield* RpcClient.make(CreateProductRouter).pipe(
        Effect.provide(RpcClient.layerProtocolHttp({ url: "http://localhost:8848/rpc/product/create" }))
    );

    // Seed Users
    yield* Effect.logInfo(`Seeding ${TOTAL_REQUESTS} users via RPC...`);
    const userPayloads = Array.from({ length: TOTAL_REQUESTS }).map((_, i) => ({
        name: randomName(i),
        email: `user${i}@example.com`,
        role: USER_ROLE.USER,
        isVerified: true,
        availableAmount: randomInt(1000, 10000)
    }));

    yield* Stream.fromIterable(userPayloads).pipe(
        Stream.schedule(Schedule.spaced(`${delayMillis} millis`)),
        Stream.mapEffect(payload => userClient.CreateUser(payload), { concurrency: REQS_PER_SEC }),
        Stream.runDrain
    );
    yield* Effect.logInfo(`${TOTAL_REQUESTS} users seeded via RPC.`);

    // Seed Products
    const totalProducts = Math.floor(TOTAL_REQUESTS / 10);
    yield* Effect.logInfo(`Seeding ${totalProducts} products via RPC...`);
    const productPayloads = Array.from({ length: totalProducts }).map((_, i) => {
        const name = randomProductName(i);
        return {
            name,
            description: `High-quality ${name.toLowerCase()} for professional use.`,
            price: randomInt(100, 1000),
            stock: randomInt(10, 100),
            status: PRODUCT_STATUS.ACTIVE
        };
    });

    yield* Stream.fromIterable(productPayloads).pipe(
        Stream.schedule(Schedule.spaced(`${delayMillis} millis`)),
        Stream.mapEffect(payload => productClient.CreateProduct(payload), { concurrency: REQS_PER_SEC }),
        Stream.runDrain
    );
    yield* Effect.logInfo(`${totalProducts} products seeded via RPC.`);

    yield* Effect.logInfo('✅ RPC seed completed successfully! Web app ready.');

    Deno.serve(
        { 
            port: 8849, 
            onListen: () => console.log("running web on localhost:8849") 
        }, 
        () => new Response("Web running on 8849 with RPC clients initialized")
    );
});

Effect.runPromise(
    program.pipe(
        Effect.scoped,
        Effect.provide(FetchHttpClient.layer),
        Effect.provide(RpcSerialization.layerJson)
    )
).catch(console.error);