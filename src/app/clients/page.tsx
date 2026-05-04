import { Users } from "lucide-react";

import { ClientsBoard } from "@/components/ClientsBoard";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  await requireSession();

  const prisma = getPrisma();

  const leads = await prisma.lead.findMany({
    where: {
      isArchived: false,
      OR: [
        { outreachStatus: { in: ["REPLIED", "INTERESTED"] } },
        { dealStage: { not: null } },
      ],
    },
    orderBy: { lastUpdated: "desc" },
    take: 500, // Hard cap — pipeline view is for active deals, not history.
  }).catch(() => []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Users className="size-5 text-emerald-300" />
            <h1 className="text-xl font-semibold text-white">Clients</h1>
          </div>
          <p className="text-sm text-zinc-400">
            Deal pipeline — from first reply through active retainer.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono">
          <span>{leads.filter((l) => l.dealStage && l.dealStage !== "LOST").length} active deals</span>
          <span className="text-zinc-700">·</span>
          <span>
            ${leads
              .filter((l) => l.dealStage === "ACTIVE" || l.dealStage === "RETAINED")
              .reduce((sum, l) => sum + (l.monthlyValue ?? 0), 0)
              .toLocaleString()}
            /mo MRR
          </span>
        </div>
      </div>

      <ClientsBoard initialLeads={leads} />
    </div>
  );
}
