import { createLogger } from "evlog"; const l = createLogger({ format: "json" }); l.info("hello json", { a: 1 });
