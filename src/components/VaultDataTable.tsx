"use client"
import { useState, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function VaultDataTable({ initialLeads }: { initialLeads: any[] }) {
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("ALL")

    // Derived state for filtered leads
    const filteredLeads = useMemo(() => {
        return initialLeads.filter((lead) => {
            const matchesSearch =
                (lead.businessName || "").toLowerCase().includes(search.toLowerCase()) ||
                (lead.niche || "").toLowerCase().includes(search.toLowerCase()) ||
                (lead.city || "").toLowerCase().includes(search.toLowerCase())

            const matchesStatus = statusFilter === "ALL" ? true : lead.websiteStatus === statusFilter

            return matchesSearch && matchesStatus
        })
    }, [initialLeads, search, statusFilter])

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                    <Input
                        placeholder="Search by business, niche, or city..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-black/50 border-white/10 text-white"
                    />
                </div>
                <div className="flex gap-2">
                    <Button
                        variant={statusFilter === "ALL" ? "default" : "outline"}
                        onClick={() => setStatusFilter("ALL")}
                        className={statusFilter === "ALL" ? "bg-emerald-600 text-white" : "border-white/10"}
                    >
                        All
                    </Button>
                    <Button
                        variant={statusFilter === "MISSING" ? "default" : "outline"}
                        onClick={() => setStatusFilter("MISSING")}
                        className={statusFilter === "MISSING" ? "bg-red-600/80 text-white" : "border-white/10"}
                    >
                        No Website
                    </Button>
                    <Button
                        variant={statusFilter === "ACTIVE" ? "default" : "outline"}
                        onClick={() => setStatusFilter("ACTIVE")}
                        className={statusFilter === "ACTIVE" ? "bg-blue-600/80 text-white" : "border-white/10"}
                    >
                        Has Website
                    </Button>
                </div>
            </div>

            <div className="rounded-md border border-white/5 overflow-x-auto bg-black/40">
                <Table>
                    <TableHeader className="bg-zinc-900/50">
                        <TableRow className="hover:bg-transparent border-white/10">
                            <TableHead className="font-bold text-zinc-300">Business</TableHead>
                            <TableHead className="font-bold text-zinc-300">Location</TableHead>
                            <TableHead className="font-bold text-zinc-300">Address/Category</TableHead>
                            <TableHead className="font-bold text-zinc-300">Contact</TableHead>
                            <TableHead className="font-bold text-zinc-300">Rating/Reviews</TableHead>
                            <TableHead className="font-bold text-zinc-300 hidden md:table-cell w-[350px]">Tactical Note (Gemini AI)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredLeads.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                                    No leads match your filters.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredLeads.map((lead: any) => (
                                <TableRow key={lead.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                                    <TableCell className="font-medium text-white">
                                        <div className="flex items-center gap-2">
                                            {lead.businessName}
                                            {lead.websiteStatus === "MISSING" ? (
                                                <span className="w-2 h-2 rounded-full bg-red-500" title="No Website"></span>
                                            ) : (
                                                <span className="w-2 h-2 rounded-full bg-blue-500" title="Has Website"></span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1 font-mono">{lead.niche}</div>
                                    </TableCell>
                                    <TableCell className="text-zinc-400">{lead.city}</TableCell>
                                    <TableCell>
                                        <div className="text-sm font-medium text-purple-400">{lead.category || "Unknown"}</div>
                                        <div className="text-xs text-zinc-500 mt-1 truncate max-w-[150px]" title={lead.address || ""}>{lead.address}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-zinc-300 font-mono text-xs">{lead.phone || "No Phone"}</div>
                                        {(lead.email || lead.contactName) && (
                                            <div className="mt-1 flex flex-col gap-0.5">
                                                {lead.contactName && <span className="text-xs text-amber-500">{lead.contactName}</span>}
                                                {lead.email && <span className="text-[10px] text-cyan-500 break-all">{lead.email}</span>}
                                            </div>
                                        )}
                                        {lead.socialLink && (
                                            <a href={lead.socialLink} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline mt-1 inline-block">Social Link ↗</a>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-yellow-500">★</span>
                                            <span className="font-bold">{lead.rating || "N/A"}</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">({lead.reviewCount || 0} reviews)</div>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell align-top py-4">
                                        <div className="bg-zinc-950/50 p-3 rounded border border-white/5 text-xs text-zinc-300 leading-relaxed group-hover:border-emerald-500/20 transition-colors">
                                            {lead.tacticalNote === "Processing..." ? (
                                                <span className="animate-pulse text-amber-500/70 font-mono">Generating intelligence...</span>
                                            ) : lead.tacticalNote}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="text-xs text-muted-foreground text-right">
                Showing {filteredLeads.length} of {initialLeads.length} total leads.
            </div>
        </div>
    )
}
