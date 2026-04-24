"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-provider";
import {
    getLeadNotes, addLeadNote, deleteLeadNote,
    getLeadDisposition, setLeadDisposition, clearLeadDisposition,
    DISPOSITION_OPTIONS,
    type LeadNote, type LeadDisposition, type DispositionType,
} from "@/lib/ui/storage";
import { Search, Plus, Trash2, Clock, StickyNote, Tag } from "lucide-react";

interface OperationalHistoryProps {
    leadId: number;
}

const DISPOSITION_COLORS: Record<string, string> = {
    not_interested: "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20",
    call_back: "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
    wrong_number: "border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20",
    booked: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
    follow_up: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20",
};

export function OperationalHistory({ leadId }: OperationalHistoryProps) {
    const { toast } = useToast();
    const [notes, setNotes] = useState<LeadNote[]>([]);
    const [disposition, setDisposition] = useState<LeadDisposition | null>(null);
    const [noteText, setNoteText] = useState("");
    const [noteSearch, setNoteSearch] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Load from localStorage
    useEffect(() => {
        setNotes(getLeadNotes(leadId));
        setDisposition(getLeadDisposition(leadId));
    }, [leadId]);

    const handleAddNote = useCallback(() => {
        if (!noteText.trim()) return;
        const updated = addLeadNote(leadId, noteText.trim());
        setNotes(updated);
        setNoteText("");
        toast("Note added", { icon: "note" });
    }, [leadId, noteText, toast]);

    const handleDeleteNote = useCallback((noteId: string) => {
        const updated = deleteLeadNote(leadId, noteId);
        setNotes(updated);
    }, [leadId]);

    const handleDisposition = useCallback((type: DispositionType) => {
        if (disposition?.type === type) {
            clearLeadDisposition(leadId);
            setDisposition(null);
            toast("Disposition cleared", { type: "info" });
        } else {
            const d = setLeadDisposition(leadId, type);
            setDisposition(d);
            const label = DISPOSITION_OPTIONS.find(o => o.value === type)?.label || type;
            toast(`Disposition: ${label}`, { type: "success" });
        }
    }, [leadId, disposition, toast]);

    const filteredNotes = useMemo(() => {
        if (!noteSearch.trim()) return notes;
        const q = noteSearch.toLowerCase();
        return notes.filter(n => n.text.toLowerCase().includes(q));
    }, [notes, noteSearch]);

    const currentDisp = disposition ? DISPOSITION_OPTIONS.find(o => o.value === disposition.type) : null;

    return (
        <div className="space-y-5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
            {/* Current Disposition Banner */}
            {currentDisp && disposition && (
                <div className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg border text-xs",
                    DISPOSITION_COLORS[disposition.type]
                )}>
                    <div className="flex items-center gap-2">
                        <span>{currentDisp.icon}</span>
                        <span className="font-semibold">{currentDisp.label}</span>
                    </div>
                    <span className="text-[10px] opacity-60 font-mono">
                        {new Date(disposition.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                </div>
            )}

            {/* Dispositions */}
            <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                    <Tag className="w-4 h-4 text-purple-400" />
                    Disposition
                </h3>
                <div className="flex flex-wrap gap-2">
                    {DISPOSITION_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => handleDisposition(opt.value)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all duration-200",
                                disposition?.type === opt.value
                                    ? DISPOSITION_COLORS[opt.value]
                                    : "border-white/[0.06] text-zinc-500 hover:text-white hover:border-white/[0.12]"
                            )}
                        >
                            <span className="mr-1">{opt.icon}</span> {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Notes */}
            <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                    <StickyNote className="w-4 h-4 text-amber-400" />
                    Notes
                    <span className="text-[10px] font-mono text-muted-foreground/40 ml-auto">{notes.length}</span>
                </h3>

                {/* Add note */}
                <div className="flex gap-2 mb-3">
                    <textarea
                        ref={textareaRef}
                        id="dossier-note-input"
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAddNote(); } }}
                        placeholder="Add a note... (Cmd/Ctrl+Enter to save)"
                        rows={2}
                        className="flex-1 bg-black/30 border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 resize-none outline-none focus:border-emerald-500/30 transition-colors"
                    />
                    <button
                        onClick={handleAddNote}
                        disabled={!noteText.trim()}
                        className={cn(
                            "self-end px-3 py-2 rounded-lg text-xs font-medium transition-all",
                            noteText.trim()
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                                : "bg-white/[0.02] text-zinc-700 border border-white/[0.04] cursor-not-allowed"
                        )}
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                {/* Search notes */}
                {notes.length > 2 && (
                    <div className="relative mb-3">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                        <input
                            value={noteSearch}
                            onChange={e => setNoteSearch(e.target.value)}
                            placeholder="Search notes..."
                            className="w-full bg-black/20 border border-white/[0.04] rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-white/[0.08] transition-colors"
                        />
                    </div>
                )}

                {/* Notes list */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {filteredNotes.length === 0 && notes.length === 0 && (
                        <p className="text-[11px] text-zinc-700 text-center py-4 italic">No notes yet. Press N to focus.</p>
                    )}
                    {filteredNotes.length === 0 && notes.length > 0 && (
                        <p className="text-[11px] text-zinc-600 text-center py-3">No notes matching &ldquo;{noteSearch}&rdquo;</p>
                    )}
                    {filteredNotes.map(note => (
                        <div key={note.id} className="group rounded-lg border border-white/[0.05] bg-black/20 p-3">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-[11px] text-zinc-300 leading-relaxed flex-1">{note.text}</p>
                                <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="flex items-center gap-1 mt-1.5 text-[9px] text-zinc-700">
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(note.timestamp).toLocaleDateString("en-US", {
                                    month: "short", day: "numeric", year: "numeric",
                                    hour: "2-digit", minute: "2-digit",
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
