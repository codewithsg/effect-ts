import { Effect } from "effect";

const eff = Effect.sleep("1 second").pipe(
    Effect.timeout({ duration: "3 seconds", onTimeout: () => "timeout" })
);
