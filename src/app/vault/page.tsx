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
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE COALESCE(isArchived, 0) = 0`).first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM "Lead" WHERE outreachStatus = 'READY_FOR_FIRST_TOUCH' AND COALESCE(isArchived, 0) = 0`,
      )
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM "Lead" WHERE websiteStatus = 'ACTIVE' AND COALESCE(isArchived, 0) = 0`,
      )
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM "Lead" WHERE websiteStatus = 'MISSING' AND COALESCE(isArchived, 0) = 0`,
      )
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM "Lead" WHERE email IS NOT NULL AND email != '' AND COALESCE(isArchived, 0) = 0`,
      )
      .first<{ c: number }>(),
  ]);

  const total = totalRow?.c ?? 0;
  const readyForTouch = readyRow?.c ?? 0;
  const verifiedWebsite = verifiedRow?.c ?? 0;
  const missingWebsite = missingRow?.c ?? 0;
  const withEmail = emailRow?.c ?? 0;

  const metrics = [
    {
      label: "Records",
      value: total,
      detail: "active records",
      icon: Database,
      tone: "text-zinc-300",
      title: "Total non-archived lead records in Vault",
    },
    {
      label: "Pre-send",
      value: readyForTouch,
      detail: `${readyForTouch.toLocaleString()} ready`,
      icon: Search,
      tone: "text-cyan-300",
      title: "Leads ready for first outbound touch",
    },
    {
      label: "Verified",
      value: verifiedWebsite,
      detail: missingWebsite > 0 ? `${missingWebsite.toLocaleString()} no site` : "all sites checked",
      icon: ShieldCheck,
      tone: "text-emerald-300",
      title: "Leads with a verified active website",
    },
    {
      label: "Exportable",
      value: withEmail,
      detail: `${withEmail.toLocaleString()} with email`,
      icon: Download,
      tone: "text-amber-300",
      title: "Leads with a captured email address",
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="border-b border-white/[0.06] pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              <Database className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              Vault
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Lead database
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Source of truth for every lead. Search, verify, segment, and export records — outreach status is secondary here.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[680px]" role="list" aria-label="Vault summary">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                role="listitem"
                title={metric.title}
                className="min-w-0 border-l border-white/[0.08] bg-white/[0.015] px-3 py-2.5"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  <metric.icon className={`h-3.5 w-3.5 ${metric.tone}`} aria-hidden="true" />
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
