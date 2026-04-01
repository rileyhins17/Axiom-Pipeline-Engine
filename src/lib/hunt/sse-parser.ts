/**
 * SSE Log Parser — Infers pipeline stage and counter increments
 * from raw terminal log lines emitted by /api/scrape.
 *
 * Zero engine changes required. Pure string matching.
 */

export type PipelineStage = "idle" | "extracting" | "dedupe" | "enrich" | "disqualify" | "write" | "done";

export type CounterKey = "found" | "accepted" | "duplicates" | "disqualified" | "enriched" | "callable" | "errors";

export interface ParseResult {
    /** If non-null, switch the active stage to this value */
    stage: PipelineStage | null;
    /** Counter increments (only non-zero keys included) */
    increments: Partial<Record<CounterKey, number>>;
    /** If this is an error line */
    isError: boolean;
    /** Human-readable event summary (for "last notable event" display) */
    event: string | null;
    /** If this marks job completion */
    isDone: boolean;
    /** Log level for colorization */
    level: "ok" | "warn" | "error" | "score" | "info" | "system" | "default";
}

/**
 * Parse a single SSE message line from the engine.
 */
export function parseSSELine(message: string): ParseResult {
    const result: ParseResult = {
        stage: null,
        increments: {},
        isError: false,
        event: null,
        isDone: false,
        level: "default",
    };

    if (!message) return result;

    const m = message;

    // ─── STAGE DETECTION ───

    // Extracting: scrolling/listing phase
    if (m.includes("[⬇️] Depth") || m.includes("[🌐] Infinite scroll") || m.includes("[⬇️] Extracting details")) {
        result.stage = "extracting";
        result.level = "info";
    }

    // Found listings → extracting stage + found count
    if (m.includes("[🔍] Found")) {
        result.stage = "extracting";
        result.level = "ok";
        const match = m.match(/Found (\d+) listings/);
        if (match) {
            result.increments.found = parseInt(match[1], 10);
            result.event = `Found ${match[1]} listings`;
        }
    }

    // Targets parsed → still extracting
    if (m.includes("[🎯]") && m.includes("targets parsed")) {
        result.stage = "extracting";
        result.level = "ok";
        const match = m.match(/(\d+) targets parsed/);
        if (match) result.event = `${match[1]} targets ready for enrichment`;
    }

    // Dedupe keys loaded
    if (m.includes("[🔑] Loaded")) {
        result.stage = "dedupe";
        result.level = "info";
    }

    // Dedup match
    if (m.includes("[♻️] DEDUP")) {
        result.stage = "dedupe";
        result.level = "info";
        result.increments.duplicates = 1;
        const nameMatch = m.match(/DEDUP \([^)]+\): (.+?) —/);
        if (nameMatch) result.event = `Duplicate: ${nameMatch[1]}`;
    }

    // Enriching a lead
    if (m.includes("[⚙️] Enriching")) {
        result.stage = "enrich";
        result.level = "info";
        result.increments.enriched = 1;
        const nameMatch = m.match(/Enriching \[\d+\/\d+\]: (.+?)\.{3}/);
        if (nameMatch) result.event = `Enriching: ${nameMatch[1]}`;
    }

    // Deep scan / search
    if (m.includes("[🌐] Deep scan") || m.includes("[🔍] No website")) {
        result.stage = "enrich";
        result.level = "info";
    }

    // Contact validation
    if (m.includes("[📧] Contact:")) {
        result.stage = "enrich";
        result.level = "info";
        // Check if this is a callable lead (decent email + phone)
        const emailConf = m.match(/email=\w+\(([0-9.]+)\)/);
        const phoneConf = m.match(/phone=([0-9.]+)/);
        if (emailConf && phoneConf) {
            const ec = parseFloat(emailConf[1]);
            const pc = parseFloat(phoneConf[1]);
            if (ec >= 0.5 && pc >= 0.5) {
                result.increments.callable = 1;
            }
        }
    }

    // Axiom scoring result
    if (m.includes("[🛡️] Axiom:")) {
        result.level = "score";
        if (m.includes("❌ DISQUALIFIED")) {
            result.stage = "disqualify";
            result.increments.disqualified = 1;
            const nameMatch = m.match(/— (.+)$/);
            if (nameMatch) result.event = `Disqualified: ${nameMatch[1]}`;
        } else {
            result.stage = "enrich";
            result.increments.accepted = 1;
            const nameMatch = m.match(/— (.+)$/);
            const tierMatch = m.match(/\[([SABCD])\]/);
            if (nameMatch && tierMatch) {
                result.event = `Scored: ${nameMatch[1]} [${tierMatch[1]}]`;
            }
        }
    }

    // Job done / write phase
    if (m.includes("[💾] Call Sheet:") || m.includes("[📊] Tiers:")) {
        result.stage = "write";
        result.level = "ok";
    }

    // Lead/result writes from the local worker
    if (m.includes("[LEAD]")) {
        result.stage = "write";
        result.level = "ok";
        result.event = m.replace(/^\[LEAD\]\s*/, "").trim();
    }

    // Extraction complete
    if (m.includes("[✅] ═══ AXIOM EXTRACTION COMPLETE")) {
        result.stage = "done";
        result.isDone = true;
        result.level = "ok";
        result.event = "Extraction complete";
    }

    // Queue complete
    if (m.includes("[✅] ALL QUEUE JOBS COMPLETE")) {
        result.stage = "done";
        result.isDone = true;
        result.level = "system";
        result.event = "All queue jobs complete";
    }

    // Queue job header
    if (m.includes("[🚀]")) {
        result.level = "system";
        const jobMatch = m.match(/QUEUE (\d+)\/(\d+): (.+)/);
        if (jobMatch) {
            result.event = `Job ${jobMatch[1]}/${jobMatch[2]}: ${jobMatch[3]}`;
        }
    }

    // Remote job lifecycle messages
    if (m.includes("[JOB]")) {
        result.level = "system";
        result.event = m.replace(/^\[JOB\]\s*/, "").trim();
    }

    // Engine init
    if (m.includes("AXIOM ENGINE")) {
        result.stage = "extracting";
        result.level = "system";
    }

    // ─── ERROR DETECTION ───
    if (m.includes("[!!!]") || m.includes("ERROR") || m.includes("CRITICAL") || m.includes("failed") || m.includes("exception") || m.includes("timeout")) {
        // Only mark as error for real error markers
        if (m.includes("[!!!]") || m.includes("CRITICAL") || (m.includes("ERROR") && !m.includes("Axiom Engine Error"))) {
            result.isError = true;
            result.increments.errors = 1;
            result.level = "error";
            result.event = m.replace(/\[!!!\]\s*/, "").replace(/CRITICAL:\s*/, "").trim();
        }
    }

    // Axiom Engine Error (from sendEvent({ error: ... }))
    if (m.includes("Axiom Engine Error")) {
        result.isError = true;
        result.increments.errors = 1;
        result.level = "error";
    }

    // Additional level detection
    if (m.includes("[✔]")) result.level = "ok";
    if (m.includes("[⚡]")) result.level = "warn";

    return result;
}

/**
 * Classify a log line for colorization.
 */
export function getLogColor(level: ParseResult["level"]): string {
    switch (level) {
        case "ok": return "text-emerald-400";
        case "warn": return "text-amber-400";
        case "error": return "text-red-400 font-bold";
        case "score": return "text-purple-300";
        case "system": return "text-emerald-400 font-bold";
        case "info": return "text-cyan-400/80";
        default: return "text-green-400/80";
    }
}
