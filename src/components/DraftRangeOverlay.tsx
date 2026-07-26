import { useEffect, useMemo, useState } from "react";
import type { ChordTimelineItem } from "../domain/types";
import {
  cycleDraftSnapMode,
  draftRangeAbsoluteBeats,
  retargetDraftByAbsoluteBeats,
  setDraftSnapMode,
  snapAbsoluteBeat,
} from "../domain/midi/draftRangeEditing";
import type {
  CandidateDraftSnapMode,
  ManualCandidateDraft,
} from "../domain/midi/manualDraft";
import type { AppLanguage } from "../i18n";

export interface DraftRangeOverlayProps {
  draft: ManualCandidateDraft;
  timeline: readonly ChordTimelineItem[];
  totalBars: number;
  language: AppLanguage;
  onChange(draft: ManualCandidateDraft): void;
  onPreview?(): void;
}

export function DraftRangeOverlay({
  draft,
  timeline,
  totalBars,
  language,
  onChange,
  onPreview,
}: DraftRangeOverlayProps) {
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

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
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
