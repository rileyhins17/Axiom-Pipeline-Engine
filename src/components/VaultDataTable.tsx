"use client"
import React, { useState, useMemo, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { OutreachEditorSheet } from "@/components/outreach/outreach-editor-sheet"
import { OutreachStatusBadge } from "@/components/outreach/outreach-status-badge"
import { resolveLeadWebsiteUrl } from "@/lib/lead-website"
import { formatOutreachDate, getOutreachChannelLabel, isContactedOutreachStatus } from "@/lib/outreach"
import { formatAppDate } from "@/lib/time"
import {
    Search, Download, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
    ArrowUpDown, ExternalLink, Phone, Mail, User, MapPin, Globe, Filter, X,
    FileSpreadsheet, SlidersHorizontal, Star, MessageSquare, Building, Tag,
    Calendar, CheckCircle2, XCircle, AtSign, Share2, FileText
} from "lucide-react"

type Lead = {
    id: number
    businessName: string
    niche: string
    city: string
    category: string | null
    address: string | null
    phone: string | null
    email: string | null
    socialLink: string | null
    websiteUrl?: string | null
    websiteDomain?: string | null
    rating: number | null
    reviewCount: number | null
    websiteStatus: string | null
    contactName: string | null
    tacticalNote: string | null
    outreachStatus: string | null
    outreachChannel: string | null
    firstContactedAt: string | Date | null
    lastContactedAt: string | Date | null
    nextFollowUpDue: string | Date | null
    outreachNotes: string | null
    createdAt: string
}

type SortKey = "businessName" | "city" | "rating" | "reviewCount" | "createdAt" | "niche"
type SortDir = "asc" | "desc"

const PAGE_OPTIONS = [10, 25, 50, 100]

// Export column options
const EXPORT_COLUMNS = [
    { key: "businessName", label: "Business Name", default: true },
    { key: "niche", label: "Niche", default: true },
    { key: "city", label: "City", default: true },
    { key: "category", label: "Category", default: true },
    { key: "address", label: "Address", default: false },
    { key: "phone", label: "Phone", default: true },
    { key: "email", label: "Email", default: true },
    { key: "contactName", label: "Contact Name", default: true },
    { key: "socialLink", label: "Social Link", default: false },
    { key: "rating", label: "Rating", default: true },
    { key: "reviewCount", label: "Reviews", default: true },
    { key: "websiteStatus", label: "Website Status", default: true },
    { key: "tacticalNote", label: "AI Tactical Note", default: false },
    { key: "createdAt", label: "Date Added", default: false },
] as const

export default function VaultDataTable({ initialLeads }: { initialLeads: Lead[] }) {
    const router = useRouter()
    const [leads, setLeads] = useState<Lead[]>(initialLeads)

    // Search
    const [search, setSearch] = useState("")

    // Filters
    const [showFilters, setShowFilters] = useState(false)
    const [statusFilter, setStatusFilter] = useState("ALL")
    const [hasEmailFilter, setHasEmailFilter] = useState("ALL") // ALL | YES | NO
    const [hasPhoneFilter, setHasPhoneFilter] = useState("ALL")
    const [hasContactFilter, setHasContactFilter] = useState("ALL")
    const [hasSocialFilter, setHasSocialFilter] = useState("ALL")
    const [nicheFilter, setNicheFilter] = useState("ALL")
    const [cityFilter, setCityFilter] = useState("ALL")
    const [minRating, setMinRating] = useState("")
    const [maxRating, setMaxRating] = useState("")
    const [minReviews, setMinReviews] = useState("")
    const [maxReviews, setMaxReviews] = useState("")
    const [dateFrom, setDateFrom] = useState("")
    const [dateTo, setDateTo] = useState("")

    // Sort & Pagination
    const [sortKey, setSortKey] = useState<SortKey>("createdAt")
    const [sortDir, setSortDir] = useState<SortDir>("desc")
    const [page, setPage] = useState(0)
    const [perPage, setPerPage] = useState(25)
    const [expandedId, setExpandedId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState<number | null>(null)

    // Export Panel
    const [showExport, setShowExport] = useState(false)
    const [exportColumns, setExportColumns] = useState<Record<string, boolean>>(
        Object.fromEntries(EXPORT_COLUMNS.map(c => [c.key, c.default]))
    )
    const [exportFormat, setExportFormat] = useState<"csv" | "tsv">("csv")
    const [exportScope, setExportScope] = useState<"filtered" | "all" | "page">("filtered")

    // Derived unique values for filter dropdowns
    const uniqueNiches = useMemo(() => [...new Set(leads.map(l => l.niche).filter(Boolean))].sort(), [leads])
    const uniqueCities = useMemo(() => [...new Set(leads.map(l => l.city).filter(Boolean))].sort(), [leads])

    // Count active filters
    const activeFilterCount = useMemo(() => {
        let count = 0
        if (statusFilter !== "ALL") count++
        if (hasEmailFilter !== "ALL") count++
        if (hasPhoneFilter !== "ALL") count++
        if (hasContactFilter !== "ALL") count++
        if (hasSocialFilter !== "ALL") count++
        if (nicheFilter !== "ALL") count++
        if (cityFilter !== "ALL") count++
        if (minRating) count++
        if (maxRating) count++
        if (minReviews) count++
        if (maxReviews) count++
        if (dateFrom) count++
        if (dateTo) count++
        return count
    }, [statusFilter, hasEmailFilter, hasPhoneFilter, hasContactFilter, hasSocialFilter, nicheFilter, cityFilter, minRating, maxRating, minReviews, maxReviews, dateFrom, dateTo])

    const clearAllFilters = () => {
        setStatusFilter("ALL")
        setHasEmailFilter("ALL")
        setHasPhoneFilter("ALL")
        setHasContactFilter("ALL")
        setHasSocialFilter("ALL")
        setNicheFilter("ALL")
        setCityFilter("ALL")
        setMinRating("")
        setMaxRating("")
        setMinReviews("")
        setMaxReviews("")
        setDateFrom("")
        setDateTo("")
        setSearch("")
    }

    // Filtered + sorted
    const processedLeads = useMemo(() => {
        let filtered = leads.filter((lead) => {
            // Text search
            if (search) {
                const s = search.toLowerCase()
                const matchesSearch =
                    (lead.businessName || "").toLowerCase().includes(s) ||
                    (lead.niche || "").toLowerCase().includes(s) ||
                    (lead.city || "").toLowerCase().includes(s) ||
                    (lead.email || "").toLowerCase().includes(s) ||
                    (lead.contactName || "").toLowerCase().includes(s) ||
                    (lead.category || "").toLowerCase().includes(s) ||
                    (lead.address || "").toLowerCase().includes(s) ||
                    (lead.tacticalNote || "").toLowerCase().includes(s) ||
                    (lead.outreachNotes || "").toLowerCase().includes(s) ||
                    (lead.outreachStatus || "").toLowerCase().includes(s)
                if (!matchesSearch) return false
            }

            // Website Status
            if (statusFilter !== "ALL" && lead.websiteStatus !== statusFilter) return false

            // Has Email
            if (hasEmailFilter === "YES" && (!lead.email || lead.email.trim() === "")) return false
            if (hasEmailFilter === "NO" && lead.email && lead.email.trim() !== "") return false

            // Has Phone
            if (hasPhoneFilter === "YES" && (!lead.phone || lead.phone.trim() === "")) return false
            if (hasPhoneFilter === "NO" && lead.phone && lead.phone.trim() !== "") return false

            // Has Contact Name
            if (hasContactFilter === "YES" && (!lead.contactName || lead.contactName.trim() === "")) return false
            if (hasContactFilter === "NO" && lead.contactName && lead.contactName.trim() !== "") return false

            // Has Social Link
            if (hasSocialFilter === "YES" && (!lead.socialLink || lead.socialLink.trim() === "")) return false
            if (hasSocialFilter === "NO" && lead.socialLink && lead.socialLink.trim() !== "") return false

            // Niche filter
            if (nicheFilter !== "ALL" && lead.niche !== nicheFilter) return false

            // City filter
            if (cityFilter !== "ALL" && lead.city !== cityFilter) return false

            // Rating range
            if (minRating && (lead.rating == null || lead.rating < parseFloat(minRating))) return false
            if (maxRating && (lead.rating == null || lead.rating > parseFloat(maxRating))) return false

            // Reviews range
            if (minReviews && (lead.reviewCount == null || lead.reviewCount < parseInt(minReviews))) return false
            if (maxReviews && (lead.reviewCount == null || lead.reviewCount > parseInt(maxReviews))) return false

            // Date range
            if (dateFrom) {
                const d = new Date(lead.createdAt)
                if (d < new Date(dateFrom)) return false
            }
            if (dateTo) {
                const d = new Date(lead.createdAt)
                const to = new Date(dateTo)
                to.setHours(23, 59, 59, 999)
                if (d > to) return false
            }

            return true
        })

        filtered.sort((a, b) => {
            let aVal: any = a[sortKey]
            let bVal: any = b[sortKey]
            if (aVal == null) aVal = sortKey === "rating" || sortKey === "reviewCount" ? 0 : ""
            if (bVal == null) bVal = sortKey === "rating" || sortKey === "reviewCount" ? 0 : ""
            if (typeof aVal === "string") aVal = aVal.toLowerCase()
            if (typeof bVal === "string") bVal = bVal.toLowerCase()
            if (aVal < bVal) return sortDir === "asc" ? -1 : 1
            if (aVal > bVal) return sortDir === "asc" ? 1 : -1
            return 0
        })

        return filtered
    }, [leads, search, statusFilter, hasEmailFilter, hasPhoneFilter, hasContactFilter, hasSocialFilter, nicheFilter, cityFilter, minRating, maxRating, minReviews, maxReviews, dateFrom, dateTo, sortKey, sortDir])

    // Pagination
    const totalPages = Math.max(1, Math.ceil(processedLeads.length / perPage))
    const pagedLeads = processedLeads.slice(page * perPage, (page + 1) * perPage)

    useMemo(() => { setPage(0) }, [search, statusFilter, hasEmailFilter, hasPhoneFilter, hasContactFilter, hasSocialFilter, nicheFilter, cityFilter, minRating, maxRating, minReviews, maxReviews, dateFrom, dateTo, perPage])

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === "asc" ? "desc" : "asc")
        } else {
            setSortKey(key)
            setSortDir("desc")
        }
    }

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-zinc-600 ml-1" />
        return sortDir === "asc"
            ? <ChevronUp className="w-3 h-3 text-emerald-400 ml-1" />
            : <ChevronDown className="w-3 h-3 text-emerald-400 ml-1" />
    }

    // Delete lead
    const handleDelete = useCallback(async (id: number) => {
        setDeleting(id)
        try {
            const res = await fetch("/api/leads/delete", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            })
            if (res.ok) {
                setLeads(prev => prev.filter(l => l.id !== id))
                if (expandedId === id) setExpandedId(null)
            }
        } catch (e) {
            console.error("Delete failed:", e)
        } finally {
            setDeleting(null)
        }
    }, [expandedId])

    // Export
    const handleExport = useCallback(() => {
        const separator = exportFormat === "csv" ? "," : "\t"
        const ext = exportFormat === "csv" ? "csv" : "tsv"

        const selectedCols = EXPORT_COLUMNS.filter(c => exportColumns[c.key])
        const headers = selectedCols.map(c => c.label)

        let dataToExport: Lead[]
        if (exportScope === "all") {
            dataToExport = leads
        } else if (exportScope === "page") {
            dataToExport = pagedLeads
        } else {
            dataToExport = processedLeads
        }

        const rows = dataToExport.map(l => {
            return selectedCols.map(c => {
                let val = (l as any)[c.key]
                if (val == null) val = ""
                if (c.key === "createdAt" && val) {
                    val = formatAppDate(val, undefined, "")
                }
                val = String(val).replace(/"/g, '""')
                return `"${val}"`
            })
        })

        const content = [headers.join(separator), ...rows.map(r => r.join(separator))].join("\n")
        const mimeType = exportFormat === "csv" ? "text/csv" : "text/tab-separated-values"
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url

        // Build descriptive filename
        const parts = ["omniscient_v4_leads"]
        if (exportScope === "filtered" && activeFilterCount > 0) {
            if (statusFilter === "MISSING") parts.push("no_website")
            else if (statusFilter === "ACTIVE") parts.push("has_website")
            if (hasEmailFilter === "YES") parts.push("with_email")
            if (hasEmailFilter === "NO") parts.push("no_email")
            if (nicheFilter !== "ALL") parts.push(nicheFilter.toLowerCase().replace(/\s+/g, "_"))
            if (cityFilter !== "ALL") parts.push(cityFilter.toLowerCase())
        }
        parts.push(new Date().toISOString().slice(0, 10))
        a.download = `${parts.join("_")}.${ext}`
        a.click()
        URL.revokeObjectURL(url)
        setShowExport(false)
    }, [exportFormat, exportColumns, exportScope, leads, processedLeads, pagedLeads, activeFilterCount, statusFilter, hasEmailFilter, nicheFilter, cityFilter])

    const toggleExportColumn = (key: string) => {
        setExportColumns(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const selectAllExportCols = () => setExportColumns(Object.fromEntries(EXPORT_COLUMNS.map(c => [c.key, true])))
    const deselectAllExportCols = () => setExportColumns(Object.fromEntries(EXPORT_COLUMNS.map(c => [c.key, false])))

    const handleOutreachSaved = useCallback((updatedLead: Partial<Lead> & { id: number }) => {
        setLeads(prev => prev.map(lead => lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead))
    }, [])

    // Filter pill component
    const FilterPill = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
        <button
            onClick={onClick}
            className={`text-[10px] px-2.5 py-1 rounded-full border transition-all duration-200 ${active
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                }`}
        >
            {label}
        </button>
    )

    // Tri-state filter button
    const TriFilter = ({ label, icon: Icon, value, onChange }: { label: string; icon: any; value: string; onChange: (v: string) => void }) => (
        <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                <Icon className="w-3 h-3" /> {label}
            </Label>
            <div className="flex gap-1">
                {[
                    { key: "ALL", label: "Any", color: "" },
                    { key: "YES", label: "Has", color: "emerald" },
                    { key: "NO", label: "Missing", color: "red" },
                ].map(opt => (
                    <button
                        key={opt.key}
                        onClick={() => onChange(opt.key)}
                        className={`text-[10px] px-2 py-1 rounded border transition-all duration-200 flex-1 ${value === opt.key
                            ? opt.color === "emerald" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                                : opt.color === "red" ? "bg-red-500/20 border-red-500/40 text-red-300"
                                    : "bg-white/5 border-white/20 text-white"
                            : "border-white/8 text-zinc-600 hover:border-white/15 hover:text-zinc-400"
                            }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    )

    return (
        <div className="space-y-4">
            {/* Top Bar: Search + Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                    <Input
                        placeholder="Search anything — business, niche, city, email, notes..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 bg-black/30 border-white/10 focus:border-emerald-500/50 transition-all"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowFilters(!showFilters)}
                        className={`text-xs gap-1.5 transition-all ${showFilters || activeFilterCount > 0
                            ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                            : "border-white/10 text-zinc-500 hover:text-white"
                            }`}
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Filters
                        {activeFilterCount > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 text-[9px] font-bold">
                                {activeFilterCount}
                            </span>
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowExport(!showExport)}
                        className={`text-xs gap-1.5 transition-all ${showExport
                            ? "border-cyan-500/40 text-cyan-400 bg-cyan-500/10"
                            : "border-white/10 text-zinc-500 hover:text-white"
                            }`}
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Quick Status Filter Pills */}
            <div className="flex flex-wrap gap-2">
                {[
                    { key: "ALL", label: `All (${leads.length})`, color: "emerald" },
                    { key: "MISSING", label: `No Website (${leads.filter(l => l.websiteStatus === "MISSING").length})`, color: "red" },
                    { key: "ACTIVE", label: `Has Website (${leads.filter(l => l.websiteStatus === "ACTIVE").length})`, color: "blue" },
                ].map(f => (
                    <Button
                        key={f.key}
                        variant={statusFilter === f.key ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStatusFilter(f.key)}
                        className={`text-[11px] h-7 transition-all duration-200 ${statusFilter === f.key
                            ? f.color === "emerald" ? "bg-emerald-600/80 text-white border-emerald-500"
                                : f.color === "red" ? "bg-red-600/80 text-white border-red-500"
                                    : "bg-blue-600/80 text-white border-blue-500"
                            : "border-white/10 text-zinc-500 hover:text-white hover:border-white/20"
                            }`}
                    >
                        {f.label}
                    </Button>
                ))}
                {activeFilterCount > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllFilters}
                        className="text-[11px] h-7 text-zinc-500 hover:text-red-400 gap-1"
                    >
                        <X className="w-3 h-3" /> Clear all filters
                    </Button>
                )}
            </div>

            {/* Advanced Filter Panel */}
            {showFilters && (
                <div className="glass-strong rounded-lg p-5 space-y-5">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-xs font-bold text-white flex items-center gap-2">
                            <Filter className="w-4 h-4 text-emerald-400" />
                            Advanced Filters
                        </h3>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAllFilters}
                            className="text-[10px] text-zinc-500 hover:text-red-400 h-6 gap-1"
                        >
                            <X className="w-3 h-3" /> Reset
                        </Button>
                    </div>

                    {/* Row 1: Data Availability Filters */}
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-3 font-semibold">Data Availability</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <TriFilter label="Email" icon={AtSign} value={hasEmailFilter} onChange={setHasEmailFilter} />
                            <TriFilter label="Phone" icon={Phone} value={hasPhoneFilter} onChange={setHasPhoneFilter} />
                            <TriFilter label="Contact Name" icon={User} value={hasContactFilter} onChange={setHasContactFilter} />
                            <TriFilter label="Social Link" icon={Share2} value={hasSocialFilter} onChange={setHasSocialFilter} />
                        </div>
                    </div>

                    {/* Row 2: Category Filters */}
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-3 font-semibold">Categories</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                                    <Tag className="w-3 h-3" /> Niche
                                </Label>
                                <select
                                    value={nicheFilter}
                                    onChange={(e) => setNicheFilter(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white focus:border-emerald-500/50 outline-none transition-all appearance-none cursor-pointer"
                                >
                                    <option value="ALL">All Niches ({uniqueNiches.length})</option>
                                    {uniqueNiches.map(n => (
                                        <option key={n} value={n}>{n} ({leads.filter(l => l.niche === n).length})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> City
                                </Label>
                                <select
                                    value={cityFilter}
                                    onChange={(e) => setCityFilter(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white focus:border-emerald-500/50 outline-none transition-all appearance-none cursor-pointer"
                                >
                                    <option value="ALL">All Cities ({uniqueCities.length})</option>
                                    {uniqueCities.map(c => (
                                        <option key={c} value={c}>{c} ({leads.filter(l => l.city === c).length})</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Row 3: Range Filters */}
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-3 font-semibold">Ranges</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                                    <Star className="w-3 h-3" /> Min Rating
                                </Label>
                                <Input
                                    type="number" step="0.1" min="0" max="5" placeholder="e.g. 4.0"
                                    value={minRating} onChange={e => setMinRating(e.target.value)}
                                    className="bg-black/40 border-white/10 text-xs h-8 focus:border-emerald-500/50"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                                    <Star className="w-3 h-3" /> Max Rating
                                </Label>
                                <Input
                                    type="number" step="0.1" min="0" max="5" placeholder="e.g. 5.0"
                                    value={maxRating} onChange={e => setMaxRating(e.target.value)}
                                    className="bg-black/40 border-white/10 text-xs h-8 focus:border-emerald-500/50"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                                    <MessageSquare className="w-3 h-3" /> Min Reviews
                                </Label>
                                <Input
                                    type="number" min="0" placeholder="e.g. 10"
                                    value={minReviews} onChange={e => setMinReviews(e.target.value)}
                                    className="bg-black/40 border-white/10 text-xs h-8 focus:border-emerald-500/50"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                                    <MessageSquare className="w-3 h-3" /> Max Reviews
                                </Label>
                                <Input
                                    type="number" min="0" placeholder="e.g. 100"
                                    value={maxReviews} onChange={e => setMaxReviews(e.target.value)}
                                    className="bg-black/40 border-white/10 text-xs h-8 focus:border-emerald-500/50"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Row 4: Date Range */}
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-3 font-semibold">Date Range</div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> From
                                </Label>
                                <Input
                                    type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                    className="bg-black/40 border-white/10 text-xs h-8 focus:border-emerald-500/50"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> To
                                </Label>
                                <Input
                                    type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                    className="bg-black/40 border-white/10 text-xs h-8 focus:border-emerald-500/50"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Filter Summary */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                        <span className="text-[10px] text-muted-foreground">
                            {processedLeads.length} lead{processedLeads.length !== 1 ? "s" : ""} matching your filters
                        </span>
                        {activeFilterCount > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-emerald-400 font-mono">{activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Export Panel */}
            {showExport && (
                <div className="glass-strong rounded-lg p-5 space-y-5">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-xs font-bold text-white flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                            Export Settings
                        </h3>
                        <button onClick={() => setShowExport(false)} className="text-zinc-600 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Export Scope */}
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-3 font-semibold">Data Scope</div>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { key: "filtered" as const, label: "Filtered Results", count: processedLeads.length, desc: "Export what matches your current filters" },
                                { key: "page" as const, label: "Current Page", count: pagedLeads.length, desc: "Export only leads visible on this page" },
                                { key: "all" as const, label: "All Leads", count: leads.length, desc: "Export your entire database" },
                            ].map(s => (
                                <button
                                    key={s.key}
                                    onClick={() => setExportScope(s.key)}
                                    className={`p-3 rounded-lg border text-left transition-all duration-200 ${exportScope === s.key
                                        ? "bg-cyan-500/10 border-cyan-500/30"
                                        : "border-white/8 hover:border-white/15"
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`text-xs font-semibold ${exportScope === s.key ? "text-cyan-300" : "text-zinc-400"}`}>{s.label}</span>
                                        <span className={`text-xs font-mono ${exportScope === s.key ? "text-cyan-400" : "text-zinc-600"}`}>{s.count}</span>
                                    </div>
                                    <p className="text-[9px] text-zinc-600">{s.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Columns Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-semibold">Columns to Include</div>
                            <div className="flex gap-2">
                                <button onClick={selectAllExportCols} className="text-[9px] text-emerald-500 hover:text-emerald-300 transition-colors">Select All</button>
                                <span className="text-zinc-700">|</span>
                                <button onClick={deselectAllExportCols} className="text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors">Deselect All</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                            {EXPORT_COLUMNS.map(col => (
                                <button
                                    key={col.key}
                                    onClick={() => toggleExportColumn(col.key)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[10px] transition-all duration-200 ${exportColumns[col.key]
                                        ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                                        : "border-white/8 text-zinc-600 hover:border-white/15"
                                        }`}
                                >
                                    {exportColumns[col.key]
                                        ? <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                                        : <XCircle className="w-3 h-3 text-zinc-700" />
                                    }
                                    {col.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Format & Download */}
                    <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Format:</span>
                            {(["csv", "tsv"] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setExportFormat(f)}
                                    className={`text-[10px] px-3 py-1 rounded-md border uppercase font-bold tracking-wider transition-all ${exportFormat === f
                                        ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                                        : "border-white/10 text-zinc-600 hover:text-white"
                                        }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] text-zinc-600">
                                {Object.values(exportColumns).filter(Boolean).length} columns × {
                                    exportScope === "all" ? leads.length :
                                        exportScope === "page" ? pagedLeads.length :
                                            processedLeads.length
                                } rows
                            </span>
                            <Button
                                onClick={handleExport}
                                size="sm"
                                disabled={Object.values(exportColumns).filter(Boolean).length === 0}
                                className="bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white text-xs font-bold gap-1.5 shadow-lg shadow-cyan-500/20 transition-all"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Download {exportFormat.toUpperCase()}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Active Filters Tags */}
            {activeFilterCount > 0 && !showFilters && (
                <div className="flex flex-wrap gap-1.5">
                    {statusFilter !== "ALL" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Status: {statusFilter === "MISSING" ? "No Website" : "Has Website"}
                            <button onClick={() => setStatusFilter("ALL")}><X className="w-2.5 h-2.5" /></button>
                        </span>
                    )}
                    {hasEmailFilter !== "ALL" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            Email: {hasEmailFilter === "YES" ? "Has" : "Missing"}
                            <button onClick={() => setHasEmailFilter("ALL")}><X className="w-2.5 h-2.5" /></button>
                        </span>
                    )}
                    {hasPhoneFilter !== "ALL" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Phone: {hasPhoneFilter === "YES" ? "Has" : "Missing"}
                            <button onClick={() => setHasPhoneFilter("ALL")}><X className="w-2.5 h-2.5" /></button>
                        </span>
                    )}
                    {hasContactFilter !== "ALL" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            Contact: {hasContactFilter === "YES" ? "Has" : "Missing"}
                            <button onClick={() => setHasContactFilter("ALL")}><X className="w-2.5 h-2.5" /></button>
                        </span>
                    )}
                    {hasSocialFilter !== "ALL" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Social: {hasSocialFilter === "YES" ? "Has" : "Missing"}
                            <button onClick={() => setHasSocialFilter("ALL")}><X className="w-2.5 h-2.5" /></button>
                        </span>
                    )}
                    {nicheFilter !== "ALL" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Niche: {nicheFilter}
                            <button onClick={() => setNicheFilter("ALL")}><X className="w-2.5 h-2.5" /></button>
                        </span>
                    )}
                    {cityFilter !== "ALL" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            City: {cityFilter}
                            <button onClick={() => setCityFilter("ALL")}><X className="w-2.5 h-2.5" /></button>
                        </span>
                    )}
                    {(minRating || maxRating) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Rating: {minRating || "0"}–{maxRating || "5"}
                            <button onClick={() => { setMinRating(""); setMaxRating("") }}><X className="w-2.5 h-2.5" /></button>
                        </span>
                    )}
                    {(minReviews || maxReviews) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Reviews: {minReviews || "0"}–{maxReviews || "∞"}
                            <button onClick={() => { setMinReviews(""); setMaxReviews("") }}><X className="w-2.5 h-2.5" /></button>
                        </span>
                    )}
                    {(dateFrom || dateTo) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                            Date: {dateFrom || "start"}–{dateTo || "now"}
                            <button onClick={() => { setDateFrom(""); setDateTo("") }}><X className="w-2.5 h-2.5" /></button>
                        </span>
                    )}
                </div>
            )}

            {/* Mobile Cards */}
            <div className="space-y-3 md:hidden">
                {pagedLeads.length === 0 ? (
                    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-4 py-12 text-center">
                        <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-zinc-600">
                            <Globe className="h-10 w-10" />
                            <div>
                                <p className="text-sm text-zinc-500">No leads found</p>
                                <p className="mt-1 text-[10px] text-zinc-700">
                                    {activeFilterCount > 0 ? "Try adjusting your filters" : "Run an extraction to populate your vault"}
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    pagedLeads.map((lead) => (
                        <div
                            key={lead.id}
                            className="rounded-xl border border-white/[0.06] bg-black/20 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1">
                                    <div className="text-sm font-semibold text-white">{lead.businessName}</div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                                        <span>{lead.city}</span>
                                        <span>•</span>
                                        <span className="font-mono text-purple-400/80">{lead.niche}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                                        {lead.rating != null && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-400">
                                                <Star className="h-3 w-3" />
                                                {lead.rating}
                                            </span>
                                        )}
                                        <span className="font-mono">{lead.reviewCount || 0} reviews</span>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-1">
                                    {isContactedOutreachStatus(lead.outreachStatus) && (
                                        <OutreachStatusBadge status={lead.outreachStatus} />
                                    )}
                                    {lead.websiteStatus === "MISSING" ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                            No Site
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                            Has Site
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="mt-3 space-y-1 text-xs">
                                {lead.contactName ? <div className="text-amber-300">{lead.contactName}</div> : null}
                                {lead.phone ? <div className="break-all font-mono text-zinc-300">{lead.phone}</div> : null}
                                {lead.email ? <div className="break-all font-mono text-cyan-300">{lead.email}</div> : null}
                                {lead.socialLink ? <div className="break-all text-blue-300">{lead.socialLink}</div> : null}
                                {!lead.contactName && !lead.phone && !lead.email && !lead.socialLink ? (
                                    <div className="italic text-zinc-600">No contact info</div>
                                ) : null}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <OutreachEditorSheet
                                    lead={lead}
                                    onSaved={handleOutreachSaved}
                                    buttonLabel="Outreach"
                                    buttonVariant="ghost"
                                    buttonSize="sm"
                                    buttonClassName="w-full justify-center border border-cyan-500/20 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/10"
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-center border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
                                    onClick={() => router.push(`/lead/${lead.id}`)}
                                >
                                    <FileText className="h-3.5 w-3.5" />
                                    Dossier
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-center border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white"
                                    onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                                >
                                    {expandedId === lead.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    {expandedId === lead.id ? "Less" : "Details"}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-center border border-red-500/20 text-red-400 hover:bg-red-500/10"
                                    onClick={() => void handleDelete(lead.id)}
                                    disabled={deleting === lead.id}
                                >
                                    <Trash2 className={`h-3.5 w-3.5 ${deleting === lead.id ? "animate-pulse" : ""}`} />
                                    Delete
                                </Button>
                            </div>

                            {expandedId === lead.id && (
                                <div className="mt-4 space-y-3">
                                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                                        <h4 className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Contact Details</h4>
                                        <div className="space-y-2 text-xs">
                                            {lead.contactName && (
                                                <div className="flex items-center gap-2">
                                                    <User className="h-3 w-3 text-amber-400" />
                                                    <span className="text-amber-400 font-medium">{lead.contactName}</span>
                                                </div>
                                            )}
                                            {lead.phone && (
                                                <div className="flex items-center gap-2">
                                                    <Phone className="h-3 w-3 text-zinc-500" />
                                                    <span className="font-mono text-zinc-300">{lead.phone}</span>
                                                </div>
                                            )}
                                            {lead.email && (
                                                <div className="flex items-center gap-2">
                                                    <Mail className="h-3 w-3 text-cyan-400" />
                                                    <span className="break-all text-cyan-400">{lead.email}</span>
                                                </div>
                                            )}
                                            {lead.socialLink && (
                                                <a href={lead.socialLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-400">
                                                    <ExternalLink className="h-3 w-3" />
                                                    <span className="break-all">{lead.socialLink.replace(/https?:\/\//, "")}</span>
                                                </a>
                                            )}
                                            {!lead.contactName && !lead.phone && !lead.email && !lead.socialLink && (
                                                <p className="italic text-zinc-600">No contact details found.</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                                        <h4 className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Location</h4>
                                        <div className="space-y-2 text-xs">
                                            <div className="flex items-center gap-2">
                                                <MapPin className="h-3 w-3 text-emerald-400" />
                                                <span className="text-zinc-300">{lead.city}</span>
                                            </div>
                                            {lead.address && <p className="pl-5 text-zinc-500">{lead.address}</p>}
                                            {lead.category && (
                                                <div>
                                                    <span className="inline-block rounded border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-400">
                                                        {lead.category}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="text-[10px] text-zinc-600">
                                                Added: {formatAppDate(lead.createdAt)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                                        <h4 className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">AI Intelligence</h4>
                                        <p className="text-xs leading-relaxed text-zinc-300" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                                            {lead.tacticalNote || "No intelligence generated."}
                                        </p>
                                    </div>

                                    {isContactedOutreachStatus(lead.outreachStatus) && (
                                        <div className="rounded-lg border border-cyan-500/10 bg-cyan-500/5 p-3">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <span className="text-[10px] uppercase tracking-widest text-cyan-300/70">Outreach</span>
                                                <OutreachStatusBadge status={lead.outreachStatus} />
                                            </div>
                                            <div className="space-y-2 text-[11px] text-zinc-400">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>Channel</span>
                                                    <span className="text-zinc-200">{getOutreachChannelLabel(lead.outreachChannel)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>First Contact</span>
                                                    <span className="text-zinc-200">{formatOutreachDate(lead.firstContactedAt, true)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>Last Contact</span>
                                                    <span className="text-zinc-200">{formatOutreachDate(lead.lastContactedAt, true)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>Follow-Up Due</span>
                                                    <span className="text-zinc-200">{formatOutreachDate(lead.nextFollowUpDue)}</span>
                                                </div>
                                            </div>
                                            {lead.outreachNotes && (
                                                <p className="mt-3 text-[11px] leading-relaxed text-zinc-300" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                                                    {lead.outreachNotes}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Desktop Table */}
            <div className="hidden rounded-lg border border-white/[0.06] bg-black/20 md:block">
                <Table>
                    <TableHeader className="bg-black/40">
                        <TableRow className="hover:bg-transparent border-white/[0.06]">
                            <TableHead
                                className="font-bold text-zinc-400 text-xs cursor-pointer select-none hover:text-white transition-colors"
                                onClick={() => handleSort("businessName")}
                            >
                                <span className="flex items-center">Business <SortIcon col="businessName" /></span>
                            </TableHead>
                            <TableHead
                                className="hidden font-bold text-zinc-400 text-xs cursor-pointer select-none hover:text-white transition-colors md:table-cell"
                                onClick={() => handleSort("niche")}
                            >
                                <span className="flex items-center">Niche <SortIcon col="niche" /></span>
                            </TableHead>
                            <TableHead
                                className="hidden font-bold text-zinc-400 text-xs cursor-pointer select-none hover:text-white transition-colors md:table-cell"
                                onClick={() => handleSort("city")}
                            >
                                <span className="flex items-center">City <SortIcon col="city" /></span>
                            </TableHead>
                            <TableHead className="font-bold text-zinc-400 text-xs">Contact</TableHead>
                            <TableHead
                                className="hidden font-bold text-zinc-400 text-xs cursor-pointer select-none hover:text-white transition-colors md:table-cell"
                                onClick={() => handleSort("rating")}
                            >
                                <span className="flex items-center">Rating <SortIcon col="rating" /></span>
                            </TableHead>
                            <TableHead
                                className="hidden font-bold text-zinc-400 text-xs cursor-pointer select-none hover:text-white transition-colors md:table-cell"
                                onClick={() => handleSort("reviewCount")}
                            >
                                <span className="flex items-center">Reviews <SortIcon col="reviewCount" /></span>
                            </TableHead>
                            <TableHead className="font-bold text-zinc-400 text-xs">Status</TableHead>
                            <TableHead className="font-bold text-zinc-400 text-xs w-10"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pagedLeads.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center h-40">
                                    <div className="flex flex-col items-center gap-3 text-zinc-600">
                                        <Globe className="w-10 h-10" />
                                        <div>
                                            <p className="text-sm text-zinc-500">No leads found</p>
                                            <p className="text-[10px] text-zinc-700 mt-1">
                                                {activeFilterCount > 0 ? "Try adjusting your filters" : "Run an extraction to populate your vault"}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            pagedLeads.map((lead) => (
                                <React.Fragment key={lead.id}>
                                    <TableRow
                                        className={`border-white/[0.04] cursor-pointer transition-all duration-200 group ${expandedId === lead.id ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
                                            }`}
                                        onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                                    >
                                        <TableCell className="font-medium text-white">
                                            <div className="min-w-0 space-y-1">
                                                {(() => {
                                                    const websiteUrl = resolveLeadWebsiteUrl(lead);
                                                    const leadName = lead.businessName;
                                                    return websiteUrl ? (
                                                        <a
                                                            href={websiteUrl}
                                                            target="_blank"
                                                            rel="noreferrer noopener"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="inline-flex max-w-full items-center gap-1 text-sm text-white transition-colors hover:text-cyan-300"
                                                            title={websiteUrl}
                                                        >
                                                            <span className="truncate">{leadName}</span>
                                                            <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                                                        </a>
                                                    ) : (
                                                        <span className="block text-sm">{leadName}</span>
                                                    );
                                                })()}
                                                <span className="block text-[11px] text-zinc-500 md:hidden">
                                                    {lead.city} • {lead.niche}
                                                </span>
                                                {isContactedOutreachStatus(lead.outreachStatus) && (
                                                    <OutreachStatusBadge status={lead.outreachStatus} />
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            <span className="text-[10px] text-purple-400/80 font-mono">{lead.niche}</span>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            <span className="text-sm text-zinc-400">{lead.city}</span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {lead.email && <Mail className="w-3 h-3 text-cyan-500" />}
                                                {lead.phone && <Phone className="w-3 h-3 text-zinc-500" />}
                                                {lead.contactName && <User className="w-3 h-3 text-amber-500" />}
                                                {lead.socialLink && <Share2 className="w-3 h-3 text-blue-500" />}
                                                {!lead.email && !lead.phone && !lead.contactName && !lead.socialLink && (
                                                    <span className="text-[10px] text-zinc-700">None</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            <div className="flex items-center gap-1">
                                                <span className="text-amber-400">★</span>
                                                <span className="font-bold text-sm">{lead.rating || "—"}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            <span className="text-sm font-mono text-zinc-400">{lead.reviewCount || 0}</span>
                                        </TableCell>
                                        <TableCell>
                                            {lead.websiteStatus === "MISSING" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                    No Site
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                    Has Site
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <ChevronDown className={`w-4 h-4 text-zinc-600 transition-transform duration-200 ${expandedId === lead.id ? "rotate-180" : ""}`} />
                                                <OutreachEditorSheet
                                                    lead={lead}
                                                    onSaved={handleOutreachSaved}
                                                    buttonLabel="Outreach"
                                                    buttonVariant="ghost"
                                                    buttonSize="sm"
                                                    buttonClassName="h-7 px-2 text-zinc-700 hover:bg-cyan-500/10 hover:text-cyan-300"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-7 h-7 p-0 text-zinc-700 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                                                    onClick={(e) => { e.stopPropagation(); router.push(`/lead/${lead.id}`) }}
                                                    title="Open Dossier"
                                                >
                                                    <FileText className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-7 h-7 p-0 text-zinc-700 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(lead.id) }}
                                                    disabled={deleting === lead.id}
                                                >
                                                    <Trash2 className={`w-3.5 h-3.5 ${deleting === lead.id ? "animate-pulse" : ""}`} />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    {/* Expanded Detail Row */}
                                    {expandedId === lead.id && (
                                        <TableRow key={`${lead.id}-expanded`} className="bg-white/[0.02] border-white/[0.04]">
                                            <TableCell
                                                colSpan={8}
                                                className="whitespace-normal break-words px-6 py-4 align-top"
                                            >
                                                <div className="grid min-w-0 grid-cols-1 gap-4 animate-slide-up items-start md:grid-cols-3">
                                                    <div className="glass rounded-lg p-4 space-y-2 min-w-0">
                                                        <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Contact Details</h4>
                                                        {lead.contactName && (
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <User className="w-3 h-3 text-amber-400" />
                                                                <span className="text-amber-400 font-medium">{lead.contactName}</span>
                                                            </div>
                                                        )}
                                                        {lead.phone && (
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <Phone className="w-3 h-3 text-zinc-500" />
                                                                <span className="text-zinc-300 font-mono">{lead.phone}</span>
                                                            </div>
                                                        )}
                                                        {lead.email && (
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <Mail className="w-3 h-3 text-cyan-400" />
                                                                <span className="text-cyan-400 break-all">{lead.email}</span>
                                                            </div>
                                                        )}
                                                        {lead.socialLink && (
                                                            <a href={lead.socialLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                                                                <ExternalLink className="w-3 h-3" />
                                                                <span className="truncate">{lead.socialLink.replace(/https?:\/\//, "").substring(0, 35)}...</span>
                                                            </a>
                                                        )}
                                                        {!lead.contactName && !lead.phone && !lead.email && !lead.socialLink && (
                                                            <p className="text-xs text-zinc-600 italic">No contact details found.</p>
                                                        )}
                                                    </div>
                                                    <div className="glass rounded-lg p-4 space-y-2 min-w-0">
                                                        <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Location</h4>
                                                        <div className="flex items-center gap-2 text-xs">
                                                            <MapPin className="w-3 h-3 text-emerald-400" />
                                                            <span className="text-zinc-300">{lead.city}</span>
                                                        </div>
                                                        {lead.address && (
                                                            <p className="text-xs text-zinc-500 pl-5">{lead.address}</p>
                                                        )}
                                                        {lead.category && (
                                                            <div className="mt-2">
                                                                <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                                    {lead.category}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="mt-2 text-[10px] text-zinc-600">
                                                            Added: {formatAppDate(lead.createdAt)}
                                                        </div>
                                                    </div>
                                                    <div className="glass rounded-lg p-4 space-y-2 min-w-0">
                                                        <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">AI Intelligence</h4>
                                                        <p
                                                            className="min-w-0 max-w-full text-xs leading-relaxed text-zinc-300"
                                                            style={{
                                                                whiteSpace: "pre-wrap",
                                                                overflowWrap: "anywhere",
                                                                wordBreak: "break-word",
                                                            }}
                                                        >
                                                            {lead.tacticalNote || "No intelligence generated."}
                                                        </p>
                                                        {isContactedOutreachStatus(lead.outreachStatus) && (
                                                            <div className="mt-3 rounded-lg border border-cyan-500/10 bg-cyan-500/5 p-3 space-y-2">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-[10px] uppercase tracking-widest text-cyan-300/70">Outreach</span>
                                                                    <OutreachStatusBadge status={lead.outreachStatus} />
                                                                </div>
                                                                <div className="grid grid-cols-1 gap-2 text-[11px] text-zinc-400">
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span>Channel</span>
                                                                        <span className="text-zinc-200">{getOutreachChannelLabel(lead.outreachChannel)}</span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span>First Contact</span>
                                                                        <span className="text-zinc-200">{formatOutreachDate(lead.firstContactedAt, true)}</span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span>Last Contact</span>
                                                                        <span className="text-zinc-200">{formatOutreachDate(lead.lastContactedAt, true)}</span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span>Follow-Up Due</span>
                                                                        <span className="text-zinc-200">{formatOutreachDate(lead.nextFollowUpDue)}</span>
                                                                    </div>
                                                                </div>
                                                                {lead.outreachNotes && (
                                                                    <p
                                                                        className="text-[11px] leading-relaxed text-zinc-300"
                                                                        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                                                                    >
                                                                        {lead.outreachNotes}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Show</span>
                    {PAGE_OPTIONS.map(opt => (
                        <Button
                            key={opt}
                            variant={perPage === opt ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPerPage(opt)}
                            className={`text-[10px] h-7 px-2.5 transition-all ${perPage === opt
                                ? "bg-emerald-600/60 text-white"
                                : "border-white/10 text-zinc-500 hover:text-white"
                                }`}
                        >
                            {opt}
                        </Button>
                    ))}
                    <span className="text-xs text-muted-foreground ml-2">
                            {processedLeads.length} of {leads.length} total
                    </span>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(0)}
                        disabled={page === 0}
                        className="h-7 px-2 text-[10px] border-white/10 text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                        First
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="h-7 w-7 p-0 border-white/10 text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-xs font-mono text-zinc-400 min-w-[60px] text-center">
                        {page + 1} / {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="h-7 w-7 p-0 border-white/10 text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(totalPages - 1)}
                        disabled={page >= totalPages - 1}
                        className="h-7 px-2 text-[10px] border-white/10 text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                        Last
                    </Button>
                </div>
            </div>
        </div>
    )
}
