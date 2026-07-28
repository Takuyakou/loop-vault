import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { playbackController, samePlaybackSource, type PlayingSource } from "../audio/playbackController";
import type { PreviewSound } from "../audio/chordPreview";
import { PlayToggle } from "../components/PlayToggle";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { PracticeProgressBadge } from "../components/practice/PracticeProgressBadge";
import {
  isRecent,
  ProgressionLibraryRail,
  type ProgressionLibraryScope,
} from "../components/ProgressionLibraryRail";
import { degreeSequence } from "../domain/harmony/degrees";
import { beatsPerBar } from "../domain/midi";
import { resolveTimelineVoicings } from "../domain/voicing";
import {
  buildProgressionIndex,
  filterProgressionIndex,
  progressionTagLabel,
  type ProgressionIndexEntry,
} from "../domain/progressionClassification/mod";
import { filterAndSortProgressions } from "../domain/progressionFilters";
import { formatProgressionText } from "../domain/progressionText";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import { smartLibraryCopy, type AppCopy, type AppLanguage } from "../i18n";
import { usePlaybackState } from "../hooks/usePlaybackState";
import { ChevronRight, Copy, SlidersHorizontal, Star, X } from "lucide-react";

type ProgressionEntry = { idea: SongIdea; block: SavedProgressionBlock };
type SortField = "capturedAt" | "updatedAt" | "key" | "bpm";
type VaultMode = "library" | "list" | "idea";
type ProgressionViewMode = Exclude<VaultMode, "idea">;

const progressionViewModeSessionKey = "loop-vault.progression-view-mode";

