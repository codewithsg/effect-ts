import { createLogger } from "evlog";
import { Logger } from "effect";

export const log = createLogger({
  redact: true,
  format: "logfmt"
});

export const LoggingsucksLogger = Logger.make((options) => {
    const structured = Logger.formatStructured.log(options);
    
    const date = new Date(structured.timestamp);
    const pad = (n: number, l = 2) => n.toString().padStart(l, '0');
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
    
    const level = structured.level.toUpperCase();
    
    let meta = "";
    if (structured.annotations) {
        for (const [k, v] of Object.entries(structured.annotations)) {
            meta += ` ${k}=${v}`;
        }
    }
    
    (globalThis as any).console.log(`[${time}] ${level} ${structured.message}${meta}`);
});
