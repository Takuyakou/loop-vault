import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { playbackController, type PlayingSource } from "../audio/playbackController";
import { Modal } from "../components/Modal";
import { PlayToggle } from "../components/PlayToggle";
import { PracticeProgressBadge } from "../components/practice/PracticeProgressBadge";
import { pipelineStatuses, StatusPipeline } from "../components/StatusPipeline";
import { canOpenAssetPath, openableAssetExtensions } from "../domain/assetSecurity";
import { statusLabel } from "../domain/displayLabels";
import { beatsPerBar } from "../domain/midi";
import { resolveTimelineVoicings } from "../domain/voicing";
import { formatProgressionText } from "../domain/progressionText";
import type { TransitionOptions, TransitionResult } from "../domain/transition";
import type { AssetType, SavedProgressionBlock, SongIdea, Status } from "../domain/types";
import {
  assetAnchor,
  createUndoSnapshot,
  progressionBlockAnchor,
  type PendingAssetDeletion,
  type PendingProgressionBlockDeletion,
  type PendingReferenceDeletion,
} from "../domain/undoDeletion";
import type { AppCopy, AppLanguage } from "../i18n";
import { type DraftParseResult, useDraftSave } from "../hooks/useDraftSave";
import type { UndoRequest } from "../hooks/useUndoQueue";
import { ProgressionGrid } from "../ui/ProgressionGrid";
import { Copy, ExternalLink, FolderOpen, Trash2, TriangleAlert } from "lucide-react";

type Reference = SongIdea["references"][number]; type Asset = SongIdea["assets"][number];
const keySuggestions = ["C", "Cm", "D", "Dm", "E", "Em", "F", "Fm", "G", "Gm", "A", "Am", "B", "Bm"]; const inputClass = "w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-400";
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section className={"border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4 " + className}>{children}</section>; } function StatusBadge({ status, language }: { status: Status; language: AppLanguage }) { return <span className="shrink-0 rounded bg-[var(--lv-surface-raised)] px-2 py-1 text-xs font-semibold uppercase text-teal-200">{statusLabel(status, language)}</span>; } function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); } function splitList(value: string): string[] { return value.split(",").map((entry) => entry.trim()).filter(Boolean); } function hashString(value: string): number { let hash = 0; for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0; return hash; } const defaultAssetId = () => crypto.randomUUID(); async function writeClipboardText(text: string): Promise<boolean> { if (!navigator.clipboard?.writeText) return false; await navigator.clipboard.writeText(text); return true; }
function labelStatus(status: Status, language: AppLanguage): string { return statusLabel(status, language); }
function validDraft<T>(value: T, displayValue?: string): DraftParseResult<T> { return { ok: true, value, displayValue }; }
function invalidDraft<T>(): DraftParseResult<T> { return { ok: false }; }
function optionalTextDraft(value: string): DraftParseResult<string | undefined> { const trimmed = value.trim(); return validDraft(trimmed || undefined, trimmed); }
function equalStringLists(left: string[], right: string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }

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
  language,
}: {
  block: SavedProgressionBlock;
  source: PlayingSource;
  bpm?: number;
  onRemove: () => void;
  onOpen: () => void;
  onCopyProgression: () => void;
  onPreviewError: (error: unknown) => void;
  copy: AppCopy;
  language: AppLanguage;
}) {
  return (
    <div className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" className="min-w-0 text-left" onClick={onOpen}>
          <p className="font-semibold">{block.summaryText || block.chords.map((item) => item.chord.label).join(" - ")}</p>
          <p className="mt-1 text-[var(--lv-text-muted)]">
            {block.sourceFileName ?? copy.detail.capturedMidi}{block.startBar ? ` · ${copy.detail.barRange(block.startBar, block.endBar ?? block.startBar)}` : ""}
          </p>
          <span className="mt-2 inline-flex">
            <PracticeProgressBadge block={block} language={language} />
          </span>
        </button>
        <PlayToggle source={source} request={{ type: "timeline", timeline: block.chords, bpm, beatsPerBar: beatsPerBar(block.timeSignature), explicitMidiNotesByEventId: resolveTimelineVoicings(block.chords) }} playLabel={copy.common.preview} stopLabel={copy.common.stop} className="rounded border border-cyan-500/60 px-2 py-1 text-cyan-100" onError={onPreviewError} />
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
      {block.memo ? <p className="mt-3 text-xs text-amber-200">{block.memo}</p> : null}
    </div>
  );
}

