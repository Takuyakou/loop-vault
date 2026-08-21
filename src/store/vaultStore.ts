import { createStore, type StoreApi } from "zustand/vanilla";
import {
  assertVaultCandidateSerializedBudget,
  createEmptyVault,
  VaultRepositoryError,
  type VaultBackup,
  type VaultImportMode,
  type VaultRepository,
} from "../domain/repository";
import {
  analyzeMidi,
  annotateVoiceRolesV2,
  beatsPerBar,
  buildVoices,
  candidateEventsAsTimeline,
  normalizeNotes,
  parseMidi,
} from "../domain/midi";
import { confirmedTextProgressionKeyState } from "../domain/textProgression";
import { isTextProgressionStyleSnapshot } from "../domain/textProgressionVoicing";
import { parseChordLabel } from "../domain/chords";
import { attachSourceVoicing, attachSourceVoicings, isValidVoicingSnapshot, voicingCompatibility } from "../domain/voicing";
import {
  transition,
  type TransitionOptions,
  type TransitionResult,
} from "../domain/transition";
import {
  MAX_PERSISTED_CHORD_ALTERNATIVES,
  type QuarantinedRecord,
} from "../domain/schema";
import { sourceBasslineSnapshotSchema, type SourceBasslineSnapshotV1 } from "../domain/sourceBassline";
import type {
  ChordTimelineItem,
  MidiProgressionAnalysis,
  ProgressionBlockCandidate,
  SavedProgressionBlock,
  SongIdea,
  Status,
  VaultFile,
  AppLanguage,
} from "../domain/types";
import type { AnalyzeMidiOptions, MidiSongData, Voice } from "../domain/midi/types";
import {
  assetAnchor,
  ideaAnchor,
  progressionBlockAnchor,
  removeUndoSnapshot,
  resolveUndoSnapshotIndex,
  type PendingAssetDeletion,
  type PendingIdeaDeletion,
  type PendingProgressionBlockDeletion,
  type PendingReferenceDeletion,
} from "../domain/undoDeletion";

export type LoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "recovery"
  | "readonly"
  | "error";

export interface RecoveryState {
  kind: "corrupt-json";
  message: string;
  corruptPath?: string;
  backups: VaultBackup[];
}

export interface ReadonlyState {
  kind: "future-version";
  message: string;
  fileVersion?: number;
}

export type AnalysisStatus = "idle" | "analyzing" | "done" | "error";

export interface AnalysisState {
  status: AnalysisStatus;
  result?: MidiProgressionAnalysis;
  error?: string;
  sourceData?: MidiSongData;
  sourceVoices?: Voice[];
}

export interface SongIdeaDraft {
  title: string;
  status?: Status;
  bpm?: number;
  key?: string;
  genre?: string;
  moods?: string[];
  chordMemo?: string;
  nextAction?: string;
  progressionBlock?: SavedProgressionBlock | ProgressionBlockCandidate;
  progressionAnalysis?: MidiProgressionAnalysis;
  progressionMetadata?: ProgressionSaveMetadata;
}

/**
 * Text Progression Entry save data. It is intentionally distinct from MIDI
 * analysis drafts: there is no source, analyzer result, asset, path, filename,
 * fingerprint, or candidate-origin field to accidentally persist.
 */
export interface TextProgressionIdeaDraft {
  title: string;
  nextAction?: string;
  chords: readonly ChordTimelineItem[];
  summaryText: string;
  userEdited?: boolean;
  userVerified?: boolean;
  /** Present only when explicitly supplied and valid. */
  bpm?: number;
  /** Present only when explicitly confirmed by the Text Progression UI. */
  confirmedKey?: string;
}
export interface ProgressionSaveMetadata {
  sourcePath?: string;
  userEdited?: boolean;
  userVerified?: boolean;
  /** Strict detached asset only; transient Voice/source identity must not cross this boundary. */
  sourceBassline?: SourceBasslineSnapshotV1;
  /** Transient UI confirmation, invoked only when the aggregate fits after omitting this snapshot. */
  confirmSourceBasslineOmission?: () => boolean;
  /** Transient localized rejection announcer; never persisted. */
  onPersistenceError?: (message: string) => void;
}

export type VaultMutationResult = boolean | "pending";

export interface VaultStoreState {
  ideas: SongIdea[];
  settings: VaultFile["settings"];
  analysis: AnalysisState;
  loadStatus: LoadStatus;
  quarantine: QuarantinedRecord[];
  /** Valid legacy v1 above 16 MiB; only a compliant delete/shrink may write. */
  sizeRecovery?: boolean;
  recovery?: RecoveryState;
  readonly?: ReadonlyState;
  unsaved: boolean;
  saving: boolean;
  lastSavedAt?: string;
  backups: VaultBackup[];
  vaultEpoch: number;
  error?: string;
  initialize: () => Promise<void>;
  createIdea: (title: string, status?: Status) => string | undefined;
  createIdeaFromDraft: (draft: SongIdeaDraft) => string | undefined;
  createIdeaFromTextProgression: (draft: TextProgressionIdeaDraft) => string | undefined;
  updateIdea: (id: string, changes: Partial<SongIdea>) => VaultMutationResult;
  appendTextProgressionToIdea: (ideaId: string, draft: TextProgressionIdeaDraft) => boolean;
  deleteIdea: (deletion: PendingIdeaDeletion) => VaultMutationResult;
  appendBlockToIdea: (
    ideaId: string,
    block: SavedProgressionBlock | ProgressionBlockCandidate,
    analysis?: MidiProgressionAnalysis,
    metadata?: ProgressionSaveMetadata,
  ) => boolean;
  updateProgressionBlock: (
    ideaId: string,
    blockId: string,
    changes: Partial<SavedProgressionBlock>,
  ) => VaultMutationResult;
  duplicateProgressionBlock: (
    ideaId: string,
    blockId: string,
  ) => string | undefined;
  removeProgressionBlock: (
    deletion: PendingProgressionBlockDeletion,
  ) => VaultMutationResult;
  removeReference: (
    deletion: PendingReferenceDeletion,
  ) => VaultMutationResult;
  unlinkAsset: (
    deletion: PendingAssetDeletion,
  ) => VaultMutationResult;
  transitionIdea: (
    id: string,
    to: Status,
    now?: Date,
    options?: TransitionOptions,
  ) => TransitionResult;
  updateNextAction: (id: string, text: string, now?: Date) => VaultMutationResult;
  analyzeMidiBytes: (
    bytes: Uint8Array,
    options?: AnalyzeMidiOptions,
  ) => MidiProgressionAnalysis | undefined;
  clearAnalysis: () => void;
  setMonthlyGoal: (goal: number) => void;
  setLanguage: (language: AppLanguage) => void;
  setShowRomanNumerals?: (show: boolean) => void;
  refreshBackups: () => Promise<void>;
  exportVault: (path: string) => Promise<boolean>;
  importVault: (path: string, mode: VaultImportMode) => Promise<boolean>;
  restoreBackup: (backupName: string) => Promise<void>;
  flush: () => Promise<void>;
}

