import type { EditableProgression } from "../../domain/progressionEditing";
import { progressionEditorCopy, type AppLanguage } from "../../i18n";
import { EditableChordCard } from "./EditableChordCard";

interface EditableProgressionGridProps {
  editable: EditableProgression;
  playingSlotId?: string;
  playingProgress?: number | null;
  onSelect: (slotId: string, index: number) => void;
  language: AppLanguage;
}

export function EditableProgressionGrid({
  editable,
  playingSlotId,
  playingProgress,
  onSelect,
  language,
}: EditableProgressionGridProps) {
  const text = progressionEditorCopy[language];
  return (
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
          language={language}
        />
      ))}
    </div>
  );
}
