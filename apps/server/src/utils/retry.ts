import {Effect,Schedule} from 'effect';

export const retryable = <A, E, R>(
    effect: Effect.Effect<A,E,R>,
    retries: number
)=>
    effect.pipe(
        Effect.retry(
            Schedule.exponential('1 second').pipe(
                Schedule.jittered,
                Schedule.upTo({ times: retries })
            )
        )
    )