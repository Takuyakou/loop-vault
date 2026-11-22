import { displayChordLabel, displayDegreeLabel } from "../ui/chordText";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import { playbackController, samePlaybackSource, type PlayingSource } from "../audio/playbackController";
import type { PreviewSound } from "../audio/chordPreview";
import { FavoriteIcon, PlayIcon, SearchIcon, StopIcon } from "../components/icons";
import { FirstCaptureGuide } from "../components/FirstCaptureGuide";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { PracticeProgressBadge } from "../components/practice/PracticeProgressBadge";
import { ProgressionMidiControl } from "../components/ProgressionMidiControl";
import { Button, EmptyState, FavoriteDots, IconButton, Popover, useTransientFlag } from "../components/ui";
import { displayKey } from "../domain/displayLabels";
import { LoopRoll } from "./home/LoopRoll";
import { degreeOf } from "../domain/harmony/degrees";
import { beatsPerBar } from "../domain/midi";
import { buildProgressionMidi } from "../domain/midiExport";
import { buildProgressionIndex } from "../domain/progressionClassification/mod";
import { formatProgressionText } from "../domain/progressionText";
import { splitProgressionMemo } from "../domain/progressionWorkspace/progressionWorkspace";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import { usePlaybackState } from "../hooks/usePlaybackState";
import type { AppCopy } from "../i18n";
import { isProgressionMidiExportEnabled } from "../midiExport/featureFlag";
import { buildVaultChordContextSnapshot } from "../features/bass-practice/domain";
import { Check, ChevronDown, ChevronRight, Copy, Pencil } from "lucide-react";
import { loadPracticeOpens } from "./home/practiceOpens";
import { useTimelinePlayhead } from "./home/timelinePlayhead";
import { auditionSavedChord } from "./chordAudition";
import { FULL_NAME_CHARS, groupChords, groupWidth, layoutChordBand, type ChordBandGroup } from "./vault/chordBand";
import { previewRequestOf } from "./vault/progressionPreviewRequest";
import { progressionSourceLabels } from "./vault/progressionFacts";
import { useVaultKeyboardSelection } from "./vault/useVaultKeyboardSelection";
import { useVaultLibraryFilters } from "./vault/useVaultLibraryFilters";
import {
  ideasWithoutProgressions,
  lengthBucketLabels,
  lengthBuckets,
  sourceKinds,
  vaultSortLabels,
  type VaultMatch,
  type VaultRow,
  type VaultSort,
} from "./vault/vaultLibrary";
import { chordRoles, KEY_BAND, keyCellCounts, keysInCell, sameMotion, selectedKeyCell, tagLabel } from "./vault/vaultShape";

type Entry = { row: VaultRow; match?: VaultMatch };