export interface CreateVaultStoreOptions {
  repository: VaultRepository;
  debounceMs?: number;
  now?: () => Date;
  idFactory?: () => string;
}

export function createVaultStore(
  options: CreateVaultStoreOptions,
): StoreApi<VaultStoreState> {
  const debounceMs = options.debounceMs ?? 500;
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let changeRevision = 0;
  let savedRevision = 0;
  let vaultGeneration = 0;
  let activeFlush: { generation: number; promise: Promise<void> } | undefined;
  let activeRecoveryCommit: Promise<void> | undefined;

  const store = createStore<VaultStoreState>((set, get) => {
    function clearSaveTimer() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
      }
    }

    function scheduleSave() {
      clearSaveTimer();
      saveTimer = setTimeout(() => {
        void get().flush();
      }, debounceMs);
    }

    function setVault(vault: VaultFile, quarantine: QuarantinedRecord[] = [], sizeRecovery = false) {
      clearSaveTimer();
      vaultGeneration += 1;
      changeRevision = 0;
      savedRevision = 0;
      set({
        ideas: vault.ideas,
        settings: vault.settings,
        quarantine,
        sizeRecovery,
        loadStatus: "ready",
        unsaved: false,
        saving: false,
        lastSavedAt: undefined,
        vaultEpoch: get().vaultEpoch + 1,
        error: undefined,
        recovery: undefined,
        readonly: undefined,
      });
    }

    function applyVaultChange(
      mutator: (vault: VaultFile) => VaultFile,
      allowSizeRecoveryShrink?: false,
      sourceBasslineFallback?: {
        omit: (vault: VaultFile) => VaultFile;
        confirm: () => boolean;
      },
      onPersistenceError?: (message: string) => void,
    ): boolean;
    function applyVaultChange(
      mutator: (vault: VaultFile) => VaultFile,
      allowSizeRecoveryShrink: true,
      sourceBasslineFallback?: undefined,
      onPersistenceError?: (message: string) => void,
    ): VaultMutationResult;    function applyVaultChange(
      mutator: (vault: VaultFile) => VaultFile,
      allowSizeRecoveryShrink = false,
      sourceBasslineFallback?: {
        omit: (vault: VaultFile) => VaultFile;
        confirm: () => boolean;
      },
      onPersistenceError?: (message: string) => void,
    ) {
      const state = get();
      if (state.loadStatus !== "ready") return false;
      if (state.quarantine.length > 0) {
        set({ error: quarantineReadonlyMessage(state.settings.language, "mutation") });
        return false;
      }
      if (state.sizeRecovery && activeRecoveryCommit) {
        set({ error: sizeRecoveryMessage(state.settings.language, "saving") });
        return false;
      }
      if (state.sizeRecovery && !allowSizeRecoveryShrink) {
        set({ error: sizeRecoveryMessage(state.settings.language, "readonly") });
        return false;
      }

      let vault = mutator(currentVault(state));
      try {
        assertVaultCandidateSerializedBudget(vault);
      } catch (error) {
        if (!(error instanceof VaultRepositoryError)
          || error.kind !== "vault-too-large"
          || !sourceBasslineFallback) {
          const message = error instanceof VaultRepositoryError && error.kind === "vault-too-large"
            ? vaultBudgetMessage(state.settings.language)
            : error instanceof Error ? error.message : vaultBudgetMessage(state.settings.language);
          set({ error: message });
          onPersistenceError?.(message);
          return false;
        }
        const withoutSourceBassline = sourceBasslineFallback.omit(vault);
        try {
          assertVaultCandidateSerializedBudget(withoutSourceBassline);
        } catch {
          const message = vaultBudgetMessage(state.settings.language);
          set({ error: message });
          onPersistenceError?.(message);
          return false;
        }
        if (!sourceBasslineFallback.confirm()) {
          set({
            error: state.settings.language === "ja"
              ? "元ベースラインを外した保存はキャンセルされました。"
              : "Saving without the source bassline was cancelled.",
          });
          return false;
        }
        vault = withoutSourceBassline;
      }
      if (state.sizeRecovery) {
        const generation = vaultGeneration;
        set({ saving: true, error: undefined });
        const commit = (async () => {
          try {
            await options.repository.save(vault);
            if (generation !== vaultGeneration) return;
            vaultGeneration += 1;
            changeRevision = 0;
            savedRevision = 0;
            set({
              ideas: vault.ideas,
              settings: vault.settings,
              sizeRecovery: false,
              unsaved: false,
              saving: false,
              lastSavedAt: now().toISOString(),
              vaultEpoch: get().vaultEpoch + 1,
              error: undefined,
            });
          } catch {
            if (generation !== vaultGeneration) return;
            set({
              saving: false,
              error: sizeRecoveryMessage(state.settings.language, "save-failed"),
            });
          }
        })();
        activeRecoveryCommit = commit;
        void commit.finally(() => {
          if (activeRecoveryCommit === commit) activeRecoveryCommit = undefined;
        });
        return "pending" as const;
      }
      changeRevision += 1;
      set({
        ideas: vault.ideas,
        settings: vault.settings,
        unsaved: true,
        error: undefined,
      });
      scheduleSave();
      return true;
    }

    return {
      ...initialState(),

      async initialize() {
        clearSaveTimer();
        if (activeRecoveryCommit) await activeRecoveryCommit;
        if (activeFlush) await activeFlush.promise;
        set({
          loadStatus: "loading",
          error: undefined,
          recovery: undefined,
          readonly: undefined,
        });

        try {
          const result = await options.repository.load();
          setVault(result.vault, result.quarantine, result.sizeRecovery ?? false);
          void get().refreshBackups();
        } catch (error) {
          if (
            error instanceof VaultRepositoryError &&
            error.kind === "invalid-json"
          ) {
            set({
              loadStatus: "recovery",
              recovery: {
                kind: "corrupt-json",
                message: error.message,
                corruptPath: corruptPathFromDetails(error.details),
                backups: await safeListBackups(options.repository),
              },
              unsaved: false,
              saving: false,
              error: undefined,
            });
            return;
          }

          if (
            error instanceof VaultRepositoryError &&
            error.kind === "future-version"
          ) {
            set({
              loadStatus: "readonly",
              readonly: {
                kind: "future-version",
                message: error.message,
                fileVersion: futureVersionFromDetails(error.details),
              },
              unsaved: false,
              saving: false,
              error: undefined,
            });
            return;
          }

          set({
            loadStatus: "error",
            error:
              error instanceof Error
                ? error.message
                : "Vault could not be loaded.",
          });
        }
      },

      createIdea(title, status = "idea") {
        return get().createIdeaFromDraft({ title, status });
      },

      createIdeaFromDraft(draft) {
        const trimmedTitle = draft.title.trim();
        if (!trimmedTitle) {
          return undefined;
        }

        const createdAt = now().toISOString();
        const status = draft.status ?? "idea";
        const id = idFactory();
        const sourceAssetId = draft.progressionMetadata?.sourcePath
          ? idFactory()
          : draft.progressionAnalysis?.sourceAssetId;
        const progressionAnalysis = sourceAssetId
          ? { ...draft.progressionAnalysis, sourceAssetId } as MidiProgressionAnalysis
          : draft.progressionAnalysis;
        const progressionBlock = draft.progressionBlock
          ? toSavedProgressionBlock(draft.progressionBlock, progressionAnalysis, {
              idFactory,
              now,
              ...voicingSourceContext(get().analysis, draft.progressionAnalysis),
            }, draft.progressionMetadata)
          : undefined;
        const idea: SongIdea = {
          id,
          title: trimmedTitle.slice(0, 80),
          ...(draft.bpm ? { bpm: draft.bpm } : {}),
          ...(draft.key ? { key: draft.key } : {}),
          ...(draft.genre ? { genre: draft.genre } : {}),
          moods: draft.moods ?? [],
          status,
          nextAction: { text: draft.nextAction ?? "", updatedAt: createdAt },
          chordMemo: draft.chordMemo ?? "",
          references: [],
          assets: draft.progressionMetadata?.sourcePath && sourceAssetId
            ? [{ id: sourceAssetId, type: "midi", path: draft.progressionMetadata.sourcePath }]
            : [],
          progressionBlocks: progressionBlock ? [progressionBlock] : [],
          statusHistory: [{ status, at: createdAt }],
          createdAt,
          updatedAt: createdAt,
        };

        const applied = applyVaultChange(
          (vault) => ({
            ...vault,
            ideas: [...vault.ideas, idea],
          }),
          false,
          progressionBlock?.sourceBassline && draft.progressionMetadata?.confirmSourceBasslineOmission
            ? {
                omit: (vault) => omitSourceBasslineFromBlock(vault, id, progressionBlock.id),
                confirm: draft.progressionMetadata.confirmSourceBasslineOmission,
              }
            : undefined,
          draft.progressionMetadata?.onPersistenceError,
        );
        return applied ? id : undefined;
      },

      createIdeaFromTextProgression(draft) {
        const normalized = normalizeTextProgressionIdeaDraft(draft);
        if (!normalized) return undefined;
        const createdAt = now().toISOString();
        const id = idFactory();
        const block = createSavedTextProgressionBlock(normalized, { idFactory, createdAt });
        const idea: SongIdea = {
          id,
          title: normalized.title,
          ...(normalized.bpm === undefined ? {} : { bpm: normalized.bpm }),
          ...(normalized.confirmedKey === undefined ? {} : { key: normalized.confirmedKey }),
          moods: [],
          status: "idea",
          nextAction: { text: normalized.nextAction, updatedAt: createdAt },
          chordMemo: normalized.summaryText,
          references: [],
          assets: [],
          progressionBlocks: [block],
          statusHistory: [{ status: "idea", at: createdAt }],
          createdAt,
          updatedAt: createdAt,
        };
        const applied = applyVaultChange((vault) => ({
          ...vault,
          ideas: [...vault.ideas, idea],
        }));
        return applied ? id : undefined;
      },

      appendTextProgressionToIdea(ideaId, draft) {
        const normalized = normalizeTextProgressionIdeaDraft(draft);
        if (!normalized || !get().ideas.some((idea) => idea.id === ideaId)) return false;
        const updatedAt = now().toISOString();
        const block = createSavedTextProgressionBlock(normalized, { idFactory, createdAt: updatedAt });
        return applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((idea) => idea.id === ideaId
            ? {
                ...idea,
                progressionBlocks: [...(idea.progressionBlocks ?? []), block],
                ...(idea.bpm === undefined && normalized.bpm !== undefined ? { bpm: normalized.bpm } : {}),
                ...(idea.key === undefined && normalized.confirmedKey !== undefined ? { key: normalized.confirmedKey } : {}),
                chordMemo: idea.chordMemo.trim() ? idea.chordMemo : normalized.summaryText,
                updatedAt,
              }
            : idea),
        }));
      },
      updateIdea(id, changes) {
        const updatedAt = now().toISOString();
        return applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((idea) =>
            idea.id === id ? { ...idea, ...changes, updatedAt } : idea,
          ),
        }), true);
      },

      deleteIdea(deletion) {
        if (deletion.vaultEpoch !== get().vaultEpoch) return true;
        const { snapshot } = deletion;
        if (snapshot.parentId !== "vault") return false;
        if (resolveUndoSnapshotIndex(get().ideas, snapshot, ideaAnchor) < 0) return true;
        return applyVaultChange((vault) => ({
          ...vault,
          ideas: removeUndoSnapshot(vault.ideas, snapshot, ideaAnchor),
        }), true);
      },

      appendBlockToIdea(ideaId, block, analysis, metadata) {
        const currentIdea = get().ideas.find((idea) => idea.id === ideaId);
        if (!currentIdea) {
          return false;
        }
        const existingAsset = metadata?.sourcePath
          ? currentIdea?.assets.find((asset) => asset.type === "midi" && asset.path === metadata.sourcePath)
          : undefined;
        const sourceAssetId = existingAsset?.id ?? (metadata?.sourcePath ? idFactory() : analysis?.sourceAssetId);
        const effectiveAnalysis = sourceAssetId ? { ...analysis, sourceAssetId } as MidiProgressionAnalysis : analysis;
        const savedBlock = toSavedProgressionBlock(block, effectiveAnalysis, {
          idFactory,
          now,
          ...voicingSourceContext(get().analysis, analysis),
        }, metadata);
        return applyVaultChange(
          (vault) => ({
            ...vault,
            ideas: vault.ideas.map((idea) =>
              idea.id === ideaId
                ? {
                    ...idea,
                    progressionBlocks: [
                      ...(idea.progressionBlocks ?? []),
                      savedBlock,
                    ],
                    assets: metadata?.sourcePath && sourceAssetId && !existingAsset
                      ? [...idea.assets, { id: sourceAssetId, type: "midi" as const, path: metadata.sourcePath }]
                      : idea.assets,
                    bpm: idea.bpm ?? savedBlock.bpm,
                    key: idea.key ?? savedBlock.detectedKey,
                    chordMemo: idea.chordMemo.trim()
                      ? idea.chordMemo
                      : savedBlock.summaryText,
                    updatedAt: now().toISOString(),
                  }
                : idea,
            ),
          }),
          false,
          savedBlock.sourceBassline && metadata?.confirmSourceBasslineOmission
            ? {
                omit: (vault) => omitSourceBasslineFromBlock(vault, ideaId, savedBlock.id),
                confirm: metadata.confirmSourceBasslineOmission,
              }
            : undefined,
          metadata?.onPersistenceError,
        );
      },

      updateProgressionBlock(ideaId, blockId, changes) {
        if (Object.prototype.hasOwnProperty.call(changes, "sourceBassline")) {
          set({ error: "Stored source bassline snapshots are immutable." });
          return false;
        }
        const idea = get().ideas.find((entry) => entry.id === ideaId);
        const block = idea?.progressionBlocks?.find((entry) => entry.id === blockId);
        if (!idea || !block) {
          return false;
        }
        const updatedAt = now().toISOString();
        const persistedChanges = changes.chords
          ? { ...changes, chords: persistChordEvents(changes.chords, idFactory) }
          : changes;
        return applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((entry) => entry.id === ideaId
            ? {
                ...entry,
                progressionBlocks: (entry.progressionBlocks ?? []).map((candidate) => candidate.id === blockId
                  ? { ...candidate, ...persistedChanges, id: candidate.id }
                  : candidate),
                updatedAt,
              }
            : entry),
        }), true);
      },

      duplicateProgressionBlock(ideaId, blockId) {
        const idea = get().ideas.find((entry) => entry.id === ideaId);
        const block = idea?.progressionBlocks?.find((entry) => entry.id === blockId);
        if (!idea || !block) {
          return undefined;
        }
        const id = idFactory();
        const capturedAt = now().toISOString();
        const duplicate: SavedProgressionBlock = {
          ...block,
          id,
          chords: block.chords.map((item) => ({
            ...item,
            eventId: idFactory(),
            chord: { ...item.chord, tensions: [...item.chord.tensions] },
            alternatives: item.alternatives.map((alternative) => ({
              ...alternative,
              chord: { ...alternative.chord, tensions: [...alternative.chord.tensions] },
            })),
            warnings: [...item.warnings],
            ...(item.voicingMemory
              ? {
                  voicingMemory: {
                    ...(item.voicingMemory.sourceVoicing
                      ? {
                          sourceVoicing: {
                            ...item.voicingMemory.sourceVoicing,
                            midiNotes: [...item.voicingMemory.sourceVoicing.midiNotes],
                          },
                        }
                      : {}),
                    ...(item.voicingMemory.practiceVoicingOverride
                      ? {
                          practiceVoicingOverride: {
                            ...item.voicingMemory.practiceVoicingOverride,
                            midiNotes: [...item.voicingMemory.practiceVoicingOverride.midiNotes],
                          },
                        }
                      : {}),
                  },
                }
              : {}),
          })),
          tags: [...block.tags],
          suppressedAutoTags: block.suppressedAutoTags?.map((tag) => ({ ...tag })),
          ...(block.sourceBassline
            ? { sourceBassline: cloneSourceBassline(block.sourceBassline) }
            : {}),
          capturedAt,
        };
        const applied = applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((entry) => entry.id === ideaId
            ? {
                ...entry,
                progressionBlocks: [...(entry.progressionBlocks ?? []), duplicate],
                updatedAt: capturedAt,
              }
            : entry),
        }));
        return applied ? id : undefined;
      },

      removeProgressionBlock(deletion) {
        if (deletion.vaultEpoch !== get().vaultEpoch) return true;
        const { snapshot } = deletion;
        const idea = get().ideas.find(
          (entry) => entry.id === snapshot.parentId,
        );
        const blocks = idea?.progressionBlocks ?? [];
        if (!idea) return true;
        if (resolveUndoSnapshotIndex(
          blocks,
          snapshot,
          progressionBlockAnchor,
        ) < 0) return true;
        return applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((idea) =>
            idea.id === snapshot.parentId
              ? {
                  ...idea,
                  progressionBlocks: removeUndoSnapshot(
                    idea.progressionBlocks ?? [],
                    snapshot,
                    progressionBlockAnchor,
                  ),
                  updatedAt: now().toISOString(),
                }
              : idea,
          ),
        }), true);
      },

      removeReference(deletion) {
        if (deletion.vaultEpoch !== get().vaultEpoch) return true;
        const { snapshot } = deletion;
        const idea = get().ideas.find(
          (entry) => entry.id === snapshot.parentId,
        );
        if (!idea) return true;
        if (resolveUndoSnapshotIndex(idea.references, snapshot) < 0) return true;
        return applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((entry) =>
            entry.id === snapshot.parentId
              ? {
                  ...entry,
                  references: removeUndoSnapshot(
                    entry.references,
                    snapshot,
                  ),
                  updatedAt: now().toISOString(),
                }
              : entry,
          ),
        }), true);
      },

      unlinkAsset(deletion) {
        if (deletion.vaultEpoch !== get().vaultEpoch) return true;
        const { snapshot } = deletion;
        const idea = get().ideas.find(
          (entry) => entry.id === snapshot.parentId,
        );
        if (!idea) return true;
        if (resolveUndoSnapshotIndex(idea.assets, snapshot, assetAnchor) < 0) return true;
        return applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((entry) =>
            entry.id === snapshot.parentId
              ? {
                  ...entry,
                  assets: removeUndoSnapshot(
                    entry.assets,
                    snapshot,
                    assetAnchor,
                  ),
                  updatedAt: now().toISOString(),
                }
              : entry,
          ),
        }), true);
      },

      transitionIdea(id, to, transitionNow = now(), transitionOptions = {}) {
        const idea = get().ideas.find((entry) => entry.id === id);
        if (!idea) {
          return {
            ok: false,
            error: { code: "invalid-jump", message: "Idea was not found." },
          };
        }

        const result = transition(idea, to, transitionNow, transitionOptions);
        if (!result.ok) {
          return result;
        }

        const applied = applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((entry) =>
            entry.id === id ? result.idea : entry,
          ),
        }));
        if (!applied) {
          return {
            ok: false,
            error: {
              code: "persistence-failed",
              message: get().error ?? "The Vault update could not be saved.",
            },
          };
        }
        return result;
      },

      updateNextAction(id, text, actionNow = now()) {
        const updatedAt = actionNow.toISOString();
        return applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((idea) =>
            idea.id === id
              ? {
                  ...idea,
                  nextAction: { text, updatedAt },
                  updatedAt,
                }
              : idea,
          ),
        }), true);
      },

      analyzeMidiBytes(bytes, analyzeOptions = {}) {
        set({ analysis: { status: "analyzing" }, error: undefined });
        try {
          const result = analyzeMidi(bytes, analyzeOptions);
          const sourceData = analyzeOptions.preparedData ?? parseMidi(bytes);
          const normalized = normalizeNotes(sourceData);
          const baseVoices = buildVoices(sourceData);
          const sourceVoices = annotateVoiceRolesV2(
            baseVoices,
            normalized,
            analyzeOptions.analysisInput?.roleOverrides,
          );
          // Attach the original MIDI voicing to the candidates now, so the
          // chord the user auditions before saving is the chord they get after
          // saving. The cache is per analysis and never persisted.
          const voicingCache = new Map<string, ChordTimelineItem["voicingMemory"]>();
          const context = {
            analysis: result,
            sourceData,
            sourceVoices,
            accuracyFirst: analyzeOptions.accuracyFirst,
          };
          const enriched: MidiProgressionAnalysis = {
            ...result,
            fullTimeline: attachSourceVoicings(result.fullTimeline, context, voicingCache),
            blockCandidates: result.blockCandidates.map((block) => ({
              ...block,
              chords: attachSourceVoicings(block.chords, context, voicingCache),
              ...(block.events
                ? {
                    events: block.events.map((event) => ({
                      ...event,
                      source: attachSourceVoicing(event.source, context, voicingCache),
                    })),
                  }
                : {}),
            })),
          };
          set({ analysis: { status: "done", result: enriched, sourceData, sourceVoices } });
          return enriched;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "MIDI could not be analyzed.";
          set({ analysis: { status: "error", error: message }, error: message });
          return undefined;
        }
      },

      clearAnalysis() {
        set({ analysis: emptyAnalysisState() });
      },

      setMonthlyGoal(goal) {
        const monthlyGoal = Math.max(1, Math.trunc(goal));
        applyVaultChange((vault) => ({
          ...vault,
          settings: { ...vault.settings, monthlyGoal },
        }));
      },

      setLanguage(language) {
        return applyVaultChange((vault) => ({
          ...vault,
          settings: { ...vault.settings, language },
        }));
      },

      setShowRomanNumerals(showRomanNumerals) {
        return applyVaultChange((vault) => ({
          ...vault,
          settings: { ...vault.settings, showRomanNumerals },
        }));
      },

      async refreshBackups() {
        set({ backups: await safeListBackups(options.repository) });
      },

      async exportVault(path) {
        if (get().quarantine.length > 0) {
          set({ error: quarantineReadonlyMessage(get().settings.language, "export") });
          return false;
        }        if (get().sizeRecovery) {
          set({ error: sizeRecoveryMessage(get().settings.language, "export") });
          return false;
        }
        await get().flush();
        set({ error: undefined });
        try {
          await options.repository.exportTo(path);
          return true;
        } catch (error) {
          set({
            error:
              error instanceof Error
                ? error.message
                : "Vault could not be exported.",
          });
          return false;
        }
      },

      async importVault(path, mode) {
        if (get().quarantine.length > 0 && mode === "merge") {
          set({ error: quarantineReadonlyMessage(get().settings.language, "merge") });
          return false;
        }        if (get().sizeRecovery) {
          set({ error: sizeRecoveryMessage(get().settings.language, "import") });
          return false;
        }
        await get().flush();
        set({ loadStatus: "loading", error: undefined });
        try {
          const result = await options.repository.importFrom(path, { mode });
          setVault(result.vault, result.quarantine, result.sizeRecovery ?? false);
          await get().refreshBackups();
          return true;
        } catch (error) {
          set({
            loadStatus: "ready",
            error:
              error instanceof Error
                ? error.message
                : "Vault could not be imported.",
          });
          return false;
        }
      },

      async restoreBackup(backupName) {
        await get().flush();
        set({ loadStatus: "loading", error: undefined });
        try {
          const result = await options.repository.restore(backupName);
          setVault(result.vault, result.quarantine, result.sizeRecovery ?? false);
          await get().refreshBackups();
        } catch (error) {
          set({
            loadStatus: "recovery",
            error:
              error instanceof Error
                ? error.message
                : "Backup could not be restored.",
          });
        }
      },

      async flush() {
        if (get().quarantine.length > 0) {
          clearSaveTimer();
          set({ error: quarantineReadonlyMessage(get().settings.language, "flush") });
          return;
        }        clearSaveTimer();
        if (activeRecoveryCommit) await activeRecoveryCommit;
        if (activeFlush) {
          await activeFlush.promise;
          if (changeRevision > savedRevision) {
            await get().flush();
          }
          return;
        }

        const revisionToSave = changeRevision;
        if (revisionToSave <= savedRevision) return;
        const generationToSave = vaultGeneration;
        const vaultToSave = currentVault(get());

        set({ saving: true, error: undefined });
        const flush = (async () => {
          try {
            await options.repository.save(vaultToSave);
            if (generationToSave !== vaultGeneration) return;
            savedRevision = Math.max(savedRevision, revisionToSave);
            set({
              unsaved: changeRevision > savedRevision,
              saving: false,
              lastSavedAt: now().toISOString(),
            });
          } catch (error) {
            if (generationToSave !== vaultGeneration) return;
            set({
              saving: false,
              unsaved: true,
              error:
                error instanceof Error ? error.message : "Vault could not be saved.",
            });
          }
        })();
        const active = { generation: generationToSave, promise: flush };
        activeFlush = active;
        try {
          await flush;
        } finally {
          if (activeFlush === active) activeFlush = undefined;
        }
      },
    };
  });

  return store;
}

