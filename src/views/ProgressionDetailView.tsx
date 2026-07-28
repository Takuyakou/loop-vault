import { useMemo, useState } from "react";
import type { PreviewSound } from "../audio/chordPreview";
import { voiceChordForPreview } from "../domain/chordVoicing";
import {
  playbackController,
  type PlaybackController,
  type PlayingSource,
} from "../audio/playbackController";
import { PlayToggle } from "../components/PlayToggle";
import { PreviewSoundSelector } from "../components/PreviewSoundSelector";
import { ProgressionTagsEditor } from "../components/ProgressionTagsEditor";
import { PracticeProgressBadge } from "../components/practice/PracticeProgressBadge";
import { ProgressionAdvisorButton } from "../components/progression-advisor/ProgressionAdvisorButton";
import { ProgressionAdvisorDrawer } from "../components/progression-advisor/ProgressionAdvisorDrawer";
import { ChordInspector } from "../components/progression-editing/ChordInspector";
import { EditableProgressionGrid } from "../components/progression-editing/EditableProgressionGrid";
import { ProgressionEditorToolbar } from "../components/progression-editing/ProgressionEditorToolbar";
import { VoicingPanel } from "../components/voicing/VoicingPanel";
import {
  applyEditableProgressionToSavedBlock,
  buildAuthorReferenceIndex,
  canMergeEditableChords,
  canRedoProgressionEdit,
  canSplitEditableChord,
  canUndoProgressionEdit,
  createEditableProgression,
  deleteEditableChord,
  insertSuggestedEditableChordAfter,
  hasProgressionEdits,
  markEditableProgressionSaved,
  mergeEditableChords,
  quickCandidatesForSlot,
  redoProgressionEdit,
  replaceEditableChord,
  resetAllEditableChords,
  resetEditableChord,
  selectedEditableSlotIndex,
  selectEditableSlot,
  setEditableVoicingMemories,
  setEditableVoicingMemory,
  splitEditableChord,
  undoProgressionEdit,
} from "../domain/progressionEditing";
import {
  annotateVoiceRoles,
  beatsPerBar,
  buildCorrectionEvents,
  buildVoiceFeatureInputs,
  buildVoices,
  normalizeNotes,
} from "../domain/midi";
import type { MidiSongData } from "../domain/midi/types";
import { degreeSequence } from "../domain/harmony/degrees";
import { buildProgressionIndex } from "../domain/progressionClassification/mod";
import { formatProgressionText } from "../domain/progressionText";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import { extractVoicing, resolveVoicingForUse } from "../domain/voicing";
import { advisorSuggestionToCandidate, appendAdvisorSuggestionToEditableProgression, selectAdvisorReferenceContexts } from "../domain/progressionAdvisor";
import { appendAnalysisFeedback } from "../storage/analysisFeedbackStorage";
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
  Dumbbell,
} from "lucide-react";

interface ProgressionDetailViewProps {
  idea: SongIdea;
  ideas?: readonly SongIdea[];
  block: SavedProgressionBlock;
  updateProgressionBlock: (
    ideaId: string,
    blockId: string,
    changes: Partial<SavedProgressionBlock>,
  ) => boolean;
  duplicateProgressionBlock: (ideaId: string, blockId: string) => string | undefined;
  appendBlockToIdea?: (
    ideaId: string,
    block: ReturnType<typeof advisorSuggestionToCandidate>,
    analysis?: undefined,
    metadata?: { userEdited?: boolean; userVerified?: boolean },
  ) => boolean;
  openProgression: (ideaId: string, blockId: string) => void;
  openIdea: (ideaId: string) => void;
  openVault: () => void;
  requestDelete: (idea: SongIdea, block: SavedProgressionBlock) => void;
  openPractice?: () => void;
  setToast: (message: string) => void;
  copy: AppCopy;
  language: AppLanguage;
  controller?: PlaybackController;
  loadMidiSource?: (path: string) => Promise<MidiSongData>;
}

