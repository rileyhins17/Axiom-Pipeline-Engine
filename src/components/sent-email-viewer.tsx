"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

type EmailDetail = {
  id: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string | null;
  bodyPlain: string | null;
  status: string;
  errorMessage: string | null;
  sentAt: string;
};

export function SentEmailViewerTrigger({
  emailId,
  children,
  className,
}: {
  emailId: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "w-full text-left transition hover:bg-white/[0.025]"}
      >
        {children}
      </button>
      {open ? <SentEmailViewerModal emailId={emailId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SentEmailViewerModal({ emailId, onClose }: { emailId: string; onClose: () => void }) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/outreach/emails/${emailId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!cancelled) {
          setEmail(data.email);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load email");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [emailId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sentAt = email ? new Date(email.sentAt) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-viewer-title"
    >
      <div
        className="v2-card w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.08] p-5">
          <div className="min-w-0">
            <div className="v2-eyebrow">Sent email</div>
            <h2 id="email-viewer-title" className="mt-2 text-lg font-semibold text-white truncate">
              {email?.subject || (loading ? "Loading…" : "Email")}
            </h2>
            {email ? (
              <div className="mt-1 space-y-0.5 text-[12px] text-zinc-500">
                <div>
                  From <span className="font-mono text-zinc-300">{email.senderEmail}</span>
                </div>
                <div>
                  To <span className="font-mono text-zinc-300">{email.recipientEmail}</span>
                </div>
                <div>
                  Sent {sentAt ? sentAt.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.03] p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-500">Loading email…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-300">{error}</div>
          ) : email ? (
            <EmailBody email={email} />
          ) : null}
        </div>
        {email?.status && email.status !== "sent" ? (
          <div className="border-t border-white/[0.08] bg-white/[0.02] px-5 py-3 text-xs text-zinc-400">
            Status: <span className="font-medium text-zinc-200">{email.status}</span>
            {email.errorMessage ? <span className="ml-2 text-red-300">— {email.errorMessage}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmailBody({ email }: { email: EmailDetail }) {
  if (email.bodyHtml && email.bodyHtml.trim().length > 0) {
    return (
      <iframe
        title={email.subject}
        srcDoc={`<base target="_blank"><style>body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#e4e4e7;background:#0a121c;padding:20px;margin:0;}a{color:#34d399;}img{max-width:100%;height:auto;}</style>${email.bodyHtml}`}
        sandbox=""
        className="w-full"
        style={{ minHeight: 360, height: "60vh", border: 0, background: "#0a121c" }}
      />
    );
  }
  return (
    <pre className="p-5 text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap font-sans">
      {email.bodyPlain || "(empty)"}
    </pre>
  );
}
