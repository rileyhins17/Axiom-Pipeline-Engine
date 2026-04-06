import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { OutreachDatabase } from "@/components/outreach/outreach-database";

export const dynamic = 'force-dynamic';

export default async function OutreachPage() {
  await requireSession();
  const prisma = getPrisma();

  const leads = await prisma.lead.findMany({
    where: { isArchived: false },
    orderBy: { lastContactedAt: "desc" },
    select: {
      id: true,
      businessName: true,
      city: true,
      niche: true,
      contactName: true,
      email: true,
      phone: true,
      outreachStatus: true,
      outreachChannel: true,
      firstContactedAt: true,
      lastContactedAt: true,
      nextFollowUpDue: true,
      enrichedAt: true,
      axiomScore: true,
      axiomTier: true,
      websiteStatus: true,
      createdAt: true,
    },
  });

  const stats = {
    total: leads.length,
    notContacted: leads.filter((l) => l.outreachStatus === "NOT_CONTACTED").length,
    enriching: leads.filter((l) => l.outreachStatus === "ENRICHING").length,
    enriched: leads.filter((l) => l.outreachStatus === "ENRICHED").length,
    readyForTouch: leads.filter((l) => l.outreachStatus === "READY_FOR_FIRST_TOUCH").length,
    outreached: leads.filter((l) => l.outreachStatus === "OUTREACHED").length,
    followUp: leads.filter((l) => l.outreachStatus === "FOLLOW_UP_DUE").length,
    replied: leads.filter((l) => l.outreachStatus === "REPLIED" || l.outreachStatus === "INTERESTED").length,
    notInterested: leads.filter((l) => l.outreachStatus === "NOT_INTERESTED").length,
  };

  return (
    <div className="mx-auto max-w-7xl">
      <OutreachDatabase
        initialLeads={JSON.parse(JSON.stringify(leads))}
        stats={stats}
      />
    </div>
  );
}