export function VaultView({
  ideas, storedIdeas = ideas, openDetail, openProgression, openCreate, openCapture, updateIdea, setToast, copy, language, showRomanNumerals,
}: {
  ideas: SongIdea[];
  storedIdeas?: SongIdea[];
  openDetail: (id: string) => void;
  openProgression?: (ideaId: string, blockId: string) => void;
  openCreate: () => void;
  openCapture: () => void;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  setToast: (toast: string) => void;
  copy: AppCopy;
  language: AppLanguage;
  showRomanNumerals: boolean;
}) {
  const { sound: previewSound } = usePreviewSound();
  const [mode, setMode] = useState<VaultMode>(readProgressionViewMode);
  const [libraryScope, setLibraryScope] = useState<ProgressionLibraryScope>("all");
  const [selectedLibraryTags, setSelectedLibraryTags] = useState<string[]>([]);
  const [libraryDrawerOpen, setLibraryDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [lengthBars, setLengthBars] = useState<"all" | "4" | "8" | "16">("all");
  const [keyFilter, setKeyFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState<SortField>("capturedAt");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const libraryText = smartLibraryCopy[language];
  const progressionIndex = useMemo(() => buildProgressionIndex(ideas), [ideas]);
  const progressionIndexById = useMemo(
    () => new Map(progressionIndex.map((entry) => [entry.id, entry])),
    [progressionIndex],
  );
  const allBlocks = useMemo(() => ideas.flatMap((idea) => idea.progressionBlocks ?? []), [ideas]);
  const keys = useMemo(() => [...new Set(ideas.flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => block.detectedKey ?? idea.key).filter((value): value is string => Boolean(value))))].sort(), [ideas]);
  const sources = useMemo(() => [...new Set(allBlocks.map((block) => block.sourceFileName).filter((value): value is string => Boolean(value)))].sort(), [allBlocks]);
  const tags = useMemo(() => [...new Set(allBlocks.flatMap((block) => block.tags))].sort(), [allBlocks]);
  const visible = useMemo(() => {
    const sorted = filterAndSortProgressions(ideas, {
      query: mode === "library" ? "" : query,
      pinnedOnly: onlyPinned,
      keys: keyFilter ? [keyFilter] : [],
      lengths: lengthBars === "all" ? [] : [Number(lengthBars)],
      sources: sourceFilter ? [sourceFilter] : [],
      tags: tagFilter ? [tagFilter] : [],
    }, { field: sort, direction: sort === "key" || sort === "bpm" ? "asc" : "desc" });
    if (mode !== "library") return sorted;
    const libraryMatches = filterProgressionIndex(progressionIndex, {
      query,
      tagIds: selectedLibraryTags,
    }).filter((entry) => {
      if (libraryScope === "favorites") return entry.favorite;
      if (libraryScope === "recent") return isRecent(entry.createdAt);
      return true;
    });
    const allowed = new Set(libraryMatches.map((entry) => entry.id));
    return sorted.filter((entry) => allowed.has(progressionEntryId(entry)));
  }, [ideas, keyFilter, lengthBars, libraryScope, mode, onlyPinned, progressionIndex, query, selectedLibraryTags, sort, sourceFilter, tagFilter]);
  useEffect(() => {
    setSelectedIndex((value) => Math.min(value, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  const togglePlayback = useCallback(async (entry: ProgressionEntry) => {
    try {
      await playbackController.toggle(sourceOf(entry), requestOf(entry, previewSound));
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }, [copy.toast.chordPreviewFailed, previewSound, setToast]);

  function changeMode(next: VaultMode) {
    setMode(next);
    if (next !== "idea") writeProgressionViewMode(next);
  }

  const openProgressionDetail = useCallback((entry: ProgressionEntry) => {
    if (openProgression) {
      openProgression(entry.idea.id, entry.block.id);
      return;
    }
    openDetail(entry.idea.id);
  }, [openDetail, openProgression]);

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
    if (!active || mode === "idea") return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((value) => Math.max(0, Math.min(visible.length - 1,
        value + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === " ") {
      event.preventDefault();
      void togglePlayback(active);
    } else if (event.key === "Enter") {
      openProgressionDetail(active);
    } else if (event.key.toLowerCase() === "c") {
      void copyProgression(active.block);
    } else if (event.key.toLowerCase() === "s") {
      togglePin(active);
    }
  }, [copyProgression, mode, openProgressionDetail, selectedIndex, togglePin, togglePlayback, visible]);

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
      <div className="mb-3 inline-flex border border-[var(--lv-border)] p-0.5 text-sm" role="group" aria-label="Vault">
        <button
          type="button"
          className={mode === "library" ? "bg-[var(--lv-surface-raised)] px-3 py-1.5" : "px-3 py-1.5 text-[var(--lv-text-muted)]"}
          onClick={() => changeMode("library")}
          aria-pressed={mode === "library"}
        >
          {libraryText.library}
        </button>
        <button
          type="button"
          className={mode === "list" ? "bg-[var(--lv-surface-raised)] px-3 py-1.5" : "px-3 py-1.5 text-[var(--lv-text-muted)]"}
          onClick={() => changeMode("list")}
          aria-pressed={mode === "list"}
        >
          {libraryText.list}
        </button>
        <button
          type="button"
          className={mode === "idea" ? "bg-[var(--lv-surface-raised)] px-3 py-1.5" : "px-3 py-1.5 text-[var(--lv-text-muted)]"}
          onClick={() => changeMode("idea")}
          aria-pressed={mode === "idea"}
        >
          {copy.library.idea}
        </button>
      </div>
      {mode !== "idea" ? <>
        <div className="grid gap-2 border-y border-[var(--lv-border)] py-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input ref={searchRef} className="border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--lv-accent)]" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setQuery(""); event.currentTarget.blur(); } }} placeholder={copy.library.searchPlaceholder} />
          <div className="flex gap-1">{(["all", "4", "8", "16"] as const).map((value) => <button key={value} className={lengthBars === value ? "bg-[var(--lv-surface-raised)] px-2 text-xs" : "px-2 text-xs text-[var(--lv-text-muted)]"} onClick={() => setLengthBars(value)}>{value === "all" ? copy.library.all : copy.library.bars(Number(value))}</button>)}</div>
          <select className="border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-2 text-xs" value={sort} onChange={(event) => setSort(event.target.value as SortField)}><option value="capturedAt">{copy.library.captured}</option><option value="updatedAt">{copy.library.updated}</option><option value="key">Key</option><option value="bpm">BPM</option></select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={onlyPinned ? "inline-flex items-center gap-1.5 bg-[var(--lv-surface-raised)] px-3 py-1 text-xs text-[var(--lv-warning)]" : "inline-flex items-center gap-1.5 border border-[var(--lv-border)] px-3 py-1 text-xs text-[var(--lv-text-muted)]"} onClick={() => setOnlyPinned((value) => {
            const next = !value;
            if (mode === "library") setLibraryScope(next ? "favorites" : "all");
            return next;
          })}>
            <Star aria-hidden="true" size={16} fill={onlyPinned ? "currentColor" : "none"} />
            {copy.library.onlyFavorites}
          </button>
          <FilterSelect label="Key" allLabel={copy.library.all} value={keyFilter} values={keys} onChange={setKeyFilter} />
          <FilterSelect label={copy.library.source} allLabel={copy.library.all} value={sourceFilter} values={sources} onChange={setSourceFilter} />
          <FilterSelect label={copy.library.tag} allLabel={copy.library.all} value={tagFilter} values={tags} onChange={setTagFilter} />
          <span className="text-xs text-[var(--lv-text-muted)]">{copy.library.itemCount(visible.length)}</span>
          {mode === "library" ? (
            <button
              type="button"
              className="lv-button-secondary ml-auto inline-flex items-center gap-2 px-3 py-1 text-xs lg:hidden"
              onClick={() => setLibraryDrawerOpen(true)}
            >
              <SlidersHorizontal aria-hidden="true" size={16} />
              {libraryText.filters}
            </button>
          ) : null}
        </div>
        {mode === "library" && selectedLibraryTags.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label={libraryText.selectedFilters}>
            {selectedLibraryTags.map((tagId) => (
              <button
                key={tagId}
                type="button"
                className="inline-flex items-center gap-1 bg-teal-300/10 px-2 py-1 text-xs text-teal-100"
                onClick={() => setSelectedLibraryTags((current) => current.filter((entry) => entry !== tagId))}
              >
                {displayTaxonomyTag(tagId, language)}
                <X aria-hidden="true" size={16} />
              </button>
            ))}
            <button
              type="button"
              className="px-2 py-1 text-xs text-[var(--lv-text-muted)]"
              onClick={() => setSelectedLibraryTags([])}
            >
              {libraryText.clear}
            </button>
          </div>
        ) : null}
        {mode === "library" ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <aside className="hidden border-r border-[var(--lv-border)] pr-4 lg:block">
              <ProgressionLibraryRail
                entries={progressionIndex}
                selectedTagIds={selectedLibraryTags}
                scope={libraryScope}
                language={language}
                onToggleTag={(tagId) => setSelectedLibraryTags((current) => current.includes(tagId)
                  ? current.filter((entry) => entry !== tagId)
                  : [...current, tagId])}
                onScopeChange={(scope) => {
                  setLibraryScope(scope);
                  setOnlyPinned(scope === "favorites");
                }}
              />
            </aside>
            <ProgressionRows
              entries={visible}
              selectedIndex={selectedIndex}
              showDegrees={showRomanNumerals}
              language={language}
              copy={copy}
              displayTags={(entry) => libraryTags(progressionIndexById.get(progressionEntryId(entry)), language)}
              onSelect={setSelectedIndex}
              onOpen={openProgressionDetail}
              onPin={togglePin}
              onCopy={(entry) => void copyProgression(entry.block)}
              onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
            />
          </div>
        ) : visible.length ? (
          <ProgressionRows
            entries={visible}
            selectedIndex={selectedIndex}
            showDegrees={showRomanNumerals}
            language={language}
            copy={copy}
            onSelect={setSelectedIndex}
            onOpen={openProgressionDetail}
            onPin={togglePin}
            onCopy={(entry) => void copyProgression(entry.block)}
            onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
          />
        ) : <EmptyState copy={copy} openCreate={openCreate} />}
        {mode === "library" && visible.length === 0 ? <EmptyState copy={copy} openCreate={openCreate} /> : null}
        {libraryDrawerOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/70"
              onClick={() => setLibraryDrawerOpen(false)}
              aria-label={libraryText.closeFilters}
            />
            <aside className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] overflow-y-auto border-r border-[var(--lv-border-strong)] bg-[var(--lv-bg)] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="font-semibold">{libraryText.filters}</p>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center"
                  onClick={() => setLibraryDrawerOpen(false)}
                  aria-label={libraryText.closeFilters}
                  title={libraryText.closeFilters}
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </div>
              <ProgressionLibraryRail
                entries={progressionIndex}
                selectedTagIds={selectedLibraryTags}
                scope={libraryScope}
                language={language}
                onToggleTag={(tagId) => setSelectedLibraryTags((current) => current.includes(tagId)
                  ? current.filter((entry) => entry !== tagId)
                  : [...current, tagId])}
                onScopeChange={(scope) => {
                  setLibraryScope(scope);
                  setOnlyPinned(scope === "favorites");
                }}
              />
            </aside>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-[var(--lv-text-muted)]">{copy.library.shortcuts}</p>
      </> : <IdeaList ideas={ideas} openDetail={openDetail} copy={copy} />}
    </div>
  );
}

