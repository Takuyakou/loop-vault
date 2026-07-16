import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { playbackController, type PlayingSource } from "../audio/playbackController";
import { Modal } from "../components/Modal";
import { PlayToggle } from "../components/PlayToggle";
import { pipelineStatuses, StatusPipeline } from "../components/StatusPipeline";
import { canOpenAssetPath, openableAssetExtensions } from "../domain/assetSecurity";
import { statusLabel } from "../domain/displayLabels";
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
import type { UndoRequest } from "../hooks/useUndoQueue";
import { ProgressionGrid } from "../ui/ProgressionGrid";

type Reference = SongIdea["references"][number]; type Asset = SongIdea["assets"][number];
const keySuggestions = ["C", "Cm", "D", "Dm", "E", "Em", "F", "Fm", "G", "Gm", "A", "Am", "B", "Bm"]; const nextPlaceholders = ["Replace the bass", "Try the B section chords", "Make two drum variations", "Bounce a rough hook"]; const inputClass = "w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-400";
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section className={"border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4 " + className}>{children}</section>; } function StatusBadge({ status, language }: { status: Status; language: AppLanguage }) { return <span className="shrink-0 rounded bg-[var(--lv-surface-raised)] px-2 py-1 text-xs font-semibold uppercase text-teal-200">{statusLabel(status, language)}</span>; } function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); } function splitList(value: string): string[] { return value.split(",").map((entry) => entry.trim()).filter(Boolean); } function hashString(value: string): number { let hash = 0; for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0; return hash; } const defaultAssetId = () => crypto.randomUUID(); async function writeClipboardText(text: string): Promise<void> { if (!navigator.clipboard?.writeText) throw new Error("Clipboard is not available."); await navigator.clipboard.writeText(text); }
function labelStatus(status: Status, language: AppLanguage): string { return statusLabel(status, language); }