export function initialState(): Pick<
  VaultStoreState,
  | "ideas"
  | "settings"
  | "analysis"
  | "loadStatus"
  | "quarantine"
  | "sizeRecovery"
  | "recovery"
  | "readonly"
  | "unsaved"
  | "saving"
  | "backups"
  | "vaultEpoch"
  | "error"
> {
  return {
    ideas: [],
    settings: createEmptyVault().settings,
    analysis: emptyAnalysisState(),
    loadStatus: "idle",
    quarantine: [],
    sizeRecovery: false,
    recovery: undefined,
    readonly: undefined,
    unsaved: false,
    saving: false,
    backups: [],
    vaultEpoch: 0,
    error: undefined,
  };
}

function emptyAnalysisState(): AnalysisState {
  return { status: "idle" };
}

async function safeListBackups(
  repository: VaultRepository,
): Promise<VaultBackup[]> {
  try {
    return await repository.listBackups();
  } catch {
    return [];
  }
}

function vaultBudgetMessage(language: "ja" | "en"): string {
  return language === "ja"
    ? "Vault全体が16 MiB上限を超えるため保存できません。既存内容を減らすか、元ベースラインを付けずにもう一度保存してください。"
    : "The complete Vault exceeds the 16 MiB limit. Reduce existing content or retry without the source bassline.";
}
function quarantineReadonlyMessage(
  language: "ja" | "en",
  kind: "mutation" | "flush" | "merge" | "export",
): string {
  const ja = language === "ja";
  if (kind === "merge") return ja
    ? "無効レコードを隔離中のVaultへは結合できません。置換読み込みまたは正常なbackup復元を使用してください。"
    : "A Vault with quarantined records cannot be merged. Use replace import or restore a valid backup.";
  if (kind === "export") return ja
    ? "無効レコードを隔離中のVaultは、不完全な書き出しを防ぐためexportできません。"
    : "A Vault with quarantined records cannot be exported because the export would be incomplete.";
  return ja
    ? "無効レコードを隔離中のため、このVaultは非書込みです。置換読み込みまたは正常なbackup復元で回復してください。"
    : "This Vault is non-writing while invalid records are quarantined. Recover with replace import or a valid backup.";
}
function sizeRecoveryMessage(
  language: "ja" | "en",
  kind: "readonly" | "saving" | "save-failed" | "export" | "import",
): string {
  const ja = language === "ja";
  if (kind === "saving") return ja
    ? "Vaultの縮小保存中です。完了後にもう一度お試しください。"
    : "The reduced Vault is being saved. Try again after it completes.";
  if (kind === "save-failed") return ja
    ? "Vaultを縮小保存できませんでした。元の読み取り専用データは変更されていません。"
    : "The reduced Vault could not be saved. The original read-only data is unchanged.";
  if (kind === "export") return ja
    ? "16 MiB未満へ縮小するまでVaultを書き出せません。"
    : "Reduce the Vault below 16 MiB before exporting.";
  if (kind === "import") return ja
    ? "16 MiB未満へ縮小するまでVaultを読み込めません。"
    : "Reduce the Vault below 16 MiB before importing.";
  return ja
    ? "このVaultは上限超過のため読み取り専用です。削除または内容の縮小で16 MiB未満にしてください。"
    : "This Vault is read-only because it exceeds the limit. Delete or reduce content below 16 MiB.";
}

