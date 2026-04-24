"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowUpDown,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Circle,
    CopyCheck,
    Download,
    ExternalLink,
    FileSpreadsheet,
    FileText,
    Filter,
    Globe,
    Mail,
    Phone,
    Search,
    Share2,
    SlidersHorizontal,
    Star,
    Trash2,
    User,
    X,
    XCircle,
} from "lucide-react";

import { OutreachEditorSheet } from "@/components/outreach/outreach-editor-sheet";
import { OutreachStatusBadge } from "@/components/outreach/outreach-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatOutreachDate, getOutreachChannelLabel, isContactedOutreachStatus } from "@/lib/outreach";
import { formatAppDate } from "@/lib/time";

type Lead = {
    id: number;
    businessName: string;
    niche: string;
    city: string;
    category: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    socialLink: string | null;
    rating: number | null;
    reviewCount: number | null;
    websiteStatus: string | null;
    contactName: string | null;
    tacticalNote: string | null;
    outreachStatus: string | null;
    outreachChannel: string | null;
    firstContactedAt: string | Date | null;
    lastContactedAt: string | Date | null;
    nextFollowUpDue: string | Date | null;
    outreachNotes: string | null;
    createdAt: string;
};

type SortKey = "businessName" | "city" | "rating" | "reviewCount" | "createdAt" | "niche";
type SortDir = "asc" | "desc";
type ContactFilter = "ALL" | "YES" | "NO";
type ExportScope = "filtered" | "all" | "page";
type ExportFormat = "csv" | "tsv";

const PAGE_OPTIONS = [10, 25, 50, 100];

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
] as const;

type ExportColumnKey = typeof EXPORT_COLUMNS[number]["key"];

const defaultExportColumns = () =>
    Object.fromEntries(EXPORT_COLUMNS.map((column) => [column.key, column.default])) as Record<ExportColumnKey, boolean>;

function hasText(value: string | null) {
    return Boolean(value && value.trim());
}

function getWebsiteLabel(status: string | null) {
    return status === "MISSING" ? "No site" : "Verified";
}

function StatusBadge({ status }: { status: string | null }) {
    const missing = status === "MISSING";

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium ${
                missing
                    ? "border-red-500/20 bg-red-500/[0.07] text-red-300"
                    : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
            }`}
        >
            {missing ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            {getWebsiteLabel(status)}
        </span>
    );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return <ArrowUpDown className="ml-1 h-3 w-3 text-zinc-700" />;
    return dir === "asc" ? (
        <ChevronUp className="ml-1 h-3 w-3 text-emerald-400" />
    ) : (
        <ChevronDown className="ml-1 h-3 w-3 text-emerald-400" />
    );
}

function ContactIndicators({ lead }: { lead: Lead }) {
    const contacts = [
        { label: "email", active: hasText(lead.email), icon: Mail, activeClass: "text-cyan-300" },
        { label: "phone", active: hasText(lead.phone), icon: Phone, activeClass: "text-emerald-300" },
        { label: "contact", active: hasText(lead.contactName), icon: User, activeClass: "text-amber-300" },
        { label: "social", active: hasText(lead.socialLink), icon: Share2, activeClass: "text-blue-300" },
    ];

    if (!contacts.some((contact) => contact.active)) {
        return <span className="text-[11px] text-zinc-700">No contact data</span>;
    }

    return (
        <div className="flex items-center gap-1.5" aria-label="Contact coverage">
            {contacts.map(({ label, active, icon: Icon, activeClass }) => (
                <span
                    key={label}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${
                        active ? `border-white/10 bg-white/[0.04] ${activeClass}` : "border-white/[0.04] text-zinc-800"
                    }`}
                    title={active ? `Has ${label}` : `Missing ${label}`}
                >
                    <Icon className="h-3.5 w-3.5" />
                </span>
            ))}
        </div>
    );
}

function FieldValue({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</div>
            <div className={`mt-1 min-w-0 break-words text-xs text-zinc-300 ${mono ? "font-mono" : ""}`}>{value}</div>
        </div>
    );
}

