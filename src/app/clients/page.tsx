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
  }).catch(() => []);

  const activeDealCount = leads.filter((l) => l.dealStage && l.dealStage !== "LOST").length;
  const mrrTotal = leads
    .filter((l) => l.dealStage === "ACTIVE" || l.dealStage === "RETAINED")
    .reduce((sum, l) => sum + (l.monthlyValue ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2.5">
            <Users className="size-5 text-emerald-300" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-white">Clients</h1>
          </div>
          <p className="text-sm text-zinc-400">
            Deal pipeline from first reply through active retainer — work replies, advance stages, watch MRR.
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-3 font-mono text-xs text-zinc-400"
          aria-label="Pipeline summary"
        >
          <span title="Open deals across Discovery, Proposal, Negotiating, Signed, Active">
            <span className="tabular-nums text-zinc-100">{activeDealCount.toLocaleString()}</span>{" "}
            active deals
          </span>
          <span className="text-zinc-700" aria-hidden="true">·</span>
          <span title="Sum of monthlyValue across ACTIVE and RETAINED deals">
            <span className="tabular-nums text-emerald-300">${mrrTotal.toLocaleString()}</span>
            <span className="text-zinc-500">/mo MRR</span>
          </span>
        </div>
      </div>

      <ClientsBoard initialLeads={leads} />
    </div>
  );
}
