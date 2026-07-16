import { createStore, type StoreApi } from "zustand/vanilla";
import {
  createEmptyVault,
  VaultRepositoryError,
  type VaultBackup,
  type VaultImportMode,
  type VaultRepository,
} from "../domain/repository";
import { analyzeMidi } from "../domain/midi";
import { transition, type TransitionResult } from "../domain/transition";
import type { QuarantinedRecord } from "../domain/schema";
import type {
  MidiProgressionAnalysis,
  ProgressionBlockCandidate,
  SavedProgressionBlock,
  SongIdea,
  Status,
  VaultFile,
  AppLanguage,
} from "../domain/types";
import type { AnalyzeMidiOptions } from "../domain/midi/types";

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
  error?: string;
  initialize: () => Promise<void>;
  createIdea: (title: string, status?: Status) => string | undefined;
  createIdeaFromDraft: (draft: SongIdeaDraft) => string | undefined;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  deleteIdea: (id: string) => void;
  appendBlockToIdea: (
    ideaId: string,
    block: SavedProgressionBlock | ProgressionBlockCandidate,
    analysis?: MidiProgressionAnalysis,
    metadata?: ProgressionSaveMetadata,
  ) => void;
  removeProgressionBlock: (ideaId: string, blockId: string) => void;
  transitionIdea: (id: string, to: Status, now?: Date) => TransitionResult;
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
      set({
        ideas: vault.ideas,
        settings: vault.settings,
        quarantine,
        loadStatus: "ready",
        unsaved: false,
        saving: false,
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

      deleteIdea(id) {
        applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.filter((idea) => idea.id !== id),
        }));
      },

      appendBlockToIdea(ideaId, block, analysis, metadata) {
        const currentIdea = get().ideas.find((idea) => idea.id === ideaId);
        const existingAsset = metadata?.sourcePath
          ? currentIdea?.assets.find((asset) => asset.type === "midi" && asset.path === metadata.sourcePath)
          : undefined;
        const sourceAssetId = existingAsset?.id ?? (metadata?.sourcePath ? idFactory() : analysis?.sourceAssetId);
        const effectiveAnalysis = sourceAssetId ? { ...analysis, sourceAssetId } as MidiProgressionAnalysis : analysis;
        const savedBlock = toSavedProgressionBlock(block, effectiveAnalysis, {
          idFactory,
          now,
        }, metadata);
        applyVaultChange((vault) => ({
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

      removeProgressionBlock(ideaId, blockId) {
        applyVaultChange((vault) => ({
          ...vault,
          ideas: vault.ideas.map((idea) =>
            idea.id === ideaId
              ? {
                  ...idea,
                  progressionBlocks: (idea.progressionBlocks ?? []).filter(
                    (block) => block.id !== blockId,
                  ),
                  updatedAt: now().toISOString(),
                }
              : idea,
          ),
        }));
      },

      transitionIdea(id, to, transitionNow = now()) {
        const idea = get().ideas.find((entry) => entry.id === id);
        if (!idea) {
          return {
            ok: false,
            error: { code: "invalid-jump", message: "Idea was not found." },
          };
        }

        const result = transition(idea, to, transitionNow);
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
          set({ analysis: { status: "done", result } });
          return result;
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
        applyVaultChange((vault) => ({
          ...vault,
          settings: { ...vault.settings, language },
        }));
      },

      setShowRomanNumerals(showRomanNumerals) {
        applyVaultChange((vault) => ({
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
        const state = get();
        if (!state.unsaved) {
          return;
        }

        set({ saving: true, error: undefined });
        try {
          await options.repository.save(currentVault(get()));
          set({
            unsaved: false,
            saving: false,
            lastSavedAt: now().toISOString(),
          });
        } catch (error) {
          set({
            saving: false,
            unsaved: true,
            error:
              error instanceof Error ? error.message : "Vault could not be saved.",
          });
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
  context: { idFactory: () => string; now: () => Date },
  metadata: ProgressionSaveMetadata = {},
): SavedProgressionBlock {
  if ("capturedAt" in block) {
    return block;
  }

  const sourceRange = block.chords.length > 0 ? {
    sourceStartBeat: Math.min(...block.chords.map((item) => (item.bar - 1) * 4 + item.beat - 1)),
    sourceEndBeat: Math.max(...block.chords.map((item) => (item.bar - 1) * 4 + item.beat - 1 + item.durationBeats)),
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
    chords: block.chords,
    ...(analysis?.detectedKey ? { detectedKey: analysis.detectedKey } : {}),
    ...(analysis?.bpm ? { bpm: analysis.bpm } : {}),
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
