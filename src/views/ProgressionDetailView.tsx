import { useMemo, useState } from "react";
import type { PreviewSound } from "../audio/chordPreview";
import {
  playbackController,
  type PlaybackController,
  type PlayingSource,
} from "../audio/playbackController";
import { PlayToggle } from "../components/PlayToggle";
import { PreviewSoundSelector } from "../components/PreviewSoundSelector";
import { ProgressionTagsEditor } from "../components/ProgressionTagsEditor";
import { ChordInspector } from "../components/progression-editing/ChordInspector";
import { EditableProgressionGrid } from "../components/progression-editing/EditableProgressionGrid";
import { ProgressionEditorToolbar } from "../components/progression-editing/ProgressionEditorToolbar";
import {
  applyEditableProgressionToSavedBlock,
  canMergeEditableChords,
  canRedoProgressionEdit,
  canSplitEditableChord,
  canUndoProgressionEdit,
  createEditableProgression,
  deleteEditableChord,
  hasProgressionEdits,
  mergeEditableChords,
  redoProgressionEdit,
  replaceEditableChord,
  resetAllEditableChords,
  resetEditableChord,
  selectEditableSlot,
  splitEditableChord,
  undoProgressionEdit,
} from "../domain/progressionEditing";
import { beatsPerBar } from "../domain/midi";
import { formatProgressionText } from "../domain/progressionText";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import {
  progressionDetailCopy,
  type AppCopy,
  type AppLanguage,
} from "../i18n";
import {
  ArrowLeft,
  CopyPlus,
  ExternalLink,
  Save,
  Trash2,
} from "lucide-react";

interface ProgressionDetailViewProps {
  idea: SongIdea;
  block: SavedProgressionBlock;
  updateProgressionBlock: (
    ideaId: string,
    blockId: string,
    changes: Partial<SavedProgressionBlock>,
  ) => boolean;
  duplicateProgressionBlock: (ideaId: string, blockId: string) => string | undefined;
  openProgression: (ideaId: string, blockId: string) => void;
  openIdea: (ideaId: string) => void;
  openVault: () => void;
  requestDelete: (idea: SongIdea, block: SavedProgressionBlock) => void;
  setToast: (message: string) => void;
  copy: AppCopy;
  language: AppLanguage;
  controller?: PlaybackController;
}

