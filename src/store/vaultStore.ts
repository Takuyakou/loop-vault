import { createStore, type StoreApi } from "zustand/vanilla";
import { createEmptyVault, type VaultRepository } from "../domain/repository";
import { transition, type TransitionResult } from "../domain/transition";
import type { QuarantinedRecord } from "../domain/schema";
import type { SongIdea, Status, VaultFile } from "../domain/types";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface VaultStoreState {
  ideas: SongIdea[];
  settings: VaultFile["settings"];
  loadStatus: LoadStatus;
  quarantine: QuarantinedRecord[];
  unsaved: boolean;
  saving: boolean;
  lastSavedAt?: string;
  error?: string;
  initialize: () => Promise<void>;
  createIdea: (title: string, status?: Status) => string | undefined;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  deleteIdea: (id: string) => void;
  transitionIdea: (id: string, to: Status, now?: Date) => TransitionResult;
  updateNextAction: (id: string, text: string, now?: Date) => void;
  setMonthlyGoal: (goal: number) => void;
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
      });
    }

    function applyVaultChange(mutator: (vault: VaultFile) => VaultFile) {
      const state = get();
      if (state.loadStatus !== "ready") {
        return;
      }

      const vault = mutator(currentVault(state));
      set({
        ideas: vault.ideas,
        settings: vault.settings,
        unsaved: true,
        error: undefined,
      });
      scheduleSave();
    }

    return {
      ...initialState(),

      async initialize() {
        clearSaveTimer();
        set({ loadStatus: "loading", error: undefined });

        try {
          const result = await options.repository.load();
          setVault(result.vault, result.quarantine);
        } catch (error) {
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
        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
          return undefined;
        }

        const createdAt = now().toISOString();
        const id = idFactory();
        const idea: SongIdea = {
          id,
          title: trimmedTitle.slice(0, 80),
          moods: [],
          status,
          nextAction: { text: "", updatedAt: createdAt },
          chordMemo: "",
          references: [],
          assets: [],
          statusHistory: [{ status, at: createdAt }],
          createdAt,
          updatedAt: createdAt,
        };

        applyVaultChange((vault) => ({ ...vault, ideas: [...vault.ideas, idea] }));
        return id;
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

      setMonthlyGoal(goal) {
        const monthlyGoal = Math.max(1, Math.trunc(goal));
        applyVaultChange((vault) => ({
          ...vault,
          settings: { ...vault.settings, monthlyGoal },
        }));
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
  | "loadStatus"
  | "quarantine"
  | "unsaved"
  | "saving"
  | "error"
> {
  return {
    ideas: [],
    settings: createEmptyVault().settings,
    loadStatus: "idle",
    quarantine: [],
    unsaved: false,
    saving: false,
    error: undefined,
  };
}

function currentVault(state: VaultStoreState): VaultFile {
  return {
    app: "loopvault",
    fileVersion: 1,
    settings: state.settings,
    ideas: state.ideas,
  };
}