function corruptPathFromDetails(details: unknown): string | undefined {
  if (!details || typeof details !== "object") {
    return undefined;
  }

  const corruptPath = (details as Record<string, unknown>).corruptPath;
  return typeof corruptPath === "string" ? corruptPath : undefined;
}

function futureVersionFromDetails(details: unknown): number | undefined {
  if (!details || typeof details !== "object") {
    return undefined;
  }

  const fileVersion = (details as Record<string, unknown>).fileVersion;
  return typeof fileVersion === "number" ? fileVersion : undefined;
}

function currentVault(state: VaultStoreState): VaultFile {
  return {
    app: "loopvault",
    fileVersion: 2,
    settings: state.settings,
    ideas: state.ideas,
  };
}

function normalizeTextProgressionIdeaDraft(
  draft: TextProgressionIdeaDraft,
): (TextProgressionIdeaDraft & {
  title: string;
  summaryText: string;
  nextAction: string;
  chords: ChordTimelineItem[];
  bpm?: number;
  confirmedKey?: string;
}) | undefined {
  const title = draft.title.trim().slice(0, 80);
  if (!title || (draft.bpm !== undefined && !isValidTextProgressionBpm(draft.bpm))) {
    return undefined;
  }
  const suppliedKey = draft.confirmedKey?.trim();
  const keyState = confirmedTextProgressionKeyState(suppliedKey);
  if (suppliedKey && keyState.kind !== "confirmed") return undefined;

  // Deliberately discard every incoming MIDI-like field. The public adapter is
  // fail-closed: only text-safe timing, chord identity, and Live MIDI practice
  // overrides are copied into the normal SavedProgressionBlock shape.
  const convertedChords = draft.chords.map(textProgressionChordForSave);
  if (convertedChords.some((chord) => chord === undefined)) return undefined;
  const chords = convertedChords.filter((chord): chord is ChordTimelineItem => chord !== undefined);
  if (chords.length !== draft.chords.length || !isSaveSafeTextProgressionTimeline(chords)) return undefined;

  return {
    ...draft,
    title,
    summaryText: textProgressionSummary(chords),
    nextAction: draft.nextAction ?? "",
    chords,
    ...(draft.bpm === undefined ? {} : { bpm: draft.bpm }),
    ...(keyState.kind === "confirmed" ? { confirmedKey: keyState.key } : {}),
  };
}

