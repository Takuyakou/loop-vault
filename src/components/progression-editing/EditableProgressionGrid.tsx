import { useEffect, useRef, useState } from "react";
import {
  type ChordContextAction,
  quickCandidatesForSlot,
  type AuthorReferenceIndex,
  type EditableProgression,
  type QuickCandidateSelectionMetadata,
} from "../../domain/progressionEditing";
import type { ChordSymbol } from "../../domain/types";
import { progressionEditorCopy, type AppLanguage } from "../../i18n";
import { EditableChordCard } from "./EditableChordCard";
import { ChordContextMenu } from "./ChordContextMenu";
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

export interface ChordContextActionControls {
  canCutRange?(slotId: string): boolean;
  onAction(slotId: string, action: ChordContextAction): boolean;
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
  contextActions?: ChordContextActionControls;
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
  contextActions,
}: EditableProgressionGridProps) {
  const text = progressionEditorCopy[language];
  const cardButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const [quickEdit, setQuickEdit] = useState<{
    slotId: string;
    index: number;
    anchorElement: HTMLElement;
  }>();
  const [contextMenu, setContextMenu] = useState<{
    slotId: string;
    index: number;
    anchorElement: HTMLElement;
  }>();
  const [actionToast, setActionToast] = useState<string>();
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

  useEffect(() => {
    if (contextMenu && !editable.slots.some((slot) => slot.id === contextMenu.slotId)) {
      setContextMenu(undefined);
    }
  }, [contextMenu, editable.slots]);

  useEffect(() => {
    if (!actionToast) return undefined;
    const timeout = window.setTimeout(() => setActionToast(undefined), 4_000);
    return () => window.clearTimeout(timeout);
  }, [actionToast]);

  function openQuickEditor(slotId: string, index: number, anchorElement: HTMLElement) {
    if (!quickEditor) return;
    if (quickEditor.onOpen) quickEditor.onOpen(slotId, index);
    else (onNavigate ?? onSelect)(slotId, index);
    setQuickEdit({ slotId, index, anchorElement });
  }

  function openContextMenu(slotId: string, index: number, anchorElement: HTMLElement) {
    (onNavigate ?? onSelect)(slotId, index);
    setQuickEdit(undefined);
    setContextMenu({ slotId, index, anchorElement });
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
        <div className="contents" role="group" aria-label={text.selectChord}>
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
                ? (anchorElement) => contextActions
                  ? openContextMenu(slot.id, index, anchorElement)
                  : openQuickEditor(slot.id, index, anchorElement)
                : undefined}
              openActionLabel={contextActions
                ? language === "ja" ? "編集メニュー" : "Edit actions"
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
      {contextActions && contextMenu ? (
        <ChordContextMenu
          editable={editable}
          slotId={contextMenu.slotId}
          anchorElement={contextMenu.anchorElement}
          language={language}
          canCutRange={contextActions.canCutRange?.(contextMenu.slotId) ?? false}
          onEdit={() => {
            const current = contextMenu;
            setContextMenu(undefined);
            openQuickEditor(current.slotId, current.index, current.anchorElement);
          }}
          onAction={(action) => {
            const message = contextActionMessage(
              editable,
              contextMenu.slotId,
              action,
              language,
            );
            if (contextActions.onAction(contextMenu.slotId, action)) {
              setActionToast(message);
            }
          }}
          onClose={() => setContextMenu(undefined)}
        />
      ) : null}
      {actionToast ? (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-[70] max-w-sm border border-teal-300/60 bg-[var(--lv-surface)] px-4 py-3 text-sm text-[var(--lv-text)] shadow-xl"
        >
          {actionToast}
        </div>
      ) : null}
    </>
  );
}

function contextActionMessage(
  editable: EditableProgression,
  slotId: string,
  action: ChordContextAction,
  language: AppLanguage,
): string {
  const index = editable.slots.findIndex((slot) => slot.id === slotId);
  const slot = editable.slots[index];
  if (!slot) return language === "ja" ? "変更しました" : "Changed";
  const previous = editable.slots[index - 1];
  const next = editable.slots[index + 1];
  const beats = slot.position.durationBeats;
  const pair = next ? [slot, next] as const : previous ? [previous, slot] as const : undefined;
  if (language === "en") {
    if (action === "delete-extend-previous") {
      return `Deleted ${slot.currentChord.label} and extended ${previous?.currentChord.label} by ${beats} beats.`;
    }
    if (action === "delete-extend-next") {
      return `Deleted ${slot.currentChord.label} and extended ${next?.currentChord.label} by ${beats} beats.`;
    }
    if (action === "delete-close-gap") {
      return `Deleted ${slot.currentChord.label} and shifted following chords by ${beats} beats.`;
    }
    if (action === "replace-no-chord") return `Replaced ${slot.currentChord.label} with N.C.`;
    if (action === "split") return `Split ${slot.currentChord.label} into two equal events.`;
    if (action === "cut-range-here") return `Cut the Draft range at the end of ${slot.currentChord.label}.`;
    const kept = action === "merge-keep-left" ? pair?.[0] : pair?.[1];
    return `Merged ${pair?.[0].currentChord.label} and ${pair?.[1].currentChord.label}, keeping ${kept?.currentChord.label}.`;
  }
  if (action === "delete-extend-previous") {
    return `${slot.currentChord.label}を削除し、前の${previous?.currentChord.label}を${beats}拍延長しました`;
  }
  if (action === "delete-extend-next") {
    return `${slot.currentChord.label}を削除し、次の${next?.currentChord.label}を${beats}拍延長しました`;
  }
  if (action === "delete-close-gap") {
    return `${slot.currentChord.label}を削除し、後続コードを${beats}拍前へ詰めました`;
  }
  if (action === "replace-no-chord") return `${slot.currentChord.label}をN.C.に置き換えました`;
  if (action === "split") return `${slot.currentChord.label}を同じ長さの2つに分割しました`;
  if (action === "cut-range-here") {
    return `${slot.currentChord.label}の終端でDraft範囲を切りました`;
  }
  const kept = action === "merge-keep-left" ? pair?.[0] : pair?.[1];
  return `${pair?.[0].currentChord.label}と${pair?.[1].currentChord.label}を結合し、${kept?.currentChord.label}を残しました`;
}
