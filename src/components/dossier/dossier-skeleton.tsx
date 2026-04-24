"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function DossierSkeleton() {
    return (
        <div className="grid animate-slide-up grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
                <div className="space-y-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                    <Skeleton className="h-6 w-3/4 bg-white/[0.06]" />
                    <Skeleton className="h-4 w-1/2 bg-white/[0.04]" />
                    <Skeleton className="h-4 w-2/3 bg-white/[0.04]" />
                    <div className="flex gap-2 pt-2">
                        <Skeleton className="h-6 w-16 rounded-md bg-white/[0.06]" />
                        <Skeleton className="h-6 w-12 rounded-md bg-white/[0.06]" />
                    </div>
                </div>
                <div className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                    <Skeleton className="h-4 w-24 bg-white/[0.04]" />
                    <Skeleton className="h-9 w-full rounded-lg bg-white/[0.06]" />
                    <Skeleton className="h-9 w-full rounded-lg bg-white/[0.06]" />
                    <Skeleton className="h-9 w-full rounded-lg bg-white/[0.06]" />
                </div>
                <div className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                    <Skeleton className="h-4 w-32 bg-white/[0.04]" />
                    <Skeleton className="h-3 w-full bg-white/[0.04]" />
                    <Skeleton className="h-3 w-3/4 bg-white/[0.04]" />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4">
                    <div className="space-y-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
                        <Skeleton className="h-5 w-32 bg-white/[0.06]" />
                        <div className="grid grid-cols-2 gap-3">
                            {[1, 2, 3, 4].map((item) => (
                                <Skeleton key={item} className="h-16 rounded-lg bg-white/[0.04]" />
                            ))}
                        </div>
                    </div>
                    <div className="space-y-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
                        <Skeleton className="h-5 w-40 bg-white/[0.06]" />
                        <Skeleton className="h-24 w-full rounded-lg bg-white/[0.04]" />
                    </div>
                </div>
                <div className="space-y-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                    <Skeleton className="h-5 w-28 bg-white/[0.06]" />
                    <Skeleton className="h-20 w-full rounded-lg bg-white/[0.04]" />
                    <Skeleton className="h-20 w-full rounded-lg bg-white/[0.04]" />
                </div>
            </div>
        </div>
    );
}
