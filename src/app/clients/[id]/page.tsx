import { notFound } from "next/navigation";

import { ClientProfile } from "@/components/ClientProfile";
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

  const [activities, outreachEmails] = await Promise.all([
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
  ]);

  return (
    <ClientProfile
      lead={lead}
      initialActivities={activities}
      outreachEmails={outreachEmails}
    />
  );
}
