import { Logger } from "effect";

/**
 * Wide Event Logger — following loggingsucks.com canonical log line pattern.
 *
 * Instead of many scattered log statements, we emit ONE rich structured event
 * per significant operation. The event contains everything needed to debug:
 *   - timestamp, level, message
 *   - span / trace context (trace_id, span_id, parent_span_id)
 *   - all annotated key-value pairs (userId, cartSize, event, status, paymentId, …)
 *
 * This is the "canonical log line" / "wide event" pattern from loggingsucks.com:
 * one JSON line = one authoritative record of what happened, queryable as structured data.
 */
const wideEventLogger = Logger.map(Logger.formatStructured, (output) => {
    const spans = output.spans ?? [];
    const annotations = output.annotations ?? {};

    // Build the canonical wide-event JSON record
    const wideEvent: Record<string, unknown> = {
        // ── Core fields (always present) ───────────────────────────────
        timestamp: output.date?.toISOString() ?? new Date().toISOString(),
        level: output.logLevel?.label ?? "INFO",
        message: typeof output.message === "string"
            ? output.message
            : JSON.stringify(output.message),

        // ── Trace / span context ────────────────────────────────────────
        // Effect encodes spans as an array of {label, startTime} objects.
        // We pick the innermost span as the "current span" and outer ones as context.
        ...(spans.length > 0 && {
            span: spans[spans.length - 1]?.label,
            span_chain: spans.map((s: any) => s?.label).filter(Boolean),
        }),

        // ── Business context (all annotateLogs key-value pairs) ─────────
        // This is where the wide-event richness lives:
        // userId, cartSize, event, status, paymentId, cause, etc.
        ...annotations,

        // ── Fiber / cause context ────────────────────────────────────────
        ...(output.cause && output.cause !== "NoSuchElementException"
            ? { cause: String(output.cause) }
            : {}),
    };

    try {
        const logLine = JSON.stringify(wideEvent) + "\n";
        Deno.writeTextFileSync("server-json.log", logLine, { append: true });
    } catch (_e) {
        // Last-resort fallback: write a minimal record
        Deno.writeTextFileSync(
            "server-json.log",
            JSON.stringify({
                timestamp: new Date().toISOString(),
                level: "ERROR",
                message: "Logger serialisation failed",
                original_message: String(output.message),
            }) + "\n",
            { append: true },
        );
    }
});

export const FileLoggerLive = Logger.layer([wideEventLogger]);
