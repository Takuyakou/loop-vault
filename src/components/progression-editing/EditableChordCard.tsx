import type { EditableChordSlot } from "../../domain/progressionEditing";
import { progressionEditorCopy, type AppLanguage } from "../../i18n";
import { Pencil, TriangleAlert } from "lucide-react";

interface EditableChordCardProps {
  slot: EditableChordSlot;
  selected: boolean;
  playing: boolean;
  playingProgress?: number | null;
  onSelect: () => void;
  language: AppLanguage;
}

export function EditableChordCard({
  slot,
  selected,
  playing,
  playingProgress,
  onSelect,
  language,
}: EditableChordCardProps) {
  const text = progressionEditorCopy[language];
  const needsReview = (slot.confidence ?? 1) < 0.7 || slot.warnings.length > 0;
  return (
    <button
      type="button"
      role="option"
      className={`relative min-h-20 overflow-hidden border px-3 py-3 text-left transition-colors ${
        selected
          ? "border-teal-300 bg-teal-300/10"
          : playing
            ? "border-cyan-300 bg-cyan-300/10"
            : "border-[var(--lv-border)] bg-[var(--lv-surface)] hover:border-stone-500"
      }`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-base font-semibold text-[var(--lv-text)]">
          {slot.currentChord.label}
        </span>
        {slot.edited ? (
          <span className="text-xs text-teal-200" aria-label={text.edited}>
            <Pencil aria-hidden="true" size={16} />
          </span>
        ) : null}
      </span>
      {needsReview ? (
        <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-200">
          <TriangleAlert aria-hidden="true" size={16} />
          {text.review}
        </span>
      ) : null}
      {playing && playingProgress !== null && playingProgress !== undefined ? (
        <span
          className="absolute inset-x-0 bottom-0 h-1 origin-left bg-cyan-300 transition-transform"
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, playingProgress))})` }}
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}
