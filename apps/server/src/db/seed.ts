import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql';
import { log } from "../utils/logger.ts";

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

// ─── Truncate ───────────────────────────────────────────────────────────────
const truncateTables = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* Effect.sync(() => log.info('Truncating tables...'));

    // Order matters: child tables first to respect FK constraints
    yield* sql`TRUNCATE TABLE payment_items, payments, products, users RESTART IDENTITY CASCADE`;

    yield* Effect.sync(() => log.info('All tables truncated.'));
});

// ─── Create tables ──────────────────────────────────────────────────────────
const createTables = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* Effect.sync(() => log.info('Creating tables if not exists...'));

    yield* sql`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            "isVerified" BOOLEAN NOT NULL DEFAULT false,
            "availableAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
    `;

    yield* sql`
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT '',
            price NUMERIC(10,2) NOT NULL,
            stock INTEGER NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
    `;

    yield* sql`
        CREATE TABLE IF NOT EXISTS payments (
            id SERIAL PRIMARY KEY,
            "userId" INTEGER NOT NULL REFERENCES users(id),
            "totalAmount" NUMERIC(12,2) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
    `;

    yield* sql`
        CREATE TABLE IF NOT EXISTS payment_items (
            id SERIAL PRIMARY KEY,
            "paymentId" INTEGER NOT NULL REFERENCES payments(id),
            "productId" INTEGER NOT NULL REFERENCES products(id),
            quantity INTEGER NOT NULL,
            "unitPrice" NUMERIC(10,2) NOT NULL,
            "totalPrice" NUMERIC(12,2) NOT NULL
        )
    `;

    yield* Effect.sync(() => log.info('All tables created.'));
});



// ─── Main seed pipeline ─────────────────────────────────────────────────────
export const seed = Effect.gen(function* () {
    yield* Effect.sync(() => log.info('🌱 Starting database seed...'));

    yield* createTables;
    yield* truncateTables;

    yield* Effect.sync(() => log.info('✅ Database seed completed successfully!'));
});
