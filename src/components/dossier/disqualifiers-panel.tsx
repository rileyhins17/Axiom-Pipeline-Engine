"use client";
import { AlertOctagon, XCircle } from "lucide-react";

interface DisqualifiersPanelProps {
    disqualifiers: string[];
    disqualifyReason: string | null;
}

export function DisqualifiersPanel({ disqualifiers, disqualifyReason }: DisqualifiersPanelProps) {
    if ((!disqualifiers || disqualifiers.length === 0) && !disqualifyReason) return null;

    return (
        <div className="rounded-lg border border-red-500/15 bg-red-500/[0.025] p-5">
            <h3 className="text-sm font-bold text-red-400 flex items-center gap-2 mb-4">
                <AlertOctagon className="w-4 h-4" />
                Disqualifiers
            </h3>

            {disqualifyReason && (
                <div className="mb-3 rounded-lg border border-red-500/10 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-red-400/60 mb-1">Primary reason</div>
                    <p className="text-xs text-red-300">{disqualifyReason}</p>
                </div>
            )}

            {disqualifiers && disqualifiers.length > 0 && (
                <ul className="space-y-1.5">
                    {disqualifiers.map((dq, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-400">
                            <XCircle className="w-3 h-3 text-red-400/50 mt-0.5 flex-shrink-0" />
                            <span>{dq}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
