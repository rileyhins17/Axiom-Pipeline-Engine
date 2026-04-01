"use client";

import { useCallback, useState } from "react";
import { Brain, Inbox, MessageSquareText } from "lucide-react";

import { EmailComposer } from "@/components/outreach/email-composer";
import { EmailLogTable } from "@/components/outreach/email-log-table";
import { EnrichmentPanel } from "@/components/outreach/enrichment-panel";
import { GmailConnectCard } from "@/components/outreach/gmail-connect-card";
import { OutreachClient } from "@/components/outreach/outreach-client";
import type { OutreachEditableLead } from "@/components/outreach/outreach-editor-sheet";
import { useToast } from "@/components/ui/toast-provider";

type Tab = "pipeline" | "enriched" | "log";

const TAB_CONFIG: Array<{ id: Tab; label: string; icon: typeof MessageSquareText }> = [
  { id: "pipeline", label: "Pipeline", icon: MessageSquareText },
  { id: "enriched", label: "Enriched Leads", icon: Brain },
  { id: "log", label: "Email Log", icon: Inbox },
];

type EnrichedLead = {
  id: number;
  businessName: string;
  city: string;
  niche: string;
  email: string | null;
  contactName: string | null;
  axiomScore: number | null;
  axiomTier: string | null;
  websiteStatus: string | null;
  enrichedAt: string | null;
  enrichmentData: string | null;
  outreachStatus: string | null;
};

type OutreachHubProps = {
  initialPipelineLeads: OutreachEditableLead[];
  initialEnrichedLeads: EnrichedLead[];
};

export function OutreachHub({ initialPipelineLeads, initialEnrichedLeads }: OutreachHubProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("pipeline");
  const [enrichedLeads, setEnrichedLeads] = useState<EnrichedLead[]>(initialEnrichedLeads);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [sendingLeadIds, setSendingLeadIds] = useState<number[] | null>(null);

  // Check Gmail status on mount
  const [gmailChecked, setGmailChecked] = useState(false);
  if (!gmailChecked) {
    setGmailChecked(true);
    fetch("/api/outreach/gmail/status")
      .then((res) => res.json())
      .then((data) => setGmailConnected(data.connected === true))
      .catch(() => {});
  }

  const refreshEnrichedLeads = useCallback(async () => {
    try {
      // Re-fetch enriched leads from the server
      const res = await fetch("/api/outreach/enriched-leads");
      if (res.ok) {
        const data = await res.json();
        setEnrichedLeads(data.leads || []);
      }
    } catch {
      // Silently fail — the page will show stale data
    }
  }, []);

  const handleEnrichFromPipeline = useCallback(
    async (leadIds: number[]) => {
      try {
        const res = await fetch("/api/outreach/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Enrichment failed");
        }

        const data = await res.json();
        toast(`Enriched ${data.enriched} lead${data.enriched !== 1 ? "s" : ""} with AI`, {
          type: "success",
          icon: "note",
        });

        // Switch to enriched tab and refresh
        await refreshEnrichedLeads();
        setActiveTab("enriched");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Enrichment failed", {
          type: "error",
          icon: "note",
        });
      }
    },
    [refreshEnrichedLeads, toast],
  );

  const handleSendRequested = useCallback((leadIds: number[]) => {
    setSendingLeadIds(leadIds);
  }, []);

  const handleSendComplete = useCallback(() => {
    setSendingLeadIds(null);
    refreshEnrichedLeads();
  }, [refreshEnrichedLeads]);

  return (
    <div className="space-y-4">
      {/* Gmail Connection */}
      <GmailConnectCard />

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-black/30 p-1">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs font-semibold transition-all ${
                isActive
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
              }`}
            >
              <Icon className={`h-4 w-4 ${
                isActive
                  ? tab.id === "pipeline" ? "text-cyan-400" : tab.id === "enriched" ? "text-purple-400" : "text-emerald-400"
                  : ""
              }`} />
              {tab.label}
              {tab.id === "enriched" && enrichedLeads.length > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  isActive ? "bg-purple-500/20 text-purple-300" : "bg-white/5 text-zinc-600"
                }`}>
                  {enrichedLeads.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        {activeTab === "pipeline" && (
          <OutreachClient
            initialLeads={initialPipelineLeads}
            enableSelection
            onEnrichRequested={handleEnrichFromPipeline}
          />
        )}

        {activeTab === "enriched" && (
          <EnrichmentPanel
            leads={enrichedLeads}
            gmailConnected={gmailConnected}
            onSendRequested={handleSendRequested}
            onLeadsUpdated={refreshEnrichedLeads}
          />
        )}

        {activeTab === "log" && <EmailLogTable />}
      </div>

      {/* Email Composer Dialog */}
      {sendingLeadIds && (
        <EmailComposer
          leadIds={sendingLeadIds}
          onClose={() => setSendingLeadIds(null)}
          onComplete={handleSendComplete}
        />
      )}
    </div>
  );
}
