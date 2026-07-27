import type { ChordTimelineItem, ProgressionBlockCandidate } from "../domain/types";
import type { TimelineRange } from "../domain/midi/manualRange";
import type { ManualCandidateDraft } from "../domain/midi/manualDraft";
import type { AppLanguage } from "../i18n";
import { DraftRangeOverlay } from "./DraftRangeOverlay";

export interface SongMiniMapCopy {
  title: string;
  description: string;
  empty: string;
  candidateLabel: (index: number, startBar: number, endBar: number) => string;
}

export interface SongMiniMapProps {
  totalBars: number;
  beatsPerBar: number;
  timeline: readonly ChordTimelineItem[];
  candidates: readonly ProgressionBlockCandidate[];
  draft?: ManualCandidateDraft;
  activeCandidateId?: string;
  language: AppLanguage;
  copy: SongMiniMapCopy;
  onCandidateSelect: (candidateId: string) => void;
  onCandidateDoubleClick?: (candidateId: string) => void;
  onDraftChange: (draft: ManualCandidateDraft) => void;
  onManualRangeCreate: (range: TimelineRange) => void;
  onPreviewSelection?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onEnterSelection?: () => void;
}

interface PositionedCandidate {
  candidate: ProgressionBlockCandidate;
  candidateIndex: number;
  lane: number;
  left: number;
  width: number;
}

export function layoutSongMiniMapCandidates(
  candidates: readonly ProgressionBlockCandidate[],
  totalBars: number,
): PositionedCandidate[] {
  if (totalBars <= 0) return [];

  const laneEnds: number[] = [];
  return candidates
    .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
    .sort((left, right) => (
      left.candidate.startBar - right.candidate.startBar
      || left.candidate.endBar - right.candidate.endBar
      || left.candidateIndex - right.candidateIndex
    ))
    .map(({ candidate, candidateIndex }) => {
      const startBar = Math.min(totalBars, Math.max(1, candidate.startBar));
      const endBar = Math.min(totalBars, Math.max(startBar, candidate.endBar));
      let lane = laneEnds.findIndex((lastEnd) => startBar > lastEnd);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = endBar;

      return {
        candidate,
        candidateIndex,
        lane,
        left: ((startBar - 1) / totalBars) * 100,
        width: ((endBar - startBar + 1) / totalBars) * 100,
      };
    });
}

export function SongMiniMap({
  totalBars,
  beatsPerBar,
  timeline,
  candidates,
  draft,
  activeCandidateId,
  language,
  copy,
  onCandidateSelect,
  onCandidateDoubleClick,
  onDraftChange,
  onManualRangeCreate,
  onPreviewSelection,
  onUndo,
  onRedo,
  onEnterSelection,
}: SongMiniMapProps) {
  const sourceCandidateId = draft && draft.source.type === "automatic-candidate"
    ? draft.source.candidateId
    : undefined;
  const displayCandidates = candidates.map((candidate) => (
    draft && candidate.id === sourceCandidateId
      ? {
          ...candidate,
          startBar: draft.selectedRange.startBar,
          endBar: draft.selectedRange.endBar,
          lengthBars: draft.lengthBars as ProgressionBlockCandidate["lengthBars"],
        }
      : candidate
  ));
  const positionedCandidates = layoutSongMiniMapCandidates(displayCandidates, totalBars);
  const laneCount = positionedCandidates.length > 0
    ? Math.max(...positionedCandidates.map(({ lane }) => lane)) + 1
    : 1;
  const sourceCandidateIndex = sourceCandidateId === undefined
    ? undefined
    : candidates.findIndex((candidate) => candidate.id === sourceCandidateId) + 1;

  return (
    <section
      data-song-minimap
      className="border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-5"
      aria-labelledby="song-minimap-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="song-minimap-title" className="text-lg font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{copy.description}</p>
        </div>
        <span className="text-xs text-[var(--lv-text-muted)]">1-{Math.max(0, totalBars)}</span>
      </div>

      {totalBars > 0 ? (
        <DraftRangeOverlay
          variant="primary"
          timeline={timeline}
          totalBars={totalBars}
          beatsPerBar={beatsPerBar}
          language={language}
          trackHeightRem={laneCount * 2 + 2.75}
          {...(draft === undefined ? {} : { draft })}
          {...(sourceCandidateIndex === undefined || sourceCandidateIndex < 1
            ? {}
            : { sourceCandidateIndex })}
          onChange={onDraftChange}
          onCreateRange={onManualRangeCreate}
          {...(onPreviewSelection === undefined ? {} : { onPreview: onPreviewSelection })}
          {...(onUndo === undefined ? {} : { onUndo })}
          {...(onRedo === undefined ? {} : { onRedo })}
          {...(onEnterSelection === undefined ? {} : { onEnter: onEnterSelection })}
        >
          {positionedCandidates.length > 0
            ? positionedCandidates.map(({ candidate, candidateIndex, lane, left, width }) => {
              const baseLabel = copy.candidateLabel(
                candidateIndex + 1,
                candidate.startBar,
                candidate.endBar,
              );
              const label = language === "ja"
                ? `${baseLabel}。採集範囲の選択プリセット`
                : `${baseLabel}. Capture range selection preset`;
              const isActive = candidate.id === activeCandidateId;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  data-song-minimap-candidate={candidate.id}
                  data-song-minimap-lane={lane}
                  aria-label={label}
                  aria-pressed={isActive}
                  title={language === "ja"
                    ? `${label}・ダブルクリックで候補カードへ移動`
                    : `${label}. Double-click to reveal the candidate card`}
                  className={`absolute z-40 grid h-7 min-w-7 place-items-center overflow-hidden border px-1 text-xs font-semibold transition focus-visible:z-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)] ${
                    isActive
                      ? "border-teal-100 bg-teal-200 text-stone-950 shadow-[0_0_0_2px_rgba(94,234,212,0.3)]"
                      : "border-teal-300/80 bg-teal-400/35 text-teal-50 hover:bg-teal-300/55"
                  }`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    top: `${lane * 2 + 2}rem`,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onCandidateSelect(candidate.id)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onCandidateDoubleClick?.(candidate.id);
                  }}
                >
                  {candidateIndex + 1}
                </button>
              );
            })
            : null}
        </DraftRangeOverlay>
      ) : null}

      {positionedCandidates.length > 0 ? null : (
        <p className="mt-4 text-sm text-[var(--lv-text-muted)]">{copy.empty}</p>
      )}
    </section>
  );
}
