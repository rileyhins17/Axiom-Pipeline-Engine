import { Database, Download, Search, ShieldCheck } from "lucide-react";

import VaultDataTable from "@/components/VaultDataTable";
import { ToastProvider } from "@/components/ui/toast-provider";
import { getDatabase } from "@/lib/cloudflare";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function VaultPage() {
  await requireSession();

  const db = getDatabase();
  const [
    totalRow,
    readyRow,
    verifiedRow,
    missingRow,
    emailRow,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead"`).first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM "Lead" WHERE outreachStatus = 'READY_FOR_FIRST_TOUCH' AND isArchived = 0`,
      )
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM "Lead" WHERE websiteStatus IS NOT NULL AND websiteStatus != 'MISSING'`,
      )
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM "Lead" WHERE websiteStatus = 'MISSING'`,
      )
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM "Lead" WHERE email IS NOT NULL AND email != ''`,
      )
      .first<{ c: number }>(),
  ]);

  const total = totalRow?.c ?? 0;
  const readyForTouch = readyRow?.c ?? 0;
  const verifiedWebsite = verifiedRow?.c ?? 0;
  const missingWebsite = missingRow?.c ?? 0;
  const withEmail = emailRow?.c ?? 0;

  const metrics = [
    { label: "Records", value: total, detail: "all leads", icon: Database, tone: "text-zinc-300" },
    { label: "Pre-send", value: readyForTouch, detail: `${readyForTouch} ready`, icon: Search, tone: "text-cyan-300" },
    { label: "Verified", value: verifiedWebsite, detail: `${missingWebsite} no site`, icon: ShieldCheck, tone: "text-emerald-300" },
    { label: "Exportable", value: withEmail, detail: `${withEmail} with email`, icon: Download, tone: "text-amber-300" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="border-b border-white/[0.06] pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              <Database className="h-3.5 w-3.5 text-emerald-400" />
              Vault
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Lead database
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Search, verify, segment, and export lead records. Outreach stays secondary here; Vault is the source of truth.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[680px]">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="min-w-0 border-l border-white/[0.08] bg-white/[0.015] px-3 py-2.5"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                  <metric.icon className={`h-3.5 w-3.5 ${metric.tone}`} />
                  {metric.label}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-semibold tabular-nums text-white">
                    {metric.value.toLocaleString()}
                  </span>
                  <span className="truncate text-[11px] text-zinc-500">{metric.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ToastProvider>
        <VaultDataTable totalCount={total} />
      </ToastProvider>
    </div>
  );
}