export function ProgressionDetailView({
  idea,
  ideas = [idea],
  block,
  updateProgressionBlock,
  duplicateProgressionBlock,
  appendBlockToIdea,
  openProgression,
  openIdea,
  openVault,
  requestDelete,
  openPractice,
  setToast,
  copy,
  language,
  controller = playbackController,
  loadMidiSource,
}: ProgressionDetailViewProps) {
  const text = progressionDetailCopy[language];
  const meter = beatsPerBar(block.timeSignature);
  const [editable, setEditable] = useState(() => createEditableProgression(block, meter));
  const [previewSound, setPreviewSound] = useState<PreviewSound>("piano");
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [reextracting, setReextracting] = useState(false);
  const dirty = hasProgressionEdits(editable);
  const editingBlock = useMemo(
    () => applyEditableProgressionToSavedBlock(block, editable),
    [block, editable],
  );
  const selectedIndex = selectedEditableSlotIndex(editable);
  const keySignature = block.detectedKey ?? idea.key;
  const authorReferenceIndex = useMemo(() => buildAuthorReferenceIndex(ideas), [ideas]);
  const progressionIndex = useMemo(() => buildProgressionIndex(ideas), [ideas]);
  const currentIndexEntry = progressionIndex.find((entry) => entry.ideaId === idea.id && entry.blockId === block.id);
  const advisorReferenceContext = useMemo(() => selectAdvisorReferenceContexts({
    index: progressionIndex,
    currentBlockId: block.id,
    key: keySignature,
    tagIds: currentIndexEntry?.effectiveTags ?? block.tags,
    romanNumerals: degreeSequence(editingBlock),
  }), [block.id, block.tags, currentIndexEntry?.effectiveTags, editingBlock, keySignature, progressionIndex]);
  const selectedSlot = selectedIndex === undefined
    ? undefined
    : editable.slots[selectedIndex];
  const selectedQuickCandidates = selectedSlot
    ? quickCandidatesForSlot({
        editable,
        slotId: selectedSlot.id,
        keySignature,
        authorReferenceIndex,
      })
    : [];
  const previousSlot = selectedIndex !== undefined && selectedIndex > 0
    ? editable.slots[selectedIndex - 1]
    : undefined;
  const nextSlot = selectedIndex === undefined ? undefined : editable.slots[selectedIndex + 1];
  const playbackSource: PlayingSource = {
    kind: "detail",
    id: `idea:${idea.id}:progression:${block.id}`,
  };
  const sourceAsset = idea.assets.find((asset) => (
    asset.type === "midi"
    && (
      asset.id === block.sourceAssetId
      || (
        !block.sourceAssetId
        && block.sourceFileName !== undefined
        && fileNameFromPath(asset.path) === block.sourceFileName
      )
    )
  ));
  const explicitMidiNotesByEventId = useMemo(() => Object.fromEntries(
    editingBlock.chords.flatMap((item) => {
      if (!item.eventId) return [];
      return [[
        item.eventId,
        resolveVoicingForUse(
          item.chord,
          item.voicingMemory,
          voiceChordForPreview(item.chord).notes,
        ).midiNotes,
      ]];
    }),
  ), [editingBlock.chords]);

  function saveChanges() {
    const saved = updateProgressionBlock(idea.id, block.id, editingBlock);
    if (!saved) {
      setToast(text.saveFailed);
      return;
    }
    const correctionEvents = buildCorrectionEvents(
      block,
      editingBlock,
      {
        sourceFingerprint: block.sourceFingerprint,
        analyzerVersion: block.sourceAnalyzerVersion ?? block.analyzerVersion,
        timeSignature: block.timeSignature,
        detectedKey: block.detectedKey ?? idea.key,
      },
      editable.slots.map((slot) => slot.editSource),
      editable.slots.map((slot) => slot.quickCandidateSelection),
    );
    if (correctionEvents.length > 0) {
      void appendAnalysisFeedback(correctionEvents)
        .catch(() => setToast(copy.capture.feedbackSaveFailed));
    }
    setEditable((current) => markEditableProgressionSaved(current));
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

  async function previewChord(
    chord: SavedProgressionBlock["chords"][number]["chord"],
    slotId = "draft",
    useSavedVoicing = false,
  ) {
    const slot = useSavedVoicing
      ? editable.slots.find((candidate) => candidate.id === slotId)
      : undefined;
    const explicitMidiNotes = slot
      ? resolveVoicingForUse(
          chord,
          slot.voicingMemory,
          voiceChordForPreview(chord).notes,
        ).midiNotes
      : undefined;
    try {
      await controller.toggle(
        { kind: "detail", id: `${playbackSource.id}:chord:${slotId}:${chordPreviewKey(chord)}` },
        { type: "chord", chord, sound: previewSound, explicitMidiNotes },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  async function reextractSourceVoicings() {
    if (!sourceAsset?.path || !loadMidiSource) {
      setToast(language === "ja"
        ? "元MIDIファイルを見つけられませんでした。"
        : "The source MIDI file could not be found.");
      return;
    }
    if (
      editable.slots.some((slot) => slot.voicingMemory?.sourceVoicing)
      && !globalThis.confirm(language === "ja"
        ? `現在の進行 ${editable.slots.length} コードの元MIDIボイシングを再取得します。続けますか？`
        : `Re-extract source voicings for ${editable.slots.length} chords?`)
    ) {
      return;
    }
    setReextracting(true);
    try {
      const sourceData = await loadMidiSource(sourceAsset.path);
      const normalized = normalizeNotes(sourceData);
      const baseVoices = buildVoices(sourceData);
      const voices = annotateVoiceRoles(
        baseVoices,
        buildVoiceFeatureInputs(baseVoices, normalized),
      );
      const updates = editable.slots.flatMap((slot) => {
        const startBeat = (slot.position.bar - 1) * editable.beatsPerBar + slot.position.beat - 1;
        const result = extractVoicing({
          chord: slot.currentChord,
          segment: {
            startBeat,
            endBeat: startBeat + slot.position.durationBeats,
          },
          notes: sourceData.notes,
          ticksPerBeat: sourceData.ticksPerBeat,
          voices,
        });
        return result.snapshot
          ? [{
              slotId: slot.id,
              memory: {
                ...slot.voicingMemory,
                sourceVoicing: result.snapshot,
              },
            }]
          : [];
      });
      setEditable((current) => setEditableVoicingMemories(current, updates));
      setToast(language === "ja"
        ? `${updates.length}/${editable.slots.length} コードのボイシングを取得しました。保存すると反映されます。`
        : `Extracted voicings for ${updates.length}/${editable.slots.length} chords. Save to keep them.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : (
        language === "ja" ? "元MIDIから取得できませんでした。" : "Could not extract from source MIDI."
      ));
    } finally {
      setReextracting(false);
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
          <h2 className="mt-1 text-lg font-semibold text-[var(--lv-text)]">
            {block.summaryText || text.untitled}
          </h2>
          <span className="mt-2 inline-flex">
            <PracticeProgressBadge
              block={block}
              language={language}
              effectiveKeySignature={block.detectedKey ?? idea.key}
            />
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {openPractice ? (
            <button
              type="button"
              className="lv-button-primary inline-flex min-h-9 items-center gap-2 px-3 text-sm font-semibold"
              onClick={openPractice}
            >
              <Dumbbell aria-hidden="true" size={16} />
              {language === "ja" ? "練習する" : "Practice"}
            </button>
          ) : null}
          <ProgressionAdvisorButton language={language} onClick={() => setAdvisorOpen(true)} />
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
      <ProgressionAdvisorDrawer
        open={advisorOpen}
        block={editingBlock}
        title={idea.title}
        keySignature={keySignature}
        bpm={block.bpm ?? idea.bpm}
        language={language}
        onClose={() => setAdvisorOpen(false)}
        onAppend={(suggestion) => setEditable((current) => appendAdvisorSuggestionToEditableProgression(current, suggestion))}
        onSave={(suggestion) => {
          const saved = appendBlockToIdea?.(idea.id, advisorSuggestionToCandidate(suggestion), undefined, { userEdited: true, userVerified: false }) ?? false;
          if (!saved) setToast(text.saveFailed);
          return saved;
        }}
        onApplyTags={(tagIds) => {
          const updated = updateProgressionBlock(idea.id, block.id, { tags: [...new Set([...editingBlock.tags, ...tagIds])] });
          if (!updated) setToast(text.saveFailed);
          return updated;
        }}
        setToast={setToast}
        referenceContext={advisorReferenceContext}
        derivedTagIds={currentIndexEntry?.derivedTags.map((tag) => tag.tagId)}
      />

      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--lv-border)] py-4">
        <PlayToggle
          source={playbackSource}
          request={{
            type: "timeline",
            timeline: editingBlock.chords,
            bpm: block.bpm ?? idea.bpm,
            sound: previewSound,
            beatsPerBar: meter,
            explicitMidiNotesByEventId,
          }}
          playLabel={copy.common.preview}
          stopLabel={copy.common.stop}
          className="lv-button-primary lv-progression-preview-toggle inline-flex min-h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap px-3 text-sm font-semibold"
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

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]" data-progression-detail-editor>
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
            onSelect={(slotId, index) => {
              setEditable((current) => selectEditableSlot(current, slotId));
              const slot = editable.slots[index];
              if (slot) void previewChord(slot.currentChord, slot.id, true);
            }}
            onNavigate={(slotId) => setEditable((current) => selectEditableSlot(current, slotId))}
            onPreviewSlot={(slotId, chord) => {
              setEditable((current) => selectEditableSlot(current, slotId));
              void previewChord(chord, slotId, true);
            }}
            onInsertAfter={(slotId) => setEditable((current) => (
              insertSuggestedEditableChordAfter(
                current,
                slotId,
                keySignature,
                authorReferenceIndex,
              )
            ))}
            keySignature={keySignature}
            authorReferenceIndex={authorReferenceIndex}
            language={language}
            quickEditor={{
              onPreview: (slotId, chord) => void previewChord(chord, slotId),
              onApply: (slotId, chord, source, selection) => setEditable((current) => (
                replaceEditableChord(
                  selectEditableSlot(current, slotId),
                  slotId,
                  chord,
                  source,
                  selection,
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

        <div className="lv-progression-detail-inspector min-w-0" data-progression-detail-inspector>
          <ChordInspector
            slot={selectedSlot}
            quickCandidates={selectedQuickCandidates}
            language={language}
            onPreview={(chord) => void previewChord(chord)}
            playbackSource={playbackSource}
            previewSound={previewSound}
            stopLabel={copy.common.stop}
            onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
            controller={controller}
            originalLabel={text.savedChord}
            currentLabel={text.editingChord}
            currentExplicitMidiNotes={selectedSlot
              ? resolveVoicingForUse(
                  selectedSlot.currentChord,
                  selectedSlot.voicingMemory,
                  voiceChordForPreview(selectedSlot.currentChord).notes,
                ).midiNotes
              : undefined}
            keySignature={keySignature}
            previousChord={previousSlot?.currentChord}
            onApply={(chord, source, selection) => setEditable((current) => {
              const slotId = current.selectedSlotId;
              return slotId
                ? replaceEditableChord(current, slotId, chord, source, selection)
                : current;
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
          {selectedSlot ? (
            <div className="mt-4 border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4">
              <VoicingPanel
                chord={selectedSlot.currentChord}
                memory={selectedSlot.voicingMemory}
                generatedNotes={voiceChordForPreview(selectedSlot.currentChord).notes}
                language={language}
                sourceAvailable={Boolean(sourceAsset?.path && loadMidiSource)}
                reextracting={reextracting}
                onMemoryChange={(memory) => setEditable((current) => (
                  setEditableVoicingMemory(current, selectedSlot.id, memory)
                ))}
                onReextract={() => void reextractSourceVoicings()}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function fileNameFromPath(path: string | undefined): string | undefined {
  return path?.split(/[\\/]/).pop();
}

function progressionBarCount(block: SavedProgressionBlock): number {
  if (block.chords.length === 0) return 0;
  const bars = block.chords.map((item) => item.bar);
  return Math.max(...bars) - Math.min(...bars) + 1;
}

function chordPreviewKey(chord: SavedProgressionBlock["chords"][number]["chord"]): string {
  return [chord.root, chord.quality, chord.bass ?? "root", ...chord.tensions].join("-");
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
