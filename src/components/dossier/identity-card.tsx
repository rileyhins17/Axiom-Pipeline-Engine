"use client";
import { cn } from "@/lib/utils";
import { getTierConfig } from "@/lib/ui/tokens";
import { TierBadge } from "@/components/ui/tier-badge";
import { MapPin, Globe, Archive, Building, Star, MessageSquare } from "lucide-react";

interface IdentityCardProps {
    businessName: string;
    niche: string;
    city: string;
    address: string | null;
    axiomTier: string | null;
    axiomScore: number | null;
    websiteStatus: string | null;
    rating: number | null;
    reviewCount: number | null;
    isArchived: boolean;
}

export function IdentityCard({
    businessName, niche, city, address, axiomTier, axiomScore,
    websiteStatus, rating, reviewCount, isArchived,
}: IdentityCardProps) {
    const tierConfig = getTierConfig(axiomTier);

    return (
        <div className={cn("relative space-y-4 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] p-4", tierConfig.glow)}>
            <div className={cn("absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r", tierConfig.gradient)} />

            <div>
                <h2 className="text-base font-semibold leading-tight text-white">{businessName}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                    <Building className="w-3 h-3 text-purple-400/60" />
                    <span className="text-[11px] text-purple-400/80 font-mono">{niche}</span>
                </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-zinc-400">
                <MapPin className="w-3.5 h-3.5 text-emerald-400/60 mt-0.5 flex-shrink-0" />
                <div>
                    <div>{city}</div>
                    {address && <div className="text-zinc-600 text-[11px] mt-0.5">{address}</div>}
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <TierBadge tier={axiomTier} score={axiomScore} size="sm" />

                {websiteStatus && (
                    <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border",
                        websiteStatus === "MISSING"
                            ? "bg-red-400/10 text-red-400 border-red-400/20"
                            : "bg-blue-400/10 text-blue-400 border-blue-400/20"
                    )}>
                        <Globe className="w-3 h-3" />
                        {websiteStatus === "MISSING" ? "No Site" : "Has Site"}
                    </span>
                )}

                {isArchived && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-400/10 text-zinc-400 border border-zinc-400/20">
                        <Archive className="w-3 h-3" />
                        Archived
                    </span>
                )}
            </div>

            {(rating || reviewCount) && (
                <div className="flex items-center gap-4 pt-1 border-t border-white/[0.04]">
                    {rating != null && (
                        <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-sm font-bold text-amber-400 font-mono">{rating}</span>
                        </div>
                    )}
                    {reviewCount != null && (
                        <div className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3 text-zinc-500" />
                            <span className="text-xs text-zinc-400 font-mono">{reviewCount} reviews</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