function createSavedTextProgressionBlock(
  draft: TextProgressionIdeaDraft & {
    summaryText: string;
    chords: ChordTimelineItem[];
    bpm?: number;
    confirmedKey?: string;
  },
  context: { idFactory: () => string; createdAt: string },
): SavedProgressionBlock {
  const start = textAbsoluteBeat(draft.chords[0]!);
  const end = textAbsoluteBeat(draft.chords[draft.chords.length - 1]!)
    + draft.chords[draft.chords.length - 1]!.durationBeats;
  const startBar = Math.floor(start / 4) + 1;
  const endBar = Math.ceil(end / 4);
  return {
    id: context.idFactory(),
    startBar,
    endBar,
    lengthBars: endBar - startBar + 1,
    summaryText: draft.summaryText,
    chords: persistChordEvents(draft.chords, context.idFactory),
    ...(draft.confirmedKey === undefined ? {} : { detectedKey: draft.confirmedKey }),
    ...(draft.bpm === undefined ? {} : { bpm: draft.bpm }),
    timeSignature: "4/4",
    tags: [],
    capturedAt: context.createdAt,
    // Required existing field; this is true text-parser provenance, not a MIDI
    // analyzer, source-analyzer, or source-weight claim.
    analyzerVersion: "text-progression-v1",
    userEdited: draft.userEdited ?? false,
    userVerified: draft.userVerified ?? false,
  };
}

