import {Schema} from 'effect';

export enum USER_ROLE {
    ADMIN = "admin",
    USER = "user",
}

export class User extends Schema.Class<User>("User")({
    id: Schema.Number,
    name: Schema.String,
    email: Schema.String,
    role: Schema.Enum(USER_ROLE),
    isVerified: Schema.Boolean,
    availableAmount: Schema.Number,
    createdAt: Schema.Date,
    updatedAt: Schema.Date
}) {}

export const CreateUserInputSchema = Schema.Struct({
    name: Schema.NonEmptyString,
    email: Schema.String.pipe(Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))),
    role: Schema.Enum(USER_ROLE),
    isVerified: Schema.Boolean,
    availableAmount: Schema.Number
});

export type TCreateUserInput = typeof CreateUserInputSchema.Type;

export const GetUserByIdInputSchema = Schema.Struct({
    id: Schema.Number
});

export type TGetUserByIdInput = typeof GetUserByIdInputSchema.Type;

export const UpdateUserInputSchema = Schema.Struct({
    id: Schema.Number,
    name: Schema.optional(Schema.NonEmptyString),
    role: Schema.optional(Schema.Enum(USER_ROLE)),
    isVerified: Schema.optional(Schema.Boolean),
    availableAmount: Schema.optional(Schema.Number)
});

export type TUpdateUserInput = typeof UpdateUserInputSchema.Type;
