import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { playbackController, samePlaybackSource, type PlayingSource } from "../audio/playbackController";
import type { PreviewSound } from "../audio/chordPreview";
import { CloseIcon, FavoriteIcon, PlayIcon, SearchIcon, StopIcon } from "../components/icons";
import { FirstCaptureGuide } from "../components/FirstCaptureGuide";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { PracticeProgressBadge } from "../components/practice/PracticeProgressBadge";
import { Button, EmptyState, IconButton } from "../components/ui";
import { displayKey } from "../domain/displayLabels";
import { degreeOf } from "../domain/harmony/degrees";
import { beatsPerBar } from "../domain/midi";
import { buildProgressionIndex } from "../domain/progressionClassification/mod";
import { formatProgressionText } from "../domain/progressionText";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import { resolveTimelineVoicings } from "../domain/voicing";
import { usePlaybackState } from "../hooks/usePlaybackState";
import type { AppCopy } from "../i18n";
import { ChevronRight, Copy, SlidersHorizontal, X } from "lucide-react";
import { useTimelinePlayhead } from "./home/timelinePlayhead";
import { progressionSourceLabels } from "./vault/progressionFacts";
import { useVaultKeyboardSelection, useVirtualRowWindow } from "./vault/useVaultKeyboardSelection";
import { useVaultLibraryFilters } from "./vault/useVaultLibraryFilters";
import { VaultFilterPanel, tagLabel } from "./vault/VaultFilterPanel";
import {
  ideasWithoutProgressions,
  lengthBucketLabels,
  vaultSortLabels,
  type VaultMatch,
  type VaultRow,
  type VaultSort,
} from "./vault/vaultLibrary";

type Entry = { row: VaultRow; match?: VaultMatch };

const progressionVirtualizationThreshold = 50;
const progressionPreviewChordLimit = 8;

