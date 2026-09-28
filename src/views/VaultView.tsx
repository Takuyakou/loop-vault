import { useCallback, useMemo, useState, type ReactNode } from "react";
import { playbackController, samePlaybackSource, type PlayingSource } from "../audio/playbackController";
import type { PreviewSound } from "../audio/chordPreview";
import { PlayToggle } from "../components/PlayToggle";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { PracticeProgressBadge } from "../components/practice/PracticeProgressBadge";
import {
  Button,
  EmptyState as UiEmptyState,
  IconButton,
  Surface,
} from "../components/ui";
import { ProgressionLibraryRail } from "../components/ProgressionLibraryRail";
import { degreeSequence } from "../domain/harmony/degrees";
import { beatsPerBar } from "../domain/midi";
import { resolveTimelineVoicings } from "../domain/voicing";
import {
  buildProgressionIndex,
  progressionTagLabel,
  type ProgressionIndexEntry,
} from "../domain/progressionClassification/mod";
import { formatProgressionText } from "../domain/progressionText";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import { smartLibraryCopy, type AppCopy } from "../i18n";
import { usePlaybackState } from "../hooks/usePlaybackState";
import { useVaultKeyboardSelection, useVirtualRowWindow } from "./vault/useVaultKeyboardSelection";
import { progressionEntryId, useVaultLibraryFilters, type ProgressionEntry, type SortField } from "./vault/useVaultLibraryFilters";
import { ChevronRight, Copy, SearchX, SlidersHorizontal, Star, X } from "lucide-react";

const progressionVirtualizationThreshold = 50;
const progressionPreviewChordLimit = 8;

