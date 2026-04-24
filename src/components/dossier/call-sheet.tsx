"use client";

import { useCallback } from "react";
import { ArrowRight, Copy, Lightbulb, MessageCircle, PhoneCall } from "lucide-react";

import { useToast } from "@/components/ui/toast-provider";

interface PainSignal { type: string; severity: number; evidence: string; }

interface CallSheetProps {
    callOpener: string | null;
    followUpQuestion: string | null;
    painSignals: PainSignal[];
}

const OBJECTION_TEMPLATES: Record<string, { trigger: string; handler: string }> = {
    NO_WEBSITE: {
        trigger: "No website",
        handler: "Most people find you on Google first. Without a site, you are invisible to many customers searching right now.",
    },
    SPEED: {
        trigger: "Slow speed",
        handler: "Mobile speed is killing conversions. Visitors often leave when a page takes more than a few seconds to load.",
    },
    CONVERSION: {
        trigger: "Conversion issues",
        handler: "No clear booking or quote path means visitors cannot take the next step, even if they want to hire you.",
    },
    TRUST: {
        trigger: "Trust gaps",
        handler: "Without reviews, testimonials, or certifications visible, visitors do not have enough confidence to reach out.",
    },
    SEO: {
        trigger: "SEO weakness",
        handler: "You cannot measure or improve lead flow if search engines cannot properly index the business.",
    },
};

const NEXT_STEP = "If I could show you a 30-second example of what we would change, would you want to see it?";

function CopyButton({ onClick, label = "Copy" }: { onClick: () => void; label?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label || "Copy"}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
            <Copy className="h-3 w-3" />
            {label}
        </button>
    );
}

export function CallSheet({ callOpener, followUpQuestion, painSignals }: CallSheetProps) {
    const { toast } = useToast();

    const copyBlock = useCallback(async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast(`Copied ${label}`, { icon: "copy" });
        } catch {
            toast("Failed to copy", { type: "error" });
        }
    }, [toast]);

    const painTypes = new Set(painSignals.map((signal) => signal.type));
    const relevantObjections = Object.entries(OBJECTION_TEMPLATES)
        .filter(([key]) => painTypes.has(key))
        .slice(0, 4);

    return (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
            <div className="border-b border-white/[0.06] px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Call sheet</div>
                <p className="mt-1 text-xs text-zinc-500">Copy-ready talk tracks for verification and follow-up.</p>
            </div>

            <div className="divide-y divide-white/[0.06]">
                {callOpener ? (
                    <section className="p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                                <PhoneCall className="h-4 w-4 text-emerald-400" />
                                Opener
                            </h3>
                            <CopyButton onClick={() => copyBlock(callOpener, "opener")} />
                        </div>
                        <p className="rounded-md border border-white/[0.05] bg-black/20 p-3 text-xs leading-5 text-zinc-300">
                            {callOpener}
                        </p>
                    </section>
                ) : null}

                {followUpQuestion ? (
                    <section className="p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                                <MessageCircle className="h-4 w-4 text-cyan-400" />
                                Follow-up
                            </h3>
                            <CopyButton onClick={() => copyBlock(followUpQuestion, "follow-up")} />
                        </div>
                        <p className="rounded-md border border-white/[0.05] bg-black/20 p-3 text-xs leading-5 text-zinc-300">
                            {followUpQuestion}
                        </p>
                    </section>
                ) : null}

                {relevantObjections.length > 0 ? (
                    <section className="p-4">
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                            <Lightbulb className="h-4 w-4 text-amber-400" />
                            Objections
                        </h3>
                        <div className="space-y-3">
                            {relevantObjections.map(([key, objection]) => (
                                <div key={key} className="border-l border-amber-500/25 pl-3">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80">
                                            {objection.trigger}
                                        </span>
                                        <CopyButton onClick={() => copyBlock(objection.handler, objection.trigger.toLowerCase())} label="" />
                                    </div>
                                    <p className="text-[11px] leading-5 text-zinc-400">{objection.handler}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                <section className="p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-400/70">
                            <ArrowRight className="h-3 w-3" />
                            Next step
                        </h3>
                        <CopyButton onClick={() => copyBlock(NEXT_STEP, "next step")} label="" />
                    </div>
                    <p className="text-xs leading-5 text-emerald-200/80">{NEXT_STEP}</p>
                </section>
            </div>
        </div>
    );
}
