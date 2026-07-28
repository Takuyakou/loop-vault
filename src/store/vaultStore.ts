import { createStore, type StoreApi } from "zustand/vanilla";
import {
  createEmptyVault,
  VaultRepositoryError,
  type VaultBackup,
  type VaultImportMode,
  type VaultRepository,
} from "../domain/repository";
import {
  analyzeMidi,
  annotateVoiceRoles,
  beatsPerBar,
  buildVoiceFeatureInputs,
  buildVoices,
  candidateEventsAsTimeline,
  normalizeNotes,
  parseMidi,
} from "../domain/midi";
import { attachSourceVoicing, attachSourceVoicings } from "../domain/voicing";
import {
  transition,
  type TransitionOptions,
  type TransitionResult,
} from "../domain/transition";
import type { QuarantinedRecord } from "../domain/schema";
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

export interface ProgressionSaveMetadata {
  sourcePath?: string;
  userEdited?: boolean;
  userVerified?: boolean;
}

export interface VaultStoreState {
  ideas: SongIdea[];
  settings: VaultFile["settings"];
  analysis: AnalysisState;
  loadStatus: LoadStatus;
  quarantine: QuarantinedRecord[];
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
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  deleteIdea: (deletion: PendingIdeaDeletion) => boolean;
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
  ) => boolean;
  duplicateProgressionBlock: (
    ideaId: string,
    blockId: string,
  ) => string | undefined;
  removeProgressionBlock: (
    deletion: PendingProgressionBlockDeletion,
  ) => boolean;
  removeReference: (
    deletion: PendingReferenceDeletion,
  ) => boolean;
  unlinkAsset: (
    deletion: PendingAssetDeletion,
  ) => boolean;
  transitionIdea: (
    id: string,
    to: Status,
    now?: Date,
    options?: TransitionOptions,
  ) => TransitionResult;
  updateNextAction: (id: string, text: string, now?: Date) => void;
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

    function setVault(vault: VaultFile, quarantine: QuarantinedRecord[] = []) {
      clearSaveTimer();
      vaultGeneration += 1;
      changeRevision = 0;
      savedRevision = 0;
      set({
        ideas: vault.ideas,
        settings: vault.settings,
        quarantine,
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

    function applyVaultChange(mutator: (vault: VaultFile) => VaultFile) {
      const state = get();
      if (state.loadStatus !== "ready") {
        return false;
      }

      const vault = mutator(currentVault(state));
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
        if (activeFlush) await activeFlush.promise;
        set({
          loadStatus: "loading",
          error: undefined,
          recovery: undefined,
          readonly: undefined,
        });

        try {
          const result = await options.repository.load();
          setVault(result.vault, result.quarantine);
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

        const applied = applyVaultChange((vault) => ({
          ...vault,
          ideas: [...vault.ideas, idea],
        }));
        return applied ? id : undefined;
      },

      updateIdea(id, changes) {
        const updatedAt = now().toISOString();
        applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((idea) =>
            idea.id === id ? { ...idea, ...changes, updatedAt } : idea,
          ),
        }));
      },

      deleteIdea(deletion) {
        if (deletion.vaultEpoch !== get().vaultEpoch) return true;
        const { snapshot } = deletion;
        if (snapshot.parentId !== "vault") return false;
        if (resolveUndoSnapshotIndex(get().ideas, snapshot, ideaAnchor) < 0) return true;
        return applyVaultChange((vault) => ({
          ...vault,
          ideas: removeUndoSnapshot(vault.ideas, snapshot, ideaAnchor),
        }));
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
        return applyVaultChange((vault) => ({
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
        }));
      },

      updateProgressionBlock(ideaId, blockId, changes) {
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
        }));
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
        }));
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
        }));
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
        }));
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

        applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((entry) =>
            entry.id === id ? result.idea : entry,
          ),
        }));
        return result;
      },

      updateNextAction(id, text, actionNow = now()) {
        const updatedAt = actionNow.toISOString();
        applyVaultChange((vault) => ({
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
        }));
      },

      analyzeMidiBytes(bytes, analyzeOptions = {}) {
        set({ analysis: { status: "analyzing" }, error: undefined });
        try {
          const result = analyzeMidi(bytes, analyzeOptions);
          const sourceData = parseMidi(bytes);
          const normalized = normalizeNotes(sourceData);
          const baseVoices = buildVoices(sourceData);
          const sourceVoices = annotateVoiceRoles(
            baseVoices,
            buildVoiceFeatureInputs(baseVoices, normalized),
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
        await get().flush();
        set({ loadStatus: "loading", error: undefined });
        try {
          const result = await options.repository.importFrom(path, { mode });
          setVault(result.vault, result.quarantine);
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
          setVault(result.vault, result.quarantine);
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
        clearSaveTimer();
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
    fileVersion: 1,
    settings: state.settings,
    ideas: state.ideas,
  };
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
  };
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
