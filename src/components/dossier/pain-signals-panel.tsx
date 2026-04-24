"use client";
import { SignalChip } from "@/components/ui/signal-chip";
import { AlertTriangle, Zap } from "lucide-react";

interface PainSignal {
    type: string;
    severity: number;
    evidence: string;
    source?: string;
}

interface PainSignalsPanelProps {
    painSignals: PainSignal[];
}

export function PainSignalsPanel({ painSignals }: PainSignalsPanelProps) {
    if (!painSignals || painSignals.length === 0) {
        return (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Pain signals
                </h3>
                <div className="flex flex-col items-center py-8 text-center">
                    <div className="w-12 h-12 rounded-xl glass-strong flex items-center justify-center mb-3">
                        <AlertTriangle className="w-5 h-5 text-zinc-600" />
                    </div>
                    <p className="text-xs text-zinc-500">No pain signals captured yet</p>
                    <p className="text-[10px] text-zinc-700 mt-1">Run a fresh extraction for this niche/city.</p>
                </div>
            </div>
        );
    }

    // Group by type
    const grouped = painSignals.reduce<Record<string, PainSignal[]>>((acc, sig) => {
        const key = sig.type || "UNKNOWN";
        if (!acc[key]) acc[key] = [];
        acc[key].push(sig);
        return acc;
    }, {});

    return (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Pain signals
                </h3>
                <span className="text-[10px] font-mono text-muted-foreground/40">
                    {painSignals.length} signal{painSignals.length !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Compact chips overview */}
            <div className="flex flex-wrap gap-1.5 mb-4">
                {Object.entries(grouped).map(([type, sigs]) => {
                    const maxSev = Math.max(...sigs.map(s => s.severity || 0));
                    return (
                        <SignalChip key={type} type={type} severity={maxSev} compact />
                    );
                })}
            </div>

            {/* Detailed signals */}
            <div className="space-y-2">
                {painSignals.map((sig, i) => (
                    <SignalChip
                        key={`${sig.type}-${i}`}
                        type={sig.type}
                        severity={sig.severity}
                        evidence={sig.evidence}
                    />
                ))}
            </div>
        </div>
    );
}