function ProgressionRows({
  entries,
  selectedIndex,
  showDegrees,
  language,
  copy,
  displayTags,
  onSelect,
  onOpen,
  onPin,
  onCopy,
  onPreviewError,
}: {
  entries: ProgressionEntry[];
  selectedIndex: number;
  showDegrees: boolean;
  language: AppLanguage;
  copy: AppCopy;
  displayTags?: (entry: ProgressionEntry) => string[];
  onSelect: (index: number) => void;
  onOpen: (entry: ProgressionEntry) => void;
  onPin: (entry: ProgressionEntry) => void;
  onCopy: (entry: ProgressionEntry) => void;
  onPreviewError: (error: unknown) => void;
}) {
  const row = (entry: ProgressionEntry, index: number) => (
    <ProgressionRow
      key={progressionEntryId(entry)}
      entry={entry}
      selected={index === selectedIndex}
      showDegrees={showDegrees}
      language={language}
      copy={copy}
      displayTags={displayTags?.(entry)}
      onSelect={() => onSelect(index)}
      onOpen={() => onOpen(entry)}
      onPin={() => onPin(entry)}
      onCopy={() => onCopy(entry)}
      onPreviewError={onPreviewError}
    />
  );

  if (entries.length === 0) return null;
  if (entries.length <= 200) {
    return <div className="mt-4 overflow-hidden border border-[var(--lv-border)]">{entries.map(row)}</div>;
  }
  return (
    <VirtualizedProgressionRows
      entries={entries}
      selectedIndex={selectedIndex}
      renderRow={row}
    />
  );
}

