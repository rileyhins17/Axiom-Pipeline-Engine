"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mail,
  MailOpen,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────

type EmailMessage = {
  id: string;
  threadId: string;
  internalDate: string;
  from: string;
  to: string;
  subject: string;
  bodyPlain: string;
  bodyHtml: string;
  labelIds: string[];
};

type EmailThread = {
  id: string;
  messages: EmailMessage[];
};

type EmailThreadPanelProps = {
  leadId: number;
  leadName: string;
  leadEmail: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────

function formatEmailDate(internalDateMs: string) {
  const date = new Date(Number(internalDateMs));
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullDate(internalDateMs: string) {
  const date = new Date(Number(internalDateMs));
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function extractName(from: string) {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.split("@")[0];
}

function extractEmail(from: string) {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

function isOurEmail(from: string, senderEmail: string | null) {
  if (!senderEmail) return false;
  return extractEmail(from).toLowerCase() === senderEmail.toLowerCase();
}

function stripQuotedText(text: string): string {
  // Remove forwarded/quoted sections that start with common patterns
  const lines = text.split("\n");
  const cleaned: string[] = [];
  for (const line of lines) {
    // Stop at "On ... wrote:" pattern
    if (/^On .+ wrote:\s*$/.test(line)) break;
    // Stop at "> " quoted lines
    if (/^>/.test(line.trim())) break;
    // Stop at "------" dividers
    if (/^-{3,}/.test(line.trim())) break;
    // Stop at "From:" header in forwarded emails
    if (/^From:\s/i.test(line.trim())) break;
    cleaned.push(line);
  }
  return cleaned.join("\n").trim();
}

// ─── Composer Component ──────────────────────────────────────────────

function ReplyComposer({
  leadId,
  leadName,
  thread,
  senderEmail,
  onSent,
  onCancel,
}: {
  leadId: number;
  leadName: string;
  thread: EmailThread;
  senderEmail: string | null;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lastMessage = thread.messages[thread.messages.length - 1];
  const replyTo = isOurEmail(lastMessage.from, senderEmail)
    ? lastMessage.to
    : lastMessage.from;
  const subject = lastMessage.subject;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(120, textareaRef.current.scrollHeight)}px`;
    }
  }, [replyText]);

  const handleGenerateReply = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      // Build thread context from messages
      const threadContext = thread.messages
        .map((msg) => {
          const sender = extractName(msg.from);
          const date = formatFullDate(msg.internalDate);
          const body = stripQuotedText(msg.bodyPlain) || "(no text content)";
          return `From: ${sender}\nDate: ${date}\n\n${body}`;
        })
        .join("\n\n---\n\n");

      const res = await fetch(`/api/clients/${leadId}/emails/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadContext,
          tone: "professional",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate reply");
      }

      const data = await res.json();
      setReplyText(data.generatedReply || "");
      textareaRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [leadId, thread.messages]);

  const handleSend = useCallback(async () => {
    if (!replyText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const plainText = replyText.trim();
      const htmlBody = `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; line-height: 1.5; color: #1a1a1a;">${plainText.replace(/\n/g, "<br>")}</div>`;

      const res = await fetch(`/api/clients/${leadId}/emails/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: thread.id,
          to: extractEmail(replyTo),
          subject,
          bodyHtml: htmlBody,
          bodyPlain: plainText,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send reply");
      }

      setReplyText("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }, [leadId, replyText, thread.id, replyTo, subject, onSent]);

  return (
    <div className="border-t border-white/[0.06] pt-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
        <Mail className="size-3.5" />
        Reply to {extractName(replyTo)}
        <span className="text-zinc-700">&lt;{extractEmail(replyTo)}&gt;</span>
      </div>

      <textarea
        ref={textareaRef}
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        placeholder={`Write a reply to ${leadName}...`}
        className="w-full resize-none rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
        style={{ minHeight: "120px" }}
      />

      {error && (
        <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !replyText.trim()}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          {sending ? "Sending..." : "Send reply"}
        </button>

        <button
          type="button"
          onClick={handleGenerateReply}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-500/50 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {generating ? "Generating..." : "AI draft"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-300"
        >
          <X className="size-3" />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Single Message ──────────────────────────────────────────────────

function MessageBubble({
  message,
  senderEmail,
  isLast,
}: {
  message: EmailMessage;
  senderEmail: string | null;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(isLast);
  const isSent = isOurEmail(message.from, senderEmail);
  const name = extractName(message.from);
  const cleanBody = stripQuotedText(message.bodyPlain) || "(no text content)";

  return (
    <div className={cn("group flex gap-3", isSent && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          isSent
            ? "bg-emerald-500/15 text-emerald-400"
            : "bg-cyan-500/15 text-cyan-400",
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>

      <div className={cn("min-w-0 max-w-[85%]", isSent && "text-right")}>
        <div className="mb-1 flex items-center gap-2">
          <span className={cn("text-xs font-medium", isSent ? "text-emerald-300" : "text-cyan-300")}>
            {isSent ? "You" : name}
          </span>
          <span className="text-[10px] text-zinc-600">{formatEmailDate(message.internalDate)}</span>
        </div>

        <div
          className={cn(
            "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
            isSent
              ? "bg-emerald-500/10 border border-emerald-500/20 text-zinc-200"
              : "bg-white/[0.04] border border-white/[0.08] text-zinc-300",
          )}
        >
          {expanded ? (
            <div className="whitespace-pre-wrap">{cleanBody}</div>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full text-left"
            >
              <div className="line-clamp-2 whitespace-pre-wrap">{cleanBody}</div>
              <span className="mt-1 inline-block text-[11px] text-zinc-500 hover:text-zinc-400">
                Show more
              </span>
            </button>
          )}
        </div>
        <div className="mt-0.5 text-[10px] text-zinc-700" title={formatFullDate(message.internalDate)}>
          {formatFullDate(message.internalDate)}
        </div>
      </div>
    </div>
  );
}

// ─── Thread List Item ────────────────────────────────────────────────

function ThreadItem({
  thread,
  senderEmail,
  leadId,
  leadName,
  onRefresh,
}: {
  thread: EmailThread;
  senderEmail: string | null;
  leadId: number;
  leadName: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);

  const lastMessage = thread.messages[thread.messages.length - 1];
  const firstMessage = thread.messages[0];
  const subject = firstMessage?.subject || "No subject";
  const messageCount = thread.messages.length;
  const lastSender = extractName(lastMessage?.from || "");
  const lastPreview = stripQuotedText(lastMessage?.bodyPlain || "").slice(0, 120);
  const isLastFromUs = isOurEmail(lastMessage?.from || "", senderEmail);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden transition-colors hover:border-white/[0.1]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <div className={cn(
          "mt-1 flex size-8 shrink-0 items-center justify-center rounded-full",
          isLastFromUs ? "bg-emerald-500/15" : "bg-cyan-500/15",
        )}>
          {isLastFromUs
            ? <Send className="size-3.5 text-emerald-400" />
            : <MailOpen className="size-3.5 text-cyan-400" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-white">{subject}</span>
            <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              {messageCount}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={cn("text-xs font-medium", isLastFromUs ? "text-emerald-400" : "text-cyan-400")}>
              {isLastFromUs ? "You" : lastSender}
            </span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">{formatEmailDate(lastMessage?.internalDate || "")}</span>
          </div>
          {!expanded && (
            <div className="mt-1 line-clamp-1 text-xs text-zinc-500">{lastPreview}</div>
          )}
        </div>

        <div className="ml-2 mt-1 shrink-0 text-zinc-600">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-4 py-4">
          <div className="flex flex-col gap-4">
            {thread.messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                senderEmail={senderEmail}
                isLast={i === thread.messages.length - 1}
              />
            ))}
          </div>

          {composing ? (
            <div className="mt-4">
              <ReplyComposer
                leadId={leadId}
                leadName={leadName}
                thread={thread}
                senderEmail={senderEmail}
                onSent={() => {
                  setComposing(false);
                  onRefresh();
                }}
                onCancel={() => setComposing(false)}
              />
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setComposing(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:border-emerald-500/50 hover:bg-emerald-500/20"
              >
                <Pencil className="size-3" />
                Reply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Email Thread Panel ─────────────────────────────────────────

export function EmailThreadPanel({ leadId, leadName, leadEmail }: EmailThreadPanelProps) {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [senderEmail, setSenderEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${leadId}/emails`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load email threads");
      }
      const data = await res.json();
      setThreads(data.threads || []);
      setSenderEmail(data.senderEmail || null);
      setWarning(data.warning || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-white">Email Threads</h3>
          {threads.length > 0 && (
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              {threads.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={fetchThreads}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-300 disabled:opacity-50"
          title="Refresh threads"
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {warning && (
        <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          {warning}
        </div>
      )}

      {loading && threads.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Loader2 className="size-6 animate-spin text-zinc-600" />
          <p className="text-sm text-zinc-500">Loading email threads...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
          <button
            type="button"
            onClick={fetchThreads}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Try again
          </button>
        </div>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-white/[0.04]">
            <Mail className="size-5 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-500">No email threads found</p>
          <p className="text-xs text-zinc-600">
            {leadEmail
              ? "Emails will appear here once outreach begins."
              : "This client has no email address on file."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              senderEmail={senderEmail}
              leadId={leadId}
              leadName={leadName}
              onRefresh={fetchThreads}
            />
          ))}
        </div>
      )}
    </div>
  );
}
