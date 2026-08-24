import { Effect } from "effect";

const program = Effect.sync(() => {
    Deno.serve(
        { 
            port: 8849, 
            onListen: () => console.log("running web on localhost:8849") 
        }, 
        () => new Response("Web running on 8849")
    );
});

Effect.runSync(program);