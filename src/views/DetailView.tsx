import { describeBlockMemo } from "./captureLabels";
import type { ToastFn } from "../components/notifications";
import { playbackController, type PlayingSource } from "../audio/playbackController";
import { PlayToggle } from "../components/PlayToggle";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { PracticeProgressBadge } from "../components/practice/PracticeProgressBadge";
import { beatsPerBar } from "../domain/midi";
import { resolveTimelineVoicings } from "../domain/voicing";
import { formatProgressionText } from "../domain/progressionText";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import {
  createUndoSnapshot,
  progressionBlockAnchor,
  type PendingProgressionBlockDeletion,
} from "../domain/undoDeletion";
import type { AppCopy } from "../i18n";
import { type DraftParseResult, useDraftSave } from "../hooks/useDraftSave";
import type { UndoRequest } from "../hooks/useUndoQueue";
import { ProgressionGrid } from "../ui/ProgressionGrid";
import { Copy, Trash2 } from "lucide-react";

const keySuggestions = ["C", "Cm", "D", "Dm", "E", "Em", "F", "Fm", "G", "Gm", "A", "Am", "B", "Bm"]; const inputClass = "w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-400";
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section className={"border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4 " + className}>{children}</section>; } async function writeClipboardText(text: string): Promise<boolean> { if (!navigator.clipboard?.writeText) return false; await navigator.clipboard.writeText(text); return true; }
function validDraft<T>(value: T, displayValue?: string): DraftParseResult<T> { return { ok: true, value, displayValue }; }
function invalidDraft<T>(): DraftParseResult<T> { return { ok: false }; }
function optionalTextDraft(value: string): DraftParseResult<string | undefined> { const trimmed = value.trim(); return validDraft(trimmed || undefined, trimmed); }
// P8.9-03: genre, moods and the chord memo are no longer edited; saved values stay readable here.
function LegacyField({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold text-[var(--lv-text-muted)]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-[var(--lv-text-secondary)]">{value}</dd></div>; }

function SaveFlash({ visible, label }: { visible: boolean; label: string }) {
  return (
    <span
      className={`pointer-events-none absolute right-3 top-2 text-xs font-semibold text-teal-300 transition-opacity ${visible ? "opacity-100" : "opacity-0"}`}
      aria-live="polite"
      title={visible ? label : undefined}
    >
      {visible ? <span aria-label={label}>✓</span> : null}
    </span>
  );
}

function ProgressionBlockCard({
  block,
  source,
  bpm,
  onRemove,
  onOpen,
  onCopyProgression,
  onPreviewError,
  copy,
  effectiveKeySignature,
}: {
  block: SavedProgressionBlock;
  source: PlayingSource;
  bpm?: number;
  onRemove: () => void;
  onOpen: () => void;
  onCopyProgression: () => void;
  onPreviewError: (error: unknown) => void;
  copy: AppCopy;
  effectiveKeySignature?: string;
}) {
  const { sound: previewSound } = usePreviewSound();
  return (
    <div className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" className="min-w-0 text-left" onClick={onOpen}>
          <p className="font-semibold">{block.summaryText || block.chords.map((item) => item.chord.label).join(" - ")}</p>
          <p className="mt-1 text-[var(--lv-text-muted)]">
            {block.sourceFileName ?? copy.detail.capturedMidi}{block.startBar ? ` · ${copy.detail.barRange(block.startBar, block.endBar ?? block.startBar)}` : ""}
          </p>
          <span className="mt-2 inline-flex">
            <PracticeProgressBadge
              block={block}
              effectiveKeySignature={effectiveKeySignature}
            />
          </span>
        </button>
        <PlayToggle source={source} request={{ type: "timeline", timeline: block.chords, bpm, sound: previewSound, beatsPerBar: beatsPerBar(block.timeSignature), explicitMidiNotesByEventId: resolveTimelineVoicings(block.chords, Boolean(block.textSource)) }} playLabel={copy.common.preview} stopLabel={copy.common.stop} className="rounded border border-cyan-500/60 px-2 py-1 text-cyan-100" onError={onPreviewError} />
        <button className="inline-flex items-center gap-2 rounded border border-teal-500/60 px-2 py-1 text-teal-100" onClick={onCopyProgression}>
          <Copy aria-hidden="true" size={16} />
          {copy.capture.copyProgression}
        </button>
        <button className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-2 py-1 text-[var(--lv-text-secondary)]" onClick={onRemove}>
          <Trash2 aria-hidden="true" size={16} />
          {copy.common.delete}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ProgressionGrid
          chords={block.chords}
          beatsPerBar={beatsPerBar(block.timeSignature)}
          currentBar={null}
          selectedChordIndex={undefined}
          playingChordIndex={null}
        />
      </div>
      {block.memo ? <p className="mt-3 text-xs text-amber-200">{describeBlockMemo(block.memo)}</p> : null}
    </div>
  );
}

export function DetailView({
  idea,
  updateIdea,
  removeProgressionBlock,
  openProgression = () => undefined,
  enqueueUndo = () => "",
  vaultEpoch = 0,
  requestDelete,
  setToast,
  copy,
  recoveryPending = false,
}: {
  idea: SongIdea;
  updateIdea: (id: string, changes: Partial<SongIdea>) => boolean | "pending";
  removeProgressionBlock: (
    deletion: PendingProgressionBlockDeletion,
  ) => boolean | "pending";
  openProgression?: (ideaId: string, blockId: string) => void;
  enqueueUndo?: <T>(request: UndoRequest<T>) => string;
  vaultEpoch?: number;
  requestDelete: (idea: SongIdea) => void;
  setToast: ToastFn;
  copy: AppCopy;
  recoveryPending?: boolean;
}) {

  const titleField = useDraftSave<string>({
    scopeKey: idea.id,
    value: idea.title,
    format: (fieldValue) => fieldValue,
    parse: (fieldValue) => {
      const trimmed = fieldValue.trim().slice(0, 80);
      return trimmed ? validDraft(trimmed, trimmed) : invalidDraft();
    },
    onCommit: (id, title) => updateIdea(id, { title }),
    commitOnEnter: true,
  });
  const bpmField = useDraftSave<number | undefined>({
    scopeKey: idea.id,
    value: idea.bpm,
    format: (fieldValue) => fieldValue?.toString() ?? "",
    parse: (fieldValue) => {
      const trimmed = fieldValue.trim();
      if (!trimmed) return validDraft(undefined, "");
      if (!/^\d+$/.test(trimmed)) return invalidDraft();
      const bpm = Number(trimmed);
      return bpm >= 40 && bpm <= 300 ? validDraft(bpm, bpm.toString()) : invalidDraft();
    },
    onCommit: (id, bpm) => updateIdea(id, { bpm }),
    commitOnEnter: true,
  });
  const keyField = useDraftSave<string | undefined>({
    scopeKey: idea.id,
    value: idea.key,
    format: (fieldValue) => fieldValue ?? "",
    parse: optionalTextDraft,
    onCommit: (id, key) => updateIdea(id, { key }),
    commitOnEnter: true,
  });
  const hasLegacyFields = Boolean(idea.genre) || idea.moods.length > 0 || idea.chordMemo.trim().length > 0;

  function stopPlaybackForIdea() {
    if (playbackController.getState().source?.id.startsWith(`idea:${idea.id}:`)) {
      playbackController.stop();
    }
  }

  async function copySavedBlock(block: SavedProgressionBlock) {
    try {
      const copied = await writeClipboardText(formatProgressionText(block.chords));
      if (!copied) {
        setToast(copy.detail.copyFailed, "error");
        return;
      }
      setToast(copy.detail.copiedProgression);
    } catch {
      setToast(copy.detail.copyFailed, "error");
    }
  }

  return (
    <>
      <div className="grid gap-5 py-5">
      <section className="space-y-5">
        <Panel>
          <div className="flex items-start justify-between gap-4">
            <div className="relative w-full">
              <input
                className="w-full bg-transparent pr-9 text-2xl font-semibold outline-none"
                value={titleField.draft}
                maxLength={80}
                aria-label={copy.detail.fields.title}
                aria-invalid={titleField.invalid}
                aria-errormessage={titleField.invalid ? "detail-title-error" : undefined}
                title={copy.detail.fields.title}
                onChange={(event) => titleField.setDraft(event.target.value)}
                {...titleField.inputProps}
              />
              <SaveFlash visible={titleField.saved} label={copy.detail.saveAccepted} />
              <span id="detail-title-error" className="sr-only">{copy.detail.validation.title}</span>
            </div>
          </div>
          <button className="mt-5 inline-flex items-center gap-2 rounded border border-red-500/50 px-3 py-2 text-sm text-red-200" onClick={() => requestDelete(idea)}>
            <Trash2 aria-hidden="true" size={16} />
            {copy.common.delete}
          </button>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.metadata}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <input className={`${inputClass} pr-9`} type="number" min={40} max={300} step={1} value={bpmField.draft} aria-label={copy.detail.fields.bpm} aria-invalid={bpmField.invalid} aria-errormessage={bpmField.invalid ? "detail-bpm-error" : undefined} title={copy.detail.fields.bpm} onChange={(event) => bpmField.setDraft(event.target.value)} placeholder={copy.detail.placeholders.bpm} {...bpmField.inputProps} />
              <SaveFlash visible={bpmField.saved} label={copy.detail.saveAccepted} />
              <span id="detail-bpm-error" className="sr-only">{copy.detail.validation.bpm}</span>
            </div>
            <div className="relative">
              <input className={`${inputClass} pr-9`} list="key-options" value={keyField.draft} aria-label={copy.detail.fields.key} title={copy.detail.fields.key} onChange={(event) => keyField.setDraft(event.target.value)} placeholder={copy.detail.placeholders.key} {...keyField.inputProps} />
              <SaveFlash visible={keyField.saved} label={copy.detail.saveAccepted} />
            </div>
            <datalist id="key-options">{keySuggestions.map((key) => <option key={key} value={key} />)}</datalist>
          </div>
        </Panel>

        {hasLegacyFields ? (
          <Panel>
            <h2 className="text-xl font-semibold">{copy.detail.legacy.title}</h2>
            <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{copy.detail.legacy.help}</p>
            <dl className="mt-3 grid gap-3 text-sm">
              {idea.genre ? <LegacyField label={copy.detail.legacy.genre} value={idea.genre} /> : null}
              {idea.moods.length > 0 ? <LegacyField label={copy.detail.legacy.mood} value={idea.moods.join(", ")} /> : null}
              {idea.chordMemo.trim() ? <LegacyField label={copy.detail.legacy.memo} value={idea.chordMemo} /> : null}
            </dl>
          </Panel>
        ) : null}

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.progressionBlocks}</h2>
          {(idea.progressionBlocks ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-[var(--lv-text-muted)]">{copy.detail.noProgressionBlocks}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {(idea.progressionBlocks ?? []).map((block) => (
                <ProgressionBlockCard
                  key={block.id}
                  block={block}
                  source={{ kind: "detail", id: `idea:${idea.id}:block:${block.id}` }}
                  bpm={block.bpm ?? idea.bpm}
                  effectiveKeySignature={block.detectedKey ?? idea.key}
                  onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed, "error")}
                  onOpen={() => openProgression(idea.id, block.id)}
                  onCopyProgression={() => void copySavedBlock(block)}
                  onRemove={() => {
                    stopPlaybackForIdea();
                    const blocks = idea.progressionBlocks ?? [];
                    const snapshot = createUndoSnapshot(
                      blocks,
                      blocks.findIndex((entry) => entry.id === block.id),
                      idea.id,
                      progressionBlockAnchor,
                    );
                    if (!snapshot) return;
                    const deletion: PendingProgressionBlockDeletion = {
                      kind: "progressionBlock",
                      vaultEpoch,
                      snapshot,
                    };
                    if (recoveryPending) {
                      removeProgressionBlock(deletion);
                      return;
                    }
                    enqueueUndo({
                      label: copy.undo.blockDeleted,
                      payload: deletion,
                      undo: () => true,
                      commit: () => removeProgressionBlock(deletion) === true,
                    });
                  }}
                  copy={copy}
                />
              ))}
            </div>
          )}
        </Panel>
      </section>
      </div>
    </>
  );
}
