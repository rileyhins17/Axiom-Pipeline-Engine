import { notFound } from "next/navigation";

import { ClientProfile } from "@/components/ClientProfile";
import { getDatabase } from "@/lib/cloudflare";
import { getPrisma, type OutreachEmailRecord } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type ProfileOutreachEmail = Pick<
  OutreachEmailRecord,
  "id" | "leadId" | "senderEmail" | "recipientEmail" | "subject" | "status" | "errorMessage" | "sentAt" | "gmailThreadId"
>;

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();

  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isFinite(leadId) || leadId <= 0) {
    notFound();
  }

  const prisma = getPrisma();
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
  });

  if (!lead || lead.isArchived) {
    notFound();
  }

  const db = getDatabase();

  const [activities, outreachEmails, sequenceRows, stepRows] = await Promise.all([
    prisma.crmActivity.findMany({
      where: { leadId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.outreachEmail.findMany({
      where: { leadId },
      orderBy: { sentAt: "desc" },
      take: 20,
      select: {
        id: true,
        leadId: true,
        senderEmail: true,
        recipientEmail: true,
        subject: true,
        status: true,
        errorMessage: true,
        sentAt: true,
        gmailThreadId: true,
      },
    }) as Promise<ProfileOutreachEmail[]>,
    db.prepare(
      `SELECT id, status, currentStep, nextScheduledAt, lastSentAt, replyDetectedAt, stopReason, createdAt
       FROM "OutreachSequence" WHERE leadId = ? ORDER BY createdAt DESC LIMIT 1`
    ).bind(leadId).all<{
      id: string; status: string; currentStep: string;
      nextScheduledAt: string | null; lastSentAt: string | null;
      replyDetectedAt: string | null; stopReason: string | null; createdAt: string;
    }>().catch(() => ({ results: [] as Array<{ id: string; status: string; currentStep: string; nextScheduledAt: string | null; lastSentAt: string | null; replyDetectedAt: string | null; stopReason: string | null; createdAt: string }> })),
    db.prepare(
      `SELECT s.id, s.stepType, s.status, s.scheduledFor, s.sentAt, s.subject, s.bodyPlain
       FROM "OutreachSequenceStep" s
       JOIN "OutreachSequence" seq ON s.sequenceId = seq.id
       WHERE seq.leadId = ?
       ORDER BY s.stepNumber ASC`
    ).bind(leadId).all<{
      id: string; stepType: string; status: string;
      scheduledFor: string | null; sentAt: string | null;
      subject: string | null; bodyPlain: string | null;
    }>().catch(() => ({ results: [] as Array<{ id: string; stepType: string; status: string; scheduledFor: string | null; sentAt: string | null; subject: string | null; bodyPlain: string | null }> })),
  ]);

  const sequence = (sequenceRows.results ?? [])[0] ?? null;
  const steps = stepRows.results ?? [];

  return (
    <ClientProfile
      lead={lead}
      initialActivities={activities}
      outreachEmails={outreachEmails}
      sequence={sequence}
      sequenceSteps={steps}
    />
  );
}
