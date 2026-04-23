import { NextResponse } from "next/server";

import { queueLeadsForAutomation } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { requireAdminApiSession } from "@/lib/session";

/**
 * Queue one or more leads for automated outreach.
 *
 * Body:
 *   { leadIds: number[], immediate?: boolean }
 *
 * When `immediate: true`, we also fast-forward step 1 of each newly-created
 * sequence so it fires on the very next cron tick (within 60s) instead of
 * waiting the random 1-5 min initial delay. Powers the "Send this lead now"
 * button on the outreach database.
 */
export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const body = (await request.json()) as { leadIds?: number[]; immediate?: boolean };
    if (!Array.isArray(body.leadIds) || body.leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds array is required" }, { status: 400 });
    }

    const result = await queueLeadsForAutomation({
      leadIds: body.leadIds,
      queuedByUserId: authResult.session.user.id,
    });

    if (body.immediate && result.queued.length > 0) {
      const prisma = getPrisma();
      const sequenceIds = result.queued.map((q) => q.sequenceId);
      const now = new Date();
      // Snap step 1 (and anything else scheduled in the future) to now so
      // the next tick claims immediately. Per-mailbox caps + min-delay are
      // still enforced inside the scheduler so we can't out-send Gmail.
      await prisma.outreachSequenceStep.updateMany({
        where: {
          sequenceId: { in: sequenceIds },
          stepNumber: 1,
          status: "SCHEDULED",
        },
        data: { scheduledFor: now },
      });
      await prisma.outreachSequence.updateMany({
        where: { id: { in: sequenceIds } },
        data: { nextScheduledAt: now },
      });
    }

    return NextResponse.json({ ...result, immediate: Boolean(body.immediate) });
  } catch (error: any) {
    console.error("Automation queue error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to queue leads for automation" },
      { status: 500 },
    );
  }
}