function VirtualizedProgressionRows({
  entries,
  selectedIndex,
  renderRow,
}: {
  entries: ProgressionEntry[];
  selectedIndex: number;
  renderRow: (entry: ProgressionEntry, index: number) => ReactNode;
}) {
  const rowHeight = 96;
  const viewportHeight = 560;
  const overscan = 6;
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(
    entries.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rowTop = selectedIndex * rowHeight;
    const rowBottom = rowTop + rowHeight;
    if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop;
    else if (rowBottom > viewport.scrollTop + viewportHeight) {
      viewport.scrollTop = rowBottom - viewportHeight;
    }
  }, [selectedIndex]);

  return (
    <div
      ref={viewportRef}
      className="mt-4 overflow-y-auto border border-[var(--lv-border)]"
      style={{ height: viewportHeight }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      data-virtualized="true"
      data-row-height={rowHeight}
    >
      <div className="relative" style={{ height: entries.length * rowHeight }}>
        {entries.slice(start, end).map((entry, offset) => {
          const index = start + offset;
          return (
            <div
              key={progressionEntryId(entry)}
              className="absolute inset-x-0 h-24"
              style={{ top: index * rowHeight }}
            >
              {renderRow(entry, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressionRow({ entry, selected, showDegrees, language, copy, displayTags, onSelect, onOpen, onPin, onCopy, onPreviewError }: { entry: ProgressionEntry; selected: boolean; showDegrees: boolean; language: AppLanguage; copy: AppCopy; displayTags?: string[]; onSelect: () => void; onOpen: () => void; onPin: () => void; onCopy: () => void; onPreviewError: (error: unknown) => void }) {
  const { sound: previewSound } = usePreviewSound();
  const degrees = degreeSequence(entry.block);
  const playback = usePlaybackState();
  const source = sourceOf(entry);
  const playing = playback.status !== "idle" && samePlaybackSource(playback.source, source);
  return <div className={`lv-vault-row h-24 overflow-hidden border-b border-[var(--lv-border)] px-2 py-2 text-sm ${selected ? "bg-[var(--lv-surface-raised)]" : "hover:bg-[var(--lv-surface)]"} ${playing ? "border-l-2 border-l-[var(--lv-accent)]" : ""}`} onClick={onSelect}>
    <div className="lv-vault-play" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <PlayToggle source={source} request={requestOf(entry, previewSound)} playLabel={copy.common.preview} stopLabel={copy.common.stop} className="lv-button-ghost grid h-8 w-8 place-items-center" showLabel={false} onError={onPreviewError} />
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
      <PracticeProgressBadge
        block={entry.block}
        language={language}
        compact
        effectiveKeySignature={keyOf(entry)}
      />
    </button>
    <div className="lv-vault-metadata text-xs text-[var(--lv-text-muted)]">
      <span>{keyOf(entry) ? `Key ${keyOf(entry)}` : "Key -"}</span>
      <span>{bpmOf(entry) || "-"} BPM</span>
      <span>{formatDate(entry.block.capturedAt)}</span>
      <span className="lv-vault-tags">{(displayTags ?? entry.block.tags).join(" · ") || "-"}</span>
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
        aria-label={copy.library.openProgression}
        title={copy.library.openProgression}
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
function progressionEntryId(entry: ProgressionEntry): string { return `${entry.idea.id}:${entry.block.id}`; }
function displayTaxonomyTag(tagId: string, language: AppLanguage): string {
  const label = progressionTagLabel(tagId, language);
  return label === tagId ? tagId.replace(/^[^.]+\./, "") : label;
}
function libraryTags(entry: ProgressionIndexEntry | undefined, language: AppLanguage): string[] {
  if (!entry) return [];
  return entry.effectiveTags.slice(0, 4).map((tagId) => displayTaxonomyTag(tagId, language));
}
function requestOf(entry: ProgressionEntry, sound: PreviewSound) {
  return {
    type: "timeline" as const,
    timeline: entry.block.chords,
    bpm: entry.block.bpm ?? entry.idea.bpm,
    sound,
    beatsPerBar: beatsPerBar(entry.block.timeSignature),
    explicitMidiNotesByEventId: resolveTimelineVoicings(entry.block.chords),
  };
}

function readProgressionViewMode(): ProgressionViewMode {
  try {
    const stored = window.sessionStorage.getItem(progressionViewModeSessionKey);
    return stored === "list" || stored === "library" ? stored : "library";
  } catch {
    return "library";
  }
}

function writeProgressionViewMode(mode: ProgressionViewMode): void {
  try {
    window.sessionStorage.setItem(progressionViewModeSessionKey, mode);
  } catch {
    // UI preferences must never block the Vault.
  }
}
