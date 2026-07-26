import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { ChordTimelineItem } from "../domain/types";
import {
  cycleDraftSnapMode,
  draftRangeAbsoluteBeats,
  retargetDraftByAbsoluteBeats,
  rangeFromAbsoluteBeats,
  setDraftSnapMode,
  snapAbsoluteBeat,
} from "../domain/midi/draftRangeEditing";
import type {
  CandidateDraftSnapMode,
  ManualCandidateDraft,
} from "../domain/midi/manualDraft";
import type { AppLanguage } from "../i18n";
import { GripVertical } from "lucide-react";

interface DraftRangeOverlayBaseProps {
  timeline: readonly ChordTimelineItem[];
  totalBars: number;
  language: AppLanguage;
  onPreview?(): void;
}

interface StandaloneDraftRangeOverlayProps extends DraftRangeOverlayBaseProps {
  variant?: "standalone";
  draft: ManualCandidateDraft;
  onChange(draft: ManualCandidateDraft): void;
}

interface PrimaryDraftRangeOverlayProps extends DraftRangeOverlayBaseProps {
  variant: "primary";
  draft?: ManualCandidateDraft;
  beatsPerBar: number;
  children?: ReactNode;
  trackHeightRem: number;
  sourceCandidateIndex?: number;
  onChange?(draft: ManualCandidateDraft): void;
  onCreateRange(range: ReturnType<typeof rangeFromAbsoluteBeats>): void;
  onUndo?(): void;
  onRedo?(): void;
  onEnter?(): void;
}

export type DraftRangeOverlayProps =
  | StandaloneDraftRangeOverlayProps
  | PrimaryDraftRangeOverlayProps;

export function DraftRangeOverlay(props: DraftRangeOverlayProps) {
  if (props.variant === "primary") {
    return <PrimaryDraftRangeOverlay {...props} />;
  }
  return <StandaloneDraftRangeOverlay {...props} />;
}