export function VaultView({
  ideas, storedIdeas = ideas, openDetail, openProgression, openCapture, updateProgressionBlock, setToast, copy, showRomanNumerals,
}: {
  ideas: SongIdea[];
  storedIdeas?: SongIdea[];
  openDetail: (id: string) => void;
  openProgression?: (ideaId: string, blockId: string) => void;
  openCapture: () => void;
  updateIdea: (id: string, changes: Partial<SongIdea>) => boolean | "pending";
  updateProgressionBlock: (ideaId: string, blockId: string, changes: Partial<SavedProgressionBlock>) => boolean | "pending";
  setToast: (toast: string) => void;
  copy: AppCopy;
  showRomanNumerals: boolean;
}) {
  const { sound: previewSound } = usePreviewSound();
  const [libraryDrawerOpen, setLibraryDrawerOpen] = useState(false);
  const libraryText = smartLibraryCopy.ja;
  const progressionIndex = useMemo(() => buildProgressionIndex(ideas), [ideas]);
  const progressionIndexById = useMemo(
    () => new Map(progressionIndex.map((entry) => [entry.id, entry])),
    [progressionIndex],
  );
  const {
    mode, changeMode,
    libraryScope, setLibraryScope,
    selectedLibraryTags, setSelectedLibraryTags,
    query, setQuery,
    onlyPinned, setOnlyPinned,
    lengthBars, setLengthBars,
    keyFilter, setKeyFilter,
    sourceFilter, setSourceFilter,
    tagFilter, setTagFilter,
    sort, setSort,
    keys, sources, tags,
    hasActiveFilters, clearFilters,
    visible,
  } = useVaultLibraryFilters(ideas, progressionIndex);

  const togglePlayback = useCallback(async (entry: ProgressionEntry) => {
    try {
      await playbackController.toggle(sourceOf(entry), requestOf(entry, previewSound));
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }, [copy.toast.chordPreviewFailed, previewSound, setToast]);

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
    const block = storedIdea.progressionBlocks?.find((candidate) => candidate.id === entry.block.id);
    if (!block) return;
    updateProgressionBlock(entry.idea.id, block.id, { pinned: !block.pinned });
  }, [storedIdeas, updateProgressionBlock]);

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

  const { selectedIndex, setSelectedIndex, searchRef } = useVaultKeyboardSelection({
    visible,
    enabled: mode !== "idea",
    onPlay: (entry) => void togglePlayback(entry),
    onOpen: openProgressionDetail,
    onCopy: (entry) => void copyProgression(entry.block),
    onPin: togglePin,
  });

  return (
    <div className="py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--lv-accent)]">Vault</p>
          <h2 className="mt-2 text-2xl font-semibold">{copy.library.subtitle}</h2></div>
        <Button variant="primary" onClick={openCapture}>{copy.library.capture}</Button>
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
        <Surface variant="raised" className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
          <label className="min-w-0 text-xs font-medium text-[var(--lv-text-secondary)]" htmlFor="vault-search">
            {copy.library.search}
            <input id="vault-search" name="vault-search" autoComplete="off" ref={searchRef} className="lv-input mt-1.5 min-h-10 w-full px-3 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setQuery(""); event.currentTarget.blur(); } }} placeholder={copy.library.searchPlaceholder} />
          </label>
          <div className="flex min-h-10 gap-1" role="group" aria-label={copy.library.lengthFilter}>{(["all", "4", "8", "16"] as const).map((value) => <button type="button" key={value} aria-pressed={lengthBars === value} className={lengthBars === value ? "min-w-10 bg-[var(--lv-surface-raised)] px-2 text-xs" : "min-w-10 px-2 text-xs text-[var(--lv-text-muted)]"} onClick={() => setLengthBars(value)}>{value === "all" ? copy.library.all : copy.library.bars(Number(value))}</button>)}</div>
          <div>
            <label className="block text-xs font-medium text-[var(--lv-text-secondary)]" htmlFor="vault-sort">{copy.library.sort}</label>
            <select id="vault-sort" name="vault-sort" className="lv-input mt-1.5 min-h-10 min-w-32 px-2 text-xs" value={sort} onChange={(event) => setSort(event.target.value as SortField)}><option value="capturedAt">{copy.library.captured}</option><option value="updatedAt">{copy.library.updated}</option><option value="key">Key</option><option value="bpm">BPM</option></select>
          </div>
        </Surface>
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
          <span className="text-xs text-[var(--lv-text-muted)]" role="status" aria-live="polite" aria-atomic="true">{copy.library.itemCount(visible.length)}</span>
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
        {hasActiveFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label={libraryText.selectedFilters}>
            {onlyPinned ? (
              <ActiveFilterChip clearLabel={libraryText.clear} label={copy.library.onlyFavorites} onClear={() => {
                setOnlyPinned(false);
                if (mode === "library") setLibraryScope("all");
              }} />
            ) : null}
            {lengthBars !== "all" ? <ActiveFilterChip clearLabel={libraryText.clear} label={copy.library.bars(Number(lengthBars))} onClear={() => setLengthBars("all")} /> : null}
            {keyFilter ? <ActiveFilterChip clearLabel={libraryText.clear} label={`Key ${keyFilter}`} onClear={() => setKeyFilter("")} /> : null}
            {sourceFilter ? <ActiveFilterChip clearLabel={libraryText.clear} label={sourceFilter} onClear={() => setSourceFilter("")} /> : null}
            {tagFilter ? <ActiveFilterChip clearLabel={libraryText.clear} label={tagFilter} onClear={() => setTagFilter("")} /> : null}
            {selectedLibraryTags.map((tagId) => (
              <ActiveFilterChip
                key={tagId}
                clearLabel={libraryText.clear}
                label={displayTaxonomyTag(tagId)}
                onClear={() => setSelectedLibraryTags((current) => current.filter((entry) => entry !== tagId))}
              />
            ))}
            <button
              type="button"
              className="px-2 py-1 text-xs text-[var(--lv-text-muted)]"
              onClick={clearFilters}
            >
              {libraryText.clear}
            </button>
          </div>
        ) : null}
        {mode === "library" ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <aside className="hidden border border-[var(--lv-border)] bg-[var(--lv-surface)] p-3 lg:block">
              <ProgressionLibraryRail
                entries={progressionIndex}
                selectedTagIds={selectedLibraryTags}
                scope={libraryScope}
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
              copy={copy}
              displayTags={(entry) => libraryTags(progressionIndexById.get(progressionEntryId(entry)))}
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
            copy={copy}
            onSelect={setSelectedIndex}
            onOpen={openProgressionDetail}
            onPin={togglePin}
            onCopy={(entry) => void copyProgression(entry.block)}
            onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
          />
        ) : <EmptyState copy={copy} openCapture={openCapture} />}
        {mode === "library" && visible.length === 0 ? <EmptyState copy={copy} openCapture={openCapture} /> : null}
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
      </> : <IdeaList ideas={ideas} openDetail={openDetail} />}
    </div>
  );
}

