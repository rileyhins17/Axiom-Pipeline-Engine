"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, MailCheck, MailX, Loader2, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";

type GmailStatus = {
  connected: boolean;
  gmailAddress?: string;
  tokenHealthy?: boolean;
  connectedAt?: string;
};

export function GmailConnectCard() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/outreach/gmail/status");
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = () => {
    window.location.href = "/api/outreach/gmail/connect";
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/outreach/gmail/disconnect", { method: "POST" });
      if (res.ok) {
        setStatus({ connected: false });
      }
    } catch {
      // Silently fail
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-4 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
        <span className="text-xs text-zinc-600">Checking Gmail connection...</span>
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
            <MailX className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white">Gmail Not Connected</div>
            <div className="text-[10px] text-zinc-500">
              Connect your Gmail to send outreach emails
            </div>
          </div>
        </div>
        <Button
          onClick={handleConnect}
          size="sm"
          className="gap-1.5 bg-gradient-to-r from-amber-600 to-orange-600 text-xs font-bold text-white hover:from-amber-500 hover:to-orange-500"
        >
          <Mail className="h-3.5 w-3.5" />
          Connect Gmail
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
          <MailCheck className="h-4 w-4 text-emerald-400" />
        </div>
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            Gmail Connected
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </div>
          <div className="font-mono text-[10px] text-emerald-300/80">
            {status.gmailAddress}
          </div>
        </div>
      </div>
      <Button
        onClick={handleDisconnect}
        disabled={disconnecting}
        variant="ghost"
        size="sm"
        className="gap-1.5 border border-white/[0.08] text-xs text-zinc-500 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
      >
        <Unplug className="h-3.5 w-3.5" />
        {disconnecting ? "..." : "Disconnect"}
      </Button>
    </div>
  );
}
