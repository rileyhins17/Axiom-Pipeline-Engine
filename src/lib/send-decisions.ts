import { getDatabase } from "@/lib/cloudflare";

export type SendDecisionOutcome = "SENT" | "BLOCKED" | "SKIPPED" | "DRY_RUN";

export interface SendDecisionInput {
  leadId?: number | null;
  sequenceId?: string | null;
  stepId?: string | null;
  mailboxId?: string | null;
  senderEmail?: string | null;
  recipientEmail?: string | null;
  decision: SendDecisionOutcome;
  reason?: string | null;
  axiomScore?: number | null;
  axiomTier?: string | null;
  emailType?: string | null;
  subject?: string | null;
}

/**
 * Append-only audit row for every send attempt the engine makes — including
 * blocks and skips. Used by the dashboard "rejection breakdown" panel and
 * for post-mortems ("why did the machine email this person?").
 *
 * Best-effort: never throws. A missing audit row should never block a send.
 */
export async function recordSendDecision(input: SendDecisionInput): Promise<void> {
  try {
    await getDatabase()
      .prepare(
        `INSERT INTO "SendDecision" (
          "id","leadId","sequenceId","stepId","mailboxId","senderEmail",
          "recipientEmail","decision","reason","axiomScore","axiomTier",
          "emailType","subject","createdAt"
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.leadId ?? null,
        input.sequenceId ?? null,
        input.stepId ?? null,
        input.mailboxId ?? null,
        input.senderEmail ?? null,
        input.recipientEmail ?? null,
        input.decision,
        input.reason ?? null,
        input.axiomScore ?? null,
        input.axiomTier ?? null,
        input.emailType ?? null,
        input.subject ?? null,
        new Date().toISOString(),
      )
      .run();
  } catch (error) {
    console.error("[send-decisions] failed to record decision:", error);
  }
}

export interface SendDecisionStatRow {
  decision: string;
  reason: string | null;
  count: number;
}

/** Decision breakdown for the dashboard, since startOfDay UTC. */
export async function getTodaysDecisionBreakdown(): Promise<SendDecisionStatRow[]> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const result = await getDatabase()
    .prepare(
      `SELECT "decision", "reason", COUNT(*) AS count
       FROM "SendDecision"
       WHERE "createdAt" >= ?
       GROUP BY "decision", "reason"
       ORDER BY count DESC`,
    )
    .bind(start.toISOString())
    .all<{ decision: string; reason: string | null; count: number | string }>();

  return (result.results ?? []).map((row) => ({
    decision: String(row.decision),
    reason: row.reason ? String(row.reason) : null,
    count: Number(row.count || 0),
  }));
}
