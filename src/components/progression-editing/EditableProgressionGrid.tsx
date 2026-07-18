import { useEffect, useRef, useState } from "react";
import {
  quickCandidatesForSlot,
  type AuthorReferenceIndex,
  type EditableProgression,
  type QuickCandidateSelectionMetadata,
} from "../../domain/progressionEditing";
import type { ChordSymbol } from "../../domain/types";
import { progressionEditorCopy, type AppLanguage } from "../../i18n";
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
    selection?: QuickCandidateSelectionMetadata,
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
  onInsertAfter?: (slotId: string) => void;
  keySignature?: string;
  authorReferenceIndex?: AuthorReferenceIndex;
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
  onInsertAfter,
  keySignature,
  authorReferenceIndex,
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
    ? editable.slots.find((slot) => slot.id === quickEdit.slotId)
    : undefined;
  const quickCandidates = quickEdit
    ? quickCandidatesForSlot({
        editable,
        slotId: quickEdit.slotId,
        keySignature,
        authorReferenceIndex,
      })
    : [];

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
              onInsertAfter={onInsertAfter ? () => onInsertAfter(slot.id) : undefined}
              buttonRef={(element) => { cardButtons.current[index] = element; }}
              language={language}
            />
          ))}
        </div>
      </div>
      {quickEditor && quickEdit && quickSlot ? (
        <QuickChordEditor
          key={quickSlot.id}
          slot={quickSlot}
          candidates={quickCandidates}
          anchorElement={quickEdit.anchorElement}
          language={language}
          resetLabel={quickEditor.resetLabel}
          onPreview={(chord) => quickEditor.onPreview(quickSlot.id, chord)}
          onApply={(chord, source, selection) => quickEditor.onApply(
            quickSlot.id,
            chord,
            source,
            selection,
          )}
          onReset={() => quickEditor.onReset(quickSlot.id)}
          onOpenInspector={() => quickEditor.onOpenInspector(quickSlot.id, quickEdit.index)}
          onClose={() => setQuickEdit(undefined)}
        />
      ) : null}
    </>
  );
}