function ProgressionBlockCard({
  block,
  source,
  bpm,
  onRemove,
  onCopyProgression,
  onPreviewError,
  copy,
}: {
  block: SavedProgressionBlock;
  source: PlayingSource;
  bpm?: number;
  onRemove: () => void;
  onCopyProgression: () => void;
  onPreviewError: (error: unknown) => void;
  copy: AppCopy;
}) {
  return (
    <div className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{block.summaryText || block.chords.map((item) => item.chord.label).join(" - ")}</p>
          <p className="mt-1 text-[var(--lv-text-muted)]">
            {block.sourceFileName ?? "Captured MIDI"} {block.startBar ? `Bar ${block.startBar}-${block.endBar}` : ""}
          </p>
        </div>
        <PlayToggle source={source} request={{ type: "timeline", timeline: block.chords, bpm }} playLabel={copy.common.preview} stopLabel={copy.common.stop} className="rounded border border-cyan-500/60 px-2 py-1 text-cyan-100" onError={onPreviewError} />
        <button className="rounded border border-teal-500/60 px-2 py-1 text-teal-100" onClick={onCopyProgression}>
          {copy.capture.copyProgression}
        </button>
        <button className="rounded border border-[var(--lv-border-strong)] px-2 py-1 text-[var(--lv-text-secondary)]" onClick={onRemove}>
          {copy.common.delete}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ProgressionGrid
          chords={block.chords}
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
  const [nextDraft, setNextDraft] = useState(idea.nextAction.text);
  const [referenceDraft, setReferenceDraft] = useState<Reference>({ title: "", url: "", memo: "" });
  const [assetDraft, setAssetDraft] = useState<Asset>({ id: "", type: "flp", path: "", memo: "" });
  const [pendingInactiveStatus, setPendingInactiveStatus] = useState<"hold" | "abandoned" | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [pendingPipelineTransition, setPendingPipelineTransition] = useState<{ to: Status; options: TransitionOptions }>();
  const statusReasonRef = useRef<HTMLTextAreaElement>(null);
  const pipelineCancelRef = useRef<HTMLButtonElement>(null);
  const placeholder = nextPlaceholders[Math.abs(hashString(idea.id)) % nextPlaceholders.length];

  useEffect(() => setNextDraft(idea.nextAction.text), [idea.id, idea.nextAction.text]);
  useEffect(() => {
    setPendingInactiveStatus(null);
    setStatusReason("");
  }, [idea.id]);

  function saveNext() {
    updateNextAction(idea.id, nextDraft, new Date());
  }

  function completeNext() {
    updateNextAction(idea.id, "", new Date());
    setNextDraft("");
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
      await writeClipboardText(formatProgressionText(block.chords));
      setToast(language === "ja" ? "Chord Drip形式でコピーしました。" : "Copied progression text.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : (language === "ja" ? "コピーできませんでした。" : "Could not copy progression."));
    }
  }

  return (
    <>
      <div className="grid gap-5 py-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-5">
        <Panel>
          <div className="flex items-start justify-between gap-4">
            <input className="w-full bg-transparent text-2xl font-semibold outline-none" value={idea.title} onChange={(event) => updateMeta({ title: event.target.value.slice(0, 80) })} />
            <StatusBadge status={idea.status} language={language} />
          </div>
          <StatusPipeline
            status={idea.status}
            prevStatus={idea.prevStatus}
            labels={copy.status}
            copy={copy.detail.statusControl}
            onMoveStatus={moveStatus}
          />
          <button className="mt-5 rounded border border-red-500/50 px-3 py-2 text-sm text-red-200" onClick={() => requestDelete(idea)}>{copy.common.delete}</button>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.nextAction}</h2>
          <textarea className={`${inputClass} mt-3 min-h-28`} value={nextDraft} onChange={(event) => setNextDraft(event.target.value)} onBlur={saveNext} placeholder={placeholder} />
          <div className="mt-3 flex gap-2">
            <button className="rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950" onClick={saveNext}>{copy.common.update}</button>
            <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={completeNext}>{copy.common.done}</button>
          </div>
          {!idea.nextAction.text.trim() ? <p className="mt-3 text-sm text-amber-200">{copy.detail.nextActionHint}</p> : null}
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.metadata}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={inputClass} type="number" min={40} max={300} value={idea.bpm ?? ""} onChange={(event) => updateMeta({ bpm: event.target.value ? Number(event.target.value) : undefined })} placeholder="BPM" />
            <input className={inputClass} list="key-options" value={idea.key ?? ""} onChange={(event) => updateMeta({ key: event.target.value || undefined })} placeholder="Key" />
            <datalist id="key-options">{keySuggestions.map((key) => <option key={key} value={key} />)}</datalist>
            <input className={inputClass} value={idea.genre ?? ""} onChange={(event) => updateMeta({ genre: event.target.value || undefined })} placeholder="Genre" />
            <input className={inputClass} value={idea.moods.join(", ")} onChange={(event) => updateMeta({ moods: splitList(event.target.value) })} placeholder={language === "ja" ? "Mood（カンマ区切り）" : "Mood (comma separated)"} />
          </div>
          <textarea className={`${inputClass} mt-3 min-h-28`} value={idea.chordMemo} onChange={(event) => updateMeta({ chordMemo: event.target.value })} placeholder={language === "ja" ? "コード進行メモ" : "Chord progression memo"} />
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
            <input className={inputClass} value={referenceDraft.title} onChange={(event) => setReferenceDraft({ ...referenceDraft, title: event.target.value })} placeholder="Title" />
            <input className={inputClass} value={referenceDraft.url ?? ""} onChange={(event) => setReferenceDraft({ ...referenceDraft, url: event.target.value })} placeholder="URL" />
            <input className={inputClass} value={referenceDraft.memo ?? ""} onChange={(event) => setReferenceDraft({ ...referenceDraft, memo: event.target.value })} placeholder="Memo" />
            <button className="rounded bg-[var(--lv-surface-raised)] px-3 py-2 text-sm" type="submit">{copy.detail.addReference}</button>
          </form>
          <div className="mt-4 space-y-2">
            {idea.references.map((reference, index) => (
              <div key={`${reference.title}-${index}`} className="border border-[var(--lv-border)] p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <p className="font-medium">{reference.title}</p>
                  <button className="text-[var(--lv-text-muted)]" onClick={() => requestReferenceRemoval(index)}>{copy.common.delete}</button>
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
            <input className={inputClass} value={assetDraft.memo ?? ""} onChange={(event) => setAssetDraft({ ...assetDraft, memo: event.target.value })} placeholder="Memo" />
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
                      className="rounded border border-[var(--lv-border-strong)] px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canOpenAssetPath(asset.path)}
                      onClick={() => void openAsset(asset)}
                    >
                      {copy.common.open}
                    </button>
                    <button className="rounded border border-[var(--lv-border-strong)] px-2 py-1" onClick={() => void showAsset(asset)}>{copy.common.folder}</button>
                    {asset.missing ? (
                      <button className="rounded border border-amber-500/60 px-2 py-1 text-amber-100" onClick={() => void replaceAssetPath(asset)}>
                        {copy.detail.fixPath}
                      </button>
                    ) : null}
                    <button className="rounded border border-[var(--lv-border-strong)] px-2 py-1" onClick={() => requestAssetRemoval(asset.id)}>{copy.common.delete}</button>
                  </div>
                </div>
                <p className="mt-2 break-all text-[var(--lv-text-muted)]">{asset.path || copy.common.pathUnset}</p>
                {!canOpenAssetPath(asset.path) && asset.path ? <p className="mt-2 text-xs text-amber-200">{copy.detail.unsupportedExtension}</p> : null}
                {asset.missing ? <p className="mt-2 text-xs text-red-200">{copy.detail.missingAsset}</p> : null}
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
