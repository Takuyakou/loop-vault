import type { EditableChordSlot } from "../../domain/progressionEditing";
import { progressionEditorCopy, type AppLanguage } from "../../i18n";
import { Pencil, Plus, SquarePen, TriangleAlert } from "lucide-react";

interface EditableChordCardProps {
  slot: EditableChordSlot;
  selected: boolean;
  playing: boolean;
  playingProgress?: number | null;
  onSelect: () => void;
  onNavigate?: (direction: -1 | 1) => void;
  onPreview?: () => void;
  onQuickEdit?: (anchorElement: HTMLElement) => void;
  openActionLabel?: string;
  onInsertAfter?: () => void;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  /** Text-entry drafts use confidence 0 as a no-analysis sentinel, not a review signal. */
  showConfidenceReview?: boolean;
  language: AppLanguage;
}

export function EditableChordCard({
  slot,
  selected,
  playing,
  playingProgress,
  onSelect,
  onNavigate,
  onPreview,
  onQuickEdit,
  openActionLabel,
  onInsertAfter,
  buttonRef,
  showConfidenceReview = true,
  language,
}: EditableChordCardProps) {
  const text = progressionEditorCopy[language];
  const needsReview = showConfidenceReview
    && ((slot.confidence ?? 1) < 0.7 || slot.warnings.length > 0);
  return (
    <div
      className={`group relative min-h-20 overflow-hidden border text-left transition-colors ${
        selected
          ? "border-teal-300 bg-teal-300/10"
          : playing
            ? "border-cyan-300 bg-cyan-300/10"
            : "border-[var(--lv-border)] bg-[var(--lv-surface)] hover:border-stone-500"
      }`}
      onContextMenu={(event) => {
        if (!onQuickEdit) return;
        event.preventDefault();
        onQuickEdit(
          event.currentTarget.querySelector<HTMLElement>("[data-chord-card]")
            ?? event.currentTarget,
        );
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        data-chord-card
        data-selected={selected}
        aria-pressed={selected}
        className="min-h-20 w-full px-3 py-3 pr-20 text-left"
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            onNavigate?.(event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
            return;
          }
          if (event.key === " " && onPreview) {
            event.preventDefault();
            event.stopPropagation();
            onPreview();
            return;
          }
          if (!onQuickEdit) return;
          if (
            event.key === "Enter"
            || event.key === "ContextMenu"
            || (event.shiftKey && event.key === "F10")
          ) {
            event.preventDefault();
            event.stopPropagation();
            onQuickEdit(event.currentTarget);
          }
        }}
      >
        <span className="flex items-start gap-2">
          <span className="min-w-0 break-words text-base font-semibold text-[var(--lv-text)] [overflow-wrap:anywhere]">
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
      {onQuickEdit ? (
        <button
          type="button"
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onQuickEdit(event.currentTarget);
          }}
          aria-label={openActionLabel ?? text.quickEdit}
          title={openActionLabel ?? text.quickEdit}
        >
          <SquarePen aria-hidden="true" size={16} />
        </button>
      ) : null}
      {onInsertAfter ? (
        <button
          type="button"
          data-insert-chord-after
          className="absolute right-12 top-2 grid h-9 w-9 place-items-center border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] text-[var(--lv-text-secondary)] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onInsertAfter();
          }}
          aria-label={text.insertAfterChord}
          title={text.insertAfterChord}
        >
          <Plus aria-hidden="true" size={16} />
        </button>
      ) : null}
    </div>
  );
}
