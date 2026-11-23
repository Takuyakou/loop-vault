import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FavoriteIcon, PlayIcon, SearchIcon } from "../../components/icons";
import { Button, EmptyState, FavoriteDots, PlayingMark, ResumeBand, ResumeGoButton, Surface, useTransientFlag } from "../../components/ui";
import { auditionSavedChord } from "../chordAudition";
import { playbackController, samePlaybackSource, type PlayingSource } from "../../audio/playbackController";
import type { PreviewSound } from "../../audio/chordPreview";
import { beatsPerBar } from "../../domain/midi";
import { usePlaybackState } from "../../hooks/usePlaybackState";
import { displayChordLabel, displayDegreeLabel } from "../../ui/chordText";
import { displayKey } from "../../domain/displayLabels";
import { voicingLoopSourceId, type ProgressionPracticeSourceReference, type VoicingLoopSection, type VoicingLoopVaultCandidate } from "../../domain/progressionVoicingPractice";
import type { LastVoicingPractice } from "../../voicingPractice/lastPractice";
import type { VoicingLoopText } from "../ProgressionVoicingPracticeView";
import { LoopRoll } from "../home/LoopRoll";
import { previewRequestOf } from "../vault/progressionPreviewRequest";

/** P23-29: how many chord chips a row shows before 「…」. */
const ROW_CHORDS = 5;

export interface VoicingLoopPickerProps {
  readonly text: VoicingLoopText;
  readonly candidates: readonly VoicingLoopVaultCandidate[];
  readonly sections: readonly VoicingLoopSection[];
  /** The search results (already in the picker's order); empty when nothing matches. */
  readonly results: readonly VoicingLoopVaultCandidate[];
  readonly query: string;
  readonly trimmedQuery: string;
  readonly onQueryChange: (value: string) => void;
  readonly favoriteOf: (candidate: VoicingLoopVaultCandidate) => boolean;
  readonly onToggleFavorite: (candidate: VoicingLoopVaultCandidate) => void;
  readonly favoriteCount: number;
  readonly favoriteNotice?: string;
  readonly lastPractice?: LastVoicingPractice;
  /** Starts the practice of one progression (the old row's 「練習する」). */
  readonly onPractice: (candidate: VoicingLoopVaultCandidate) => void;
  readonly onOpenInVault?: (reference: ProgressionPracticeSourceReference) => void;
  readonly onEnterText: () => void;
  readonly onImportMidi?: () => void;
  readonly sound: PreviewSound;
  readonly onPreviewError: (error: unknown) => void;
  readonly showDegrees: boolean;
  readonly onPrepareAudio: () => void;
}

/**
 * P23-29: the Voicing Loop's progression picker — 「続きから」 (L1), the tool row (L2), the sections (L3),
 * the two columns (L4), the row shape (L5) and the selection rules (L6, L6b, L8, L9).
 */
