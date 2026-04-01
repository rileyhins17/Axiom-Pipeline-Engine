"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Inbox, Loader2, Mail, Search } from "lucide-react";

import { Input } from "@/components/ui/input";

type EmailRecord = {
  id: string;
  leadId: number;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  status: string;
  errorMessage: string | null;
  sentAt: string;
};

export function EmailLogTable() {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchEmails = useCallback(async () => {
    try {
      const res = await fetch("/api/outreach/emails");
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const filtered = useMemo(() => {
    if (!search.trim()) return emails;
    const q = search.toLowerCase();
    return emails.filter(
      (e) =>
        e.recipientEmail.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        e.senderEmail.toLowerCase().includes(q),
    );
  }, [emails, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-black/20 px-6 py-16 text-center">
        <Inbox className="mb-4 h-12 w-12 text-zinc-700" />
        <div className="text-sm font-semibold text-white">No Emails Sent Yet</div>
        <div className="mt-1 max-w-sm text-xs text-zinc-500">
          Once you send outreach emails from the Enriched tab, they&apos;ll appear here with full delivery tracking.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emails by recipient, subject..."
          className="border-white/10 bg-black/30 pl-10 focus:border-cyan-500/50"
        />
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-black/20">
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 border-b border-white/[0.06] bg-black/40 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          <span>Recipient</span>
          <span>Subject</span>
          <span>Status</span>
          <span>Sent</span>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {filtered.map((email) => {
            const isExpanded = expandedId === email.id;

            return (
              <div key={email.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : email.id)}
                  className="grid w-full grid-cols-[1fr_1fr_auto_auto] items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-cyan-300">{email.recipientEmail}</div>
                    <div className="truncate text-[10px] text-zinc-600">from {email.senderEmail}</div>
                  </div>
                  <div className="truncate text-xs text-zinc-300">{email.subject}</div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      email.status === "sent"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}
                  >
                    {email.status}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-500">
                      {new Date(email.sentAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5 text-zinc-600" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/[0.04] bg-white/[0.01] px-4 py-4">
                    {email.errorMessage && (
                      <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
                        <strong>Error:</strong> {email.errorMessage}
                      </div>
                    )}
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
                      <Mail className="h-3 w-3" /> Email Body
                    </div>
                    <div
                      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-xs leading-relaxed text-zinc-300"
                      style={{ whiteSpace: "pre-wrap" }}
                    >
                      {email.bodyPlain || "(no plain text body)"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