function ProgressionRows({
  entries,
  selectedIndex,
  showDegrees,
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
      copy={copy}
      displayTags={displayTags?.(entry)}
      compact={entries.length > progressionVirtualizationThreshold}
      onSelect={() => onSelect(index)}
      onOpen={() => onOpen(entry)}
      onPin={() => onPin(entry)}
      onCopy={() => onCopy(entry)}
      onPreviewError={onPreviewError}
    />
  );

  if (entries.length === 0) return null;
  if (entries.length <= progressionVirtualizationThreshold) {
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
  const { viewportRef, start, end, onScroll } = useVirtualRowWindow(entries.length, selectedIndex, rowHeight, viewportHeight);

  return (
    <div
      ref={viewportRef}
      className="mt-4 overflow-y-auto border border-[var(--lv-border)]"
      style={{ height: viewportHeight }}
      onScroll={onScroll}
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

function ProgressionRow({ entry, selected, showDegrees, copy, displayTags, compact, onSelect, onOpen, onPin, onCopy, onPreviewError }: { entry: ProgressionEntry; selected: boolean; showDegrees: boolean;copy: AppCopy; displayTags?: string[]; compact: boolean; onSelect: () => void; onOpen: () => void; onPin: () => void; onCopy: () => void; onPreviewError: (error: unknown) => void }) {
  const { sound: previewSound } = usePreviewSound();
  const degrees = degreeSequence(entry.block);
  const playback = usePlaybackState();
  const source = sourceOf(entry);
  const playing = playback.status !== "idle" && samePlaybackSource(playback.source, source);
  const progressionText = entry.block.chords.map((item) => item.chord.label).join(" · ");
  const progressionPreview = formatProgressionPreview(entry.block.chords.map((item) => item.chord.label));
  const sourceAndTitle = entry.block.sourceFileName
    ? `${entry.block.sourceFileName} · ${entry.idea.title}`
    : entry.idea.title;
  return <div data-compact={compact} data-selected={selected} data-playing={playing} className={`lv-vault-row border-b border-[var(--lv-border)] px-2 py-2 text-sm ${compact ? "h-24 overflow-hidden" : "min-h-24"} ${selected ? "bg-[var(--lv-surface-raised)] ring-1 ring-inset ring-[var(--lv-accent-secondary)]" : "hover:bg-[var(--lv-surface)]"} ${playing ? "border-l-2 border-l-[var(--lv-accent)]" : ""}`}>
    <div className="lv-vault-play" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <PlayToggle source={source} request={requestOf(entry, previewSound)} playLabel={copy.common.preview} stopLabel={copy.common.stop} className="lv-button-ghost grid h-10 w-10 place-items-center" showLabel={false} onError={onPreviewError} />
    </div>
    <button
      type="button"
      className="lv-vault-progression min-w-0 text-left"
      aria-current={selected ? "true" : undefined}
      title={compact ? progressionText : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
      onDoubleClick={(event) => { event.stopPropagation(); onOpen(); }}
    >
      <p className={`lv-vault-progression-primary font-mono ${compact ? "truncate" : ""}`}>{progressionPreview}</p>
      <p className={`lv-vault-progression-secondary mt-1 text-xs text-[var(--lv-text-muted)] ${compact ? "truncate" : ""}`}>
        {sourceAndTitle}{showDegrees && degrees.length ? ` · ${degrees.join(" · ")}` : ""}
      </p>
      <PracticeProgressBadge
        block={entry.block}
        compact
        effectiveKeySignature={keyOf(entry)}
      />
    </button>
    <div className="lv-vault-metadata text-xs text-[var(--lv-text-muted)]">
      <span>{keyOf(entry) ? `Key ${keyOf(entry)}` : "Key -"}</span>
      <span>{bpmOf(entry) || "-"} BPM</span>
      <span>{formatDate(entry.block.capturedAt)}</span>
      <span className={`lv-vault-tags ${compact ? "truncate" : ""}`}>{(displayTags ?? entry.block.tags).join(" · ") || "-"}</span>
    </div>
    <div className="lv-vault-actions flex items-center gap-1">
      <IconButton
        type="button"
        variant="ghost"
        className={entry.block.pinned ? "text-[var(--lv-warning)]" : "text-[var(--lv-text-muted)]"}
        onClick={(event) => { event.stopPropagation(); onPin(); }}
        label={entry.block.pinned ? copy.library.removeFavorite : copy.library.addFavorite}
      ><Star aria-hidden="true" size={16} fill={entry.block.pinned ? "currentColor" : "none"} /></IconButton>
      <IconButton
        type="button"
        variant="ghost"
        onClick={(event) => { event.stopPropagation(); onCopy(); }}
        label={copy.library.copyProgression}
      ><Copy aria-hidden="true" size={16} /></IconButton>
      <IconButton
        type="button"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          if (event.detail > 1) return;
          onOpen();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        label={copy.library.openProgression}
      >
        <ChevronRight aria-hidden="true" size={20} />
      </IconButton>
    </div>
  </div>;
}

function formatProgressionPreview(chordLabels: readonly string[]): string {
  const preview = chordLabels.slice(0, progressionPreviewChordLimit).join(" · ");
  return chordLabels.length > progressionPreviewChordLimit ? `${preview} · …` : preview;
}

function IdeaList({ ideas, openDetail }: { ideas: SongIdea[]; openDetail: (id: string) => void }) {
  return <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{ideas.map((idea) => <button key={idea.id} className="min-h-24 border border-[var(--lv-border)] bg-[var(--lv-surface)] p-3 text-left hover:border-[var(--lv-accent)]" onClick={() => openDetail(idea.id)}><p className="truncate font-semibold">{idea.title}</p><p className="mt-2 text-xs text-[var(--lv-text-muted)]">{idea.bpm ?? "-"} BPM · {idea.key ?? "Key -"}</p></button>)}</div>;
}

function EmptyState({ copy, openCapture }: { copy: AppCopy; openCapture: () => void }) {
  return (
    <UiEmptyState
      className="mt-4"
      icon={<SearchX aria-hidden="true" size={20} />}
      title={copy.library.noMatchingProgressions}
      description={copy.library.searchPlaceholder}
      action={<Button onClick={openCapture}>{copy.library.capture}</Button>}
    />
  );
}
function FilterSelect({ label, allLabel, value, values, onChange }: { label: string; allLabel: string; value: string; values: string[]; onChange: (value: string) => void }) { return <select className="lv-input min-h-10 px-2 text-xs text-[var(--lv-text-secondary)]" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}: {allLabel}</option>{values.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select>; }
function ActiveFilterChip({ clearLabel, label, onClear }: { clearLabel: string; label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex min-h-8 items-center gap-1.5 border border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] px-2.5 text-xs text-[var(--lv-text)]"
      onClick={onClear}
      aria-label={`${clearLabel}: ${label}`}
    >
      {label}
      <X aria-hidden="true" size={16} />
    </button>
  );
}
function keyOf(entry: ProgressionEntry): string { return entry.block.detectedKey ?? entry.idea.key ?? ""; }
function bpmOf(entry: ProgressionEntry): number { return entry.block.bpm ?? entry.idea.bpm ?? 0; }
function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }
function sourceOf(entry: ProgressionEntry): PlayingSource { return { kind: "vault", id: `idea:${entry.idea.id}:block:${entry.block.id}` }; }
function displayTaxonomyTag(tagId: string): string {
  const label = progressionTagLabel(tagId);
  return label === tagId ? tagId.replace(/^[^.]+\./, "") : label;
}
function libraryTags(entry: ProgressionIndexEntry | undefined): string[] {
  if (!entry) return [];
  return entry.effectiveTags.slice(0, 4).map((tagId) => displayTaxonomyTag(tagId));
}
function requestOf(entry: ProgressionEntry, sound: PreviewSound) {
  return {
    type: "timeline" as const,
    timeline: entry.block.chords,
    bpm: entry.block.bpm ?? entry.idea.bpm,
    sound,
    beatsPerBar: beatsPerBar(entry.block.timeSignature),
    explicitMidiNotesByEventId: resolveTimelineVoicings(entry.block.chords, Boolean(entry.block.textSource)),
  };
}