function LeadDetails({ lead }: { lead: Lead }) {
    return (
        <div className="grid min-w-0 grid-cols-1 gap-5 text-xs md:grid-cols-[1fr_1fr_1.35fr]">
            <div className="min-w-0 space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Verification</div>
                <FieldValue label="Contact" value={lead.contactName || "No named contact"} />
                <FieldValue label="Phone" value={lead.phone || "Missing"} mono />
                <FieldValue label="Email" value={lead.email || "Missing"} mono />
                {lead.socialLink ? (
                    <a
                        href={lead.socialLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 text-xs text-blue-300 hover:text-blue-200"
                    >
                        <ExternalLink className="h-3 w-3 flex-none" />
                        <span className="truncate">{lead.socialLink.replace(/https?:\/\//, "")}</span>
                    </a>
                ) : null}
            </div>

            <div className="min-w-0 space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Market</div>
                <FieldValue label="City" value={lead.city || "Unknown"} />
                <FieldValue label="Address" value={lead.address || "No address captured"} />
                <FieldValue label="Category" value={lead.category || "Uncategorized"} />
                <FieldValue label="Added" value={formatAppDate(lead.createdAt)} mono />
            </div>

            <div className="min-w-0 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Notes</div>
                    {isContactedOutreachStatus(lead.outreachStatus) ? <OutreachStatusBadge status={lead.outreachStatus} /> : null}
                </div>
                <p className="min-w-0 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-300">
                    {lead.tacticalNote || "No tactical note generated."}
                </p>
                {isContactedOutreachStatus(lead.outreachStatus) ? (
                    <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3 text-[11px] text-zinc-500">
                        <FieldValue label="Channel" value={getOutreachChannelLabel(lead.outreachChannel)} />
                        <FieldValue label="First" value={formatOutreachDate(lead.firstContactedAt, true)} />
                        <FieldValue label="Last" value={formatOutreachDate(lead.lastContactedAt, true)} />
                        <FieldValue label="Due" value={formatOutreachDate(lead.nextFollowUpDue)} />
                        {lead.outreachNotes ? (
                            <div className="col-span-2">
                                <FieldValue label="Outreach note" value={lead.outreachNotes} />
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function TriFilter({
    label,
    value,
    onChange,
}: {
    label: string;
    value: ContactFilter;
    onChange: (value: ContactFilter) => void;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</Label>
            <div className="grid grid-cols-3 rounded-lg border border-white/[0.07] bg-black/20 p-0.5">
                {[
                    { key: "ALL" as const, label: "Any" },
                    { key: "YES" as const, label: "Has" },
                    { key: "NO" as const, label: "Missing" },
                ].map((option) => (
                    <button
                        key={option.key}
                        type="button"
                        onClick={() => onChange(option.key)}
                        className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                            value === option.key ? "bg-white/[0.08] text-white" : "text-zinc-600 hover:text-zinc-300"
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ActiveFilter({
    label,
    onClear,
}: {
    label: string;
    onClear: () => void;
}) {
    return (
        <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-400">
            {label}
            <button type="button" onClick={onClear} className="text-zinc-600 hover:text-white" aria-label={`Clear ${label}`}>
                <X className="h-3 w-3" />
            </button>
        </span>
    );
}

export default function VaultDataTable({ initialLeads }: { initialLeads: Lead[] }) {
    const router = useRouter();
    const [leads, setLeads] = useState<Lead[]>(initialLeads);
    const [search, setSearch] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [hasEmailFilter, setHasEmailFilter] = useState<ContactFilter>("ALL");
    const [hasPhoneFilter, setHasPhoneFilter] = useState<ContactFilter>("ALL");
    const [hasContactFilter, setHasContactFilter] = useState<ContactFilter>("ALL");
    const [hasSocialFilter, setHasSocialFilter] = useState<ContactFilter>("ALL");
    const [nicheFilter, setNicheFilter] = useState("ALL");
    const [cityFilter, setCityFilter] = useState("ALL");
    const [minRating, setMinRating] = useState("");
    const [maxRating, setMaxRating] = useState("");
    const [minReviews, setMinReviews] = useState("");
    const [maxReviews, setMaxReviews] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("createdAt");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [page, setPage] = useState(0);
    const [perPage, setPerPage] = useState(25);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [showExport, setShowExport] = useState(false);
    const [exportColumns, setExportColumns] = useState<Record<ExportColumnKey, boolean>>(defaultExportColumns);
    const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
    const [exportScope, setExportScope] = useState<ExportScope>("filtered");

    const uniqueNiches = useMemo(() => [...new Set(leads.map((lead) => lead.niche).filter(Boolean))].sort(), [leads]);
    const uniqueCities = useMemo(() => [...new Set(leads.map((lead) => lead.city).filter(Boolean))].sort(), [leads]);

    const statusCounts = useMemo(
        () => ({
            all: leads.length,
            missing: leads.filter((lead) => lead.websiteStatus === "MISSING").length,
            active: leads.filter((lead) => lead.websiteStatus === "ACTIVE").length,
            email: leads.filter((lead) => hasText(lead.email)).length,
            phone: leads.filter((lead) => hasText(lead.phone)).length,
        }),
        [leads],
    );

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (statusFilter !== "ALL") count++;
        if (hasEmailFilter !== "ALL") count++;
        if (hasPhoneFilter !== "ALL") count++;
        if (hasContactFilter !== "ALL") count++;
        if (hasSocialFilter !== "ALL") count++;
        if (nicheFilter !== "ALL") count++;
        if (cityFilter !== "ALL") count++;
        if (minRating) count++;
        if (maxRating) count++;
        if (minReviews) count++;
        if (maxReviews) count++;
        if (dateFrom) count++;
        if (dateTo) count++;
        return count;
    }, [
        statusFilter,
        hasEmailFilter,
        hasPhoneFilter,
        hasContactFilter,
        hasSocialFilter,
        nicheFilter,
        cityFilter,
        minRating,
        maxRating,
        minReviews,
        maxReviews,
        dateFrom,
        dateTo,
    ]);

    const clearAllFilters = useCallback(() => {
        setStatusFilter("ALL");
        setHasEmailFilter("ALL");
        setHasPhoneFilter("ALL");
        setHasContactFilter("ALL");
        setHasSocialFilter("ALL");
        setNicheFilter("ALL");
        setCityFilter("ALL");
        setMinRating("");
        setMaxRating("");
        setMinReviews("");
        setMaxReviews("");
        setDateFrom("");
        setDateTo("");
        setSearch("");
    }, []);

    const processedLeads = useMemo(() => {
        const query = search.trim().toLowerCase();
        const filtered = leads.filter((lead) => {
            if (query) {
                const matchesSearch =
                    (lead.businessName || "").toLowerCase().includes(query) ||
                    (lead.niche || "").toLowerCase().includes(query) ||
                    (lead.city || "").toLowerCase().includes(query) ||
                    (lead.email || "").toLowerCase().includes(query) ||
                    (lead.contactName || "").toLowerCase().includes(query) ||
                    (lead.category || "").toLowerCase().includes(query) ||
                    (lead.address || "").toLowerCase().includes(query) ||
                    (lead.tacticalNote || "").toLowerCase().includes(query) ||
                    (lead.outreachNotes || "").toLowerCase().includes(query) ||
                    (lead.outreachStatus || "").toLowerCase().includes(query);
                if (!matchesSearch) return false;
            }

            if (statusFilter !== "ALL" && lead.websiteStatus !== statusFilter) return false;
            if (hasEmailFilter === "YES" && !hasText(lead.email)) return false;
            if (hasEmailFilter === "NO" && hasText(lead.email)) return false;
            if (hasPhoneFilter === "YES" && !hasText(lead.phone)) return false;
            if (hasPhoneFilter === "NO" && hasText(lead.phone)) return false;
            if (hasContactFilter === "YES" && !hasText(lead.contactName)) return false;
            if (hasContactFilter === "NO" && hasText(lead.contactName)) return false;
            if (hasSocialFilter === "YES" && !hasText(lead.socialLink)) return false;
            if (hasSocialFilter === "NO" && hasText(lead.socialLink)) return false;
            if (nicheFilter !== "ALL" && lead.niche !== nicheFilter) return false;
            if (cityFilter !== "ALL" && lead.city !== cityFilter) return false;
            if (minRating && (lead.rating == null || lead.rating < Number.parseFloat(minRating))) return false;
            if (maxRating && (lead.rating == null || lead.rating > Number.parseFloat(maxRating))) return false;
            if (minReviews && (lead.reviewCount == null || lead.reviewCount < Number.parseInt(minReviews, 10))) return false;
            if (maxReviews && (lead.reviewCount == null || lead.reviewCount > Number.parseInt(maxReviews, 10))) return false;

            if (dateFrom) {
                const leadDate = new Date(lead.createdAt);
                if (leadDate < new Date(dateFrom)) return false;
            }
            if (dateTo) {
                const leadDate = new Date(lead.createdAt);
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                if (leadDate > to) return false;
            }

            return true;
        });

        filtered.sort((a, b) => {
            let aValue = a[sortKey] as string | number | null;
            let bValue = b[sortKey] as string | number | null;
            if (aValue == null) aValue = sortKey === "rating" || sortKey === "reviewCount" ? 0 : "";
            if (bValue == null) bValue = sortKey === "rating" || sortKey === "reviewCount" ? 0 : "";
            if (typeof aValue === "string") aValue = aValue.toLowerCase();
            if (typeof bValue === "string") bValue = bValue.toLowerCase();
            if (aValue < bValue) return sortDir === "asc" ? -1 : 1;
            if (aValue > bValue) return sortDir === "asc" ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [
        leads,
        search,
        statusFilter,
        hasEmailFilter,
        hasPhoneFilter,
        hasContactFilter,
        hasSocialFilter,
        nicheFilter,
        cityFilter,
        minRating,
        maxRating,
        minReviews,
        maxReviews,
        dateFrom,
        dateTo,
        sortKey,
        sortDir,
    ]);

    const totalPages = Math.max(1, Math.ceil(processedLeads.length / perPage));
    const pagedLeads = useMemo(
        () => processedLeads.slice(page * perPage, (page + 1) * perPage),
        [page, perPage, processedLeads],
    );

    useEffect(() => {
        setPage(0);
    }, [
        search,
        statusFilter,
        hasEmailFilter,
        hasPhoneFilter,
        hasContactFilter,
        hasSocialFilter,
        nicheFilter,
        cityFilter,
        minRating,
        maxRating,
        minReviews,
        maxReviews,
        dateFrom,
        dateTo,
        perPage,
    ]);

    useEffect(() => {
        if (page > totalPages - 1) setPage(totalPages - 1);
    }, [page, totalPages]);

    const handleSort = useCallback((key: SortKey) => {
        setSortKey((currentKey) => {
            if (currentKey === key) {
                setSortDir((currentDir) => (currentDir === "asc" ? "desc" : "asc"));
                return currentKey;
            }
            setSortDir("desc");
            return key;
        });
    }, []);

    const handleDelete = useCallback(async (id: number) => {
        setDeleting(id);
        try {
            const res = await fetch("/api/leads/delete", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            if (res.ok) {
                setLeads((prev) => prev.filter((lead) => lead.id !== id));
                setExpandedId((current) => (current === id ? null : current));
            }
        } catch (error) {
            console.error("Delete failed:", error);
        } finally {
            setDeleting(null);
        }
    }, []);

    const handleExport = useCallback(() => {
        const separator = exportFormat === "csv" ? "," : "\t";
        const extension = exportFormat === "csv" ? "csv" : "tsv";
        const selectedColumns = EXPORT_COLUMNS.filter((column) => exportColumns[column.key]);
        const headers = selectedColumns.map((column) => column.label);
        const dataToExport =
            exportScope === "all" ? leads : exportScope === "page" ? pagedLeads : processedLeads;

        const rows = dataToExport.map((lead) =>
            selectedColumns.map((column) => {
                let value = lead[column.key];
                if (value == null) value = "";
                if (column.key === "createdAt" && value) {
                    value = formatAppDate(lead.createdAt, undefined, "");
                }
                return `"${String(value).replace(/"/g, '""')}"`;
            }),
        );

        const content = [headers.join(separator), ...rows.map((row) => row.join(separator))].join("\n");
        const mimeType = exportFormat === "csv" ? "text/csv" : "text/tab-separated-values";
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const filenameParts = ["omniscient_v4_leads"];

        if (exportScope === "filtered" && activeFilterCount > 0) {
            if (statusFilter === "MISSING") filenameParts.push("no_website");
            else if (statusFilter === "ACTIVE") filenameParts.push("has_website");
            if (hasEmailFilter === "YES") filenameParts.push("with_email");
            if (hasEmailFilter === "NO") filenameParts.push("no_email");
            if (nicheFilter !== "ALL") filenameParts.push(nicheFilter.toLowerCase().replace(/\s+/g, "_"));
            if (cityFilter !== "ALL") filenameParts.push(cityFilter.toLowerCase().replace(/\s+/g, "_"));
        }

        filenameParts.push(new Date().toISOString().slice(0, 10));
        anchor.href = url;
        anchor.download = `${filenameParts.join("_")}.${extension}`;
        anchor.click();
        URL.revokeObjectURL(url);
        setShowExport(false);
    }, [
        activeFilterCount,
        cityFilter,
        exportColumns,
        exportFormat,
        exportScope,
        hasEmailFilter,
        leads,
        nicheFilter,
        pagedLeads,
        processedLeads,
        statusFilter,
    ]);

    const handleOutreachSaved = useCallback((updatedLead: Partial<Lead> & { id: number }) => {
        setLeads((prev) => prev.map((lead) => (lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead)));
    }, []);

    const toggleExportColumn = useCallback((key: ExportColumnKey) => {
        setExportColumns((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const selectedExportColumnCount = Object.values(exportColumns).filter(Boolean).length;
    const exportRowCount = exportScope === "all" ? leads.length : exportScope === "page" ? pagedLeads.length : processedLeads.length;

    return (
        <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_auto] lg:items-center">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search business, city, niche, contact, email, notes"
                        className="h-10 border-white/[0.08] bg-black/25 pl-9 pr-9 text-sm focus:border-emerald-500/50"
                    />
                    {search ? (
                        <button
                            type="button"
                            onClick={() => setSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {[
                        { key: "ALL", label: "All", count: statusCounts.all },
                        { key: "MISSING", label: "No site", count: statusCounts.missing },
                        { key: "ACTIVE", label: "Verified", count: statusCounts.active },
                    ].map((status) => (
                        <Button
                            key={status.key}
                            type="button"
                            variant={statusFilter === status.key ? "default" : "outline"}
                            size="sm"
                            onClick={() => setStatusFilter(status.key)}
                            className={`h-8 gap-2 px-3 text-[11px] ${
                                statusFilter === status.key
                                    ? "bg-white text-black hover:bg-zinc-200"
                                    : "border-white/[0.08] text-zinc-500 hover:text-white"
                            }`}
                        >
                            {status.label}
                            <span className="font-mono tabular-nums opacity-70">{status.count}</span>
                        </Button>
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowFilters((value) => !value)}
                        className={`h-8 gap-2 border-white/[0.08] text-[11px] ${
                            showFilters || activeFilterCount > 0 ? "text-emerald-300" : "text-zinc-500 hover:text-white"
                        }`}
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Filters
                        {activeFilterCount > 0 ? <span className="font-mono">{activeFilterCount}</span> : null}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowExport((value) => !value)}
                        className={`h-8 gap-2 border-white/[0.08] text-[11px] ${
                            showExport ? "text-cyan-300" : "text-zinc-500 hover:text-white"
                        }`}
                    >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Export
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                    <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                    {processedLeads.length.toLocaleString()} shown
                </span>
                <span className="text-zinc-700">/</span>
                <span>{leads.length.toLocaleString()} total</span>
                <span className="text-zinc-700">/</span>
                <span>{statusCounts.email.toLocaleString()} with email</span>
                <span className="text-zinc-700">/</span>
                <span>{statusCounts.phone.toLocaleString()} with phone</span>
                {activeFilterCount > 0 ? (
                    <button type="button" onClick={clearAllFilters} className="ml-1 text-red-300/80 hover:text-red-200">
                        Clear filters
                    </button>
                ) : null}
            </div>

            {showFilters ? (
                <div className="border-y border-white/[0.06] bg-white/[0.015] py-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                            <Filter className="h-4 w-4 text-emerald-400" />
                            Verification filters
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearAllFilters}
                            className="h-7 gap-1 text-[11px] text-zinc-500 hover:text-red-300"
                        >
                            <X className="h-3 w-3" />
                            Reset
                        </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(150px,1fr))_repeat(2,minmax(180px,1.2fr))]">
                        <TriFilter label="Email" value={hasEmailFilter} onChange={setHasEmailFilter} />
                        <TriFilter label="Phone" value={hasPhoneFilter} onChange={setHasPhoneFilter} />
                        <TriFilter label="Contact" value={hasContactFilter} onChange={setHasContactFilter} />
                        <TriFilter label="Social" value={hasSocialFilter} onChange={setHasSocialFilter} />
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Niche</Label>
                            <select
                                value={nicheFilter}
                                onChange={(event) => setNicheFilter(event.target.value)}
                                className="h-9 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 text-xs text-white outline-none focus:border-emerald-500/50"
                            >
                                <option value="ALL">All niches ({uniqueNiches.length})</option>
                                {uniqueNiches.map((niche) => (
                                    <option key={niche} value={niche}>
                                        {niche}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">City</Label>
                            <select
                                value={cityFilter}
                                onChange={(event) => setCityFilter(event.target.value)}
                                className="h-9 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 text-xs text-white outline-none focus:border-emerald-500/50"
                            >
                                <option value="ALL">All cities ({uniqueCities.length})</option>
                                {uniqueCities.map((city) => (
                                    <option key={city} value={city}>
                                        {city}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                        {[
                            { label: "Min rating", value: minRating, setter: setMinRating, type: "number", placeholder: "4.0" },
                            { label: "Max rating", value: maxRating, setter: setMaxRating, type: "number", placeholder: "5.0" },
                            { label: "Min reviews", value: minReviews, setter: setMinReviews, type: "number", placeholder: "10" },
                            { label: "Max reviews", value: maxReviews, setter: setMaxReviews, type: "number", placeholder: "100" },
                            { label: "From", value: dateFrom, setter: setDateFrom, type: "date", placeholder: "" },
                            { label: "To", value: dateTo, setter: setDateTo, type: "date", placeholder: "" },
                        ].map((field) => (
                            <div key={field.label} className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{field.label}</Label>
                                <Input
                                    type={field.type}
                                    value={field.value}
                                    onChange={(event) => field.setter(event.target.value)}
                                    placeholder={field.placeholder}
                                    className="h-9 border-white/[0.08] bg-black/30 text-xs focus:border-emerald-500/50"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {showExport ? (
                <div className="border-y border-cyan-500/15 bg-cyan-500/[0.025] py-4">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                            <FileSpreadsheet className="h-4 w-4 text-cyan-300" />
                            Export slice
                        </div>
                        <button type="button" onClick={() => setShowExport(false)} className="self-start text-zinc-600 hover:text-white sm:self-auto">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[360px_1fr_auto]">
                        <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/[0.07] bg-black/20 p-1">
                            {[
                                { key: "filtered" as const, label: "Filtered", count: processedLeads.length },
                                { key: "page" as const, label: "Page", count: pagedLeads.length },
                                { key: "all" as const, label: "All", count: leads.length },
                            ].map((scope) => (
                                <button
                                    key={scope.key}
                                    type="button"
                                    onClick={() => setExportScope(scope.key)}
                                    className={`rounded-md px-2 py-2 text-left transition-colors ${
                                        exportScope === scope.key ? "bg-cyan-500/15 text-cyan-200" : "text-zinc-500 hover:text-white"
                                    }`}
                                >
                                    <div className="text-[11px] font-medium">{scope.label}</div>
                                    <div className="font-mono text-[10px] opacity-70">{scope.count.toLocaleString()} rows</div>
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                            {EXPORT_COLUMNS.map((column) => (
                                <button
                                    key={column.key}
                                    type="button"
                                    onClick={() => toggleExportColumn(column.key)}
                                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[10px] transition-colors ${
                                        exportColumns[column.key]
                                            ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-200"
                                            : "border-white/[0.06] text-zinc-600 hover:text-zinc-300"
                                    }`}
                                >
                                    {exportColumns[column.key] ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                    {column.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            {(["csv", "tsv"] as const).map((format) => (
                                <Button
                                    key={format}
                                    type="button"
                                    variant={exportFormat === format ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setExportFormat(format)}
                                    className={`h-8 px-3 text-[11px] uppercase ${
                                        exportFormat === format ? "bg-cyan-500 text-white hover:bg-cyan-400" : "border-white/[0.08] text-zinc-500"
                                    }`}
                                >
                                    {format}
                                </Button>
                            ))}
                            <Button
                                type="button"
                                onClick={handleExport}
                                size="sm"
                                disabled={selectedExportColumnCount === 0}
                                className="h-8 gap-2 bg-emerald-500 text-black hover:bg-emerald-400"
                            >
                                <Download className="h-3.5 w-3.5" />
                                {exportRowCount.toLocaleString()} rows
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {activeFilterCount > 0 && !showFilters ? (
                <div className="flex flex-wrap gap-1.5">
                    {statusFilter !== "ALL" ? (
                        <ActiveFilter
                            label={`Website: ${statusFilter === "MISSING" ? "No site" : "Verified"}`}
                            onClear={() => setStatusFilter("ALL")}
                        />
                    ) : null}
                    {hasEmailFilter !== "ALL" ? (
                        <ActiveFilter label={`Email: ${hasEmailFilter === "YES" ? "Has" : "Missing"}`} onClear={() => setHasEmailFilter("ALL")} />
                    ) : null}
                    {hasPhoneFilter !== "ALL" ? (
                        <ActiveFilter label={`Phone: ${hasPhoneFilter === "YES" ? "Has" : "Missing"}`} onClear={() => setHasPhoneFilter("ALL")} />
                    ) : null}
                    {hasContactFilter !== "ALL" ? (
                        <ActiveFilter label={`Contact: ${hasContactFilter === "YES" ? "Has" : "Missing"}`} onClear={() => setHasContactFilter("ALL")} />
                    ) : null}
                    {hasSocialFilter !== "ALL" ? (
                        <ActiveFilter label={`Social: ${hasSocialFilter === "YES" ? "Has" : "Missing"}`} onClear={() => setHasSocialFilter("ALL")} />
                    ) : null}
                    {nicheFilter !== "ALL" ? <ActiveFilter label={`Niche: ${nicheFilter}`} onClear={() => setNicheFilter("ALL")} /> : null}
                    {cityFilter !== "ALL" ? <ActiveFilter label={`City: ${cityFilter}`} onClear={() => setCityFilter("ALL")} /> : null}
                    {minRating || maxRating ? (
                        <ActiveFilter label={`Rating: ${minRating || "0"}-${maxRating || "5"}`} onClear={() => { setMinRating(""); setMaxRating(""); }} />
                    ) : null}
                    {minReviews || maxReviews ? (
                        <ActiveFilter label={`Reviews: ${minReviews || "0"}-${maxReviews || "max"}`} onClear={() => { setMinReviews(""); setMaxReviews(""); }} />
                    ) : null}
                    {dateFrom || dateTo ? (
                        <ActiveFilter label={`Date: ${dateFrom || "start"}-${dateTo || "now"}`} onClear={() => { setDateFrom(""); setDateTo(""); }} />
                    ) : null}
                </div>
            ) : null}

            <div className="md:hidden">
                {pagedLeads.length === 0 ? (
                    <div className="border-y border-white/[0.06] py-12 text-center">
                        <Globe className="mx-auto h-9 w-9 text-zinc-700" />
                        <p className="mt-3 text-sm text-zinc-500">No matching leads</p>
                        <p className="mt-1 text-[11px] text-zinc-700">
                            {activeFilterCount > 0 ? "Adjust filters or clear the current slice." : "Run an extraction to populate Vault."}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                        {pagedLeads.map((lead) => (
                            <div key={lead.id} className="py-3">
                                <button
                                    type="button"
                                    onClick={() => setExpandedId((current) => (current === lead.id ? null : lead.id))}
                                    className="flex w-full items-start justify-between gap-3 text-left"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-white">{lead.businessName}</div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                                            <span>{lead.city || "Unknown city"}</span>
                                            <span className="text-zinc-700">/</span>
                                            <span className="font-mono text-zinc-400">{lead.niche || "No niche"}</span>
                                            {lead.rating != null ? (
                                                <span className="inline-flex items-center gap-1 text-amber-300">
                                                    <Star className="h-3 w-3" />
                                                    {lead.rating}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <StatusBadge status={lead.websiteStatus} />
                                        <ChevronDown className={`h-4 w-4 text-zinc-600 ${expandedId === lead.id ? "rotate-180" : ""}`} />
                                    </div>
                                </button>

                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                    <ContactIndicators lead={lead} />
                                    <div className="flex items-center gap-1">
                                        <OutreachEditorSheet
                                            lead={lead}
                                            onSaved={handleOutreachSaved}
                                            buttonLabel="Status"
                                            buttonVariant="ghost"
                                            buttonSize="sm"
                                            buttonClassName="h-8 px-2 text-zinc-500 hover:text-cyan-300 hover:bg-cyan-500/10"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-2 text-emerald-300 hover:bg-emerald-500/10"
                                            onClick={() => router.push(`/lead/${lead.id}`)}
                                        >
                                            <FileText className="h-3.5 w-3.5" />
                                            Dossier
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-2 text-red-300 hover:bg-red-500/10"
                                            onClick={() => void handleDelete(lead.id)}
                                            disabled={deleting === lead.id}
                                            aria-label={`Delete ${lead.businessName}`}
                                        >
                                            <Trash2 className={`h-3.5 w-3.5 ${deleting === lead.id ? "animate-pulse" : ""}`} />
                                        </Button>
                                    </div>
                                </div>

                                {expandedId === lead.id ? (
                                    <div className="mt-4 border-t border-white/[0.06] pt-4">
                                        <LeadDetails lead={lead} />
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="hidden overflow-hidden rounded-lg border border-white/[0.06] bg-black/20 md:block">
                <Table>
                    <TableHeader className="bg-black/40">
                        <TableRow className="border-white/[0.06] hover:bg-transparent">
                            {[
                                { key: "businessName" as const, label: "Business" },
                                { key: "niche" as const, label: "Niche" },
                                { key: "city" as const, label: "City" },
                            ].map((column) => (
                                <TableHead
                                    key={column.key}
                                    onClick={() => handleSort(column.key)}
                                    className="cursor-pointer select-none text-xs font-semibold text-zinc-500 hover:text-white"
                                >
                                    <span className="flex items-center">
                                        {column.label}
                                        <SortIcon active={sortKey === column.key} dir={sortDir} />
                                    </span>
                                </TableHead>
                            ))}
                            <TableHead className="text-xs font-semibold text-zinc-500">Contact</TableHead>
                            <TableHead
                                onClick={() => handleSort("rating")}
                                className="w-[96px] cursor-pointer select-none text-xs font-semibold text-zinc-500 hover:text-white"
                            >
                                <span className="flex items-center">
                                    Rating
                                    <SortIcon active={sortKey === "rating"} dir={sortDir} />
                                </span>
                            </TableHead>
                            <TableHead
                                onClick={() => handleSort("reviewCount")}
                                className="w-[110px] cursor-pointer select-none text-xs font-semibold text-zinc-500 hover:text-white"
                            >
                                <span className="flex items-center">
                                    Reviews
                                    <SortIcon active={sortKey === "reviewCount"} dir={sortDir} />
                                </span>
                            </TableHead>
                            <TableHead className="w-[108px] text-xs font-semibold text-zinc-500">Website</TableHead>
                            <TableHead className="w-[150px] text-right text-xs font-semibold text-zinc-500">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pagedLeads.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-40 text-center">
                                    <Globe className="mx-auto h-9 w-9 text-zinc-700" />
                                    <p className="mt-3 text-sm text-zinc-500">No matching leads</p>
                                    <p className="mt-1 text-[11px] text-zinc-700">
                                        {activeFilterCount > 0 ? "Adjust filters or clear the current slice." : "Run an extraction to populate Vault."}
                                    </p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            pagedLeads.map((lead) => (
                                <React.Fragment key={lead.id}>
                                    <TableRow
                                        onClick={() => setExpandedId((current) => (current === lead.id ? null : lead.id))}
                                        className={`cursor-pointer border-white/[0.04] transition-colors ${
                                            expandedId === lead.id ? "bg-white/[0.035]" : "hover:bg-white/[0.02]"
                                        }`}
                                    >
                                        <TableCell className="max-w-[320px]">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium text-white">{lead.businessName}</div>
                                                <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-600">
                                                    <CopyCheck className="h-3 w-3" />
                                                    <span>Added {formatAppDate(lead.createdAt)}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-[180px]">
                                            <span className="block truncate font-mono text-[11px] text-zinc-400">{lead.niche || "-"}</span>
                                        </TableCell>
                                        <TableCell className="max-w-[160px]">
                                            <span className="block truncate text-sm text-zinc-400">{lead.city || "-"}</span>
                                        </TableCell>
                                        <TableCell>
                                            <ContactIndicators lead={lead} />
                                            {isContactedOutreachStatus(lead.outreachStatus) ? (
                                                <div className="mt-1">
                                                    <OutreachStatusBadge status={lead.outreachStatus} />
                                                </div>
                                            ) : null}
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center gap-1 font-mono text-sm text-zinc-300">
                                                <Star className="h-3.5 w-3.5 text-amber-400" />
                                                {lead.rating ?? "-"}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-mono text-sm tabular-nums text-zinc-400">{lead.reviewCount ?? 0}</span>
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={lead.websiteStatus} />
                                        </TableCell>
                                        <TableCell onClick={(event) => event.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1">
                                                <ChevronDown className={`h-4 w-4 text-zinc-700 ${expandedId === lead.id ? "rotate-180" : ""}`} />
                                                <OutreachEditorSheet
                                                    lead={lead}
                                                    onSaved={handleOutreachSaved}
                                                    buttonLabel="Status"
                                                    buttonVariant="ghost"
                                                    buttonSize="sm"
                                                    buttonClassName="h-7 px-2 text-zinc-600 hover:text-cyan-300 hover:bg-cyan-500/10"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 text-zinc-600 hover:bg-emerald-500/10 hover:text-emerald-300"
                                                    onClick={() => router.push(`/lead/${lead.id}`)}
                                                    title="Open dossier"
                                                >
                                                    <FileText className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 text-zinc-600 hover:bg-red-500/10 hover:text-red-300"
                                                    onClick={() => void handleDelete(lead.id)}
                                                    disabled={deleting === lead.id}
                                                    title="Delete lead"
                                                >
                                                    <Trash2 className={`h-3.5 w-3.5 ${deleting === lead.id ? "animate-pulse" : ""}`} />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    {expandedId === lead.id ? (
                                        <TableRow className="border-white/[0.04] bg-white/[0.015]">
                                            <TableCell colSpan={8} className="px-5 py-4 align-top">
                                                <LeadDetails lead={lead} />
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </React.Fragment>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-600">Rows</span>
                    {PAGE_OPTIONS.map((option) => (
                        <Button
                            key={option}
                            type="button"
                            variant={perPage === option ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPerPage(option)}
                            className={`h-7 px-2.5 text-[10px] ${
                                perPage === option ? "bg-white text-black hover:bg-zinc-200" : "border-white/[0.08] text-zinc-500 hover:text-white"
                            }`}
                        >
                            {option}
                        </Button>
                    ))}
                    <span className="ml-1 text-xs text-zinc-600">
                        {processedLeads.length.toLocaleString()} of {leads.length.toLocaleString()}
                    </span>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(0)}
                        disabled={page === 0}
                        className="h-7 border-white/[0.08] px-2 text-[10px] text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                        First
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((current) => Math.max(0, current - 1))}
                        disabled={page === 0}
                        className="h-7 w-7 border-white/[0.08] p-0 text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[64px] text-center font-mono text-xs text-zinc-400">
                        {page + 1} / {totalPages}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                        disabled={page >= totalPages - 1}
                        className="h-7 w-7 border-white/[0.08] p-0 text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(totalPages - 1)}
                        disabled={page >= totalPages - 1}
                        className="h-7 border-white/[0.08] px-2 text-[10px] text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                        Last
                    </Button>
                </div>
            </div>
        </div>
    );
}
