import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { ChordTimelineItem, ProgressionBlockCandidate } from "../domain/types";
import type { TimelineRange } from "../domain/midi/manualRange";
import type { ManualCandidateDraft } from "../domain/midi/manualDraft";
import {
  groupTimelineCandidates,
  type TimelineCandidateGroup,
} from "../domain/timelineCandidateGrouping";
import {
  buildTimelineHarmonicActivity,
  type HarmonicActivityLevel,
} from "../domain/timelineHarmonicActivity";
import { Check } from "lucide-react";
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
  candidateDatasetKey: string;
  draft?: ManualCandidateDraft;
  activeCandidateId?: string;
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
  candidateDatasetKey,
  draft,
  activeCandidateId,
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
  const [openVariantSelector, setOpenVariantSelector] = useState<{
    datasetKey: string;
    anchorId: string;
  }>();
  const groupButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingVariantFocusAnchorRef = useRef<string>();
  const pendingVariantActivationRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    datasetKey: string;
  }>();
  const committedCandidateDatasetKeyRef = useRef(candidateDatasetKey);
  const mountedRef = useRef(false);
  const candidateDatasetLifecycleRef = useCallback((node: HTMLElement | null) => {
    if (node === null) {
      mountedRef.current = false;
      const pending = pendingVariantActivationRef.current;
      if (pending) clearTimeout(pending.timer);
      pendingVariantActivationRef.current = undefined;
      return;
    }
    mountedRef.current = true;
    if (committedCandidateDatasetKeyRef.current === candidateDatasetKey) return;
    committedCandidateDatasetKeyRef.current = candidateDatasetKey;
    const pending = pendingVariantActivationRef.current;
    if (pending) clearTimeout(pending.timer);
    pendingVariantActivationRef.current = undefined;
    pendingVariantFocusAnchorRef.current = undefined;
    setOpenVariantSelector(undefined);
  }, [candidateDatasetKey]);
  const sourceCandidateId = draft && draft.source.type === "automatic-candidate"
    ? draft.source.candidateId
    : undefined;
  const grouping = useMemo(() => {
    const groups = groupTimelineCandidates(candidates);
    const byRepresentativeId = new Map<string, { group: TimelineCandidateGroup; index: number }>();
    const byCandidateId = new Map<string, TimelineCandidateGroup>();
    groups.forEach((group, index) => {
      byRepresentativeId.set(group.representative.id, { group, index });
      group.variants.forEach((variant) => byCandidateId.set(variant.id, group));
    });
    return { groups, byRepresentativeId, byCandidateId };
  }, [candidates]);
  const harmonicActivity = useMemo(
    () => buildTimelineHarmonicActivity(timeline, totalBars, beatsPerBar),
    [beatsPerBar, timeline, totalBars],
  );
  const displayRepresentatives = useMemo(() => grouping.groups.map(({ representative }) => (
    draft && representative.id === sourceCandidateId
      ? {
          ...representative,
          startBar: draft.selectedRange.startBar,
          endBar: draft.selectedRange.endBar,
          lengthBars: draft.lengthBars as ProgressionBlockCandidate["lengthBars"],
        }
      : representative
  )), [draft, grouping.groups, sourceCandidateId]);
  const positionedCandidates = useMemo(
    () => layoutSongMiniMapCandidates(displayRepresentatives, totalBars),
    [displayRepresentatives, totalBars],
  );
  const laneCount = positionedCandidates.length > 0
    ? Math.max(...positionedCandidates.map(({ lane }) => lane)) + 1
    : 1;
  const sourceCandidateIndex = sourceCandidateId === undefined
    ? undefined
    : candidates.findIndex((candidate) => candidate.id === sourceCandidateId) + 1;
  const openGroupAnchorId = openVariantSelector?.datasetKey === candidateDatasetKey
    ? openVariantSelector.anchorId
    : undefined;
  const openGroup = openGroupAnchorId === undefined
    ? undefined
    : grouping.groups.find(({ anchor }) => anchor.id === openGroupAnchorId);
  const openGroupIndex = openGroup === undefined
    ? -1
    : grouping.groups.indexOf(openGroup);
  const activeGroup = activeCandidateId === undefined
    ? undefined
    : grouping.byCandidateId.get(activeCandidateId);

  function cancelPendingVariantActivation() {
    const pending = pendingVariantActivationRef.current;
    if (pending) clearTimeout(pending.timer);
    pendingVariantActivationRef.current = undefined;
  }

  function closeVariantSelector(group: TimelineCandidateGroup, restoreFocus: boolean) {
    cancelPendingVariantActivation();
    pendingVariantFocusAnchorRef.current = undefined;
    setOpenVariantSelector(undefined);
    if (restoreFocus) groupButtonRefs.current.get(group.anchor.id)?.focus();
  }

  function toggleVariantSelector(group: TimelineCandidateGroup) {
    cancelPendingVariantActivation();
    if (openGroupAnchorId === group.anchor.id) {
      closeVariantSelector(group, true);
      return;
    }
    pendingVariantFocusAnchorRef.current = group.anchor.id;
    setOpenVariantSelector({
      datasetKey: candidateDatasetKey,
      anchorId: group.anchor.id,
    });
  }

  function activateVariant(
    candidateId: string,
    group: TimelineCandidateGroup,
    doubleClick: boolean,
  ) {
    cancelPendingVariantActivation();
    if (doubleClick && onCandidateDoubleClick) {
      closeVariantSelector(group, false);
      onCandidateDoubleClick(candidateId);
      return;
    }
    onCandidateSelect(candidateId);
    closeVariantSelector(group, true);
  }

  function handleVariantClick(
    event: ReactMouseEvent<HTMLButtonElement>,
    candidateId: string,
    group: TimelineCandidateGroup,
  ) {
    event.stopPropagation();
    cancelPendingVariantActivation();
    if (event.detail === 0) {
      activateVariant(candidateId, group, false);
      return;
    }
    if (event.detail > 1) return;
    const datasetKey = candidateDatasetKey;
    const timer = setTimeout(() => {
      const pending = pendingVariantActivationRef.current;
      if (!pending || pending.timer !== timer || pending.datasetKey !== datasetKey) return;
      pendingVariantActivationRef.current = undefined;
      if (
        !mountedRef.current
        || committedCandidateDatasetKeyRef.current !== datasetKey
      ) return;
      onCandidateSelect(candidateId);
      pendingVariantFocusAnchorRef.current = undefined;
      setOpenVariantSelector(undefined);
      groupButtonRefs.current.get(group.anchor.id)?.focus();
    }, 250);
    pendingVariantActivationRef.current = { timer, datasetKey };
  }

  function handleVariantSelectorKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
    group: TimelineCandidateGroup,
  ) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeVariantSelector(group, true);
  }

  return (
    <section
      ref={candidateDatasetLifecycleRef}
      data-song-minimap
      className="min-w-0 border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-5"
      aria-labelledby="song-minimap-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 id="song-minimap-title" className="text-lg font-semibold">{copy.title}</h2>
          <p className="mt-1 break-words text-sm text-[var(--lv-text-muted)]">{copy.description}</p>
        </div>
        <span className="text-xs text-[var(--lv-text-muted)]">1-{Math.max(0, totalBars)}</span>
      </div>

      {totalBars > 0 ? (
        <DraftRangeOverlay
          variant="primary"
          timeline={timeline}
          totalBars={totalBars}
          beatsPerBar={beatsPerBar}
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
            ? positionedCandidates.map(({ candidate, lane, left, width }) => {
              const entry = grouping.byRepresentativeId.get(candidate.id);
              if (!entry) return null;
              const { group, index: groupIndex } = entry;
              const hasVariants = group.variants.length > 1;
              const isActive = activeGroup?.anchor.id === group.anchor.id;
              const isOpen = openGroup?.anchor.id === group.anchor.id;
              const baseLabel = copy.candidateLabel(
                groupIndex + 1,
                candidate.startBar,
                candidate.endBar,
              );
              const label = hasVariants
                ? `${baseLabel}。候補グループ ${groupIndex + 1}、${group.variants.length}個のバリアント`
                : `${baseLabel}。採集範囲の選択プリセット`;
              return (
                <button
                  key={group.anchor.id}
                  ref={(element) => {
                    if (element) groupButtonRefs.current.set(group.anchor.id, element);
                    else groupButtonRefs.current.delete(group.anchor.id);
                  }}
                  type="button"
                  data-song-minimap-candidate={candidate.id}
                  data-song-minimap-group={group.anchor.id}
                  data-song-minimap-lane={lane}
                  data-song-minimap-representative={group.representative.id}
                  data-song-minimap-selected-variant={group.selectedVariant.id}
                  aria-label={label}
                  aria-pressed={isActive}
                  {...(hasVariants
                    ? {
                        "aria-expanded": isOpen,
                        "aria-controls": `song-minimap-variants-${groupIndex + 1}`,
                      }
                    : {})}
                  title={hasVariants
                    ? `${label}。クリックしてバリアントを表示`
                    : `${label}・ダブルクリックで候補カードへ移動`}
                  className={`absolute z-40 grid h-7 min-w-7 place-items-center overflow-hidden border px-1 text-xs font-semibold transition-shadow focus-visible:z-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)] ${
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
                  onClick={() => {
                    if (hasVariants) toggleVariantSelector(group);
                    else onCandidateSelect(group.representative.id);
                  }}
                  onKeyDown={(event) => {
                    if (!hasVariants || event.key !== "Enter") return;
                    event.preventDefault();
                    event.stopPropagation();
                    toggleVariantSelector(group);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    if (!hasVariants) onCandidateDoubleClick?.(group.representative.id);
                  }}
                >
                  {hasVariants ? `${groupIndex + 1} · ${group.variants.length}` : groupIndex + 1}
                </button>
              );
            })
            : null}
          {harmonicActivity.length > 0 ? (
            <div
              data-harmonic-activity-lane
              className="pointer-events-none absolute inset-x-0 bottom-2 z-10 h-2 overflow-hidden border-y border-teal-100/10"
              role="group"
              aria-label={harmonicActivityLaneLabel()}
            >
              {harmonicActivity.map((activity) => (
                <span
                  key={activity.bar}
                  data-harmonic-activity-bar={activity.bar}
                  data-harmonic-activity-level={activity.level}
                  role="img"
                  aria-label={harmonicActivityAriaLabel(
                    activity.bar,
                    activity.level,
                  )}
                  className={`absolute bottom-0 ${harmonicActivityLevelClass(activity.level)}`}
                  style={{
                    left: `${((activity.bar - 1) / harmonicActivity.length) * 100}%`,
                    width: `${100 / harmonicActivity.length}%`,
                  }}
                />
              ))}
            </div>
          ) : null}
        </DraftRangeOverlay>
      ) : null}
      {harmonicActivity.length > 0 ? (
        <div
          data-harmonic-activity-legend
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--lv-text-muted)]"
          role="group"
          aria-label={"\u548c\u58f0\u6d3b\u52d5\u306e\u51e1\u4f8b"}
        >
          <span className="font-semibold text-[var(--lv-text-secondary)]">
            {harmonicActivityLaneLabel()}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1" role="list">
            {(["inactive", "low", "medium", "high"] as const).map((level) => (
              <span
                key={level}
                data-harmonic-activity-legend-level={level}
                className="inline-flex items-center gap-1"
                role="listitem"
              >
                <span aria-hidden="true" className="w-3 text-center font-mono">
                  {harmonicActivitySymbol(level)}
                </span>
                <span>{harmonicActivityTerm(level)}</span>
              </span>
            ))}
          </span>
        </div>
      ) : null}


      {openGroup && openGroupIndex >= 0 ? (
        <div
          id={`song-minimap-variants-${openGroupIndex + 1}`}
          data-song-minimap-variant-selector={openGroup.anchor.id}
          className="mt-3 min-w-0 border border-teal-300/40 bg-[var(--lv-surface)]/80 p-3"
          role="group"
          aria-label={`候補グループ ${openGroupIndex + 1} のバリアント`}
          onKeyDown={(event) => handleVariantSelectorKeyDown(event, openGroup)}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-words text-xs font-semibold text-[var(--lv-text-secondary)]">
              {`候補グループ ${openGroupIndex + 1} · ${openGroup.variants.length}件`}
            </p>
            <button
              type="button"
              className="min-h-8 border border-[var(--lv-border)] px-2 text-xs text-[var(--lv-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lv-accent)]"
              onClick={() => closeVariantSelector(openGroup, true)}
            >
              {"閉じる"}
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {openGroup.variants.map((variant, variantIndex) => {
              const isActive = variant.id === activeCandidateId;
              return (
                <button
                  key={variant.id}
                  ref={(element) => {
                    if (
                      element
                      && pendingVariantFocusAnchorRef.current === openGroup.anchor.id
                      && variant.id === openGroup.selectedVariant.id
                    ) {
                      pendingVariantFocusAnchorRef.current = undefined;
                      element.focus();
                    }
                  }}
                  type="button"
                  data-song-minimap-variant={variant.id}
                  data-song-minimap-variant-index={variantIndex + 1}
                  data-song-minimap-variant-representative={
                    variant.id === openGroup.representative.id
                  }
                  data-song-minimap-variant-selected={
                    variant.id === openGroup.selectedVariant.id
                  }
                  aria-label={variantAriaLabel(
                    variant,
                    openGroupIndex + 1,
                    variantIndex + 1,
                  )}
                  aria-pressed={isActive}
                  className={`flex min-h-10 min-w-0 items-center border px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)] ${
                    isActive
                      ? "border-teal-100 bg-teal-200 text-stone-950"
                      : "border-teal-300/50 bg-teal-300/5 text-[var(--lv-text)] hover:bg-teal-300/10"
                  }`}
                  onClick={(event) => handleVariantClick(
                    event,
                    variant.id,
                    openGroup,
                  )}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    activateVariant(variant.id, openGroup, true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    event.stopPropagation();
                    activateVariant(variant.id, openGroup, false);
                  }}
                >
                  <span className="min-w-0 flex-1 break-words">{variantVisibleLabel(variant)}</span>
                  {isActive ? <Check aria-hidden="true" className="ml-2 inline shrink-0" size={16} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {positionedCandidates.length > 0 ? null : (
        <p className="mt-4 text-sm text-[var(--lv-text-muted)]">{copy.empty}</p>
      )}
    </section>
  );
}

function variantVisibleLabel(
  candidate: ProgressionBlockCandidate,
): string {
  return `${candidate.lengthBars}小節 · Bar ${candidate.startBar}–${candidate.endBar}`;
}

function variantAriaLabel(
  candidate: ProgressionBlockCandidate,
  groupIndex: number,
  variantIndex: number,
): string {
  return `候補グループ ${groupIndex}、バリアント ${variantIndex}。${candidate.lengthBars}小節、Bar ${candidate.startBar}–${candidate.endBar}`;
}

function harmonicActivityLaneLabel(): string {
  return "\u548c\u58f0\u6d3b\u52d5";
}

function harmonicActivityTerm(
  level: HarmonicActivityLevel,
): string {
  if (level === "inactive") return "\u6d3b\u52d5\u306a\u3057";
  if (level === "low") return "\u4f4e";
  if (level === "medium") return "\u4e2d";
  return "\u9ad8";
}

function harmonicActivitySymbol(level: HarmonicActivityLevel): string {
  if (level === "inactive") return "\u2014";
  if (level === "low") return "\u2582";
  if (level === "medium") return "\u2585";
  return "\u2588";
}

function harmonicActivityAriaLabel(
  bar: number,
  level: HarmonicActivityLevel,
): string {
  const term = harmonicActivityTerm(level);
  return `\u548c\u58f0\u6d3b\u52d5: Bar ${bar}\u3001\u5f37\u5ea6 ${term}`;
}

function harmonicActivityLevelClass(level: HarmonicActivityLevel): string {
  if (level === "inactive") return "h-px border-t border-dashed border-teal-100/35 bg-transparent";
  if (level === "low") return "h-1 bg-teal-300/20";
  if (level === "medium") return "h-1.5 bg-teal-300/40";
  return "h-full bg-teal-200/65";
}