/** Above this many rows only the rows in view are drawn. */
const progressionVirtualizationThreshold = 50;
/** P23-10 V2: one row is 58px. P23-59-fix-3 §1c: the date headings are gone, so every item is a row. */
const ROW_HEIGHT = 58;
const VIRTUAL_VIEWPORT_HEIGHT = 560;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function VaultView({
  ideas, storedIdeas = ideas, openDetail, openProgression, openCapture, openTextCapture, updateProgressionBlock, setToast, copy, showRomanNumerals,
  openVoicingLoop, openChordDojo, openBassPractice, keyRequest, onKeyRequestDone,
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
  /** V8: 「Voicing Loop で弾く」. */
  openVoicingLoop?: (reference: { ideaId: string; blockId: string }) => void;
  /** V8: 「Chord Dojo で覚える」. */
  openChordDojo?: (reference: { ideaId: string; blockId: string }) => void;
  /** P23-58 B3: 「Bass Practice でベースを弾く」. */
  openBassPractice?: (reference: { ideaId: string; blockId: string }) => void;
  /** V12: open with the key filter on this key band cell (`major:0` …). */
  keyRequest?: string;
  onKeyRequestDone?: () => void;
}) {
  const { sound: previewSound } = usePreviewSound();
  const progressionIndex = useMemo(() => buildProgressionIndex(ideas), [ideas]);
  const library = useVaultLibraryFilters(ideas, progressionIndex);
  const { visible, query, setQuery } = library;
  const [autoPlay, setAutoPlay] = useState(false);
  const orphans = useMemo(() => ideasWithoutProgressions(ideas)
    .filter((idea) => !query.trim() || idea.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [ideas, query]);

  // V12: the Home's 「ほか n 件を Vault で見る」 opens the Vault on one key.
  const { rows: allRows, setKeys } = library;
  useEffect(() => {
    if (!keyRequest) return;
    setKeys(keysInCell(keyRequest, new Set(allRows.flatMap((row) => (row.key ? [row.key] : [])))));
    onKeyRequestDone?.();
  }, [allRows, keyRequest, onKeyRequestDone, setKeys]);

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

  const copyProgression = useCallback(async ({ row }: Entry): Promise<boolean> => {
    if (!navigator.clipboard?.writeText) {
      setToast(copy.library.copyFailed);
      return false;
    }
    try {
      await navigator.clipboard.writeText(formatProgressionText(row.block.chords));
      setToast(copy.library.copiedProgression);
      return true;
    } catch {
      setToast(copy.library.copyFailed);
      return false;
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
  const selected = visible[selectedIndex];

  // V6: while 「選ぶと鳴らす」 is on, choosing a row (click or ↑↓) plays it. Switching on does not play:
  // the row chosen at that moment counts as already heard, so only a new selection sounds.
  const selectedId = selected?.row.id;
  const autoPlayTarget = useRef({ selected, previewSound });
  autoPlayTarget.current = { selected, previewSound };
  const lastAutoPlayed = useRef<string>();
  const autoPlayWasOn = useRef(false);
  useEffect(() => {
    if (!autoPlay) {
      autoPlayWasOn.current = false;
      lastAutoPlayed.current = undefined;
      return;
    }
    if (!autoPlayWasOn.current) {
      autoPlayWasOn.current = true;
      lastAutoPlayed.current = selectedId;
      return;
    }
    const { selected: target, previewSound: sound } = autoPlayTarget.current;
    if (!target || lastAutoPlayed.current === selectedId) return;
    lastAutoPlayed.current = selectedId;
    void playbackController.play(sourceOf(target.row), requestOf(target.row, sound))
      .catch((error: unknown) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed));
  }, [autoPlay, copy.toast.chordPreviewFailed, selectedId, setToast]);

  const clearAll = () => {
    library.clearFilters();
    setQuery("");
  };
  const filtered = library.activeCount > 0 || query.trim() !== "";
  const keyCounts = useMemo(() => keyCellCounts(library.counts.keys), [library.counts.keys]);
  const keyCell = selectedKeyCell(library.filters.keys);
  const chooseKeyCell = (cell: string) => setKeys(cell === keyCell ? [] : keysInCell(cell, library.counts.keys.keys()));

  return (
    <div className="lv-vault">
      <div className="lv-vault-layout" data-preview={selected ? "true" : undefined}>
        <div className="lv-vault-main">
          <div className="lv-vault-toolbar">
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
              {/* P23-47-fix-4: the key that jumps to this box, while it is empty and not focused. */}
              <kbd className="lv-kbd lv-vault-search-key" aria-hidden="true">/</kbd>
            </label>
            <button
              type="button"
              className="lv-vault-auto"
              aria-pressed={autoPlay}
              title="行を選んだら、その進行を鳴らします。↑↓ で次々に聴けます"
              onClick={() => setAutoPlay((value) => !value)}
            >
              <span className="lv-vault-auto-mark" aria-hidden="true" />選ぶと鳴らす
            </button>
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

          {library.total ? (
            <KeyBand counts={keyCounts} active={keyCell} onChoose={chooseKeyCell} onClear={() => setKeys([])} />
          ) : null}

          {library.total ? (
            <div className="lv-vault-facets" data-testid="vault-facets">
              <button
                type="button"
                className="lv-vault-facet"
                aria-pressed={library.filters.favorite}
                onClick={() => library.setFavorite(!library.filters.favorite)}
              >
                <FavoriteIcon size={16} fill={library.filters.favorite ? "currentColor" : "none"} />
                お気に入り <b>{library.counts.favorite}</b>
              </button>
              <FacetMenu
                name="取り込み元"
                values={sourceKinds.map((source) => ({ value: source, label: progressionSourceLabels[source], count: library.counts.sources.get(source) ?? 0 }))}
                selected={library.filters.sources}
                onToggle={(value) => library.toggle("sources", value as (typeof sourceKinds)[number])}
              />
              <FacetMenu
                name="長さ"
                values={lengthBuckets.map((bucket) => ({ value: bucket, label: lengthBucketLabels[bucket], count: library.counts.lengths.get(bucket) ?? 0 }))}
                selected={library.filters.lengths}
                onToggle={(value) => library.toggle("lengths", value as (typeof lengthBuckets)[number])}
              />
              <FacetMenu
                name="タグ"
                values={[...library.counts.tags.entries()]
                  .sort((left, right) => right[1] - left[1] || tagLabel(left[0]).localeCompare(tagLabel(right[0]), "ja"))
                  .map(([tag, count]) => ({ value: tag, label: tagLabel(tag), count }))}
                selected={library.filters.tags}
                onToggle={(value) => library.toggle("tags", value)}
              />
              {filtered ? (
                <button type="button" className="lv-vault-facet-clear" onClick={clearAll}>すべて外す</button>
              ) : null}
              <span className="flex-1" />
              <span className="lv-vault-count" role="status" aria-live="polite" aria-atomic="true">
                {visible.length === library.total ? `${library.total}件` : `${visible.length} / ${library.total}件`}
              </span>
            </div>
          ) : null}

          {visible.length ? (
            <ProgressionRows
              entries={visible}
              selectedIndex={selectedIndex}
              showDegrees={showRomanNumerals}
              copy={copy}
              onSelect={setSelectedIndex}
              onOpen={openEntry}
              onPin={togglePin}
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

        {selected ? (
          <ProgressionPreview
            key={selected.row.id}
            entry={selected}
            rows={allRows}
            showDegrees={showRomanNumerals}
            sound={previewSound}
            onSelectRow={(id) => {
              const index = visible.findIndex((entry) => entry.row.id === id);
              if (index >= 0) setSelectedIndex(index);
            }}
            onOpen={() => openEntry(selected)}
            onCopy={() => copyProgression(selected)}
            onVoicingLoop={openVoicingLoop ? () => openVoicingLoop({ ideaId: selected.row.idea.id, blockId: selected.row.block.id }) : undefined}
            onChordDojo={openChordDojo ? () => openChordDojo({ ideaId: selected.row.idea.id, blockId: selected.row.block.id }) : undefined}
            onBassPractice={openBassPractice ? () => openBassPractice({ ideaId: selected.row.idea.id, blockId: selected.row.block.id }) : undefined}
            setToast={setToast}
            onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
          />
        ) : null}
      </div>
    </div>
  );
}

/** V1: the 24 keys with their progression counts; one key at a time. */
function KeyBand({ counts, active, onChoose, onClear }: {
  counts: ReadonlyMap<string, number>;
  active?: string;
  onChoose: (cell: string) => void;
  onClear: () => void;
}) {
  const most = Math.max(1, ...counts.values());
  return (
    <div className="lv-vault-keys" role="group" aria-label="キーで絞る" data-testid="vault-key-band">
      {(["major", "minor"] as const).map((mode) => (
        <div key={mode} className="lv-vault-key-row">
          <span className="lv-vault-key-cap">{mode === "major" ? "メジャー" : "マイナー"}</span>
          <div className="lv-vault-key-cells">
            {KEY_BAND[mode].map((cell) => {
              const count = counts.get(cell.id) ?? 0;
              return (
                <button
                  key={cell.id}
                  type="button"
                  className="lv-vault-key-cell"
                  data-key-cell={cell.id}
                  aria-pressed={active === cell.id}
                  aria-label={`${cell.name} ${count}件`}
                  title={`${cell.name} ${count}件`}
                  disabled={count === 0 && active !== cell.id}
                  style={{ "--lv-key-weight": count ? 0.12 + 0.5 * (count / most) : 0 } as CSSProperties}
                  onClick={() => onChoose(cell.id)}
                >
                  {cell.label}
                  {count ? <small>{count}</small> : null}
                </button>
              );
            })}
          </div>
          {mode === "major" && active ? (
            <button type="button" className="lv-vault-key-clear" onClick={onClear}>キーを外す</button>
          ) : <span className="lv-vault-key-clear-space" />}
        </div>
      ))}
    </div>
  );
}

/** V1: one facet (取り込み元・長さ・タグ) as a chip that opens its values. */
function FacetMenu({ name, values, selected, onToggle }: {
  name: string;
  values: { value: string; label: string; count: number }[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  const chosen = values.filter((entry) => selected.includes(entry.value)).map((entry) => entry.label);
  return (
    <Popover
      label={name}
      className="lv-vault-facet-menu"
      trigger={(props) => (
        <button type="button" className="lv-vault-facet" aria-pressed={selected.length > 0} {...props}>
          {name}{chosen.length ? `：${chosen.join("・")}` : ""}
          <ChevronDown aria-hidden="true" size={16} />
        </button>
      )}
    >
      <div className="lv-vault-facet-options">
        {values.length ? values.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className="lv-vault-option"
            aria-pressed={selected.includes(entry.value)}
            disabled={entry.count === 0 && !selected.includes(entry.value)}
            onClick={() => onToggle(entry.value)}
          >
            <span className="lv-vault-check" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">{entry.label}</span>
            <span className="lv-vault-option-count">{entry.count}</span>
          </button>
        )) : <p className="px-2 py-1 text-xs text-[var(--lv-text-muted)]">まだありません</p>}
      </div>
    </Popover>
  );
}

function OrphanIdeas({ ideas, openDetail }: { ideas: SongIdea[]; openDetail: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="lv-vault-orphans" aria-label="進行のない曲" data-testid="vault-orphan-ideas">
      <button type="button" className="lv-vault-orphans-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <ChevronRight aria-hidden="true" size={16} className={open ? "rotate-90" : ""} />
        進行のない曲（{ideas.length}件）
      </button>
      {open ? (
        <ul className="lv-vault-orphans-list">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <button type="button" className="lv-vault-orphan" onClick={() => openDetail(idea.id)}>
                <span className="min-w-0 flex-1 truncate">{idea.title || "無題の曲"}</span>
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
  onPreviewError: (error: unknown) => void;
}

type ListItem = { kind: "row"; entry: Entry; index: number };

/** P23-59-fix-3 §1c: the rows only (the 今週 / 今月 / それより前 headings are gone; each row carries its date). */
function listItems(entries: Entry[]): ListItem[] {
  return entries.map((entry, index) => ({ kind: "row", entry, index }));
}

function ProgressionRows({ entries, selectedIndex, onSelect, onOpen, onPin, ...rest }: RowsProps) {
  const items = useMemo(() => listItems(entries), [entries]);
  const render = (item: ListItem) => (
    <ProgressionRow
      key={item.entry.row.id}
      entry={item.entry}
      selected={item.index === selectedIndex}
      onSelect={() => onSelect(item.index)}
      onOpen={() => onOpen(item.entry)}
      onPin={() => onPin(item.entry)}
      {...rest}
    />
  );
  if (entries.length <= progressionVirtualizationThreshold) return <div className="lv-vault-list">{items.map(render)}</div>;
  return <VirtualizedProgressionRows items={items} selectedIndex={selectedIndex} render={render} />;
}

/** Only the rows in view are drawn; every row has the same height, so every offset is known. */
function VirtualizedProgressionRows({ items, selectedIndex, render }: {
  items: ListItem[];
  selectedIndex: number;
  render: (item: ListItem) => ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const offsets = useMemo(() => items.map((_, position) => position * ROW_HEIGHT), [items]);
  const total = items.length * ROW_HEIGHT;
  const overscan = 6 * ROW_HEIGHT;
  const shown = items.map((item, position) => ({ item, top: offsets[position]! }))
    .filter(({ top }) => top + ROW_HEIGHT >= scrollTop - overscan && top <= scrollTop + VIRTUAL_VIEWPORT_HEIGHT + overscan);

  // Keep the keyboard-selected row in view.
  useEffect(() => {
    const viewport = viewportRef.current;
    const position = items.findIndex((item) => item.kind === "row" && item.index === selectedIndex);
    if (!viewport || position < 0) return;
    const rowTop = offsets[position]!;
    if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop;
    else if (rowTop + ROW_HEIGHT > viewport.scrollTop + VIRTUAL_VIEWPORT_HEIGHT) viewport.scrollTop = rowTop + ROW_HEIGHT - VIRTUAL_VIEWPORT_HEIGHT;
  }, [items, offsets, selectedIndex]);

  return (
    <div
      ref={viewportRef}
      className="lv-vault-list overflow-y-auto"
      style={{ height: VIRTUAL_VIEWPORT_HEIGHT }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      data-virtualized="true"
      data-row-height={ROW_HEIGHT}
    >
      <div className="relative" style={{ height: total }}>
        {shown.map(({ item, top }) => (
          <div
            key={item.entry.row.id}
            className="absolute inset-x-0"
            style={{ top, height: ROW_HEIGHT }}
          >
            {render(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressionRow({ entry, selected, showDegrees, copy, onSelect, onOpen, onPin, onPreviewError }: {
  entry: Entry;
  selected: boolean;
  showDegrees: boolean;
  copy: AppCopy;
  onSelect: () => void;
  onOpen: () => void;
  onPin: () => void;
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
  const roles = useMemo(() => chordRoles(row.block, row.key), [row.block, row.key]);
  const allChords = chords.map((item) => item.chord.label).join(" · ");
  const meta = [row.key ? keyName(row.key) : "キーなし", `${row.bars}小節`].join(" · ");
  const pinned = Boolean(row.block.pinned);
  const [favPop, triggerFavPop, clearFavPop] = useTransientFlag(300);
  // V2: the first click chooses the row (its contents show on the right); a click on the chosen row, or a double click, opens it.
  const press = (event: MouseEvent) => {
    if (event.detail > 1) return;
    if (selected) onOpen();
    else onSelect();
  };
  return (
    <div
      data-selected={selected}
      data-playing={playing}
      data-row-id={row.id}
      className="lv-vault-row"
      onClick={press}
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
      <button
        type="button"
        className="lv-vault-progression"
        aria-current={selected ? "true" : undefined}
        title={`${row.name} — ${allChords}`}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }}
      >
        <span className="lv-vault-progression-primary">{row.name}</span>
        {match?.kind === "degree" ? (
          <span className="lv-vault-match" data-testid="vault-degree-match">
            度数で一致：{degrees.slice(match.start, match.end + 1).map((degree) => displayDegreeLabel(degree)).join(" → ")}（{match.start + 1}〜{match.end + 1}番目のコード）
          </span>
        ) : (
          <span className="lv-vault-progression-secondary">
            <span className="lv-vault-source" data-source={row.source}>{progressionSourceLabels[row.source]}</span>
            {meta}
          </span>
        )}
      </button>
      <ChordBand
        row={row}
        match={match}
        current={playing ? current : -1}
        degrees={showDegrees ? degrees : undefined}
        roles={roles}
        label={`コード: ${allChords}`}
        sound={previewSound}
        onPreviewError={onPreviewError}
      />
      <div className="lv-vault-actions" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
        <IconButton
          variant="ghost"
          className={`lv-fav-btn ${pinned ? "text-[var(--lv-accent)]" : "text-[var(--lv-text-muted)]"}`}
          data-pop={favPop ? "true" : undefined}
          aria-pressed={pinned}
          onClick={() => {
            if (!pinned) triggerFavPop();
            else clearFavPop();
            onPin();
          }}
          label={pinned ? copy.library.removeFavorite : copy.library.addFavorite}
        >
          <FavoriteIcon size={16} fill={pinned ? "currentColor" : "none"} />
          <FavoriteDots />
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

/** One line of chord frames: width follows the chord's length, repeats merge, a click auditions, the role colours the frame's mark. */
function ChordBand({ row, match, current, degrees, roles, label, sound, onPreviewError }: {
  row: VaultRow;
  match?: VaultMatch;
  /** Index of the chord the row's timeline is on, -1 when it is not playing. */
  current: number;
  degrees?: (string | undefined)[];
  roles: string[];
  label: string;
  sound: PreviewSound;
  onPreviewError: (error: unknown) => void;
}) {
  const groups = useMemo(() => groupChords(row.block.chords), [row.block.chords]);
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const degreeOfGroup = (group: ChordBandGroup) => degrees?.[group.first];
  const { shown, restBars } = layoutChordBand(groups, width ?? Number.POSITIVE_INFINITY, row.bars, degreeOfGroup);
  const playback = usePlaybackState();
  return (
    <div ref={ref} className="lv-vault-chips" aria-label={label} data-degrees={Boolean(degrees) || undefined}>
      {groups.slice(0, shown).map((group) => {
        const source: PlayingSource = { kind: "vault", id: `vault-chord:${row.id}:${group.first}` };
        const auditioning = playback.status !== "idle" && samePlaybackSource(playback.source, source);
        const degree = degreeOfGroup(group);
        return (
          <button
            key={group.first}
            type="button"
            className="lv-vault-chip"
            style={{ width: groupWidth(group, degree) }}
            data-fn={roles[group.first] || undefined}
            data-current={group.indices.includes(current) || auditioning}
            data-match={Boolean(match && group.indices.some((index) => index >= match.start && index <= match.end))}
            aria-label={`${group.label} を試聴`}
            title={group.label.length > FULL_NAME_CHARS ? group.label : undefined}
            onClick={(event) => {
              event.stopPropagation();
              void auditionSavedChord(row.block, group.first, source, sound).catch(onPreviewError);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <span className="lv-vault-chip-name">
              <span className="lv-vault-chip-label">{displayChordLabel(group.label)}</span>
              {group.indices.length > 1 ? <span className="lv-vault-chip-count">×{group.indices.length}</span> : null}
            </span>
            {degree ? <small className="lv-vault-chip-degree">{displayDegreeLabel(degree)}</small> : null}
          </button>
        );
      })}
      {restBars ? <span className="lv-vault-chip-more">+{restBars}小節</span> : null}
    </div>
  );
}

/** V2・V7・V8: the chosen progression's contents on the right. */
function ProgressionPreview({ entry, rows, showDegrees, sound, onSelectRow, onOpen, onCopy, onVoicingLoop, onChordDojo, onBassPractice, setToast, onPreviewError }: {
  entry: Entry;
  rows: readonly VaultRow[];
  showDegrees: boolean;
  sound: PreviewSound;
  onSelectRow: (id: string) => void;
  onOpen: () => void;
  onCopy: () => boolean | Promise<boolean> | void;
  onVoicingLoop?: () => void;
  onChordDojo?: () => void;
  onBassPractice?: () => void;
  setToast: (toast: string) => void;
  onPreviewError: (error: unknown) => void;
}) {
  const { row } = entry;
  const source = sourceOf(row);
  const playback = usePlaybackState();
  const playing = playback.status !== "idle" && samePlaybackSource(playback.source, source);
  const current = useTimelinePlayhead(source, row.block.chords, row.bpm, beatsPerBar(row.block.timeSignature));
  const [copied, triggerCopied, clearCopied] = useTransientFlag(1100);
  useEffect(() => { clearCopied(); }, [row.id, clearCopied]);
  const roles = useMemo(() => chordRoles(row.block, row.key), [row.block, row.key]);
  const same = useMemo(() => sameMotion(row, rows), [row, rows]);
  const opens = useMemo(() => {
    const since = Date.now() - WEEK_MS;
    return loadPracticeOpens().filter((open) => open.ideaId === row.idea.id && open.blockId === row.block.id && Date.parse(open.at) > since).length;
  }, [row.block.id, row.idea.id]);
  const memo = splitProgressionMemo(row.block.memo).free;
  const [midiExportEnabled] = useState(isProgressionMidiExportEnabled);
  const midiExport = useMemo(() => {
    if (!midiExportEnabled) return undefined;
    try {
      return { result: buildProgressionMidi(row.block, { ideaBpm: row.idea.bpm }) };
    } catch {
      return { disabledReason: "この進行はMIDIに書き出せません。" };
    }
  }, [midiExportEnabled, row.block, row.idea.bpm]);
  const bassPracticeUsable = useMemo(() => {
    if (!onBassPractice) return false;
    return buildVaultChordContextSnapshot({
      sourceReference: { ideaId: row.idea.id, blockId: row.block.id },
      block: row.block,
    }).ok;
  }, [onBassPractice, row.block, row.idea.id]);
  const meta = [
    row.key ? keyName(row.key) : "キーなし",
    row.bpm ? `${row.bpm} BPM` : "BPM なし",
    `${row.bars}小節`,
    progressionSourceLabels[row.source],
    `${formatDate(row.block.capturedAt)}に保存`,
  ];
  return (
    <aside className="lv-vault-preview" aria-label="選んだ進行" data-testid="vault-preview">
      <div className="lv-vault-preview-body">
        <h2 className="lv-vault-preview-title">{row.name}</h2>
        <p className="lv-vault-preview-meta">{meta.map((part) => <span key={part}>{part}</span>)}</p>
        <div className="lv-vault-preview-play">
          <button
            type="button"
            className="lv-vault-preview-play-button"
            aria-label={playing ? "この進行を止める" : "この進行を試聴"}
            aria-pressed={playing}
            onClick={() => void playbackController.toggle(source, requestOf(row, sound)).catch(onPreviewError)}
          >
            {playing ? <StopIcon size={20} /> : <PlayIcon size={20} />}
          </button>
          <span className="text-xs text-[var(--lv-text-muted)]">コードを押すと、その音が鳴ります</span>
        </div>
        <div className="lv-vault-preview-chords">
          {row.block.chords.map((item, index) => {
            const chordSource: PlayingSource = { kind: "vault", id: `vault-preview:${row.id}:${index}` };
            const degree = degreeOf(item.chord, row.key)?.label;
            return (
              <button
                key={item.eventId ?? `${item.bar}:${item.beat}:${index}`}
                type="button"
                className="lv-vault-preview-chord"
                data-fn={roles[index] || undefined}
                data-current={playing && current === index}
                aria-label={`${item.chord.label} を鳴らす`}
                onClick={() => void auditionSavedChord(row.block, index, chordSource, sound).catch(onPreviewError)}
              >
                {showDegrees && degree ? <small>{displayDegreeLabel(degree)}</small> : <small aria-hidden="true">&nbsp;</small>}
                <b>{displayChordLabel(item.chord.label)}</b>
              </button>
            );
          })}
        </div>
        <div className="lv-vault-preview-roll">
          <LoopRoll block={row.block} limit={row.block.chords.length} source={source} current={current} bpm={row.bpm} beatsPerBar={beatsPerBar(row.block.timeSignature)} />
        </div>
        <dl className="lv-vault-preview-facts">
          <div>
            <dt>Chord Dojo</dt>
            <dd className="lv-vault-preview-dojo"><PracticeProgressBadge block={row.block} effectiveKeySignature={row.key} /></dd>
          </div>
          <div>
            <dt>この 1 週間で開いた</dt>
            <dd>{opens} 回</dd>
          </div>
        </dl>
        {row.tags.length ? (
          <section aria-label="タグ">
            <h3 className="lv-vault-preview-section">タグ</h3>
            <p className="lv-vault-preview-tags">{row.tags.map((tag) => <span key={tag} className="lv-vault-tag">{tagLabel(tag)}</span>)}</p>
          </section>
        ) : null}
        {memo ? (
          <section aria-label="メモ">
            <h3 className="lv-vault-preview-section">メモ</h3>
            <p className="lv-vault-preview-memo">{memo}</p>
          </section>
        ) : null}
        {same.length ? (
          <section aria-label="同じ動きの進行" data-testid="vault-same-motion">
            <h3 className="lv-vault-preview-section">同じ動きの進行（キー違い）</h3>
            <ul className="lv-vault-same">
              {same.map((other) => (
                <li key={other.id}>
                  <button type="button" className="lv-vault-same-row" onClick={() => onSelectRow(other.id)}>
                    <span className="min-w-0 flex-1 truncate">{other.name}</span>
                    <span className="text-[11px] text-[var(--lv-text-muted)]">{other.key ? keyName(other.key) : "キーなし"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <div className="lv-vault-preview-actions">
        {midiExport ? (
          <ProgressionMidiControl
            label="MIDI を DAW へドラッグ"
            result={midiExport.result}
            disabledReason={midiExport.disabledReason}
            setToast={(message) => setToast(message)}
          />
        ) : null}
        <div className="lv-vault-preview-two">
          <Button variant="neutral" onClick={onOpen} title="進行のページを開きます。コード名・音・タグ・メモを直して保存できます">
            <Pencil aria-hidden="true" size={16} />開いて編集
          </Button>
          <Button
            variant="neutral"
            data-copied={copied ? "true" : undefined}
            onClick={() => {
              void Promise.resolve(onCopy()).then((ok) => {
                if (ok !== false) triggerCopied();
              });
            }}
          >
            <span className="lv-copy-icon" aria-hidden="true">
              {copied ? <Check className="lv-copy-icon-ok" size={16} /> : <Copy size={16} />}
            </span>
            コードをコピー
          </Button>
        </div>
        {onVoicingLoop || onChordDojo || (bassPracticeUsable && onBassPractice) ? (
          <div className="lv-vault-go-group" role="group" aria-labelledby="lv-vault-go-head">
            <p className="lv-vault-go-head" id="lv-vault-go-head">練習で使う</p>
            <div className="lv-vault-go-row">
              {onVoicingLoop ? (
                <Button variant="neutral" className="lv-vault-go" onClick={onVoicingLoop}>
                  <span className="lv-vault-go-mark" data-kind="vl" aria-hidden="true">VL</span><span className="lv-vault-go-name">Voicing Loop<span className="lv-vault-go-verb"> で弾く</span></span><ChevronRight aria-hidden="true" size={16} />
                </Button>
              ) : null}
              {onChordDojo ? (
                <Button variant="neutral" className="lv-vault-go" onClick={onChordDojo}>
                  <span className="lv-vault-go-mark" data-kind="cd" aria-hidden="true">CD</span><span className="lv-vault-go-name">Chord Dojo<span className="lv-vault-go-verb"> で覚える</span></span><ChevronRight aria-hidden="true" size={16} />
                </Button>
              ) : null}
              {bassPracticeUsable && onBassPractice ? (
                <Button variant="neutral" className="lv-vault-go" data-testid="vault-go-bass" onClick={onBassPractice}>
                  <span className="lv-vault-go-mark" data-kind="bp" aria-hidden="true">BP</span><span className="lv-vault-go-name">Bass Practice<span className="lv-vault-go-verb"> でベースを弾く</span></span><ChevronRight aria-hidden="true" size={16} />
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/** The element's content width, kept current; undefined until measured (and without ResizeObserver). */
function useElementWidth(ref: RefObject<HTMLElement | null>): number | undefined {
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => setWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}月${date.getDate()}日`;
}
function sourceOf(row: VaultRow): PlayingSource { return { kind: "vault", id: `idea:${row.idea.id}:block:${row.block.id}` }; }
function requestOf(row: VaultRow, sound: PreviewSound) {
  return previewRequestOf(row.block, row.bpm, sound);
}

/** P23-15 Z2: 「E♭メジャー」「F♯マイナー」, as the key band shows the names. */
function keyName(key: string): string {
  return displayChordLabel(displayKey(key) ?? key);
}
