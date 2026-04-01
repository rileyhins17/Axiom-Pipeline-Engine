"use client";
import { cn } from "@/lib/utils";
import { OutreachEditorSheet } from "@/components/outreach/outreach-editor-sheet";
import { OutreachStatusBadge } from "@/components/outreach/outreach-status-badge";
import { TierBadge } from "@/components/ui/tier-badge";
import { SignalChip } from "@/components/ui/signal-chip";
import { CopyButton } from "@/components/ui/copy-button";
import { getTierConfig } from "@/lib/ui/tokens";
import {
    Globe, Phone, Mail, PhoneCall, Copy, Clock, Archive,
    MapPin, Gauge, Star,
} from "lucide-react";

interface TriageLead {
    id: number;
    businessName: string;
    niche: string;
    city: string;
    address: string | null;
    websiteStatus: string | null;
    phone: string | null;
    email: string | null;
    contactName: string | null;
    emailType: string | null;
    emailConfidence: number | null;
    phoneConfidence: number | null;
    axiomScore: number | null;
    axiomTier: string | null;
    painSignals: string | null;
    callOpener: string | null;
    followUpQuestion: string | null;
    axiomWebsiteAssessment: string | null;
    isArchived: boolean;
    lastUpdated: string | null;
    source: string | null;
    rating: number | null;
    reviewCount: number | null;
    outreachStatus: string | null;
    outreachChannel: string | null;
    firstContactedAt: string | Date | null;
    lastContactedAt: string | Date | null;
    nextFollowUpDue: string | Date | null;
    outreachNotes: string | null;
}

function parseJSON<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
}

function MiniBar({ value, color }: { value: number; color: string }) {
    return (
        <div className="w-12 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
                className={cn("h-full rounded-full", color)}
                style={{ width: `${Math.round(value * 100)}%` }}
            />
        </div>
    );
}