function textProgressionChordForSave(item: ChordTimelineItem): ChordTimelineItem | undefined {
  const canonical = parseChordLabel(item.chord.label);
  // Validate the supplied structural fields before canonicalising the label, so
  // a direct caller cannot smuggle a mismatched chord object through this API.
  if (!canonical || !sameTextProgressionChord(canonical, item.chord)) return undefined;
  const memory = textPracticeVoicingForSave(item.voicingMemory, canonical);
  return {
    bar: item.bar,
    beat: item.beat,
    durationBeats: item.durationBeats,
    chord: { ...canonical, tensions: [...canonical.tensions] },
    // Text entry never supplies MIDI analyzer confidence or alternatives.
    confidence: 0,
    alternatives: [],
    warnings: [],
    ...(memory === undefined ? {} : { voicingMemory: memory }),
  };
}

/** Only compatible Live MIDI or verified Text style snapshots can cross the text save boundary. */
function textPracticeVoicingForSave(
  memory: ChordTimelineItem["voicingMemory"],
  chord: ChordTimelineItem["chord"],
): ChordTimelineItem["voicingMemory"] | undefined {
  const practice = memory?.practiceVoicingOverride;
  if (
    !practice
    || (
      practice.source !== "live-played"
      && !isTextProgressionStyleSnapshot(practice, chord)
    )
    || practice.representation !== "simultaneous-voicing"
    || !isValidVoicingSnapshot(practice)
    || voicingCompatibility(practice, chord) !== "compatible"
  ) return undefined;
  return {
    practiceVoicingOverride: {
      ...practice,
      midiNotes: [...practice.midiNotes],
    },
  };
}
/**
 * The public store adapter revalidates the parser's save-safe boundary:
 * contiguous exact 4/4 bars within 1..12, 48 chords at most, no gaps or
 * overlaps, and chord identities accepted by the established parser.
 */
