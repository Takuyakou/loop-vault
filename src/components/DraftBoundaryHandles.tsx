import { useEffect, useState } from "react";
import { resizeDraftBoundary } from "../domain/midi/draftRangeEditing";
import type { ManualCandidateDraft } from "../domain/midi/manualDraft";
import type { AppLanguage } from "../i18n";

export interface DraftBoundaryHandlesProps {
  draft: ManualCandidateDraft;
  language: AppLanguage;
  onChange(draft: ManualCandidateDraft): void;
}

export function DraftBoundaryHandles({
  draft,
  language,
  onChange,
}: DraftBoundaryHandlesProps) {
  const [pending, setPending] = useState<Record<string, number>>({});

  useEffect(() => setPending({}), [draft.historyIndex, draft.events]);

  if (draft.events.length < 2) return null;

  return (
    <section
      className="mt-3 border-t border-[var(--lv-border)] pt-3"
      aria-label={language === "ja" ? "コード境界" : "Chord boundaries"}
      data-testid="draft-boundary-handles"
    >
      <p className="text-xs text-[var(--lv-text-muted)]">
        {language === "ja"
          ? "境界をドラッグすると左右の長さを同時に調整します。Altでスナップを一時解除。"
          : "Drag a boundary to resize both neighbours. Hold Alt to bypass snap."}
      </p>
      <div className="mt-2 grid gap-2">
        {draft.events.slice(0, -1).map((left, index) => {
          const right = draft.events[index + 1]!;
          const leftId = left.sourceEventId ?? `${index}`;
          const current = left.relativeStartBeat + left.durationBeats;
          const value = pending[leftId] ?? current;
          const minimum = left.relativeStartBeat + 0.25;
          const maximum = right.relativeStartBeat + right.durationBeats - 0.25;
          const label = language === "ja"
            ? `${left.chord.label} と ${right.chord.label} の境界`
            : `Boundary between ${left.chord.label} and ${right.chord.label}`;

          return (
            <label
              key={`${leftId}-${right.sourceEventId ?? index + 1}`}
              className="grid min-h-10 grid-cols-[minmax(7rem,auto)_minmax(8rem,1fr)_4rem] items-center gap-3 text-xs"
            >
              <span className="truncate text-[var(--lv-text)]" title={label}>
                {left.chord.label} | {right.chord.label}
              </span>
              <input
                type="range"
                min={minimum}
                max={maximum}
                step={0.25}
                value={value}
                data-boundary-after={leftId}
                aria-label={label}
                aria-valuetext={`${value.toFixed(2)} beats`}
                className="min-h-8 accent-amber-300"
                onChange={(event) => {
                  const nextValue = Number(event.currentTarget.value);
                  setPending((currentValues) => ({
                    ...currentValues,
                    [leftId]: nextValue,
                  }));
                }}
                onPointerUp={(event) => {
                  onChange(resizeDraftBoundary(draft, leftId, value, {
                    disableSnap: event.altKey,
                  }));
                }}
                onKeyUp={(event) => {
                  if (!event.key.startsWith("Arrow")) return;
                  onChange(resizeDraftBoundary(draft, leftId, value, {
                    disableSnap: event.altKey,
                  }));
                }}
              />
              <span className="tabular-nums text-[var(--lv-text-muted)]">
                {value.toFixed(2)}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
