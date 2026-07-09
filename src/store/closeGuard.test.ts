import { describe, expect, it } from "vitest";
import type { VaultStoreState } from "./vaultStore";
import { shouldBlockClose } from "./closeGuard";

function state(overrides: Partial<VaultStoreState>): VaultStoreState {
  return {
    ideas: [],
    settings: { monthlyGoal: 1 },
    analysis: { status: "idle" },
    loadStatus: "ready",
    quarantine: [],
    unsaved: false,
    saving: false,
    backups: [],
    initialize: async () => undefined,
    createIdea: () => undefined,
    createIdeaFromDraft: () => undefined,
    updateIdea: () => undefined,
    deleteIdea: () => undefined,
    appendBlockToIdea: () => undefined,
    removeProgressionBlock: () => undefined,
    transitionIdea: () => ({
      ok: false,
      error: { code: "invalid-jump", message: "not used" },
    }),
    updateNextAction: () => undefined,
    analyzeMidiBytes: () => undefined,
    clearAnalysis: () => undefined,
    setMonthlyGoal: () => undefined,
    refreshBackups: async () => undefined,
    exportVault: async () => false,
    importVault: async () => false,
    restoreBackup: async () => undefined,
    flush: async () => undefined,
    ...overrides,
  };
}

describe("shouldBlockClose", () => {
  it("blocks close when there are unsaved changes", () => {
    expect(shouldBlockClose(state({ unsaved: true }))).toBe(true);
  });

  it("does not block close for saving status alone", () => {
    expect(shouldBlockClose(state({ saving: true, unsaved: false }))).toBe(false);
  });
});
