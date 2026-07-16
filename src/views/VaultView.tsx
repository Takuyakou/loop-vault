import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playbackController, samePlaybackSource, type PlayingSource } from "../audio/playbackController";
import { PlayToggle } from "../components/PlayToggle";
import { degreeSequence } from "../domain/harmony/degrees";
import { beatsPerBar } from "../domain/midi";
import { filterAndSortProgressions } from "../domain/progressionFilters";
import { formatProgressionText } from "../domain/progressionText";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import type { AppCopy, AppLanguage } from "../i18n";
import { usePlaybackState } from "../hooks/usePlaybackState";
import { ChevronRight, Copy, Star } from "lucide-react";

type ProgressionEntry = { idea: SongIdea; block: SavedProgressionBlock };
type SortField = "capturedAt" | "updatedAt" | "key" | "bpm";

export function VaultView({
  ideas, storedIdeas = ideas, openDetail, openCreate, openCapture, updateIdea, setToast, copy, showRomanNumerals,
}: {
  ideas: SongIdea[];
  storedIdeas?: SongIdea[];
  openDetail: (id: string) => void;
  openCreate: () => void;
  openCapture: () => void;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  setToast: (toast: string) => void;
  copy: AppCopy;
  language: AppLanguage;
  showRomanNumerals: boolean;
}) {
  const [mode, setMode] = useState<"progression" | "idea">("progression");
  const [query, setQuery] = useState("");
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [lengthBars, setLengthBars] = useState<"all" | "4" | "8" | "16">("all");
  const [keyFilter, setKeyFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState<SortField>("capturedAt");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const allBlocks = useMemo(() => ideas.flatMap((idea) => idea.progressionBlocks ?? []), [ideas]);
  const keys = useMemo(() => [...new Set(ideas.flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => block.detectedKey ?? idea.key).filter((value): value is string => Boolean(value))))].sort(), [ideas]);
  const sources = useMemo(() => [...new Set(allBlocks.map((block) => block.sourceFileName).filter((value): value is string => Boolean(value)))].sort(), [allBlocks]);
  const tags = useMemo(() => [...new Set(allBlocks.flatMap((block) => block.tags))].sort(), [allBlocks]);
  const visible = useMemo(() => filterAndSortProgressions(ideas, {
    query, pinnedOnly: onlyPinned, keys: keyFilter ? [keyFilter] : [],
    lengths: lengthBars === "all" ? [] : [Number(lengthBars)],
    sources: sourceFilter ? [sourceFilter] : [], tags: tagFilter ? [tagFilter] : [],
  }, { field: sort, direction: sort === "key" || sort === "bpm" ? "asc" : "desc" }),
  [ideas, keyFilter, lengthBars, onlyPinned, query, sort, sourceFilter, tagFilter]);
  useEffect(() => {
    setSelectedIndex((value) => Math.min(value, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  const togglePlayback = useCallback(async (entry: ProgressionEntry) => {
    try {
      await playbackController.toggle(sourceOf(entry), requestOf(entry));
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }, [copy.toast.chordPreviewFailed, setToast]);

  const togglePin = useCallback((entry: ProgressionEntry) => {
    const storedIdea = storedIdeas.find((idea) => idea.id === entry.idea.id);
    if (!storedIdea) return;
    updateIdea(entry.idea.id, {
      progressionBlocks: (storedIdea.progressionBlocks ?? []).map((block) =>
        block.id === entry.block.id ? { ...block, pinned: !block.pinned } : block),
    });
  }, [storedIdeas, updateIdea]);

  const copyProgression = useCallback(async (block: SavedProgressionBlock) => {
    if (!navigator.clipboard?.writeText) {
      setToast(copy.library.copyFailed);
      return;
    }
    try {
      await navigator.clipboard.writeText(formatProgressionText(block.chords));
      setToast(copy.library.copiedProgression);
    } catch {
      setToast(copy.library.copyFailed);
    }
  }, [copy.library.copiedProgression, copy.library.copyFailed, setToast]);

  const handleKey = useCallback((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, button, a, [role='button']") || target?.isContentEditable) return;
    if (event.key === "/") {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }
    const active = visible[selectedIndex];
    if (!active || mode !== "progression") return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((value) => Math.max(0, Math.min(visible.length - 1,
        value + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === " ") {
      event.preventDefault();
      void togglePlayback(active);
    } else if (event.key === "Enter") {
      openDetail(active.idea.id);
    } else if (event.key.toLowerCase() === "c") {
      void copyProgression(active.block);
    } else if (event.key.toLowerCase() === "s") {
      togglePin(active);
    }
  }, [copyProgression, mode, openDetail, selectedIndex, togglePin, togglePlayback, visible]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return (
    <div className="py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--lv-accent)]">Vault</p>
          <h2 className="mt-2 text-2xl font-semibold">{copy.library.subtitle}</h2></div>
        <button className="lv-button-primary px-4 py-2 text-sm font-semibold" onClick={openCapture}>{copy.library.capture}</button>
      </div>
      <div className="mb-3 flex gap-1 text-sm">
        <button className={mode === "progression" ? "bg-[var(--lv-surface-raised)] px-3 py-2" : "px-3 py-2 text-[var(--lv-text-muted)]"} onClick={() => setMode("progression")}>{copy.library.progression}</button>
        <button className={mode === "idea" ? "bg-[var(--lv-surface-raised)] px-3 py-2" : "px-3 py-2 text-[var(--lv-text-muted)]"} onClick={() => setMode("idea")}>{copy.library.idea}</button>
      </div>
      {mode === "progression" ? <>
        <div className="grid gap-2 border-y border-[var(--lv-border)] py-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input ref={searchRef} className="border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--lv-accent)]" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setQuery(""); event.currentTarget.blur(); } }} placeholder={copy.library.searchPlaceholder} />
          <div className="flex gap-1">{(["all", "4", "8", "16"] as const).map((value) => <button key={value} className={lengthBars === value ? "bg-[var(--lv-surface-raised)] px-2 text-xs" : "px-2 text-xs text-[var(--lv-text-muted)]"} onClick={() => setLengthBars(value)}>{value === "all" ? copy.library.all : copy.library.bars(Number(value))}</button>)}</div>
          <select className="border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-2 text-xs" value={sort} onChange={(event) => setSort(event.target.value as SortField)}><option value="capturedAt">{copy.library.captured}</option><option value="updatedAt">{copy.library.updated}</option><option value="key">Key</option><option value="bpm">BPM</option></select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={onlyPinned ? "inline-flex items-center gap-1.5 bg-[var(--lv-surface-raised)] px-3 py-1 text-xs text-[var(--lv-warning)]" : "inline-flex items-center gap-1.5 border border-[var(--lv-border)] px-3 py-1 text-xs text-[var(--lv-text-muted)]"} onClick={() => setOnlyPinned((value) => !value)}>
            <Star aria-hidden="true" size={16} fill={onlyPinned ? "currentColor" : "none"} />
            {copy.library.onlyFavorites}
          </button>
          <FilterSelect label="Key" allLabel={copy.library.all} value={keyFilter} values={keys} onChange={setKeyFilter} />
          <FilterSelect label={copy.library.source} allLabel={copy.library.all} value={sourceFilter} values={sources} onChange={setSourceFilter} />
          <FilterSelect label={copy.library.tag} allLabel={copy.library.all} value={tagFilter} values={tags} onChange={setTagFilter} />
          <span className="text-xs text-[var(--lv-text-muted)]">{copy.library.itemCount(visible.length)}</span>
        </div>
        {visible.length ? <div className="mt-4 overflow-hidden border border-[var(--lv-border)]">
          {visible.map((entry, index) => <ProgressionRow key={entry.block.id} entry={entry} selected={index === selectedIndex} showDegrees={showRomanNumerals} copy={copy} onSelect={() => setSelectedIndex(index)} onOpen={() => openDetail(entry.idea.id)} onPin={() => togglePin(entry)} onCopy={() => void copyProgression(entry.block)} onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)} />)}
        </div> : <EmptyState copy={copy} openCreate={openCreate} />}
        <p className="mt-3 text-xs text-[var(--lv-text-muted)]">{copy.library.shortcuts}</p>
      </> : <IdeaList ideas={ideas} openDetail={openDetail} copy={copy} />}
    </div>
  );
}

function ProgressionRow({ entry, selected, showDegrees, copy, onSelect, onOpen, onPin, onCopy, onPreviewError }: { entry: ProgressionEntry; selected: boolean; showDegrees: boolean; copy: AppCopy; onSelect: () => void; onOpen: () => void; onPin: () => void; onCopy: () => void; onPreviewError: (error: unknown) => void }) {
  const degrees = degreeSequence(entry.block);
  const playback = usePlaybackState();
  const source = sourceOf(entry);
  const playing = playback.status !== "idle" && samePlaybackSource(playback.source, source);
  return <div className={`lv-vault-row min-h-14 border-b border-[var(--lv-border)] px-2 py-2 text-sm ${selected ? "bg-[var(--lv-surface-raised)]" : "hover:bg-[var(--lv-surface)]"} ${playing ? "border-l-2 border-l-[var(--lv-accent)]" : ""}`} onClick={onSelect}>
    <div className="lv-vault-play" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <PlayToggle source={source} request={requestOf(entry)} playLabel={copy.common.preview} stopLabel={copy.common.stop} className="lv-button-ghost grid h-8 w-8 place-items-center" showLabel={false} onError={onPreviewError} />
    </div>
    <button
      type="button"
      className="lv-vault-progression min-w-0 text-left"
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
      onDoubleClick={(event) => { event.stopPropagation(); onOpen(); }}
    >
      <p className="lv-vault-progression-primary font-mono">{entry.block.chords.map((item) => item.chord.label).join(" · ")}</p>
      <p className="lv-vault-progression-secondary mt-1 text-xs text-[var(--lv-text-muted)]">
        {entry.idea.title}{showDegrees && degrees.length ? ` · ${degrees.join(" · ")}` : ""}
      </p>
    </button>
    <div className="lv-vault-metadata text-xs text-[var(--lv-text-muted)]">
      <span>{keyOf(entry) ? `Key ${keyOf(entry)}` : "Key -"}</span>
      <span>{bpmOf(entry) || "-"} BPM</span>
      <span>{formatDate(entry.block.capturedAt)}</span>
      <span className="lv-vault-tags">{entry.block.tags.join(" · ") || "-"}</span>
    </div>
    <div className="lv-vault-actions flex items-center gap-1">
      <button
        type="button"
        className={`grid h-8 w-8 shrink-0 place-items-center ${entry.block.pinned ? "text-[var(--lv-warning)]" : "text-[var(--lv-text-muted)]"}`}
        onClick={(event) => { event.stopPropagation(); onPin(); }}
        aria-label={entry.block.pinned ? copy.library.removeFavorite : copy.library.addFavorite}
        title={entry.block.pinned ? copy.library.removeFavorite : copy.library.addFavorite}
      ><Star aria-hidden="true" size={16} fill={entry.block.pinned ? "currentColor" : "none"} /></button>
      <button
        type="button"
        className="lv-button-ghost grid h-8 w-8 shrink-0 place-items-center text-xs"
        onClick={(event) => { event.stopPropagation(); onCopy(); }}
        aria-label={copy.library.copyProgression}
        title={copy.library.copyProgression}
      ><Copy aria-hidden="true" size={16} /></button>
      <button
        type="button"
        className="lv-button-ghost grid h-8 w-8 shrink-0 place-items-center text-lg"
        onClick={(event) => {
          event.stopPropagation();
          if (event.detail > 1) return;
          onOpen();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        aria-label={copy.library.openIdea}
        title={copy.library.openIdea}
      >
        <ChevronRight aria-hidden="true" size={20} />
      </button>
    </div>
  </div>;
}

function IdeaList({ ideas, openDetail, copy }: { ideas: SongIdea[]; openDetail: (id: string) => void; copy: AppCopy }) {
  return <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{ideas.map((idea) => <button key={idea.id} className="min-h-24 border border-[var(--lv-border)] bg-[var(--lv-surface)] p-3 text-left hover:border-[var(--lv-accent)]" onClick={() => openDetail(idea.id)}><p className="truncate font-semibold">{idea.title}</p><p className="mt-2 text-xs text-[var(--lv-text-muted)]">{idea.bpm ?? "-"} BPM · {idea.key ?? "Key -"}</p><p className="mt-2 truncate text-xs text-[var(--lv-text-secondary)]">{idea.nextAction.text || copy.library.noNextAction}</p></button>)}</div>;
}

function EmptyState({ copy, openCreate }: { copy: AppCopy; openCreate: () => void }) { return <div className="py-16 text-center"><p className="text-[var(--lv-text-muted)]">{copy.library.noMatchingProgressions}</p><button className="lv-button-secondary mt-4 px-3 py-2 text-sm" onClick={openCreate}>{copy.library.newIdea}</button></div>; }
function FilterSelect({ label, allLabel, value, values, onChange }: { label: string; allLabel: string; value: string; values: string[]; onChange: (value: string) => void }) { return <select className="border border-[var(--lv-border)] bg-[var(--lv-bg)] px-2 py-1 text-xs text-[var(--lv-text-secondary)]" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}: {allLabel}</option>{values.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select>; }
function keyOf(entry: ProgressionEntry): string { return entry.block.detectedKey ?? entry.idea.key ?? ""; }
function bpmOf(entry: ProgressionEntry): number { return entry.block.bpm ?? entry.idea.bpm ?? 0; }
function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }
function sourceOf(entry: ProgressionEntry): PlayingSource { return { kind: "vault", id: `idea:${entry.idea.id}:block:${entry.block.id}` }; }
function requestOf(entry: ProgressionEntry) {
  return {
    type: "timeline" as const,
    timeline: entry.block.chords,
    bpm: entry.block.bpm ?? entry.idea.bpm,
    beatsPerBar: beatsPerBar(entry.block.timeSignature),
  };
}