export function ProgressionDetailView({
  idea,
  block,
  updateProgressionBlock,
  duplicateProgressionBlock,
  openProgression,
  openIdea,
  openVault,
  requestDelete,
  setToast,
  copy,
  language,
  controller = playbackController,
}: ProgressionDetailViewProps) {
  const text = progressionDetailCopy[language];
  const meter = beatsPerBar(block.timeSignature);
  const [editable, setEditable] = useState(() => createEditableProgression(block, meter));
  const [previewSound, setPreviewSound] = useState<PreviewSound>("piano");
  const dirty = hasProgressionEdits(editable);
  const editingBlock = useMemo(
    () => applyEditableProgressionToSavedBlock(block, editable),
    [block, editable],
  );
  const selectedIndex = Math.max(
    0,
    editable.slots.findIndex((slot) => slot.id === editable.selectedSlotId),
  );
  const selectedSlot = editable.slots[selectedIndex];
  const previousSlot = selectedIndex > 0 ? editable.slots[selectedIndex - 1] : undefined;
  const nextSlot = editable.slots[selectedIndex + 1];
  const playbackSource: PlayingSource = {
    kind: "detail",
    id: `idea:${idea.id}:progression:${block.id}`,
  };

  function saveChanges() {
    const saved = updateProgressionBlock(idea.id, block.id, editingBlock);
    if (!saved) {
      setToast(text.saveFailed);
      return;
    }
    setEditable(createEditableProgression(editingBlock, meter));
    setToast(text.savedToast);
  }

  function duplicate() {
    const duplicateId = duplicateProgressionBlock(idea.id, block.id);
    if (!duplicateId) {
      setToast(text.duplicateFailed);
      return;
    }
    setToast(text.duplicatedToast);
    openProgression(idea.id, duplicateId);
  }

  async function copyForChordDrip() {
    if (!navigator.clipboard?.writeText) {
      setToast(text.copyFailed);
      return;
    }
    try {
      await navigator.clipboard.writeText(formatProgressionText(editingBlock.chords));
      setToast(text.copiedForChordDrip);
    } catch {
      setToast(text.copyFailed);
    }
  }

  async function previewChord(chord: SavedProgressionBlock["chords"][number]["chord"]) {
    try {
      await controller.toggle(
        { kind: "detail", id: `${playbackSource.id}:chord` },
        { type: "chord", chord, sound: previewSound },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  const bars = block.lengthBars ?? progressionBarCount(block);

  return (
    <div className="lv-capture-content py-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--lv-border)] pb-4">
        <div className="min-w-0">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"
            onClick={openVault}
          >
            <ArrowLeft aria-hidden="true" size={16} />
            {text.backToVault}
          </button>
          <p className="mt-4 text-xs font-semibold uppercase text-[var(--lv-accent)]">
            {text.progression}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--lv-text)]">
            {block.summaryText || text.untitled}
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="lv-button-ghost inline-flex min-h-9 items-center gap-2 px-3 text-sm"
            onClick={() => openIdea(idea.id)}
          >
            <ExternalLink aria-hidden="true" size={16} />
            {text.openParentIdea}
          </button>
          <button
            type="button"
            className="lv-button-ghost inline-flex h-9 w-9 items-center justify-center"
            onClick={duplicate}
            aria-label={text.duplicate}
            title={text.duplicate}
          >
            <CopyPlus aria-hidden="true" size={16} />
          </button>
          <button
            type="button"
            className="lv-button-ghost inline-flex h-9 w-9 items-center justify-center text-red-200"
            onClick={() => requestDelete(idea, block)}
            aria-label={copy.common.delete}
            title={copy.common.delete}
          >
            <Trash2 aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--lv-border)] py-4">
        <PlayToggle
          source={playbackSource}
          request={{
            type: "timeline",
            timeline: editingBlock.chords,
            bpm: block.bpm ?? idea.bpm,
            sound: previewSound,
            beatsPerBar: meter,
          }}
          playLabel={copy.common.preview}
          stopLabel={copy.common.stop}
          className="lv-button-primary min-h-9 px-3 text-sm font-semibold"
          onError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
          controller={controller}
        />
        <PreviewSoundSelector
          value={previewSound}
          onChange={(sound) => {
            controller.stop();
            setPreviewSound(sound);
          }}
          copy={copy}
        />
        <MetadataBadge label="Key" value={block.detectedKey ?? idea.key ?? "-"} />
        <MetadataBadge label="BPM" value={String(block.bpm ?? idea.bpm ?? "-")} />
        <MetadataBadge label={text.barCount(bars)} value={block.startBar && block.endBar ? text.barRange(block.startBar, block.endBar) : block.timeSignature ?? "-"} />
        <span
          className={`ml-auto text-xs font-semibold ${dirty ? "text-amber-200" : "text-teal-200"}`}
          aria-live="polite"
        >
          {dirty ? text.unsavedChanges : text.noChanges}
        </span>
        <button
          type="button"
          className="lv-button-primary inline-flex min-h-9 items-center gap-2 px-3 text-sm font-semibold disabled:opacity-40"
          disabled={!dirty}
          onClick={saveChanges}
        >
          <Save aria-hidden="true" size={16} />
          {text.saveChanges}
        </button>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0">
          <ProgressionEditorToolbar
            canUndo={canUndoProgressionEdit(editable)}
            canRedo={canRedoProgressionEdit(editable)}
            dirty={dirty}
            onUndo={() => setEditable((current) => undoProgressionEdit(current))}
            onRedo={() => setEditable((current) => redoProgressionEdit(current))}
            onResetAll={() => setEditable((current) => resetAllEditableChords(current))}
            language={language}
          />
          <EditableProgressionGrid
            editable={editable}
            onSelect={(slotId) => setEditable((current) => selectEditableSlot(current, slotId))}
            language={language}
            quickEditor={{
              onPreview: (_slotId, chord) => void previewChord(chord),
              onApply: (slotId, chord, source) => setEditable((current) => (
                replaceEditableChord(
                  selectEditableSlot(current, slotId),
                  slotId,
                  chord,
                  source,
                )
              )),
              onReset: (slotId) => setEditable((current) => resetEditableChord(current, slotId)),
              onOpenInspector: (slotId) => setEditable((current) => selectEditableSlot(current, slotId)),
            }}
          />

          <div className="mt-6 border-t border-[var(--lv-border)] pt-4">
            <ProgressionTagsEditor
              block={editingBlock}
              keySignature={block.detectedKey ?? idea.key}
              language={language}
              onChange={(changes) => {
                const updated = updateProgressionBlock(idea.id, block.id, changes);
                if (!updated) setToast(text.saveFailed);
              }}
            />
            <dl className="grid gap-2 text-sm">
              <MetadataRow label={text.source} value={block.sourceFileName ?? block.origin ?? "Manual"} />
              <MetadataRow label={text.parentIdea} value={idea.title} />
            </dl>
          </div>

          <button
            type="button"
            className="lv-button-secondary mt-5 px-3 py-2 text-sm"
            onClick={() => void copyForChordDrip()}
          >
            {text.copyForChordDrip}
          </button>
        </section>

        <div className="lv-responsive-inspector-host" data-active="true">
          <ChordInspector
            slot={selectedSlot}
            language={language}
            onPreview={(chord) => void previewChord(chord)}
            playbackSource={playbackSource}
            previewSound={previewSound}
            stopLabel={copy.common.stop}
            onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
            controller={controller}
            originalLabel={text.savedChord}
            currentLabel={text.editingChord}
            onApply={(chord, source) => setEditable((current) => {
              const slotId = current.selectedSlotId;
              return slotId ? replaceEditableChord(current, slotId, chord, source) : current;
            })}
            onReset={() => setEditable((current) => {
              const slotId = current.selectedSlotId;
              return slotId ? resetEditableChord(current, slotId) : current;
            })}
            canSplit={Boolean(selectedSlot && canSplitEditableChord(editable, selectedSlot.id))}
            canMergePrevious={Boolean(previousSlot && selectedSlot && canMergeEditableChords(editable, previousSlot.id, selectedSlot.id))}
            canMergeNext={Boolean(selectedSlot && nextSlot && canMergeEditableChords(editable, selectedSlot.id, nextSlot.id))}
            canDelete={editable.slots.length > 1}
            onSplit={() => selectedSlot && setEditable(splitEditableChord(editable, selectedSlot.id))}
            onMergePrevious={() => previousSlot && selectedSlot && setEditable(mergeEditableChords(editable, previousSlot.id, selectedSlot.id, "second"))}
            onMergeNext={() => selectedSlot && nextSlot && setEditable(mergeEditableChords(editable, selectedSlot.id, nextSlot.id, "first"))}
            onDelete={() => selectedSlot && setEditable(deleteEditableChord(editable, selectedSlot.id))}
          />
        </div>
      </div>
    </div>
  );
}

function progressionBarCount(block: SavedProgressionBlock): number {
  if (block.chords.length === 0) return 0;
  const bars = block.chords.map((item) => item.bar);
  return Math.max(...bars) - Math.min(...bars) + 1;
}

function MetadataBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-2 border border-[var(--lv-border)] px-3 text-xs">
      <span className="text-[var(--lv-text-muted)]">{label}</span>
      <strong className="font-semibold text-[var(--lv-text)]">{value}</strong>
    </span>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
      <dt className="text-[var(--lv-text-muted)]">{label}</dt>
      <dd className="min-w-0 truncate text-[var(--lv-text)]">{value}</dd>
    </div>
  );
}
