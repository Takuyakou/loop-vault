import { useEffect, useRef, useState } from "react";
import {
  contextualAlternativesForSlot,
  type EditableProgression,
} from "../../domain/progressionEditing";
import type { ChordSymbol } from "../../domain/types";
import { progressionEditorCopy, type AppLanguage } from "../../i18n";
import { Plus } from "lucide-react";
import { EditableChordCard } from "./EditableChordCard";
import { QuickChordEditor } from "./QuickChordEditor";

export interface QuickChordEditorControls {
  resetLabel?: string;
  onOpen?: (slotId: string, index: number) => void;
  onPreview: (slotId: string, chord: ChordSymbol) => void;
  onApply: (
    slotId: string,
    chord: ChordSymbol,
    source: "alternative" | "structure-editor",
  ) => void;
  onReset: (slotId: string) => void;
  onOpenInspector: (slotId: string, index: number) => void;
}

interface EditableProgressionGridProps {
  editable: EditableProgression;
  playingSlotId?: string;
  playingProgress?: number | null;
  onSelect: (slotId: string, index: number) => void;
  onNavigate?: (slotId: string, index: number) => void;
  onPreviewSlot?: (slotId: string, chord: ChordSymbol, index: number) => void;
  onAppend?: () => void;
  keySignature?: string;
  language: AppLanguage;
  quickEditor?: QuickChordEditorControls;
}

export function EditableProgressionGrid({
  editable,
  playingSlotId,
  playingProgress,
  onSelect,
  onNavigate,
  onPreviewSlot,
  onAppend,
  keySignature,
  language,
  quickEditor,
}: EditableProgressionGridProps) {
  const text = progressionEditorCopy[language];
  const cardButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const [quickEdit, setQuickEdit] = useState<{
    slotId: string;
    index: number;
    anchorElement: HTMLElement;
  }>();
  const quickSlot = quickEdit
    ? contextualAlternativesForSlot(editable, quickEdit.slotId, keySignature)
    : undefined;

  useEffect(() => {
    if (quickEdit && !quickSlot) setQuickEdit(undefined);
  }, [quickEdit, quickSlot]);

  function openQuickEditor(slotId: string, index: number, anchorElement: HTMLElement) {
    if (!quickEditor) return;
    if (quickEditor.onOpen) quickEditor.onOpen(slotId, index);
    else onSelect(slotId, index);
    setQuickEdit({ slotId, index, anchorElement });
  }

  function moveSelection(index: number, direction: -1 | 1) {
    const nextIndex = Math.max(0, Math.min(editable.slots.length - 1, index + direction));
    const nextSlot = editable.slots[nextIndex];
    if (!nextSlot) return;
    (onNavigate ?? onSelect)(nextSlot.id, nextIndex);
    cardButtons.current[nextIndex]?.focus();
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2">
        <div className="contents" role="listbox" aria-label={text.selectChord}>
          {editable.slots.map((slot, index) => (
            <EditableChordCard
              key={slot.id}
              slot={slot}
              selected={editable.selectedSlotId === slot.id}
              playing={playingSlotId === slot.id}
              playingProgress={playingSlotId === slot.id ? playingProgress : null}
              onSelect={() => onSelect(slot.id, index)}
              onNavigate={(direction) => moveSelection(index, direction)}
              onPreview={onPreviewSlot
                ? () => onPreviewSlot(slot.id, slot.currentChord, index)
                : undefined}
              onQuickEdit={quickEditor
                ? (anchorElement) => openQuickEditor(slot.id, index, anchorElement)
                : undefined}
              buttonRef={(element) => { cardButtons.current[index] = element; }}
              language={language}
            />
          ))}
        </div>
        {onAppend ? (
          <button
            type="button"
            data-add-chord
            className="grid min-h-20 place-items-center border border-dashed border-[var(--lv-border-strong)] bg-[var(--lv-surface)] text-[var(--lv-text-secondary)] transition-colors hover:border-teal-300 hover:text-teal-200"
            onClick={onAppend}
            aria-label={text.addChord}
            title={text.addChord}
          >
            <Plus aria-hidden="true" size={20} />
          </button>
        ) : null}
      </div>
      {quickEditor && quickEdit && quickSlot ? (
        <QuickChordEditor
          key={quickSlot.id}
          slot={quickSlot}
          anchorElement={quickEdit.anchorElement}
          language={language}
          resetLabel={quickEditor.resetLabel}
          onPreview={(chord) => quickEditor.onPreview(quickSlot.id, chord)}
          onApply={(chord, source) => quickEditor.onApply(quickSlot.id, chord, source)}
          onReset={() => quickEditor.onReset(quickSlot.id)}
          onOpenInspector={() => quickEditor.onOpenInspector(quickSlot.id, quickEdit.index)}
          onClose={() => setQuickEdit(undefined)}
        />
      ) : null}
    </>
  );
}
