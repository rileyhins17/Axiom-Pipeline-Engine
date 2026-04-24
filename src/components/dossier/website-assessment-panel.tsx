"use client";
import { cn } from "@/lib/utils";
import { Gauge, Wrench } from "lucide-react";

interface WebsiteAssessment {
    speedRisk: number;
    conversionRisk: number;
    trustRisk: number;
    seoRisk: number;
    overallGrade: string;
    topFixes: string[];
}

interface WebsiteAssessmentPanelProps {
    assessment: WebsiteAssessment | null;
}

const GRADE_COLORS: Record<string, { text: string; bg: string; ring: string }> = {
    A: { text: "text-emerald-400", bg: "bg-emerald-400/15", ring: "stroke-emerald-400" },
    B: { text: "text-cyan-400", bg: "bg-cyan-400/15", ring: "stroke-cyan-400" },
    C: { text: "text-amber-400", bg: "bg-amber-400/15", ring: "stroke-amber-400" },
    D: { text: "text-orange-400", bg: "bg-orange-400/15", ring: "stroke-orange-400" },
    F: { text: "text-red-400", bg: "bg-red-400/15", ring: "stroke-red-400" },
};

function RiskMeter({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
    const pct = Math.round((value / max) * 100);
    const color = value <= 1 ? "bg-emerald-400" : value <= 2 ? "bg-cyan-400" : value <= 3 ? "bg-amber-400" : value <= 4 ? "bg-orange-400" : "bg-red-400";
    const textColor = value <= 1 ? "text-emerald-400" : value <= 2 ? "text-cyan-400" : value <= 3 ? "text-amber-400" : value <= 4 ? "text-orange-400" : "text-red-400";

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <span className="text-[11px] text-zinc-400">{label}</span>
                <span className={cn("text-[10px] font-mono font-bold", textColor)}>{value}/{max}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export function WebsiteAssessmentPanel({ assessment }: WebsiteAssessmentPanelProps) {
    if (!assessment) {
        return (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                    <Gauge className="w-4 h-4 text-cyan-400" />
                    Website assessment
                </h3>
                <p className="text-[11px] text-zinc-600 italic text-center py-4">No website assessment data available.</p>
            </div>
        );
    }

    const gradeStyle = GRADE_COLORS[assessment.overallGrade] || GRADE_COLORS.F;

    return (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                <Gauge className="w-4 h-4 text-cyan-400" />
                Website assessment
            </h3>

            {/* Overall grade */}
            <div className="flex items-center gap-4 mb-5">
                <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-black font-mono border", gradeStyle.bg, gradeStyle.text, `border-current/20`)}>
                    {assessment.overallGrade}
                </div>
                <div>
                    <div className="text-xs text-zinc-400">Overall grade</div>
                    <div className={cn("text-sm font-bold", gradeStyle.text)}>
                        {assessment.overallGrade === "A" ? "Excellent" :
                            assessment.overallGrade === "B" ? "Good" :
                                assessment.overallGrade === "C" ? "Fair" :
                                    assessment.overallGrade === "D" ? "Poor" : "Critical"}
                    </div>
                </div>
            </div>

            {/* Risk meters */}
            <div className="space-y-3 mb-5">
                <RiskMeter label="Speed Risk" value={assessment.speedRisk} />
                <RiskMeter label="Conversion Risk" value={assessment.conversionRisk} />
                <RiskMeter label="Trust Risk" value={assessment.trustRisk} />
                <RiskMeter label="SEO Risk" value={assessment.seoRisk} />
            </div>

            {/* Top Fixes */}
            {assessment.topFixes && assessment.topFixes.length > 0 && (
                <div className="border-t border-white/[0.04] pt-4">
                    <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground/40 flex items-center gap-1.5 mb-2">
                        <Wrench className="w-3 h-3" /> Top fixes
                    </h4>
                    <ul className="space-y-1.5">
                        {assessment.topFixes.slice(0, 3).map((fix, i) => (
                            <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-300">
                                <span className="text-emerald-400 font-mono text-[10px] mt-0.5">{i + 1}.</span>
                                <span>{fix}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
