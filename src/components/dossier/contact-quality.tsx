"use client";
import { cn } from "@/lib/utils";
import { Shield, Mail, Phone } from "lucide-react";

interface ContactQualityProps {
    emailType: string | null;
    emailConfidence: number | null;
    phoneConfidence: number | null;
}

const EMAIL_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    owner: { label: "Owner", color: "emerald" },
    staff: { label: "Staff", color: "cyan" },
    generic: { label: "Generic", color: "amber" },
    unknown: { label: "Unknown", color: "zinc" },
};

function ConfidenceBar({ value, color }: { value: number; color: string }) {
    const pct = Math.round(value * 100);
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                    className={cn(
                        "h-full rounded-full transition-all duration-700",
                        color === "emerald" && "bg-emerald-400",
                        color === "cyan" && "bg-cyan-400",
                        color === "amber" && "bg-amber-400",
                        color === "zinc" && "bg-zinc-500",
                    )}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{pct}%</span>
        </div>
    );
}

export function ContactQuality({ emailType, emailConfidence, phoneConfidence }: ContactQualityProps) {
    const emailInfo = EMAIL_TYPE_LABELS[emailType || "unknown"] || EMAIL_TYPE_LABELS.unknown;

    return (
        <div className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-semibold flex items-center gap-1.5">
                <Shield className="w-3 h-3" /> Contact quality
            </div>

            {emailType && (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <Mail className="w-3 h-3" /> Email Type
                        </div>
                        <span className={cn(
                            "text-[10px] font-mono px-1.5 py-0.5 rounded border",
                            `bg-${emailInfo.color}-400/10 text-${emailInfo.color}-400 border-${emailInfo.color}-400/20`
                        )}>
                            {emailInfo.label}
                        </span>
                    </div>
                    {emailConfidence != null && (
                        <ConfidenceBar value={emailConfidence} color={emailInfo.color} />
                    )}
                </div>
            )}

            {phoneConfidence != null && (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <Phone className="w-3 h-3" /> Phone Confidence
                    </div>
                    <ConfidenceBar value={phoneConfidence} color="cyan" />
                </div>
            )}

            {!emailType && emailConfidence == null && phoneConfidence == null && (
                <p className="text-[11px] text-zinc-600 italic">No contact quality data available.</p>
            )}
        </div>
    );
}