function isSaveSafeTextProgressionTimeline(chords: readonly ChordTimelineItem[]): boolean {
  if (chords.length < 1 || chords.length > 48) return false;
  const eventsByBar = new Map<number, ChordTimelineItem[]>();
  let cursor: number | undefined;
  for (const chord of chords) {
    if (!isValidTextProgressionChord(chord)) return false;
    const parsed = parseChordLabel(chord.chord.label);
    if (!parsed || !sameTextProgressionChord(parsed, chord.chord)) return false;
    const start = textAbsoluteBeat(chord);
    const end = start + chord.durationBeats;
    if (start < 0 || end > 48 || start % 4 + chord.durationBeats > 4) return false;
    if (cursor === undefined) {
      if (start !== 0) return false;
    } else if (start !== cursor) {
      return false;
    }
    cursor = end;
    const events = eventsByBar.get(chord.bar) ?? [];
    events.push(chord);
    eventsByBar.set(chord.bar, events);
  }
  if (cursor === undefined || cursor % 4 !== 0) return false;
  return [...eventsByBar.values()].every((events) => {
    const duration = events.length === 1 ? 4 : events.length === 2 ? 2 : events.length === 4 ? 1 : undefined;
    return duration !== undefined && events.every((event) => event.durationBeats === duration);
  });
}

function isValidTextProgressionChord(item: ChordTimelineItem): boolean {
  return Number.isInteger(item.bar)
    && item.bar >= 1
    && item.bar <= 12
    && Number.isInteger(item.beat)
    && item.beat >= 1
    && item.beat <= 4
    && Number.isInteger(item.durationBeats)
    && (item.durationBeats === 1 || item.durationBeats === 2 || item.durationBeats === 4);
}

function sameTextProgressionChord(
  parsed: NonNullable<ReturnType<typeof parseChordLabel>>,
  supplied: ChordTimelineItem["chord"],
): boolean {
  return parsed.root === supplied.root
    && parsed.quality === supplied.quality
    && parsed.bass === supplied.bass
    && parsed.tensions.length === supplied.tensions.length
    && parsed.tensions.every((tension, index) => tension === supplied.tensions[index]);
}

function textProgressionSummary(chords: readonly ChordTimelineItem[]): string {
  const firstBar = chords[0]!.bar;
  const last = chords[chords.length - 1]!;
  const lastBar = Math.ceil((textAbsoluteBeat(last) + last.durationBeats) / 4);
  const cells: string[] = [];
  for (let bar = firstBar; bar <= lastBar; bar += 1) {
    const labels = chords.filter((chord) => chord.bar === bar).map((chord) => chord.chord.label);
    cells.push(labels.join(" / "));
  }
  return `| ${cells.join(" | ")} |`;
}