export function TriageCard({
    lead,
    className,
    onOutreachSaved,
}: {
    lead: TriageLead;
    className?: string;
    onOutreachSaved: (updatedLead: TriageLead) => void;
}) {
    const tierConfig = getTierConfig(lead.axiomTier);
    const painSignals = parseJSON<any[]>(lead.painSignals, []);
    const assessment = parseJSON<any>(lead.axiomWebsiteAssessment, null);

    return (
        <div className={cn(
            "glass-ultra relative overflow-hidden rounded-2xl p-4 transition-all duration-300 sm:p-6",
            tierConfig.glow,
            className
        )}>
            {/* Tier accent */}
            <div className={cn("absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r", tierConfig.gradient)} />

            {/* 1) Header */}
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold leading-tight text-white sm:text-xl">{lead.businessName}</h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[11px] text-purple-400/80 font-mono">{lead.niche}</span>
                        <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {lead.city}
                        </span>
                        {lead.rating != null && (
                            <span className="text-[11px] text-amber-400 flex items-center gap-0.5">
                                <Star className="w-3 h-3" /> {lead.rating}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:ml-4 md:flex-shrink-0 md:justify-end">
                    <TierBadge tier={lead.axiomTier} score={lead.axiomScore} size="sm" />
                    {lead.websiteStatus && (
                        <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono border",
                            lead.websiteStatus === "MISSING"
                                ? "bg-red-400/10 text-red-400 border-red-400/20"
                                : "bg-blue-400/10 text-blue-400 border-blue-400/20"
                        )}>
                            <Globe className="w-3 h-3" />
                            {lead.websiteStatus === "MISSING" ? "No Site" : "Has Site"}
                        </span>
                    )}
                    {lead.outreachStatus && lead.outreachStatus !== "NOT_CONTACTED" && (
                        <OutreachStatusBadge status={lead.outreachStatus} />
                    )}
                    {lead.isArchived && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono bg-zinc-400/10 text-zinc-400 border border-zinc-400/20">
                            <Archive className="w-3 h-3" /> Archived
                        </span>
                    )}
                    <OutreachEditorSheet
                        lead={lead}
                        onSaved={(updatedLead) => onOutreachSaved({ ...lead, ...updatedLead })}
                        buttonLabel="Outreach"
                        buttonVariant="ghost"
                        buttonSize="sm"
                        buttonClassName="border border-cyan-500/20 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/10"
                    />
                </div>
            </div>

            {/* 2) Contact strip */}
            <div className="mb-5 flex flex-col gap-3 rounded-xl px-4 py-3 glass md:flex-row md:items-center md:gap-6">
                {lead.phone ? (
                    <div className="flex min-w-0 items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="text-sm font-mono text-zinc-200">{lead.phone}</span>
                        <CopyButton value={lead.phone} label="Copy phone" size="xs" />
                        <a
                            href={`tel:${lead.phone}`}
                            className="text-emerald-400 hover:text-emerald-300 transition-colors"
                            title="Call now"
                        >
                            <PhoneCall className="w-3.5 h-3.5" />
                        </a>
                        {lead.phoneConfidence != null && (
                            <MiniBar value={lead.phoneConfidence} color="bg-cyan-400" />
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-zinc-700">
                        <Phone className="w-3.5 h-3.5" />
                        <span className="text-xs italic">No phone</span>
                    </div>
                )}

                <div className="hidden h-4 w-px bg-white/[0.06] md:block" />

                {lead.email ? (
                    <div className="flex min-w-0 items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-cyan-400/60" />
                        <span className="text-sm font-mono text-cyan-300/80 truncate max-w-[200px]">{lead.email}</span>
                        <CopyButton value={lead.email} label="Copy email" size="xs" />
                        {lead.emailType && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-500">
                                {lead.emailType}
                            </span>
                        )}
                        {lead.emailConfidence != null && (
                            <MiniBar value={lead.emailConfidence} color="bg-emerald-400" />
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-zinc-700">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="text-xs italic">No email</span>
                    </div>
                )}
            </div>

            {/* 3) Evidence: Pain Signals + Website Assessment */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                {/* Pain signals */}
                <div className="glass rounded-xl p-4">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-2">Pain Signals</div>
                    {painSignals.length > 0 ? (
                        <div className="space-y-1.5">
                            {painSignals.slice(0, 3).map((sig, i) => (
                                <SignalChip key={i} type={sig.type} severity={sig.severity} evidence={sig.evidence} />
                            ))}
                            {painSignals.length > 3 && (
                                <span className="text-[10px] text-zinc-600 font-mono">+{painSignals.length - 3} more</span>
                            )}
                        </div>
                    ) : (
                        <p className="text-[11px] text-zinc-700 italic">No pain signals</p>
                    )}
                </div>

                {/* Website assessment */}
                <div className="glass rounded-xl p-4">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-2">Website Assessment</div>
                    {assessment ? (
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className={cn(
                                    "w-10 h-10 rounded-lg flex items-center justify-center text-lg font-black font-mono",
                                    assessment.overallGrade === "A" || assessment.overallGrade === "B" ? "bg-emerald-400/15 text-emerald-400"
                                        : assessment.overallGrade === "C" ? "bg-amber-400/15 text-amber-400"
                                            : "bg-red-400/15 text-red-400"
                                )}>
                                    {assessment.overallGrade}
                                </div>
                                <div className="text-[10px] text-zinc-500">Overall Grade</div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: "Speed", val: assessment.speedRisk },
                                    { label: "Conv", val: assessment.conversionRisk },
                                    { label: "Trust", val: assessment.trustRisk },
                                    { label: "SEO", val: assessment.seoRisk },
                                ].map(r => (
                                    <div key={r.label} className="flex items-center justify-between text-[10px]">
                                        <span className="text-zinc-500">{r.label}</span>
                                        <div className="flex items-center gap-1">
                                            <div className="w-8 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                                                <div
                                                    className={cn("h-full rounded-full",
                                                        r.val <= 2 ? "bg-emerald-400" : r.val <= 3 ? "bg-amber-400" : "bg-red-400"
                                                    )}
                                                    style={{ width: `${(r.val / 5) * 100}%` }}
                                                />
                                            </div>
                                            <span className="font-mono text-zinc-500 w-4 text-right">{r.val}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-[11px] text-zinc-700 italic">No assessment data</p>
                    )}
                </div>
            </div>

            {/* 4) Call sheet preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {lead.callOpener && (
                    <div className="glass rounded-xl p-4">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] uppercase tracking-widest text-emerald-400/50">Call Opener</span>
                            <CopyButton value={lead.callOpener} label="Copy opener" size="xs" />
                        </div>
                        <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-2">{lead.callOpener}</p>
                    </div>
                )}
                {lead.followUpQuestion && (
                    <div className="glass rounded-xl p-4">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] uppercase tracking-widest text-cyan-400/50">Follow-up</span>
                            <CopyButton value={lead.followUpQuestion} label="Copy follow-up" size="xs" />
                        </div>
                        <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-1">{lead.followUpQuestion}</p>
                    </div>
                )}
            </div>

            {/* 5) Footer */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 border-t border-white/[0.04] text-[10px] text-zinc-600 font-mono">
                {lead.source && <span>Source: {lead.source}</span>}
                {lead.lastUpdated && (
                    <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(lead.lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                )}
                <span className="ml-auto">ID: {lead.id}</span>
            </div>
        </div>
    );
}

export type { TriageLead };
