import { createLogger } from "evlog"; const l = createLogger({ format: "json" }); l.info("hello json", { a: 1 }); await new Promise(r => setTimeout(r, 100));
