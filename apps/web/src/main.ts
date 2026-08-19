import { Console, Effect } from "effect";

const program = Console.log("Hello, World from @app/web!");

Effect.runSync(program);