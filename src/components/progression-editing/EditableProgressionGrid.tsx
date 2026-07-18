import { useEffect, useState } from "react";
import type { EditableProgression } from "../../domain/progressionEditing";
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
  ) => void;
  onReset: (slotId: string) => void;
  onOpenInspector: (slotId: string, index: number) => void;
}

interface EditableProgressionGridProps {
  editable: EditableProgression;
  playingSlotId?: string;
  playingProgress?: number | null;
  onSelect: (slotId: string, index: number) => void;
  language: AppLanguage;
  quickEditor?: QuickChordEditorControls;
}

export function EditableProgressionGrid({
  editable,
  playingSlotId,
  playingProgress,
  onSelect,
  language,
  quickEditor,
}: EditableProgressionGridProps) {
  const text = progressionEditorCopy[language];
  const [quickEdit, setQuickEdit] = useState<{
    slotId: string;
    index: number;
    anchorElement: HTMLElement;
  }>();
  const quickSlot = quickEdit
    ? editable.slots.find((slot) => slot.id === quickEdit.slotId)
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

  return (
    <>
      <div
        className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2"
        role="listbox"
        aria-label={text.selectChord}
      >
        {editable.slots.map((slot, index) => (
          <EditableChordCard
            key={slot.id}
            slot={slot}
            selected={editable.selectedSlotId === slot.id}
            playing={playingSlotId === slot.id}
            playingProgress={playingSlotId === slot.id ? playingProgress : null}
            onSelect={() => onSelect(slot.id, index)}
            onQuickEdit={quickEditor
              ? (anchorElement) => openQuickEditor(slot.id, index, anchorElement)
              : undefined}
            language={language}
          />
        ))}
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