export function VaultView({
  ideas, storedIdeas = ideas, openDetail, openProgression, openCapture, openTextCapture, updateProgressionBlock, setToast, copy, showRomanNumerals,
}: {
  ideas: SongIdea[];
  storedIdeas?: SongIdea[];
  openDetail: (id: string) => void;
  openProgression?: (ideaId: string, blockId: string) => void;
  openCapture: () => void;
  openTextCapture?: () => void;
  updateIdea: (id: string, changes: Partial<SongIdea>) => boolean | "pending";
  updateProgressionBlock: (ideaId: string, blockId: string, changes: Partial<SavedProgressionBlock>) => boolean | "pending";
  setToast: (toast: string) => void;
  copy: AppCopy;
  showRomanNumerals: boolean;
}) {
  const { sound: previewSound } = usePreviewSound();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const progressionIndex = useMemo(() => buildProgressionIndex(ideas), [ideas]);
  const library = useVaultLibraryFilters(ideas, progressionIndex);
  const { visible, query, setQuery } = library;
  const orphans = useMemo(() => ideasWithoutProgressions(ideas)
    .filter((idea) => !query.trim() || idea.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [ideas, query]);

  const togglePlayback = useCallback(async ({ row }: Entry) => {
    try {
      await playbackController.toggle(sourceOf(row), requestOf(row, previewSound));
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }, [copy.toast.chordPreviewFailed, previewSound, setToast]);

  const openEntry = useCallback(({ row }: Entry) => {
    if (openProgression) openProgression(row.idea.id, row.block.id);
    else openDetail(row.idea.id);
  }, [openDetail, openProgression]);

  const togglePin = useCallback(({ row }: Entry) => {
    const block = storedIdeas.find((idea) => idea.id === row.idea.id)
      ?.progressionBlocks?.find((candidate) => candidate.id === row.block.id);
    if (!block) return;
    updateProgressionBlock(row.idea.id, block.id, { pinned: !block.pinned });
  }, [storedIdeas, updateProgressionBlock]);

  const copyProgression = useCallback(async ({ row }: Entry) => {
    if (!navigator.clipboard?.writeText) {
      setToast(copy.library.copyFailed);
      return;
    }
    try {
      await navigator.clipboard.writeText(formatProgressionText(row.block.chords));
      setToast(copy.library.copiedProgression);
    } catch {
      setToast(copy.library.copyFailed);
    }
  }, [copy.library.copiedProgression, copy.library.copyFailed, setToast]);

  const { selectedIndex, setSelectedIndex, searchRef } = useVaultKeyboardSelection({
    visible,
    enabled: true,
    onPlay: (entry) => void togglePlayback(entry),
    onOpen: openEntry,
    onCopy: (entry) => void copyProgression(entry),
    onPin: togglePin,
  });

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [drawerOpen]);

  const clearAll = () => {
    library.clearFilters();
    setQuery("");
  };
  const panel = (
    <VaultFilterPanel
      filters={library.filters}
      counts={library.counts}
      activeCount={library.activeCount}
      onToggle={library.toggle}
      onFavorite={library.setFavorite}
      onClear={library.clearFilters}
    />
  );
  const filtered = library.activeCount > 0 || query.trim() !== "";

  return (
    <div className="lv-vault">
      <div className="lv-vault-layout">
        <aside className="lv-vault-rail" aria-label="絞り込み">{panel}</aside>
        <div className="lv-vault-main">
          <div className="lv-vault-toolbar">
            <button
              type="button"
              className="lv-vault-drawer-toggle lv-button-neutral"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <SlidersHorizontal aria-hidden="true" size={16} />
              絞り込み{library.activeCount ? ` ${library.activeCount}` : ""}
            </button>
            <label className="lv-vault-search" htmlFor="vault-search">
              <span className="sr-only">進行を検索</span>
              <SearchIcon size={16} className="lv-vault-search-icon" />
              <input
                id="vault-search"
                name="vault-search"
                type="text"
                autoComplete="off"
                ref={searchRef}
                className="lv-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  setQuery("");
                  event.currentTarget.blur();
                }}
                placeholder="コード名か度数（2-5-1）で探す"
              />
            </label>
            <label className="lv-vault-sort" htmlFor="vault-sort">
              <span className="sr-only">並び順</span>
              <select
                id="vault-sort"
                name="vault-sort"
                className="lv-input"
                value={library.sort}
                onChange={(event) => library.setSort(event.target.value as VaultSort)}
              >
                {(Object.keys(vaultSortLabels) as VaultSort[]).map((sort) => (
                  <option key={sort} value={sort}>{vaultSortLabels[sort]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="lv-vault-conditions">
            {library.filters.favorite ? <ConditionChip label="お気に入り" onRemove={() => library.setFavorite(false)} /> : null}
            {library.filters.sources.map((source) => (
              <ConditionChip key={source} group="取り込み元" label={progressionSourceLabels[source]} onRemove={() => library.toggle("sources", source)} />
            ))}
            {library.filters.keys.map((key) => (
              <ConditionChip key={key} group="キー" label={displayKey(key) ?? key} onRemove={() => library.toggle("keys", key)} />
            ))}
            {library.filters.lengths.map((bucket) => (
              <ConditionChip key={bucket} group="長さ" label={lengthBucketLabels[bucket]} onRemove={() => library.toggle("lengths", bucket)} />
            ))}
            {library.filters.tags.map((tag) => (
              <ConditionChip key={tag} group="タグ" label={tagLabel(tag)} onRemove={() => library.toggle("tags", tag)} />
            ))}
            {library.activeCount ? (
              <button type="button" className="px-1.5 text-[11px] text-[var(--lv-text-muted)] underline" onClick={library.clearFilters}>すべて解除</button>
            ) : null}
            <span className="flex-1" />
            <span className="text-xs text-[var(--lv-text-secondary)]" role="status" aria-live="polite" aria-atomic="true">
              {visible.length === library.total ? `${library.total}件` : `${visible.length} / ${library.total}件`}
            </span>
          </div>

          {visible.length ? (
            <ProgressionRows
              entries={visible}
              selectedIndex={selectedIndex}
              showDegrees={showRomanNumerals}
              copy={copy}
              onSelect={setSelectedIndex}
              onOpen={openEntry}
              onPin={togglePin}
              onCopy={(entry) => void copyProgression(entry)}
              onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
            />
          ) : library.total ? (
            <EmptyState
              className="lv-vault-empty"
              title="条件に合う進行はありません"
              description="絞り込みや検索の条件を外すと、ほかの進行が見つかります。"
              action={<Button variant="neutral" onClick={clearAll}>条件をすべて解除</Button>}
            />
          ) : (
            <FirstCaptureGuide onMidi={openCapture} onText={openTextCapture} />
          )}

          {orphans.length && library.activeCount === 0 ? <OrphanIdeas ideas={orphans} openDetail={openDetail} /> : null}
          {filtered ? null : <p className="mt-3 text-xs text-[var(--lv-text-muted)]">{copy.library.shortcuts}</p>}
        </div>
      </div>

      {drawerOpen ? (
        <div className="lv-vault-drawer" role="dialog" aria-modal="true" aria-label="絞り込み">
          <button type="button" className="lv-vault-drawer-scrim" onClick={() => setDrawerOpen(false)} aria-label="絞り込みを閉じる" />
          <aside className="lv-vault-drawer-panel">
            <div className="mb-2 flex justify-end">
              <IconButton label="絞り込みを閉じる" tooltip="styled" variant="ghost" onClick={() => setDrawerOpen(false)}>
                <X aria-hidden="true" size={16} />
              </IconButton>
            </div>
            {panel}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function ConditionChip({ group, label, onRemove }: { group?: string; label: string; onRemove: () => void }) {
  return (
    <span className="lv-vault-condition">
      {group ? <span className="text-[var(--lv-text-muted)]">{group}：</span> : null}
      {label}
      <button type="button" className="lv-vault-condition-remove" aria-label={`${label} を外す`} onClick={onRemove}>
        <CloseIcon size={16} />
      </button>
    </span>
  );
}

function OrphanIdeas({ ideas, openDetail }: { ideas: SongIdea[]; openDetail: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="lv-vault-orphans" aria-label="進行のない Idea" data-testid="vault-orphan-ideas">
      <button type="button" className="lv-vault-orphans-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <ChevronRight aria-hidden="true" size={16} className={open ? "rotate-90" : ""} />
        進行のない Idea（{ideas.length}件）
      </button>
      {open ? (
        <ul className="lv-vault-orphans-list">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <button type="button" className="lv-vault-orphan" onClick={() => openDetail(idea.id)}>
                <span className="min-w-0 flex-1 truncate">{idea.title || "無題の Idea"}</span>
                <span className="text-[11px] text-[var(--lv-text-muted)]">{formatDate(idea.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface RowsProps {
  entries: Entry[];
  selectedIndex: number;
  showDegrees: boolean;
  copy: AppCopy;
  onSelect: (index: number) => void;
  onOpen: (entry: Entry) => void;
  onPin: (entry: Entry) => void;
  onCopy: (entry: Entry) => void;
  onPreviewError: (error: unknown) => void;
}

function ProgressionRows({ entries, selectedIndex, onSelect, onOpen, onPin, onCopy, ...rest }: RowsProps) {
  const compact = entries.length > progressionVirtualizationThreshold;
  const row = (entry: Entry, index: number) => (
    <ProgressionRow
      key={entry.row.id}
      entry={entry}
      selected={index === selectedIndex}
      compact={compact}
      onSelect={() => onSelect(index)}
      onOpen={() => onOpen(entry)}
      onPin={() => onPin(entry)}
      onCopy={() => onCopy(entry)}
      {...rest}
    />
  );
  if (!compact) return <div className="lv-vault-list">{entries.map(row)}</div>;
  return <VirtualizedProgressionRows entries={entries} selectedIndex={selectedIndex} renderRow={row} />;
}

function VirtualizedProgressionRows({ entries, selectedIndex, renderRow }: {
  entries: Entry[];
  selectedIndex: number;
  renderRow: (entry: Entry, index: number) => ReactNode;
}) {
  const rowHeight = 96;
  const viewportHeight = 560;
  const { viewportRef, start, end, onScroll } = useVirtualRowWindow(entries.length, selectedIndex, rowHeight, viewportHeight);

  return (
    <div
      ref={viewportRef}
      className="lv-vault-list overflow-y-auto"
      style={{ height: viewportHeight }}
      onScroll={onScroll}
      data-virtualized="true"
      data-row-height={rowHeight}
    >
      <div className="relative" style={{ height: entries.length * rowHeight }}>
        {entries.slice(start, end).map((entry, offset) => {
          const index = start + offset;
          return (
            <div key={entry.row.id} className="absolute inset-x-0 h-24" style={{ top: index * rowHeight }}>
              {renderRow(entry, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressionRow({ entry, selected, showDegrees, copy, compact, onSelect, onOpen, onPin, onCopy, onPreviewError }: {
  entry: Entry;
  selected: boolean;
  showDegrees: boolean;
  copy: AppCopy;
  compact: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onPin: () => void;
  onCopy: () => void;
  onPreviewError: (error: unknown) => void;
}) {
  const { row, match } = entry;
  const { sound: previewSound } = usePreviewSound();
  const playback = usePlaybackState();
  const source = sourceOf(row);
  const playing = playback.status !== "idle" && samePlaybackSource(playback.source, source);
  const current = useTimelinePlayhead(source, row.block.chords, row.bpm, beatsPerBar(row.block.timeSignature));
  const chords = row.block.chords;
  const degrees = chords.map((item) => degreeOf(item.chord, row.key)?.label);
  const allChords = chords.map((item) => item.chord.label).join(" · ");
  const meta = [
    row.key ? displayKey(row.key) : "キーなし",
    row.bpm ? `BPM ${row.bpm}` : "BPM なし",
    `${row.bars}小節`,
    formatDate(row.block.capturedAt),
    progressionSourceLabels[row.source],
  ].join(" · ");
  const tags = row.tags.slice(0, 4).map(tagLabel);
  const pinned = Boolean(row.block.pinned);
  return (
    <div
      data-compact={compact}
      data-selected={selected}
      data-playing={playing}
      className={`lv-vault-row ${compact ? "h-24 overflow-hidden" : "min-h-24"}`}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <div className="lv-vault-play" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="lv-vault-play-button"
          aria-label={playing ? copy.common.stop : copy.common.preview}
          aria-pressed={playing}
          title={playing ? copy.common.stop : copy.common.preview}
          onClick={() => void playbackController.toggle(source, requestOf(row, previewSound)).catch(onPreviewError)}
        >
          {playing ? <StopIcon size={16} /> : <PlayIcon size={16} />}
        </button>
      </div>
      <div className="lv-vault-main-cell">
        <button
          type="button"
          className="lv-vault-progression"
          aria-current={selected ? "true" : undefined}
          title={compact ? `${row.name} — ${allChords}` : undefined}
          onClick={(event) => { event.stopPropagation(); onOpen(); }}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            onOpen();
          }}
        >
          <span className={`lv-vault-progression-primary ${compact ? "truncate" : ""}`}>{row.name}</span>
          <span className={`lv-vault-progression-secondary ${compact ? "truncate" : ""}`}>{meta}</span>
        </button>
        {match?.kind === "degree" ? (
          <p className="lv-vault-match" data-testid="vault-degree-match">
            度数で一致：{degrees.slice(match.start, match.end + 1).join(" → ")}（{match.start + 1}〜{match.end + 1}番目のコード）
          </p>
        ) : tags.length ? (
          <p className={`lv-vault-tags ${compact ? "truncate" : ""}`}>
            {tags.map((tag) => <span key={tag} className="lv-vault-tag">{tag}</span>)}
          </p>
        ) : null}
        <PracticeProgressBadge block={row.block} compact effectiveKeySignature={row.key} />
      </div>
      <div className="lv-vault-chips" aria-label={`コード: ${allChords}`}>
        {chords.slice(0, progressionPreviewChordLimit).map((item, index) => (
          <span
            key={item.eventId ?? index}
            className="lv-vault-chip"
            data-current={playing && current === index}
            data-match={Boolean(match && index >= match.start && index <= match.end)}
            title={degrees[index] ? `${item.chord.label}（${degrees[index]}）` : item.chord.label}
          >
            {item.chord.label}
            {showDegrees && degrees[index] ? <small>{degrees[index]}</small> : null}
          </span>
        ))}
        {chords.length > progressionPreviewChordLimit ? <span className="lv-vault-chip-more">…</span> : null}
      </div>
      <div className="lv-vault-actions" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
        <IconButton
          variant="ghost"
          className={pinned ? "text-[var(--lv-accent)]" : "text-[var(--lv-text-muted)]"}
          aria-pressed={pinned}
          onClick={onPin}
          label={pinned ? copy.library.removeFavorite : copy.library.addFavorite}
        >
          <FavoriteIcon size={16} fill={pinned ? "currentColor" : "none"} />
        </IconButton>
        <IconButton variant="ghost" className="text-[var(--lv-text-muted)]" onClick={onCopy} label={copy.library.copyProgression}>
          <Copy aria-hidden="true" size={16} />
        </IconButton>
        <IconButton
          variant="ghost"
          className="text-[var(--lv-text-muted)]"
          onClick={(event) => {
            if (event.detail > 1) return;
            onOpen();
          }}
          label={copy.library.openProgression}
        >
          <ChevronRight aria-hidden="true" size={20} />
        </IconButton>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}月${date.getDate()}日`;
}
function sourceOf(row: VaultRow): PlayingSource { return { kind: "vault", id: `idea:${row.idea.id}:block:${row.block.id}` }; }
function requestOf(row: VaultRow, sound: PreviewSound) {
  return {
    type: "timeline" as const,
    timeline: row.block.chords,
    bpm: row.bpm,
    sound,
    beatsPerBar: beatsPerBar(row.block.timeSignature),
    explicitMidiNotesByEventId: resolveTimelineVoicings(row.block.chords, Boolean(row.block.textSource)),
  };
}
