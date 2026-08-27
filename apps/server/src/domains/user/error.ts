import { Schema } from "effect";

export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
    "UserNotFoundError",
    { id: Schema.Number }
) { }

export class UserAlreadyExistsError extends Schema.TaggedError<UserAlreadyExistsError>()(
    'UserAlreadyExistsError',
    { email: Schema.String, name: Schema.String }
) { }

export class UserDecodingError extends Schema.TaggedError<UserDecodingError>()(
    'UserDecodingError',
    {
        message: Schema.String,
        cause: Schema.optional(Schema.String)
    }
) { }