export function VoicingLoopPicker({
  text, candidates, sections, results, query, trimmedQuery, onQueryChange, favoriteOf, onToggleFavorite,
  favoriteCount, favoriteNotice, lastPractice, onPractice, onOpenInVault, onEnterText, onImportMidi,
  sound, onPreviewError, showDegrees, onPrepareAudio,
}: VoicingLoopPickerProps) {
  const [filter, setFilter] = useState<"all" | "favorites" | "recent">("all");
  const [selectedId, setSelectedId] = useState<string>();
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const playable = (candidate: VoicingLoopVaultCandidate) => !candidate.unavailableReason;
  const visibleSections = useMemo<readonly VoicingLoopSection[]>(() => {
    if (trimmedQuery) return results.length ? [{ kind: "others", candidates: results }] : [];
    if (filter === "all") return sections;
    return sections.filter((section) => section.kind === filter);
  }, [filter, results, sections, trimmedQuery]);
  const visible = useMemo(() => visibleSections.flatMap((section) => [...section.candidates]), [visibleSections]);
  /** L8: the first playable row means the list's own order (favourites, recent, the rest), not the prop's. */
  const listedCandidates = useMemo(
    () => sections.flatMap((section) => [...section.candidates]),
    [sections],
  );
  const playableVisible = useMemo(() => visible.filter(playable), [visible]);
  const visibleKey = playableVisible.map((candidate) => candidate.id).join("|");
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  const selectedPlayable = selected && playable(selected) ? selected : undefined;

  /** L1: the 続きから band — only while the last practiced progression still exists and can be practiced. */
  const resumeCandidate = lastPractice
    ? candidates.find((candidate) => candidate.id === voicingLoopSourceId(lastPractice.reference) && playable(candidate))
    : undefined;

  // L8: the first pick is the 続きから progression, else the first playable row of the list.
  useEffect(() => {
    if (selectedId && candidates.some((candidate) => candidate.id === selectedId)) return;
    setSelectedId(resumeCandidate?.id ?? (listedCandidates.length ? listedCandidates : candidates).find(playable)?.id);
  }, [candidates, listedCandidates, resumeCandidate, selectedId]);

  // L6b: when the chosen row leaves the visible list (search or a filter), choose the first playable row.
  useEffect(() => {
    if (!selectedId) return;
    if (visible.some((candidate) => candidate.id === selectedId)) return;
    setSelectedId(playableVisible[0]?.id);
  }, [filter, trimmedQuery, visibleKey]);

  // P23-47-fix-4: picking another row stops the 試聴 of the row picked before (the button or Space).
  useEffect(() => {
    const playing = playbackController.getState().source?.id;
    if (playing?.startsWith(PREVIEW_SOURCE_PREFIX) && playing !== `${PREVIEW_SOURCE_PREFIX}${selectedId ?? ""}`) playbackController.stop();
  }, [selectedId]);

  // Keep the keyboard's place on screen (jsdom has no scrollIntoView).
  useEffect(() => {
    if (selectedId) rowRefs.current.get(selectedId)?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  const move = (delta: number) => {
    if (!playableVisible.length) return;
    const current = playableVisible.findIndex((candidate) => candidate.id === selectedId);
    const next = current < 0
      ? (delta > 0 ? 0 : playableVisible.length - 1)
      : Math.max(0, Math.min(playableVisible.length - 1, current + delta));
    setSelectedId(playableVisible[next]!.id);
  };

  // L6: the first press picks the row; pressing the picked row again starts the practice.
  const pickRow = (candidate: VoicingLoopVaultCandidate) => {
    if (!playable(candidate)) return;
    if (selectedId === candidate.id) onPractice(candidate);
    else setSelectedId(candidate.id);
  };

  // L9: Space and Enter belong to the search box while it has the keyboard.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target;
      // L9: the search box keeps Space and Enter; a focused control keeps its own Enter/Space.
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable], [role='dialog'], button, a[href], summary, [role='button'], [role='radio']")) return;
      if (event.key === "Enter") {
        event.preventDefault();
        if (selectedPlayable) onPractice(selectedPlayable);
        return;
      }
      if (event.key === " " && selectedPlayable?.block) {
        event.preventDefault();
        void playbackController.toggle(previewSourceOf(selectedPlayable), previewRequestOf(selectedPlayable.block, selectedPlayable.bpm, sound)).catch(onPreviewError);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        move(event.key === "ArrowDown" ? 1 : -1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const filterButton = (kind: "all" | "favorites" | "recent", label: string, count: number) => (
    <button key={kind} type="button" role="radio" aria-checked={filter === kind} data-testid={`voicing-loop-filter-${kind}`}
      className={`lv-vl-filter${filter === kind ? " is-on" : ""}`}
      onClick={() => setFilter(kind)}>
      {kind === "favorites" ? <FavoriteIcon aria-hidden="true" size={14} className="shrink-0" /> : null}
      {label}<span className="lv-vl-filter-count">{count}</span>
    </button>
  );
  const sectionLabels: Record<VoicingLoopSection["kind"], string> = {
    favorites: text.favorites, recent: text.recent, others: text.others,
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2" data-testid="voicing-loop-workspace" onPointerDownCapture={onPrepareAudio}>
      {/* P23-29: the screen is still named 「練習する進行」 for the outline and the screen readers (the mock's
          tool row has no visible title). */}
      <h2 className="sr-only">{text.chooseProgression}</h2>
      {resumeCandidate ? (
        <ResumeBand screen="vl" testId="voicing-loop-resume" label={text.resumeTitle}
          title={resumeCandidate.title}
          meta={resumeFacts(resumeCandidate, lastPractice, text)}>
          <ResumeGoButton label={text.resumeGo} data-testid="voicing-loop-resume-go" onClick={() => onPractice(resumeCandidate)} />
        </ResumeBand>
      ) : null}

      <Surface className="lv-vl-picker-tools flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2" data-testid="voicing-loop-picker-tools">
        <div className="inline-flex shrink-0 items-center gap-1" role="radiogroup" aria-label={text.filterLabel} data-testid="voicing-loop-filters">
          {filterButton("all", text.filterAll, candidates.length)}
          {filterButton("favorites", text.filterFavorites, favoriteCount)}
          {filterButton("recent", text.filterRecent, sections.find((section) => section.kind === "recent")?.candidates.length ?? 0)}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lv-text-muted)]" size={16} />
          <label className="sr-only" htmlFor="voicing-loop-progression-search">{text.search}</label>
          <input
            id="voicing-loop-progression-search"
            className="lv-field-control lv-vl-picker-search w-full min-w-0 pl-9 pr-3 text-sm"
            type="search"
            autoComplete="off"
            value={query}
            placeholder={text.searchPlaceholder}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      </Surface>

      <div className={`${candidates.length ? "lv-vl-picker-grid " : ""}grid min-h-0 min-w-0 flex-1 gap-2`}>
        <Surface className="lv-vl-picker-list flex min-h-0 min-w-0 flex-col overflow-hidden p-0" data-testid="voicing-loop-progression-list">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-2 py-2" tabIndex={0} aria-label={text.chooseProgression}>
            {favoriteCount === 0 && candidates.length ? (
              <p className="mb-2 flex items-center gap-1 text-xs text-[var(--lv-text-muted)]" data-testid="voicing-loop-favorite-hint">
                <FavoriteIcon aria-hidden="true" size={16} className="shrink-0" />
                <span>{text.favoriteHint}</span>
              </p>
            ) : null}
            {favoriteNotice ? (
              <p className="mb-2 text-xs text-[var(--lv-warning)]" role="status" data-testid="voicing-loop-favorite-notice">{favoriteNotice}</p>
            ) : null}
            {trimmedQuery && !visible.length ? (
              <p className="px-1 py-3 text-sm text-[var(--lv-text-secondary)]" role="status">{text.noMatches}</p>
            ) : null}
            {!trimmedQuery && !visible.length ? (
              <EmptyState
                className="mt-2"
                title={text.noSaved}
                description={text.noSavedBody}
                action={<div className="flex flex-wrap justify-center gap-2">
                  {onImportMidi ? <Button variant="secondary" onClick={onImportMidi}>{text.importMidi}</Button> : null}
                  <Button variant="secondary" onClick={onEnterText}>{text.enterTextShort}</Button>
                </div>}
              />
            ) : null}
            {visibleSections.map((section) => (
              <section key={section.kind} className="mb-2 min-w-0" data-testid={trimmedQuery ? "voicing-loop-section-results" : `voicing-loop-section-${section.kind}`}>
                {trimmedQuery ? (
                  <div className="flex min-w-0 items-baseline gap-2 px-1">
                    <h3 className="lv-vl-picker-title">{text.results}</h3>
                    <span className="shrink-0 text-xs text-[var(--lv-text-muted)]">{section.candidates.length}</span>
                  </div>
                ) : (
                  <div className="flex min-w-0 items-baseline gap-2 px-1">
                    <h3 className="lv-vl-picker-title">{sectionLabels[section.kind]}</h3>
                    <span className="shrink-0 text-xs text-[var(--lv-text-muted)]">{section.candidates.length}</span>
                  </div>
                )}
                <div className="mt-1 grid min-w-0 gap-1" role="list"
                  aria-label={trimmedQuery ? text.results : sectionLabels[section.kind]}>
                  {section.candidates.map((candidate) => (
                    <PickerRow key={candidate.id} candidate={candidate} selected={candidate.id === selectedId}
                      favorite={favoriteOf(candidate)} text={text}
                      day={dayOf(candidate, lastPractice, text)} showDegrees={showDegrees}
                      refCallback={(element) => { if (element) rowRefs.current.set(candidate.id, element); else rowRefs.current.delete(candidate.id); }}
                      onPick={() => pickRow(candidate)} onToggleFavorite={() => onToggleFavorite(candidate)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Surface>

        {/* L8: with no progression at all the old まだ進行がありません screen stays, and the right column is not drawn. */}
        {candidates.length ? (
          <Surface className="lv-vl-picker-preview flex min-h-0 min-w-0 flex-col overflow-hidden p-0" data-testid="voicing-loop-preview" aria-label={text.pickHint}>
            {selectedPlayable ? (
              <PickerPreview candidate={selectedPlayable} text={text} showDegrees={showDegrees}
                favorite={favoriteOf(selectedPlayable)} day={dayOf(selectedPlayable, lastPractice, text)}
                played={lastPractice && lastPractice.reference.ideaId === selectedPlayable.sourceReference.ideaId
                  && lastPractice.reference.blockId === selectedPlayable.sourceReference.blockId ? lastPractice.at : undefined}
                sound={sound} onPreviewError={onPreviewError} onPractice={() => onPractice(selectedPlayable)}
                onOpenInVault={onOpenInVault ? () => onOpenInVault(selectedPlayable.sourceReference) : undefined}
                onToggleFavorite={() => onToggleFavorite(selectedPlayable)} />
            ) : (
              <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1 p-6 text-center">
                <p className="text-sm font-semibold text-[var(--lv-text)]" data-testid="voicing-loop-preview-empty">{text.pickHint}</p>
                <p className="text-xs text-[var(--lv-text-secondary)]">{text.pickHintBody}</p>
              </div>
            )}
          </Surface>
        ) : null}
      </div>
    </div>
  );
}

/** One progression in the list (L5): ♥, title and the one-line facts, the role-coloured chord chips, the day. */
function PickerRow({
  candidate, selected, favorite, text, day, showDegrees, refCallback, onPick, onToggleFavorite,
}: {
  readonly candidate: VoicingLoopVaultCandidate;
  readonly selected: boolean;
  readonly favorite: boolean;
  readonly text: VoicingLoopText;
  readonly day: string;
  readonly showDegrees: boolean;
  readonly refCallback: (element: HTMLElement | null) => void;
  readonly onPick: () => void;
  readonly onToggleFavorite: () => void;
}) {
  const unavailable = candidate.unavailableReason ? unavailableLine(candidate.unavailableReason, text) : undefined;
  const unavailableFull = candidate.unavailableReason ? unavailableTitle(candidate.unavailableReason) : undefined;
  const [favPop, triggerFavPop, clearFavPop] = useTransientFlag(300);
  const chords = candidate.chordLabels;
  const shown = chords.slice(0, ROW_CHORDS);
  return (
    <div
      ref={refCallback}
      data-testid="voicing-loop-progression-row"
      data-selected={selected || undefined}
      data-unavailable={unavailable ? true : undefined}
      data-favorite={favorite}
      aria-current={selected ? "true" : undefined}
      aria-disabled={unavailable ? true : undefined}
      tabIndex={-1}
      role="listitem"
      className={`lv-vl-picker-row${selected ? " is-selected" : ""}${unavailable ? " is-off" : ""}`}
      onClick={onPick}
    >
      <button type="button" data-testid="voicing-loop-favorite" aria-pressed={favorite}
        aria-label={favorite ? text.favoriteRemove : text.favoriteAdd}
        title={favorite ? text.favoriteRemove : text.favoriteAdd}
        data-pop={favPop ? "true" : undefined}
        className={`lv-vl-row-heart lv-fav-btn${favorite ? " is-on" : ""}`}
        onClick={(event) => { event.stopPropagation(); if (!favorite) triggerFavPop(); else clearFavPop(); onToggleFavorite(); }}>
        <FavoriteIcon aria-hidden="true" size={16} fill={favorite ? "currentColor" : "none"} />
        <FavoriteDots />
      </button>
      <div className="min-w-0 flex-1" data-testid="voicing-loop-progression-choice">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-[var(--lv-text)]" title={candidate.title}>{candidate.title}</span>
        </p>
        <p className="lv-vl-row-facts flex min-w-0 items-center gap-1 truncate text-xs text-[var(--lv-text-secondary)]">
          {rowFacts(candidate, text).map((node, index) => (
            <Fragment key={index}>
              {index ? <span aria-hidden="true" className="lv-vl-sep">・</span> : null}
              {node}
            </Fragment>
          ))}
        </p>
        {unavailable ? (
          <p className="lv-vl-row-reason truncate text-xs text-[var(--lv-warning)]" data-testid="voicing-loop-progression-reason" title={unavailableFull}>{unavailable}</p>
        ) : (
          <div className="lv-vl-row-chords flex min-w-0 items-center gap-1 overflow-hidden" role="img"
            data-testid="voicing-loop-progression-chords"
            aria-label={chords.map(displayChordLabel).join(" → ")}>
            {shown.map((label, index) => {
              const role = candidate.chordRoles?.[index] ?? "";
              const degree = showDegrees ? candidate.chordDegrees?.[index] : undefined;
              return (
                <span key={`${label}-${index}`} className="lv-vl-row-chord" data-fn={role || undefined}>
                  {degree ? <small>{displayDegreeLabel(degree)}</small> : null}
                  <span>{displayChordLabel(label)}</span>
                </span>
              );
            })}
            {chords.length > shown.length ? <span className="lv-vl-row-more">…</span> : null}
          </div>
        )}
      </div>
      <span className="lv-vl-row-day shrink-0 text-xs text-[var(--lv-text-muted)]" data-testid="voicing-loop-progression-day">{day}</span>
    </div>
  );
}

/** L7: the chosen progression's contents on the right (Vault's right column, for this screen). */
function PickerPreview({
  candidate, text, showDegrees, favorite, day, played, sound, onPreviewError, onPractice, onOpenInVault, onToggleFavorite,
}: {
  readonly candidate: VoicingLoopVaultCandidate;
  readonly text: VoicingLoopText;
  readonly showDegrees: boolean;
  readonly favorite: boolean;
  readonly day: string;
  readonly played?: string;
  readonly sound: PreviewSound;
  readonly onPreviewError: (error: unknown) => void;
  readonly onPractice: () => void;
  readonly onOpenInVault?: () => void;
  readonly onToggleFavorite: () => void;
}) {
  const source = previewSourceOf(candidate);
  const playback = usePlaybackState();
  const playing = playback.status !== "idle" && samePlaybackSource(playback.source, source);
  const [favPop, triggerFavPop, clearFavPop] = useTransientFlag(300);
  useEffect(() => { clearFavPop(); }, [candidate.id, clearFavPop]);
  const block = candidate.block;
  const chords = candidate.chordLabels;
  const chips = [
    candidate.key ? displayChordLabel(displayKey(candidate.key) || "") : undefined,
    candidate.bpm === undefined ? text.noBpmLabel : `${candidate.bpm} BPM`,
    candidate.lengthBars === undefined ? undefined : text.barsCount(candidate.lengthBars),
    text.codeCount(chords.length),
  ].filter(Boolean) as string[];
  const saved = candidate.savedVoiceCount ?? 0;
  const total = candidate.chordCount ?? chords.length;
  const usable = [
    candidate.hasSourceMidi === false ? undefined : text.sourceMidiLabel,
    `${text.savedVoicesLabel} ${saved}/${total}`,
    text.generatedLabel,
  ].filter(Boolean).join(" ・ ");
  const savedOn = candidate.capturedAt ? formatMonthDay(candidate.capturedAt) : undefined;
  const toggle = () => {
    if (!block) return;
    void playbackController.toggle(source, previewRequestOf(block, candidate.bpm, sound)).catch(onPreviewError);
  };
  return (
    <>
      <div className="flex min-w-0 items-start gap-2 px-3 pt-3">
        <h2 className="min-w-0 flex-1 truncate text-xl font-bold text-[var(--lv-text)]" data-testid="voicing-loop-preview-title" title={candidate.title}>{candidate.title}</h2>
        <button type="button" data-testid="voicing-loop-preview-favorite" aria-pressed={favorite}
          aria-label={favorite ? text.favoriteRemove : text.favoriteAdd}
          data-pop={favPop ? "true" : undefined}
          className={`lv-vl-row-heart lv-fav-btn${favorite ? " is-on" : ""}`}
          onClick={() => { if (!favorite) triggerFavPop(); else clearFavPop(); onToggleFavorite(); }}>
          <FavoriteIcon aria-hidden="true" size={16} fill={favorite ? "currentColor" : "none"} />
          <FavoriteDots />
        </button>
      </div>
      <p className="flex min-w-0 flex-wrap gap-1 px-3 pt-1.5" data-testid="voicing-loop-preview-chips">
        {chips.map((chip) => <span key={chip} className="lv-vl-preview-chip">{chip}</span>)}
      </p>
      <div className="lv-vl-preview-chords grid min-w-0 gap-1 px-3 pt-2" data-testid="voicing-loop-preview-chords">
        {chords.slice(0, 8).map((label, index) => {
          const role = candidate.chordRoles?.[index] ?? "";
          const degree = showDegrees ? candidate.chordDegrees?.[index] : undefined;
          const cardSource: PlayingSource = { kind: "vault", id: `voicing-loop-card:${candidate.id}:${index}` };
          return (
            <button key={`${label}-${index}`} type="button" data-testid="voicing-loop-preview-chord" data-fn={role || undefined}
              className="lv-vl-preview-chord" aria-label={`${displayChordLabel(label)} ${text.auditionAll}`}
              disabled={!block}
              onClick={() => { if (block) void auditionSavedChord(block, index, cardSource, sound).catch(onPreviewError); }}>
              <small>{degree ? displayDegreeLabel(degree) : "\u00a0"}</small>
              <b>{displayChordLabel(label)}</b>
            </button>
          );
        })}
      </div>
      <div className="min-w-0 px-3 pt-2" data-testid="voicing-loop-preview-roll">
        {block
          ? <LoopRoll block={block} limit={Math.min(8, block.chords.length)} source={source} current={-1}
            bpm={candidate.bpm} beatsPerBar={beatsPerBar(block.timeSignature)} />
          : null}
      </div>
      <div className="flex min-w-0 items-center gap-2 px-3 pt-2">
        <Button variant="secondary" size="sm" data-testid="voicing-loop-preview-audition" disabled={!block}
          data-playing={playing ? "true" : undefined}
          aria-pressed={playing} aria-label={playing ? "この進行を止める" : "この進行を試聴"} onClick={toggle}>
          {playing ? <PlayingMark /> : <PlayIcon aria-hidden="true" size={16} />}
          {text.auditionAll}<kbd className="lv-vl-kbd">Space</kbd>
        </Button>
        <span className="min-w-0 truncate text-xs text-[var(--lv-text-muted)]">{text.auditionHint}</span>
      </div>
      <dl className="lv-vl-preview-facts grid min-w-0 gap-x-2 px-3 pt-2 text-xs" data-testid="voicing-loop-preview-facts">
        <dt>{text.lastPracticed}</dt><dd data-testid="voicing-loop-preview-last">{played ? day : text.never}</dd>
        <dt>{text.usableVoices}</dt><dd data-testid="voicing-loop-preview-usable">{usable}</dd>
        <dt>{text.savedOn}</dt><dd>{savedOn ?? "—"}</dd>
      </dl>
      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 px-3 pb-3 pt-3">
        <Button variant="primary" data-testid="voicing-loop-preview-practice" onClick={onPractice}>
          {text.practiceThis}<kbd className="lv-vl-kbd">Enter</kbd>
        </Button>
        {onOpenInVault ? <Button variant="secondary" data-testid="voicing-loop-preview-open" onClick={onOpenInVault}>{text.openInVault}</Button> : null}
      </div>
    </>
  );
}

const PREVIEW_SOURCE_PREFIX = "voicing-loop-preview:";

function previewSourceOf(candidate: VoicingLoopVaultCandidate): PlayingSource {
  return { kind: "vault", id: `${PREVIEW_SOURCE_PREFIX}${candidate.id}` };
}

/** L5: the row's one line of facts — 「{キー} ・ {BPM} ・ {n} 小節」 (a provisional tempo keeps its tooltip). */
function rowFacts(candidate: VoicingLoopVaultCandidate, text: VoicingLoopText): ReactNode[] {
  const provisional = candidate.tempoOrigin === "SMF_DEFAULT" || candidate.tempoOrigin === "PRACTICE_INITIAL";
  const tempoHint = !provisional || candidate.bpm === undefined ? undefined
    : candidate.tempoOrigin === "SMF_DEFAULT"
      ? `MIDIにテンポが無いため、仮の ${candidate.bpm} BPM です`
      : `BPMが保存されていないため、仮の ${candidate.bpm} BPM です`;
  return [
    candidate.key ? <span key="key">{displayChordLabel(displayKey(candidate.key) || "")}</span> : null,
    candidate.bpm === undefined
      ? <span key="bpm">{text.noBpmLabel}</span>
      : <span key="bpm" data-tempo-origin={candidate.tempoOrigin ?? "SAVED_BPM"}
        className={provisional ? "text-[var(--lv-text-muted)]" : undefined} title={tempoHint}>{candidate.bpm} BPM</span>,
    candidate.lengthBars === undefined ? null : <span key="bars">{text.barsCount(candidate.lengthBars)}</span>,
  ].filter((node) => node !== null) as ReactNode[];
}

/** The day the progression was last practiced (only the one record the app keeps), or 「—」. */
function dayOf(candidate: VoicingLoopVaultCandidate, lastPractice: LastVoicingPractice | undefined, text: VoicingLoopText): string {
  if (!lastPractice) return "—";
  const reference = candidate.sourceReference;
  if (lastPractice.reference.ideaId !== reference.ideaId || lastPractice.reference.blockId !== reference.blockId) return "—";
  return dayLabel(lastPractice.at, text);
}

function resumeFacts(candidate: VoicingLoopVaultCandidate, lastPractice: LastVoicingPractice | undefined, text: VoicingLoopText): string {
  return [
    candidate.key ? displayChordLabel(displayKey(candidate.key) || "") : undefined,
    candidate.lengthBars === undefined ? undefined : text.barsCount(candidate.lengthBars),
    lastPractice ? `${dayLabel(lastPractice.at, text)}練習` : undefined,
  ].filter(Boolean).join(" ・ ");
}

/** 「きょう」「きのう」「n 日前」「先週」「M/D」 from an ISO instant (the local calendar). */
function dayLabel(at: string | undefined, text: VoicingLoopText): string {
  if (!at) return text.never;
  const then = new Date(at);
  if (Number.isNaN(then.getTime())) return text.never;
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return "きょう";
  if (days === 1) return "きのう";
  if (days < 7) return `${days} 日前`;
  if (days < 14) return "先週";
  return formatMonthDay(at);
}

function formatMonthDay(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "—" : `${date.getMonth() + 1}/${date.getDate()}`;
}

/** The short reason of an unavailable row (the full sentence stays in the tooltip). */
function unavailableLine(reason: NonNullable<VoicingLoopVaultCandidate["unavailableReason"]>, text: VoicingLoopText): string {
  if (reason === "practice-capacity") return text.unavailableCapacity;
  return (unavailableTitle(reason)).split("。")[0] + "。";
}

/** The full reason (the row's tooltip keeps the whole sentence, e.g. the 256-chord limit). */
function unavailableTitle(reason: NonNullable<VoicingLoopVaultCandidate["unavailableReason"]>): string {
  const ja: Partial<Record<NonNullable<VoicingLoopVaultCandidate["unavailableReason"]>, string>> = {
    "practice-capacity": "練習グループ数が256を超えています。Vaultの保存データは保持されます。",
    "resource-budget": "再生時間・拍数・イベント数の安全上限を超えています。Vaultの保存データは保持されます。",
    "unsupported-meter": "この拍子はVoicing Loopで練習できません。",
    "invalid-bpm": "BPMが対応範囲外です。",
    "invalid-key": "キー情報を練習用に解釈できません。",
    "empty-progression": "練習できるコードがありません。",
    "invalid-selection": "この練習の形では開けません。",
    "invalid-reference": "Vaultの進行が見つかりません。",
    "source-unavailable": "元の MIDI がありません。",
  };
  return ja[reason] ?? "この進行は練習できません。";
}