function StandaloneDraftRangeOverlay({
  draft,
  timeline,
  totalBars,
  language,
  onChange,
  onPreview,
}: StandaloneDraftRangeOverlayProps) {
  const absolute = draftRangeAbsoluteBeats(draft);
  const [pending, setPending] = useState(absolute);
  const [confirmDraft, setConfirmDraft] = useState<ManualCandidateDraft>();
  const [snapBypass, setSnapBypass] = useState(false);
  const maximum = totalBars * draft.beatsPerBar;
  const bars = useMemo(
    () => Array.from({ length: Math.max(1, totalBars) }, (_unused, index) => index + 1),
    [totalBars],
  );

  useEffect(() => {
    setPending(draftRangeAbsoluteBeats(draft));
    setConfirmDraft(undefined);
  }, [draft.historyIndex, draft.selectedRange]);

  function updateEdge(edge: "start" | "end", raw: number, disableSnap: boolean) {
    const value = snapAbsoluteBeat(
      raw,
      draft.snapMode,
      timeline,
      draft.beatsPerBar,
      disableSnap,
    );
    setPending((current) => edge === "start"
      ? { startBeat: Math.min(value, current.endBeat - 1), endBeat: current.endBeat }
      : { startBeat: current.startBeat, endBeat: Math.max(value, current.startBeat + 1) });
  }

  function commitRange(disableSnap: boolean = false) {
    commitRangeValues(pending, disableSnap);
  }

  function commitRangeValues(
    range: { startBeat: number; endBeat: number },
    disableSnap: boolean = false,
  ) {
    if (
      range.startBeat === absolute.startBeat
      && range.endBeat === absolute.endBeat
    ) {
      return;
    }
    try {
      const result = retargetDraftByAbsoluteBeats(
        draft,
        timeline,
        range.startBeat,
        range.endBeat,
        totalBars,
        { keepEdits: true, disableSnap },
      );
      if (result.droppedEditCount > 0) {
        setConfirmDraft(result.draft);
        return;
      }
      onChange(result.draft);
    } catch {
      setPending(absolute);
    }
  }

  function setSnap(mode: CandidateDraftSnapMode) {
    onChange(setDraftSnapMode(draft, mode));
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (
      event.defaultPrevented
      || event.nativeEvent.isComposing
      || nativeKeyTarget(event.target)
    ) return;
    if (event.key.toLowerCase() === "g") {
      event.preventDefault();
      onChange(cycleDraftSnapMode(draft, event.shiftKey));
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      onPreview?.();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const step = draft.snapMode === "bar" ? draft.beatsPerBar : 1;
    const startOnly = event.altKey && event.shiftKey;
    const endOnly = event.shiftKey && !event.altKey;
    const nextStart = startOnly || !endOnly
      ? pending.startBeat + direction * step
      : pending.startBeat;
    const nextEnd = endOnly || !startOnly
      ? pending.endBeat + direction * step
      : pending.endBeat;
    const next = {
      startBeat: Math.max(0, Math.min(nextStart, maximum - 1)),
      endBeat: Math.max(1, Math.min(nextEnd, maximum)),
    };
    setPending(next);
    commitRangeValues(next, event.altKey && !event.shiftKey);
  }

  const source = draft.source.type === "automatic-candidate"
    ? language === "ja" ? "自動候補" : "Automatic candidate"
    : language === "ja" ? "手動範囲" : "Manual range";
  const title = language === "ja" ? "編集中の範囲" : "Editing range";
  const startLabel = language === "ja" ? "開始ハンドル" : "Start handle";
  const endLabel = language === "ja" ? "終了ハンドル" : "End handle";

  return (
    <section
      className="mt-4 border border-[var(--lv-border)] bg-[var(--lv-surface)]/35 p-4"
      data-testid="draft-range-overlay"
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={title}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[var(--lv-text)]">{title}</h4>
          <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
            {source} · {draft.selectedRange.startBar}.{draft.selectedRange.startBeat}
            {" – "}
            {draft.selectedRange.endBar}.{draft.selectedRange.endBeat}
            {" · "}
            {draft.lengthBars} {language === "ja" ? "小節" : "bars"}
            {" · "}
            {draft.events.length} {language === "ja" ? "コード" : "events"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label={language === "ja" ? "スナップ" : "Snap"}>
          {(["bar", "harmonic", "beat"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`min-h-9 border px-3 text-xs ${
                draft.snapMode === mode
                  ? "border-teal-300 bg-teal-300/10 text-teal-100"
                  : "border-[var(--lv-border)] text-[var(--lv-text-muted)]"
              }`}
              aria-pressed={draft.snapMode === mode}
              onClick={() => setSnap(mode)}
            >
              {snapLabel(mode, language)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex min-h-8 overflow-hidden border border-[var(--lv-border)]" aria-hidden="true">
        {bars.map((bar) => {
          const selected = bar >= draft.selectedRange.startBar
            && bar <= draft.selectedRange.endBar;
          return (
            <span
              key={bar}
              className={`grid min-w-5 flex-1 place-items-center border-r border-[var(--lv-border)] text-[0.6rem] ${
                selected ? "bg-amber-200/20 text-amber-100" : "text-[var(--lv-text-muted)]"
              }`}
            >
              {bar}
            </span>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-[var(--lv-text-muted)]">
          {startLabel}
          <input
            type="range"
            min={0}
            max={Math.max(0, pending.endBeat - 1)}
            step={0.25}
            value={pending.startBeat}
            aria-valuetext={formatBeat(pending.startBeat, draft.beatsPerBar)}
            className="min-h-8 accent-teal-300"
            onPointerDown={(event) => setSnapBypass(event.altKey)}
            onKeyDown={(event) => setSnapBypass(event.altKey)}
            onChange={(event) => updateEdge(
              "start",
              Number(event.currentTarget.value),
              snapBypass,
            )}
            onPointerUp={(event) => {
              commitRange(event.altKey);
              setSnapBypass(false);
            }}
            onKeyUp={(event) => {
              if (event.key.startsWith("Arrow")) commitRange(event.altKey);
              setSnapBypass(false);
            }}
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--lv-text-muted)]">
          {endLabel}
          <input
            type="range"
            min={pending.startBeat + 1}
            max={maximum}
            step={0.25}
            value={pending.endBeat}
            aria-valuetext={formatBeat(pending.endBeat, draft.beatsPerBar)}
            className="min-h-8 accent-teal-300"
            onPointerDown={(event) => setSnapBypass(event.altKey)}
            onKeyDown={(event) => setSnapBypass(event.altKey)}
            onChange={(event) => updateEdge(
              "end",
              Number(event.currentTarget.value),
              snapBypass,
            )}
            onPointerUp={(event) => {
              commitRange(event.altKey);
              setSnapBypass(false);
            }}
            onKeyUp={(event) => {
              if (event.key.startsWith("Arrow")) commitRange(event.altKey);
              setSnapBypass(false);
            }}
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-[var(--lv-text-muted)]">
        {language === "ja"
          ? "←/→: 範囲移動 · Shift+←/→: 終了 · Alt+Shift+←/→: 開始 · G: スナップ"
          : "←/→: move · Shift+←/→: end · Alt+Shift+←/→: start · G: snap"}
      </p>

      {confirmDraft === undefined ? null : (
        <div className="mt-3 border border-amber-300/50 p-3" role="alertdialog">
          <p className="text-xs text-amber-100">
            {language === "ja"
              ? "この範囲変更では範囲外の編集が失われます。変更を適用しますか？"
              : "This range change drops edits outside the range. Apply it?"}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="min-h-9 border border-amber-300 px-3 text-xs"
              onClick={() => onChange(confirmDraft)}
            >
              {language === "ja" ? "適用" : "Apply"}
            </button>
            <button
              type="button"
              className="min-h-9 border border-[var(--lv-border)] px-3 text-xs"
              onClick={() => {
                setConfirmDraft(undefined);
                setPending(absolute);
              }}
            >
              {language === "ja" ? "キャンセル" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

interface AbsoluteRange {
  startBeat: number;
  endBeat: number;
}

type PointerDrag =
  | {
      kind: "create";
      pointerId: number;
      anchorBeat: number;
      initial: AbsoluteRange;
    }
  | {
      kind: "move" | "start" | "end";
      pointerId: number;
      anchorBeat: number;
      initial: AbsoluteRange;
    };

function PrimaryDraftRangeOverlay({
  draft,
  timeline,
  totalBars,
  language,
  beatsPerBar,
  children,
  trackHeightRem,
  sourceCandidateIndex,
  onChange,
  onCreateRange,
  onPreview,
  onUndo,
  onRedo,
  onEnter,
}: PrimaryDraftRangeOverlayProps) {
  const maximum = Math.max(beatsPerBar, totalBars * beatsPerBar);
  const current = draft ? draftRangeAbsoluteBeats(draft) : undefined;
  const [pending, setPendingState] = useState<AbsoluteRange | undefined>(current);
  const pendingRef = useRef<AbsoluteRange | undefined>(current);
  const dragRef = useRef<PointerDrag>();
  const trackRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<HTMLDivElement>(null);
  const [confirmDraft, setConfirmDraft] = useState<ManualCandidateDraft>();

  useEffect(() => {
    const next = draft ? draftRangeAbsoluteBeats(draft) : undefined;
    pendingRef.current = next;
    setPendingState(next);
    setConfirmDraft(undefined);
    dragRef.current = undefined;
  }, [draft?.draftId, draft?.historyIndex, draft?.selectedRange]);

  function setPending(next: AbsoluteRange | undefined) {
    pendingRef.current = next;
    setPendingState(next);
  }

  function beatFromPointer(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return clamp(((clientX - rect.left) / rect.width) * maximum, 0, maximum);
  }

  function snap(value: number, disableSnap: boolean): number {
    return clamp(snapAbsoluteBeat(
      value,
      draft?.snapMode ?? "bar",
      timeline,
      beatsPerBar,
      disableSnap,
    ), 0, maximum);
  }

  function commitDraftRange(range: AbsoluteRange, disableSnap: boolean) {
    if (!draft || !onChange) return;
    const absolute = draftRangeAbsoluteBeats(draft);
    if (range.startBeat === absolute.startBeat && range.endBeat === absolute.endBeat) return;
    try {
      const result = retargetDraftByAbsoluteBeats(
        draft,
        timeline,
        range.startBeat,
        range.endBeat,
        totalBars,
        { keepEdits: true, disableSnap },
      );
      if (result.droppedEditCount > 0) {
        setConfirmDraft(result.draft);
        return;
      }
      onChange(result.draft);
    } catch {
      setPending(absolute);
    }
  }

  function beginDrag(
    kind: PointerDrag["kind"],
    event: ReactPointerEvent<HTMLElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const initial = pendingRef.current;
    if (!initial) return;
    const anchorBeat = beatFromPointer(event.clientX);
    dragRef.current = { kind, pointerId: event.pointerId, anchorBeat, initial };
    trackRef.current?.setPointerCapture?.(event.pointerId);
    selectionRef.current?.focus();
  }

  function beginCreate(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target;
    if (
      target instanceof Element
      && target.closest("[data-song-minimap-candidate], [data-selection-control]")
    ) return;
    event.preventDefault();
    const anchorBeat = snap(beatFromPointer(event.clientX), event.altKey);
    const initial = {
      startBeat: anchorBeat,
      endBeat: Math.min(maximum, anchorBeat + beatsPerBar),
    };
    dragRef.current = {
      kind: "create",
      pointerId: event.pointerId,
      anchorBeat,
      initial,
    };
    setPending(initial);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function rangeForPointer(event: ReactPointerEvent<HTMLDivElement>): AbsoluteRange | undefined {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return undefined;
    const raw = beatFromPointer(event.clientX);
    const value = snap(raw, event.altKey);
    const minimumLength = 0.25;

    if (drag.kind === "create") {
      const startBeat = Math.min(drag.anchorBeat, value);
      const endBeat = Math.max(drag.anchorBeat, value);
      return endBeat - startBeat >= minimumLength
        ? { startBeat, endBeat }
        : {
            startBeat: Math.min(startBeat, maximum - beatsPerBar),
            endBeat: Math.min(maximum, startBeat + beatsPerBar),
          };
    }
    if (drag.kind === "start") {
      return {
        startBeat: Math.min(value, drag.initial.endBeat - minimumLength),
        endBeat: drag.initial.endBeat,
      };
    }
    if (drag.kind === "end") {
      return {
        startBeat: drag.initial.startBeat,
        endBeat: Math.max(value, drag.initial.startBeat + minimumLength),
      };
    }

    const length = drag.initial.endBeat - drag.initial.startBeat;
    const rawStart = drag.initial.startBeat + raw - drag.anchorBeat;
    const snappedStart = snap(rawStart, event.altKey);
    const startBeat = clamp(snappedStart, 0, maximum - length);
    return { startBeat, endBeat: startBeat + length };
  }

  function updatePointer(event: ReactPointerEvent<HTMLDivElement>) {
    const next = rangeForPointer(event);
    if (next) setPending(next);
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = rangeForPointer(event) ?? pendingRef.current ?? drag.initial;
    dragRef.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (drag.kind === "create") {
      onCreateRange(rangeFromAbsoluteBeats(next.startBeat, next.endBeat, beatsPerBar));
      return;
    }
    commitDraftRange(next, event.altKey);
  }

  function handleSelectionKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || !draft || !pending) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
      event.preventDefault();
      if (key === "y" || event.shiftKey) onRedo?.();
      else onUndo?.();
      return;
    }
    if (key === "g") {
      event.preventDefault();
      onChange?.(cycleDraftSnapMode(draft, event.shiftKey));
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      onPreview?.();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onEnter?.();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setPending(draftRangeAbsoluteBeats(draft));
      selectionRef.current?.blur();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const step = draft.snapMode === "bar" ? beatsPerBar : 1;
    let next: AbsoluteRange;
    if (event.altKey && event.shiftKey) {
      next = {
        startBeat: clamp(pending.startBeat + direction * step, 0, pending.endBeat - 0.25),
        endBeat: pending.endBeat,
      };
    } else if (event.shiftKey) {
      next = {
        startBeat: pending.startBeat,
        endBeat: clamp(pending.endBeat + direction * step, pending.startBeat + 0.25, maximum),
      };
    } else {
      const length = pending.endBeat - pending.startBeat;
      const startBeat = clamp(pending.startBeat + direction * step, 0, maximum - length);
      next = { startBeat, endBeat: startBeat + length };
    }
    setPending(next);
    commitDraftRange(next, event.altKey);
  }

  const visibleRange = pending ?? current;
  const left = visibleRange ? (visibleRange.startBeat / maximum) * 100 : 0;
  const width = visibleRange
    ? ((visibleRange.endBeat - visibleRange.startBeat) / maximum) * 100
    : 0;
  const labels = primaryCopy[language];
  const source = draft?.source.type === "automatic-candidate"
    ? labels.automaticSource(sourceCandidateIndex)
    : labels.manualSource;

  return (
    <div data-testid="draft-range-overlay" data-variant="primary">
      <div
        ref={trackRef}
        className="relative mt-4 touch-none overflow-hidden border border-[var(--lv-border)] bg-[var(--lv-surface)]"
        style={{ height: `${Math.max(5.5, trackHeightRem)}rem` }}
        data-song-minimap-track
        onPointerDown={beginCreate}
        onPointerMove={updatePointer}
        onPointerUp={finishPointer}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            dragRef.current = undefined;
            setPending(current);
          }
        }}
      >
        <div aria-hidden="true" className="absolute inset-0 grid grid-cols-4">
          {Array.from({ length: 4 }, (_unused, index) => (
            <span key={index} className={index === 0 ? "" : "border-l border-[var(--lv-border)]/70"} />
          ))}
        </div>
        {children}
        {draft && visibleRange ? (
          <div
            ref={selectionRef}
            role="group"
            tabIndex={0}
            data-current-selection
            data-selection-control
            aria-label={labels.selectionAria(
              draft.selectedRange.startBar,
              draft.selectedRange.startBeat,
              draft.selectedRange.endBar,
              draft.selectedRange.endBeat,
            )}
            className="absolute inset-y-1 z-30 min-w-6 cursor-grab border-2 border-amber-100 bg-amber-300/20 shadow-[0_0_0_2px_rgba(8,15,22,0.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 active:cursor-grabbing"
            style={{ left: `${left}%`, width: `${width}%` }}
            onPointerDown={(event) => beginDrag("move", event)}
            onKeyDown={handleSelectionKeyDown}
          >
            <span className="pointer-events-none absolute left-1 top-1 max-w-[calc(100%-0.5rem)] truncate bg-[var(--lv-bg)]/90 px-1 text-[0.65rem] font-semibold text-amber-100">
              {labels.currentSelection}
            </span>
            <button
              type="button"
              role="slider"
              data-selection-control
              data-selection-handle="start"
              aria-label={labels.startHandle}
              aria-valuemin={0}
              aria-valuemax={maximum}
              aria-valuenow={visibleRange.startBeat}
              className="absolute inset-y-0 -left-2 w-4 cursor-ew-resize border border-amber-50 bg-amber-200 text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-100"
              onPointerDown={(event) => beginDrag("start", event)}
            >
              <GripVertical aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              role="slider"
              data-selection-control
              data-selection-handle="end"
              aria-label={labels.endHandle}
              aria-valuemin={0}
              aria-valuemax={maximum}
              aria-valuenow={visibleRange.endBeat}
              className="absolute inset-y-0 -right-2 w-4 cursor-ew-resize border border-amber-50 bg-amber-200 text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-100"
              onPointerDown={(event) => beginDrag("end", event)}
            >
              <GripVertical aria-hidden="true" size={16} />
            </button>
          </div>
        ) : null}
      </div>

      {draft ? (
        <div className="mt-3 border border-amber-200/30 bg-amber-200/5 p-3" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-100">{labels.currentSelection}</p>
              <p className="mt-1 text-xs text-[var(--lv-text-secondary)]">
                {labels.range(
                  draft.selectedRange.startBar,
                  draft.selectedRange.startBeat,
                  draft.selectedRange.endBar,
                  draft.selectedRange.endBeat,
                )}
              </p>
              <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
                {labels.length(draft.lengthBars)} · {labels.events(draft.events.length)}
              </p>
              <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
                {source}{draft.isDirty ? ` · ${labels.dirty}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label={labels.snap}>
              {(["bar", "harmonic", "beat"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`min-h-9 border px-3 text-xs ${
                    draft.snapMode === mode
                      ? "border-teal-300 bg-teal-300/10 text-teal-100"
                      : "border-[var(--lv-border)] text-[var(--lv-text-muted)]"
                  }`}
                  aria-pressed={draft.snapMode === mode}
                  onClick={() => onChange?.(setDraftSnapMode(draft, mode))}
                >
                  {snapLabel(mode, language)}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--lv-text-muted)]">{labels.keyboardHelp}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--lv-text-muted)]">{labels.emptySelection}</p>
      )}

      {confirmDraft === undefined ? null : (
        <div className="mt-3 border border-amber-300/50 p-3" role="alertdialog">
          <p className="text-xs text-amber-100">{labels.lostEdit}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="min-h-9 border border-amber-300 px-3 text-xs"
              onClick={() => onChange?.(confirmDraft)}
            >
              {labels.apply}
            </button>
            <button
              type="button"
              className="min-h-9 border border-[var(--lv-border)] px-3 text-xs"
              onClick={() => {
                setConfirmDraft(undefined);
                setPending(current);
              }}
            >
              {labels.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const primaryCopy = {
  ja: {
    currentSelection: "現在の採集範囲",
    startHandle: "採集範囲の開始ハンドル",
    endHandle: "採集範囲の終了ハンドル",
    selectionAria: (startBar: number, startBeat: number, endBar: number, endBeat: number) =>
      `現在の採集範囲 ${startBar}小節${startBeat}拍から${endBar}小節${endBeat}拍`,
    range: (startBar: number, startBeat: number, endBar: number, endBeat: number) =>
      `選択範囲: ${startBar}.${startBeat}〜${endBar}.${endBeat}`,
    length: (bars: number) => `長さ: ${formatNumber(bars)}小節`,
    events: (count: number) => `コード: ${count}イベント`,
    automaticSource: (index?: number) => index
      ? `自動候補${index}から作成`
      : "自動候補から作成",
    manualSource: "手動範囲から作成",
    dirty: "編集済み",
    snap: "スナップ",
    emptySelection: "候補を選ぶか、空いている領域をドラッグして採集範囲を作成します。",
    keyboardHelp:
      "←/→ 移動 · Shift+←/→ 終了を伸縮 · Alt+Shift+←/→ 開始を伸縮 · G スナップ · Space 試聴 · Enter 編集",
    lostEdit: "この範囲変更では範囲外の編集が失われます。変更を適用しますか？",
    apply: "適用",
    cancel: "キャンセル",
  },
  en: {
    currentSelection: "Current capture range",
    startHandle: "Capture range start handle",
    endHandle: "Capture range end handle",
    selectionAria: (startBar: number, startBeat: number, endBar: number, endBeat: number) =>
      `Current capture range from bar ${startBar} beat ${startBeat} to bar ${endBar} beat ${endBeat}`,
    range: (startBar: number, startBeat: number, endBar: number, endBeat: number) =>
      `Selection: ${startBar}.${startBeat}–${endBar}.${endBeat}`,
    length: (bars: number) => `Length: ${formatNumber(bars)} bars`,
    events: (count: number) => `Chords: ${count} events`,
    automaticSource: (index?: number) => index
      ? `Created from automatic candidate ${index}`
      : "Created from an automatic candidate",
    manualSource: "Created from a manual range",
    dirty: "Edited",
    snap: "Snap",
    emptySelection: "Choose a candidate or drag an empty area to create a capture range.",
    keyboardHelp:
      "←/→ move · Shift+←/→ resize end · Alt+Shift+←/→ resize start · G snap · Space preview · Enter edit",
    lostEdit: "This range change drops edits outside the range. Apply it?",
    apply: "Apply",
    cancel: "Cancel",
  },
} as const;

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function snapLabel(mode: CandidateDraftSnapMode, language: AppLanguage): string {
  if (language === "en") return mode === "bar" ? "Bar" : mode === "harmonic" ? "Harmonic" : "Beat";
  return mode === "bar" ? "小節" : mode === "harmonic" ? "コード境界" : "拍";
}

function formatBeat(absoluteBeat: number, beatsPerBar: number): string {
  const bar = Math.floor(absoluteBeat / beatsPerBar) + 1;
  const beat = (absoluteBeat % beatsPerBar) + 1;
  return `${bar}.${Number.isInteger(beat) ? beat : beat.toFixed(2)}`;
}

function nativeKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLButtonElement
    || target.isContentEditable;
}
