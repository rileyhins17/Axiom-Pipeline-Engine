import { Database, Globe, Mail, Star } from "lucide-react";

import VaultDataTable from "@/components/VaultDataTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { ToastProvider } from "@/components/ui/toast-provider";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export default async function TheVaultPage() {
  await requireSession();

  const prisma = getPrisma();
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
  });

  const totalLeads = leads.length;
  const missingWebsite = leads.filter((lead) => lead.websiteStatus === "MISSING").length;
  const withEmail = leads.filter((lead) => lead.email && lead.email.length > 0).length;
  const avgRating =
    totalLeads > 0
      ? parseFloat((leads.reduce((sum, lead) => sum + (lead.rating || 0), 0) / totalLeads).toFixed(1))
      : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="animate-slide-up">
        <h1 className="text-4xl font-extrabold tracking-tight">
          <span className="gradient-text">The Vault</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your secured repository of AI-enriched, qualified business intelligence.
        </p>
      </div>

      <div className="grid animate-slide-up grid-cols-2 gap-4 lg:grid-cols-4" style={{ animationDelay: "100ms" }}>
        <StatCard
          glowClass="glow-emerald"
          icon={<Database />}
          iconColor="text-emerald-400"
          label="Total Leads"
          subtitle="targets acquired"
          value={totalLeads}
        />
        <StatCard
          glowClass="glow-red"
          icon={<Globe />}
          iconColor="text-red-400"
          label="No Website"
          subtitle="prime targets"
          value={missingWebsite}
        />
        <StatCard
          glowClass="glow-cyan"
          icon={<Mail />}
          iconColor="text-cyan-400"
          label="With Email"
          subtitle="contactable leads"
          value={withEmail}
        />
        <StatCard
          glowClass="glow-amber"
          icon={<Star />}
          iconColor="text-amber-400"
          label="Avg Rating"
          subtitle="stars average"
          value={avgRating}
        />
      </div>

      <div className="animate-slide-up" style={{ animationDelay: "200ms" }}>
        <Card className="glass-strong overflow-hidden rounded-xl glow-emerald">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
                  <Database className="h-5 w-5 text-emerald-400" />
                  Lead Intelligence Database
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Filter, sort, and export your enriched targets.
                </CardDescription>
              </div>
              <Badge
                className="self-start border-emerald-900 bg-emerald-950/30 px-3 py-1 font-mono text-emerald-400"
                variant="outline"
              >
                {leads.length} Records
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ToastProvider>
              <VaultDataTable initialLeads={JSON.parse(JSON.stringify(leads))} />
            </ToastProvider>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
