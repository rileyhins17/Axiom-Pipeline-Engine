"use client";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    Copy, Mail, MapPin, PhoneCall, Archive, ArchiveRestore,
    ListPlus, ListMinus, type LucideIcon
} from "lucide-react";

interface QuickActionsProps {
    phone: string | null;
    email: string | null;
    address: string | null;
    isArchived: boolean;
    isInCallList: boolean;
    onToggleArchive: () => void;
    onToggleCallList: () => void;
    archiveSyncPending?: boolean;
}

function ActionButton({ onClick, icon: Icon, label, variant = "default", disabled = false, badge }: {
    onClick: () => void;
    icon: LucideIcon;
    label: string;
    variant?: "default" | "primary" | "danger" | "success";
    disabled?: boolean;
    badge?: string;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={onClick}
                    disabled={disabled}
                    className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium transition-colors",
                        "border active:scale-[0.98]",
                        variant === "default" && "border-white/[0.06] text-zinc-300 hover:bg-white/[0.04] hover:text-white",
                        variant === "primary" && "border-emerald-500/20 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10",
                        variant === "danger" && "border-red-500/20 text-red-400 bg-red-500/5 hover:bg-red-500/10",
                        variant === "success" && "border-cyan-500/20 text-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/10",
                        disabled && "opacity-40 cursor-not-allowed",
                    )}
                >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1 text-left">{label}</span>
                    {badge && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            {badge}
                        </span>
                    )}
                </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
        </Tooltip>
    );
}

export function QuickActions({
    phone, email, address, isArchived, isInCallList,
    onToggleArchive, onToggleCallList, archiveSyncPending,
}: QuickActionsProps) {
    const { toast } = useToast();

    const copyValue = useCallback(async (value: string, label: string, icon: "phone" | "email" | "address" | "copy") => {
        try {
            await navigator.clipboard.writeText(value);
            toast(`Copied ${label}`, { icon });
        } catch {
            toast("Failed to copy", { type: "error" });
        }
    }, [toast]);

    return (
        <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-semibold mb-2">
                Contact actions
            </div>

            {phone && (
                <>
                    <ActionButton
                        onClick={() => copyValue(phone, "phone", "phone")}
                        icon={Copy} label={`Copy Phone`} variant="default"
                    />
                    <ActionButton
                        onClick={() => window.open(`tel:${phone}`, "_self")}
                        icon={PhoneCall} label="Call Now" variant="primary"
                    />
                </>
            )}

            {email && (
                <ActionButton
                    onClick={() => copyValue(email, "email", "email")}
                    icon={Mail} label="Copy Email" variant="default"
                />
            )}

            {address && (
                <ActionButton
                    onClick={() => copyValue(address, "address", "address")}
                    icon={MapPin} label="Copy Address" variant="default"
                />
            )}

            <div className="h-px bg-white/[0.04] my-2" />

            <ActionButton
                onClick={onToggleArchive}
                icon={isArchived ? ArchiveRestore : Archive}
                label={isArchived ? "Unarchive" : "Archive"}
                variant={isArchived ? "success" : "danger"}
                badge={archiveSyncPending ? "Sync pending" : undefined}
            />

            <ActionButton
                onClick={onToggleCallList}
                icon={isInCallList ? ListMinus : ListPlus}
                label={isInCallList ? "Remove from Call List" : "Add to Call List"}
                variant={isInCallList ? "danger" : "success"}
            />
        </div>
    );
}