export function DetailView({
  idea,
  storedIdea = idea,
  updateIdea,
  updateNextAction,
  removeProgressionBlock,
  openProgression = () => undefined,
  removeReference = () => false,
  unlinkAsset = () => false,
  enqueueUndo = () => "",
  vaultEpoch = 0,
  analyzeMidiPath,
  transitionIdea,
  requestDelete,
  setToast,
  copy,
  language,
}: {
  idea: SongIdea;
  storedIdea?: SongIdea;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  updateNextAction: (id: string, text: string, now?: Date) => void;
  removeProgressionBlock: (
    deletion: PendingProgressionBlockDeletion,
  ) => boolean;
  openProgression?: (ideaId: string, blockId: string) => void;
  removeReference?: (deletion: PendingReferenceDeletion) => boolean;
  unlinkAsset?: (deletion: PendingAssetDeletion) => boolean;
  enqueueUndo?: <T>(request: UndoRequest<T>) => string;
  vaultEpoch?: number;
  analyzeMidiPath: (path: string) => Promise<void>;
  transitionIdea: (
    id: string,
    to: Status,
    now?: Date,
    options?: TransitionOptions,
  ) => TransitionResult;
  requestDelete: (idea: SongIdea) => void;
  setToast: (toast: string) => void;
  copy: AppCopy;
  language: AppLanguage;
}) {
  const [referenceDraft, setReferenceDraft] = useState<Reference>({ title: "", url: "", memo: "" });
  const [assetDraft, setAssetDraft] = useState<Asset>({ id: "", type: "flp", path: "", memo: "" });
  const [pendingInactiveStatus, setPendingInactiveStatus] = useState<"hold" | "abandoned" | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [pendingPipelineTransition, setPendingPipelineTransition] = useState<{ to: Status; options: TransitionOptions }>();
  const statusReasonRef = useRef<HTMLTextAreaElement>(null);
  const pipelineCancelRef = useRef<HTMLButtonElement>(null);
  const completeNextRef = useRef<HTMLButtonElement>(null);
  const placeholder = copy.detail.nextActionPlaceholders[Math.abs(hashString(idea.id)) % copy.detail.nextActionPlaceholders.length];

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
  const genreField = useDraftSave<string | undefined>({
    scopeKey: idea.id,
    value: idea.genre,
    format: (fieldValue) => fieldValue ?? "",
    parse: optionalTextDraft,
    onCommit: (id, genre) => updateIdea(id, { genre }),
    commitOnEnter: true,
  });
  const moodField = useDraftSave<string[]>({
    scopeKey: idea.id,
    value: idea.moods,
    format: (fieldValue) => fieldValue.join(", "),
    parse: (fieldValue) => {
      const moods = splitList(fieldValue);
      return validDraft(moods, moods.join(", "));
    },
    onCommit: (id, moods) => updateIdea(id, { moods }),
    equals: equalStringLists,
    commitOnEnter: true,
  });
  const memoField = useDraftSave<string>({
    scopeKey: idea.id,
    value: idea.chordMemo,
    format: (fieldValue) => fieldValue,
    parse: (fieldValue) => validDraft(fieldValue),
    onCommit: (id, chordMemo) => updateIdea(id, { chordMemo }),
    debounceMs: 500,
    flushOnUnmount: true,
  });
  const nextField = useDraftSave<string>({
    scopeKey: idea.id,
    value: idea.nextAction.text,
    format: (fieldValue) => fieldValue,
    parse: (fieldValue) => validDraft(fieldValue.trim(), fieldValue.trim()),
    onCommit: (id, text) => updateNextAction(id, text, new Date()),
    commitOnEnter: true,
    shouldCommitOnBlur: (event) => event.relatedTarget !== completeNextRef.current,
  });

  useEffect(() => {
    setPendingInactiveStatus(null);
    setStatusReason("");
  }, [idea.id]);

  function completeNext() {
    if (idea.nextAction.text || nextField.draft.trim()) {
      updateNextAction(idea.id, "", new Date());
    }
    nextField.setDraft("");
    setToast(copy.toast.nextCompleted);
  }

  function updateMeta(changes: Partial<SongIdea>) {
    updateIdea(idea.id, changes);
  }

  function moveStatus(to: Status) {
    if (to === idea.status) {
      return;
    }

    if (to === "hold" || to === "abandoned") {
      setPendingInactiveStatus(to);
      setStatusReason("");
      return;
    }

    commitStatus(to);
  }

  function commitStatus(to: Status, options: TransitionOptions = {}) {
    if (isPipelineStatus(to) && idea.nextAction.text.trim() && to !== idea.status) {
      setPendingPipelineTransition({ to, options });
      return false;
    }
    return performStatusTransition(to, options);
  }

  function performStatusTransition(to: Status, options: TransitionOptions = {}) {
    const result = transitionIdea(idea.id, to, new Date(), options);
    if (!result.ok) setToast(result.error.message);
    if (result.ok && to === "done") setToast(copy.toast.statusDone);
    return result.ok;
  }

  function resolvePipelineTransition(keepNextAction: boolean) {
    if (!pendingPipelineTransition) return;
    const moved = performStatusTransition(
      pendingPipelineTransition.to,
      pendingPipelineTransition.options,
    );
    if (moved && !keepNextAction) {
      updateNextAction(idea.id, "", new Date());
    }
    setPendingPipelineTransition(undefined);
  }

  function closeInactiveStatusDialog() {
    setPendingInactiveStatus(null);
    setStatusReason("");
  }

  function submitInactiveStatus(event: FormEvent) {
    event.preventDefault();
    if (!pendingInactiveStatus) return;

    const moved = commitStatus(pendingInactiveStatus, { reason: statusReason });
    if (moved) {
      setPendingInactiveStatus(null);
      setStatusReason("");
    }
  }

  function addReference(event: FormEvent) {
    event.preventDefault();
    if (!referenceDraft.title.trim()) return;
    updateMeta({ references: [...storedIdea.references, { ...referenceDraft, title: referenceDraft.title.trim() }] });
    setReferenceDraft({ title: "", url: "", memo: "" });
  }

  function requestReferenceRemoval(index: number) {
    stopPlaybackForIdea();
    const snapshot = createUndoSnapshot(idea.references, index, idea.id);
    if (!snapshot) return;
    const deletion: PendingReferenceDeletion = {
      kind: "reference",
      vaultEpoch,
      snapshot,
    };
    enqueueUndo({
      label: copy.undo.referenceDeleted,
      payload: deletion,
      undo: () => true,
      commit: () => removeReference(deletion),
    });
  }

  async function chooseAssetPath() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.fileChooseDesktopOnly);
      return;
    }
    const path = await openFileDialog({
      multiple: false,
      filters: [{ name: "Music assets", extensions: openableAssetExtensions().map((extension) => extension.slice(1)) }],
    });
    if (typeof path === "string") setAssetDraft((draft) => ({ ...draft, path }));
  }

  function addAsset(event: FormEvent) {
    event.preventDefault();
    const asset: Asset = {
      ...assetDraft,
      id: defaultAssetId(),
      path: assetDraft.path?.trim() || undefined,
      memo: assetDraft.memo?.trim() || undefined,
    };
    updateMeta({ assets: [...storedIdea.assets, asset] });
    setAssetDraft({ id: "", type: "flp", path: "", memo: "" });
  }

  function requestAssetRemoval(id: string) {
    stopPlaybackForIdea();
    const snapshot = createUndoSnapshot(
      idea.assets,
      idea.assets.findIndex((asset) => asset.id === id),
      idea.id,
      assetAnchor,
    );
    if (!snapshot) return;
    const deletion: PendingAssetDeletion = {
      kind: "asset",
      vaultEpoch,
      snapshot,
    };
    enqueueUndo({
      label: copy.undo.assetUnlinked,
      payload: deletion,
      undo: () => true,
      commit: () => unlinkAsset(deletion),
    });
  }

  function updateAsset(assetId: string, changes: Partial<Asset>) {
    updateMeta({
      assets: storedIdea.assets.map((entry) =>
        entry.id === assetId ? { ...entry, ...changes } : entry,
      ),
    });
  }

  function stopPlaybackForIdea() {
    if (playbackController.getState().source?.id.startsWith(`idea:${idea.id}:`)) {
      playbackController.stop();
    }
  }

  async function openAsset(asset: Asset) {
    if (!asset.path) return;
    if (!canOpenAssetPath(asset.path)) {
      setToast(copy.detail.unsupportedExtension);
      return;
    }
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.fileOpenDesktopOnly);
      return;
    }
    try {
      await openPath(asset.path);
    } catch {
      updateMeta({ assets: storedIdea.assets.map((entry) => entry.id === asset.id ? { ...entry, missing: true } : entry) });
      setToast(copy.toast.assetMissing);
    }
  }

  async function showAsset(asset: Asset) {
    if (!asset.path) return;
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.folderDesktopOnly);
      return;
    }
    await revealItemInDir(asset.path);
  }

  async function replaceAssetPath(asset: Asset) {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.fileChooseDesktopOnly);
      return;
    }

    const path = await openFileDialog({
      multiple: false,
      filters: [
        {
          name: "Music assets",
          extensions: openableAssetExtensions().map((extension) =>
            extension.slice(1),
          ),
        },
      ],
    });
    if (typeof path === "string") {
      updateAsset(asset.id, { path, missing: false });
      setToast(copy.toast.assetPathUpdated);
    }
  }

  async function copySavedBlock(block: SavedProgressionBlock) {
    try {
      const copied = await writeClipboardText(formatProgressionText(block.chords));
      if (!copied) {
        setToast(copy.detail.copyFailed);
        return;
      }
      setToast(copy.detail.copiedProgression);
    } catch {
      setToast(copy.detail.copyFailed);
    }
  }

  return (
    <>
      <div className="grid gap-5 py-5 lg:grid-cols-[0.9fr_1.1fr]">
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
            <StatusBadge status={idea.status} language={language} />
          </div>
          <StatusPipeline
            status={idea.status}
            prevStatus={idea.prevStatus}
            labels={copy.status}
            copy={copy.detail.statusControl}
            onMoveStatus={moveStatus}
          />
          <button className="mt-5 inline-flex items-center gap-2 rounded border border-red-500/50 px-3 py-2 text-sm text-red-200" onClick={() => requestDelete(idea)}>
            <Trash2 aria-hidden="true" size={16} />
            {copy.common.delete}
          </button>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.nextAction}</h2>
          <div className="relative mt-3">
            <textarea
              className={`${inputClass} min-h-28 pr-9`}
              value={nextField.draft}
              aria-label={copy.detail.fields.nextAction}
              title={copy.detail.fields.nextAction}
              onChange={(event) => nextField.setDraft(event.target.value)}
              placeholder={placeholder}
              {...nextField.inputProps}
            />
            <SaveFlash visible={nextField.saved} label={copy.detail.saveAccepted} />
          </div>
          <div className="mt-3 flex gap-2">
            <button ref={completeNextRef} className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={completeNext}>{copy.common.done}</button>
          </div>
          {!idea.nextAction.text.trim() ? <p className="mt-3 text-sm text-amber-200">{copy.detail.nextActionHint}</p> : null}
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
            <div className="relative">
              <input className={`${inputClass} pr-9`} value={genreField.draft} aria-label={copy.detail.fields.genre} title={copy.detail.fields.genre} onChange={(event) => genreField.setDraft(event.target.value)} placeholder={copy.detail.placeholders.genre} {...genreField.inputProps} />
              <SaveFlash visible={genreField.saved} label={copy.detail.saveAccepted} />
            </div>
            <div className="relative">
              <input className={`${inputClass} pr-9`} value={moodField.draft} aria-label={copy.detail.fields.mood} title={copy.detail.fields.mood} onChange={(event) => moodField.setDraft(event.target.value)} placeholder={copy.detail.placeholders.mood} {...moodField.inputProps} />
              <SaveFlash visible={moodField.saved} label={copy.detail.saveAccepted} />
            </div>
          </div>
          <div className="relative mt-3">
            <textarea className={`${inputClass} min-h-28 pr-9`} value={memoField.draft} aria-label={copy.detail.fields.memo} title={copy.detail.fields.memo} onChange={(event) => memoField.setDraft(event.target.value)} placeholder={copy.detail.placeholders.chordMemo} {...memoField.inputProps} />
            <SaveFlash visible={memoField.saved} label={copy.detail.saveAccepted} />
          </div>
        </Panel>

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
                  onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
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
                    enqueueUndo({
                      label: copy.undo.blockDeleted,
                      payload: deletion,
                      undo: () => true,
                      commit: () => removeProgressionBlock(deletion),
                    });
                  }}
                  copy={copy}
                  language={language}
                />
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section className="space-y-5">
        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.references}</h2>
          <form className="mt-3 grid gap-2" onSubmit={addReference}>
            <input className={inputClass} value={referenceDraft.title} onChange={(event) => setReferenceDraft({ ...referenceDraft, title: event.target.value })} placeholder={copy.detail.placeholders.title} />
            <input className={inputClass} value={referenceDraft.url ?? ""} onChange={(event) => setReferenceDraft({ ...referenceDraft, url: event.target.value })} placeholder={copy.detail.placeholders.url} />
            <input className={inputClass} value={referenceDraft.memo ?? ""} onChange={(event) => setReferenceDraft({ ...referenceDraft, memo: event.target.value })} placeholder={copy.detail.placeholders.memo} />
            <button className="rounded bg-[var(--lv-surface-raised)] px-3 py-2 text-sm" type="submit">{copy.detail.addReference}</button>
          </form>
          <div className="mt-4 space-y-2">
            {idea.references.map((reference, index) => (
              <div key={`${reference.title}-${index}`} className="border border-[var(--lv-border)] p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <p className="font-medium">{reference.title}</p>
                  <button className="inline-flex items-center gap-1.5 text-[var(--lv-text-muted)]" onClick={() => requestReferenceRemoval(index)}>
                    <Trash2 aria-hidden="true" size={16} />
                    {copy.common.delete}
                  </button>
                </div>
                {reference.url ? <p className="mt-1 break-all text-[var(--lv-text-muted)]">{reference.url}</p> : null}
                {reference.memo ? <p className="mt-1 text-[var(--lv-text-secondary)]">{reference.memo}</p> : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.assets}</h2>
          <form className="mt-3 grid gap-2" onSubmit={addAsset}>
            <div className="grid gap-2 sm:grid-cols-[0.4fr_1fr_auto]">
              <select className={inputClass} value={assetDraft.type} onChange={(event) => setAssetDraft({ ...assetDraft, type: event.target.value as AssetType })}>
                <option value="flp">FLP</option>
                <option value="midi">MIDI</option>
                <option value="audio">Audio</option>
                <option value="other">Other</option>
              </select>
              <input className={inputClass} value={assetDraft.path ?? ""} onChange={(event) => setAssetDraft({ ...assetDraft, path: event.target.value })} placeholder={copy.detail.absolutePath} />
              <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" type="button" onClick={() => void chooseAssetPath()}>{copy.common.choose}</button>
            </div>
            <input className={inputClass} value={assetDraft.memo ?? ""} onChange={(event) => setAssetDraft({ ...assetDraft, memo: event.target.value })} placeholder={copy.detail.placeholders.memo} />
            <button className="rounded bg-[var(--lv-surface-raised)] px-3 py-2 text-sm" type="submit">{copy.detail.addAsset}</button>
          </form>
          <div className="mt-4 space-y-2">
            {idea.assets.map((asset) => (
              <div key={asset.id} className={`border p-3 text-sm ${asset.missing ? "border-red-500/60 bg-red-950/20" : "border-[var(--lv-border)]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium uppercase text-[var(--lv-text-secondary)]">{asset.type}</p>
                  <div className="flex gap-2">
                    {asset.type === "midi" && asset.path ? (
                      <button className="rounded border border-cyan-500/60 px-2 py-1 text-cyan-100" onClick={() => void analyzeMidiPath(asset.path!)}>
                        {copy.common.analyze}
                      </button>
                    ) : null}
                    <button
                      className="inline-flex items-center gap-1.5 rounded border border-[var(--lv-border-strong)] px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canOpenAssetPath(asset.path)}
                      onClick={() => void openAsset(asset)}
                    >
                      <ExternalLink aria-hidden="true" size={16} />
                      {copy.common.open}
                    </button>
                    <button className="inline-flex items-center gap-1.5 rounded border border-[var(--lv-border-strong)] px-2 py-1" onClick={() => void showAsset(asset)}>
                      <FolderOpen aria-hidden="true" size={16} />
                      {copy.common.folder}
                    </button>
                    {asset.missing ? (
                      <button className="inline-flex items-center gap-1.5 rounded border border-amber-500/60 px-2 py-1 text-amber-100" onClick={() => void replaceAssetPath(asset)}>
                        <TriangleAlert aria-hidden="true" size={16} />
                        {copy.detail.fixPath}
                      </button>
                    ) : null}
                    <button className="inline-flex items-center gap-1.5 rounded border border-[var(--lv-border-strong)] px-2 py-1" onClick={() => requestAssetRemoval(asset.id)}>
                      <Trash2 aria-hidden="true" size={16} />
                      {copy.common.delete}
                    </button>
                  </div>
                </div>
                <p className="mt-2 break-all text-[var(--lv-text-muted)]">{asset.path || copy.common.pathUnset}</p>
                {!canOpenAssetPath(asset.path) && asset.path ? <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-200"><TriangleAlert aria-hidden="true" size={16} />{copy.detail.unsupportedExtension}</p> : null}
                {asset.missing ? <p className="mt-2 flex items-center gap-1.5 text-xs text-red-200"><TriangleAlert aria-hidden="true" size={16} />{copy.detail.missingAsset}</p> : null}
                {asset.memo ? <p className="mt-2 text-[var(--lv-text-secondary)]">{asset.memo}</p> : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.history}</h2>
          <div className="mt-3 space-y-2">
            {idea.statusHistory.map((entry, index) => (
              <div key={`${entry.status}-${entry.at}-${index}`} className="border-b border-[var(--lv-border)] pb-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span>{labelStatus(entry.status, language)}</span>
                  <span className="text-[var(--lv-text-muted)]">{formatDate(entry.at)}</span>
                </div>
                {entry.reason ? <p className="mt-1 whitespace-pre-wrap break-words text-[var(--lv-text-secondary)]">{entry.reason}</p> : null}
              </div>
            ))}
          </div>
        </Panel>
      </section>
      </div>
      {pendingInactiveStatus ? (
        <Modal
          ariaLabelledBy="status-reason-title"
          ariaDescribedBy="status-reason-help"
          initialFocusRef={statusReasonRef}
          onClose={closeInactiveStatusDialog}
          closeOnBackdrop={!statusReason.trim()}
          panelClassName="w-full max-w-md p-5"
        >
          <form onSubmit={submitInactiveStatus}>
            <h2 id="status-reason-title" className="text-xl font-semibold">
              {labelStatus(pendingInactiveStatus, language)}: {copy.detail.statusReason}
            </h2>
            <p id="status-reason-help" className="mt-2 text-sm text-[var(--lv-text-muted)]">{copy.detail.statusReasonHelp}</p>
            <textarea
              ref={statusReasonRef}
              id="status-reason"
              className={`${inputClass} mt-4 min-h-28`}
              value={statusReason}
              maxLength={500}
              onChange={(event) => setStatusReason(event.target.value)}
              placeholder={copy.detail.statusReasonPlaceholder}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--lv-text-muted)]">{statusReason.length}/500</span>
              <div className="flex gap-2">
                <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" type="button" onClick={closeInactiveStatusDialog}>
                  {copy.common.cancel}
                </button>
                <button className="rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950" type="submit">
                  {copy.detail.confirmStatus(labelStatus(pendingInactiveStatus, language))}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      ) : null}
      {pendingPipelineTransition ? (
        <Modal
          ariaLabelledBy="pipeline-transition-title"
          ariaDescribedBy="pipeline-transition-description"
          initialFocusRef={pipelineCancelRef}
          onClose={() => setPendingPipelineTransition(undefined)}
          panelClassName="w-full max-w-md p-5"
          layerClassName="z-[70]"
        >
          <h2 id="pipeline-transition-title" className="text-xl font-semibold">
            {copy.detail.statusControl.carryTitle}
          </h2>
          <p id="pipeline-transition-description" className="mt-3 text-sm leading-6 text-[var(--lv-text-secondary)]">
            {copy.detail.statusControl.carryDescription}
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              ref={pipelineCancelRef}
              type="button"
              className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm"
              onClick={() => setPendingPipelineTransition(undefined)}
            >
              {copy.common.cancel}
            </button>
            <button
              type="button"
              className="rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950"
              onClick={() => resolvePipelineTransition(true)}
            >
              {copy.detail.statusControl.keepAndContinue}
            </button>
            <button
              type="button"
              className="rounded border border-red-400/50 px-3 py-2 text-sm text-red-100"
              onClick={() => resolvePipelineTransition(false)}
            >
              {copy.detail.statusControl.clearAndContinue}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function isPipelineStatus(status: Status): boolean {
  return pipelineStatuses.includes(status as (typeof pipelineStatuses)[number]);
}
