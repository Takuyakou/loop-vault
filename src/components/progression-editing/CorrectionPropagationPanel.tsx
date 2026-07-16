import { useEffect, useState } from "react";
import { ChevronDown, WandSparkles } from "lucide-react";
import type { PreviewSound } from "../../audio/chordPreview";
import {
  playbackController,
  type PlaybackController,
  type PlayingSource,
} from "../../audio/playbackController";
import type {
  EditableChordSlot,
  SimilarSegmentCandidate,
} from "../../domain/progressionEditing";
import type { ChordSymbol } from "../../domain/types";
import { progressionEditorCopy, type AppLanguage } from "../../i18n";
import { PlayToggle } from "../PlayToggle";

interface CorrectionPropagationPanelProps {
  sourceSlotId: string;
  chord: ChordSymbol;
  candidates: readonly SimilarSegmentCandidate[];
  slots: readonly EditableChordSlot[];
  language: AppLanguage;
  playbackSource: PlayingSource;
  previewSound?: PreviewSound;
  stopLabel?: string;
  onPreviewError?: (error: unknown) => void;
  controller?: PlaybackController;
  onApply: (segmentIds: string[]) => void;
}

export function CorrectionPropagationPanel({
  sourceSlotId,
  chord,
  candidates,
  slots,
  language,
  playbackSource,
  previewSound,
  stopLabel,
  onPreviewError,
  controller = playbackController,
  onApply,
}: CorrectionPropagationPanelProps) {
  const text = progressionEditorCopy[language];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [sourceSlotId, chord.label, candidates]);

  const rows = candidates.flatMap((candidate) => {
    const slot = slots.find((entry) => entry.id === candidate.segmentId);
    return slot ? [{ candidate, slot }] : [];
  });

  if (rows.length === 0) return null;

  return (
    <details data-correction-propagation className="mt-5 border-t border-[var(--lv-border)] pt-4">
      <summary className="flex cursor-pointer list-none items-start gap-2 text-sm font-semibold text-[var(--lv-text)] marker:hidden">
        <WandSparkles aria-hidden="true" className="mt-0.5 shrink-0 text-teal-300" size={16} />
        <span className="min-w-0 flex-1">{text.propagationSummary(rows.length)}</span>
        <ChevronDown aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
      </summary>
      <p className="mt-2 text-xs text-[var(--lv-text-muted)]">{text.propagationHelp}</p>
      <div className="mt-3 divide-y divide-[var(--lv-border)] border-y border-[var(--lv-border)]">
        {rows.map(({ candidate, slot }) => {
          const selected = selectedIds.has(slot.id);
          return (
            <div key={slot.id} className="flex flex-wrap items-center gap-3 py-3">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => {
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(slot.id);
                      else next.delete(slot.id);
                      return next;
                    });
                  }}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-[var(--lv-text)]">
                    {text.position(slot.position.bar, slot.position.beat)}
                  </span>
                  <span className="block text-xs text-[var(--lv-text-muted)]">
                    {text.propagationSimilarity(Math.round(candidate.similarity * 100))}
                  </span>
                </span>
              </label>
              <PlayToggle
                source={propagationPlaybackSource(playbackSource, slot.id)}
                request={{ type: "chord", chord, sound: previewSound }}
                playLabel={text.propagationPreview(slot.position.bar, slot.position.beat)}
                stopLabel={stopLabel ?? text.stop}
                className="grid h-9 w-9 shrink-0 place-items-center border border-[var(--lv-border-strong)]"
                showLabel={false}
                onError={onPreviewError}
                controller={controller}
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="mt-3 inline-flex min-h-9 items-center gap-2 bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={selectedIds.size === 0}
        onClick={() => onApply(rows.map(({ slot }) => slot.id).filter((id) => selectedIds.has(id)))}
      >
        <WandSparkles aria-hidden="true" size={16} />
        {text.applyPropagation}
      </button>
    </details>
  );
}

export function propagationPlaybackSource(base: PlayingSource, slotId: string): PlayingSource {
  return { kind: base.kind, id: `${base.id}:propagation:${slotId}` };
}