function textAbsoluteBeat(item: Pick<ChordTimelineItem, "bar" | "beat">): number {
  return (item.bar - 1) * 4 + item.beat - 1;
}

function isValidTextProgressionBpm(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 30 && value <= 240;
}
function toSavedProgressionBlock(
  block: SavedProgressionBlock | ProgressionBlockCandidate,
  analysis: MidiProgressionAnalysis | undefined,
  context: {
    idFactory: () => string;
    now: () => Date;
    sourceData?: MidiSongData;
    sourceVoices?: Voice[];
  },
  metadata: ProgressionSaveMetadata = {},
): SavedProgressionBlock {
  if ("capturedAt" in block) {
    return {
      ...block,
      chords: persistChordEvents(block.chords, context.idFactory),
      ...(block.sourceBassline
        ? { sourceBassline: cloneSourceBassline(block.sourceBassline) }
        : {}),
    };
  }

  const barLengthBeats = beatsPerBar(analysis?.timeSignature);
  // Save what the candidate actually showed. The v2 event slice keeps both
  // chords of a two-chord bar, keeps a sustained chord's length, and includes a
  // chord that sustained in from before the block; `chords` only holds events
  // that start inside it.
  const savedChords = block.events?.length
    ? candidateEventsAsTimeline(block.events, block.startBar, barLengthBeats)
    : block.chords;
  const sourceRange = savedChords.length > 0 ? {
    sourceStartBeat: Math.min(...savedChords.map((item) => (item.bar - 1) * barLengthBeats + item.beat - 1)),
    sourceEndBeat: Math.max(...savedChords.map((item) => (item.bar - 1) * barLengthBeats + item.beat - 1 + item.durationBeats)),
  } : undefined;
  return {
    id: context.idFactory(),
    ...(analysis?.sourceAssetId ? { sourceAssetId: analysis.sourceAssetId } : {}),
    ...(analysis?.fileName ? { sourceFileName: analysis.fileName } : {}),
    ...(analysis?.sourceFingerprint ? { sourceFingerprint: analysis.sourceFingerprint } : {}),
    ...sourceRange,
    startBar: block.startBar,
    endBar: block.endBar,
    lengthBars: block.lengthBars,
    summaryText: block.summaryText,
    chords: persistChordEvents(
      savedChords.map((item) => attachExtractedVoicing(
        item,
        analysis,
        context.sourceData,
        context.sourceVoices,
      )),
      context.idFactory,
    ),
    ...(analysis?.detectedKey ? { detectedKey: analysis.detectedKey } : {}),
    ...(analysis?.bpm ? { bpm: analysis.bpm } : {}),
    ...(analysis?.timeSignature ? { timeSignature: analysis.timeSignature } : {}),
    memo: block.warnings.length > 0 ? block.warnings.join("; ") : undefined,
    tags: [],
    capturedAt: context.now().toISOString(),
    analyzerVersion: analysis?.analyzerVersion ?? "unknown",
    ...(analysis?.analyzerVersion ? { sourceAnalyzerVersion: analysis.analyzerVersion } : {}),
    sourceWeightsVersion: "phase3.6-v1",
    userEdited: metadata.userEdited ?? false,
    userVerified: metadata.userVerified ?? false,
    ...(metadata.sourceBassline
      ? { sourceBassline: cloneSourceBassline(metadata.sourceBassline) }
      : {}),
  };
}

function omitSourceBasslineFromBlock(
  vault: VaultFile,
  ideaId: string,
  blockId: string,
): VaultFile {
  return {
    ...vault,
    ideas: vault.ideas.map((idea) => idea.id === ideaId
      ? {
          ...idea,
          progressionBlocks: (idea.progressionBlocks ?? []).map((block) => {
            if (block.id !== blockId) return block;
            const { sourceBassline, ...withoutSourceBassline } = block;
            void sourceBassline;
            return withoutSourceBassline;
          }),
        }
      : idea),
  };
}
function cloneSourceBassline(snapshot: SourceBasslineSnapshotV1): SourceBasslineSnapshotV1 {
  return sourceBasslineSnapshotSchema.parse(snapshot);
}

function voicingSourceContext(
  state: AnalysisState,
  analysis: MidiProgressionAnalysis | undefined,
): Pick<AnalysisState, "sourceData" | "sourceVoices"> {
  if (!analysis || !state.result) return {};
  const matches = state.result === analysis
    || (
      state.result.sourceFingerprint !== undefined
      && state.result.sourceFingerprint === analysis.sourceFingerprint
    );
  return matches
    ? {
        ...(state.sourceData ? { sourceData: state.sourceData } : {}),
        ...(state.sourceVoices ? { sourceVoices: state.sourceVoices } : {}),
      }
    : {};
}

/**
 * Save-time source voicing.
 *
 * Delegates to the same extraction the capture preview uses, which is what
 * guarantees the saved progression sounds like the candidate that was
 * auditioned. An event that already carries a source voicing keeps it.
 */
function attachExtractedVoicing(
  item: SavedProgressionBlock["chords"][number],
  analysis: MidiProgressionAnalysis | undefined,
  sourceData: MidiSongData | undefined,
  sourceVoices: Voice[] | undefined,
): SavedProgressionBlock["chords"][number] {
  if (item.voicingMemory?.sourceVoicing) return item;
  return attachSourceVoicing(item, { analysis, sourceData, sourceVoices });
}

function persistChordEvents(
  chords: readonly SavedProgressionBlock["chords"][number][],
  idFactory: () => string,
): SavedProgressionBlock["chords"] {
  return chords.map((item) => ({
    ...item,
    alternatives: item.alternatives.slice(
      0,
      MAX_PERSISTED_CHORD_ALTERNATIVES,
    ),
    eventId: isTemporaryEventId(item.eventId) ? idFactory() : item.eventId,
  }));
}

function isTemporaryEventId(eventId: string | undefined): boolean {
  return eventId === undefined
    || eventId.startsWith("legacy:")
    || eventId.includes(":insert:")
    || eventId.includes(":right:")
    || eventId.includes(":advisor:");
}
