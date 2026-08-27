import { Logger, Effect } from "effect"; const L = Logger.make((options) => { console.log(Object.keys(options)); }); Effect.runSync(Effect.provide(Effect.logInfo("test"), Logger.layer([L])))
