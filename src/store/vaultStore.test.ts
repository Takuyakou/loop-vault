import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyVault,
  VaultRepositoryError,
  type VaultBackup,
  type VaultImportMode,
  type VaultLoadResult,
  type VaultRepository,
} from "../domain/repository";
import type { VaultFile } from "../domain/types";
import { makeIdea } from "../domain/testFactory";
import { createVaultStore } from "./vaultStore";

class FakeRepository implements VaultRepository {
  loadResult: VaultLoadResult = {
    vault: createEmptyVault(),
    quarantine: [],
    created: false,
  };
  loadError?: Error;
  restoreResult?: VaultLoadResult;
  importResult?: VaultLoadResult;
  exportedPath?: string;
  importedMode?: VaultImportMode;
  backups: VaultBackup[] = [];
  saved: VaultFile[] = [];

  async load(): Promise<VaultLoadResult> {
    if (this.loadError) {
      throw this.loadError;
    }
    return this.loadResult;
  }

  async save(vault: VaultFile): Promise<void> {
    this.saved.push(structuredClone(vault));
  }

  async exportTo(path: string): Promise<void> {
    this.exportedPath = path;
  }

  async importFrom(
    _path: string,
    options: { mode?: VaultImportMode } = {},
  ): Promise<VaultLoadResult> {
    this.importedMode = options.mode;
    if (!this.importResult) {
      throw new Error("Not implemented");
    }
    return this.importResult;
  }

  async listBackups(): Promise<VaultBackup[]> {
    return this.backups;
  }

  async restore(): Promise<VaultLoadResult> {
    if (!this.restoreResult) {
      throw new Error("Not implemented");
    }

    return this.restoreResult;
  }
}

const now = new Date("2026-07-20T12:00:00.000Z");
const generatedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("vault store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads ideas and settings from the repository", async () => {
    const repository = new FakeRepository();
    const idea = makeIdea({ id: generatedId });
    repository.loadResult = {
      vault: {
        ...createEmptyVault(),
        ideas: [idea],
        settings: { monthlyGoal: 2 },
      },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository });

    await store.getState().initialize();

    expect(store.getState().ideas).toEqual([idea]);
    expect(store.getState().settings.monthlyGoal).toBe(2);
    expect(store.getState().loadStatus).toBe("ready");
  });

  it("debounces autosave for edits", async () => {
    const repository = new FakeRepository();
    const store = createVaultStore({
      repository,
      idFactory: () => generatedId,
      now: () => now,
    });
    await store.getState().initialize();

    store.getState().createIdea("  Night Drive  ");

    expect(store.getState().unsaved).toBe(true);
    expect(repository.saved).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(499);
    expect(repository.saved).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.ideas[0]?.title).toBe("Night Drive");
    expect(store.getState().unsaved).toBe(false);
  });

  it("flushes pending changes immediately", async () => {
    const repository = new FakeRepository();
    const store = createVaultStore({
      repository,
      idFactory: () => generatedId,
      now: () => now,
    });
    await store.getState().initialize();

    store.getState().createIdea("Immediate");
    await store.getState().flush();
    await vi.advanceTimersByTimeAsync(500);

    expect(repository.saved).toHaveLength(1);
    expect(store.getState().unsaved).toBe(false);
  });

  it("updates Next Action as a single slot and touches updatedAt", async () => {
    const repository = new FakeRepository();
    const idea = makeIdea({
      id: generatedId,
      nextAction: { text: "", updatedAt: "2026-07-01T00:00:00.000Z" },
    });
    repository.loadResult = {
      vault: { ...createEmptyVault(), ideas: [idea] },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();

    store.getState().updateNextAction(generatedId, "Replace the bass", now);

    expect(store.getState().ideas[0]?.nextAction).toEqual({
      text: "Replace the bass",
      updatedAt: now.toISOString(),
    });
    expect(store.getState().ideas[0]?.updatedAt).toBe(now.toISOString());
  });

  it("uses transition domain logic and does not save invalid jumps", async () => {
    const repository = new FakeRepository();
    repository.loadResult = {
      vault: {
        ...createEmptyVault(),
        ideas: [makeIdea({ id: generatedId, status: "idea" })],
      },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();

    const result = store.getState().transitionIdea(generatedId, "mix", now);

    expect(result.ok).toBe(false);
    expect(store.getState().unsaved).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.saved).toHaveLength(0);
  });

  it("enters recovery mode for corrupt JSON and lists backups", async () => {
    const repository = new FakeRepository();
    repository.loadError = new VaultRepositoryError("invalid-json", "Bad JSON", {
      corruptPath: "loopvault/data.corrupt-20260720-120000.json",
    });
    repository.backups = [
      {
        name: "data-20260719-1200.json",
        path: "loopvault/backups/data-20260719-1200.json",
        createdAt: "2026-07-19T12:00:00.000Z",
      },
    ];
    const store = createVaultStore({ repository });

    await store.getState().initialize();

    expect(store.getState().loadStatus).toBe("recovery");
    expect(store.getState().recovery?.corruptPath).toBe(
      "loopvault/data.corrupt-20260720-120000.json",
    );
    expect(store.getState().recovery?.backups).toEqual(repository.backups);
    expect(store.getState().unsaved).toBe(false);
    expect(repository.saved).toHaveLength(0);
  });

  it("enters readonly mode for future fileVersion", async () => {
    const repository = new FakeRepository();
    repository.loadError = new VaultRepositoryError(
      "future-version",
      "Vault fileVersion 2 is newer than this app supports.",
      { fileVersion: 2 },
    );
    const store = createVaultStore({ repository });

    await store.getState().initialize();

    expect(store.getState().loadStatus).toBe("readonly");
    expect(store.getState().readonly?.fileVersion).toBe(2);
    expect(store.getState().unsaved).toBe(false);
  });

  it("restores a selected backup and returns to ready mode", async () => {
    const repository = new FakeRepository();
    const restoredIdea = makeIdea({ id: generatedId, title: "Restored" });
    repository.loadError = new VaultRepositoryError("invalid-json", "Bad JSON");
    repository.restoreResult = {
      vault: { ...createEmptyVault(), ideas: [restoredIdea] },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository });

    await store.getState().initialize();
    await store.getState().restoreBackup("data-20260719-1200.json");

    expect(store.getState().loadStatus).toBe("ready");
    expect(store.getState().ideas).toEqual([restoredIdea]);
    expect(store.getState().recovery).toBeUndefined();
  });

  it("flushes pending changes before export", async () => {
    const repository = new FakeRepository();
    const store = createVaultStore({
      repository,
      idFactory: () => generatedId,
      now: () => now,
    });
    await store.getState().initialize();
    store.getState().createIdea("Export me");

    await store.getState().exportVault("C:/loopvault-export.json");

    expect(repository.saved).toHaveLength(1);
    expect(repository.exportedPath).toBe("C:/loopvault-export.json");
    expect(store.getState().unsaved).toBe(false);
  });

  it("imports a vault with the requested mode", async () => {
    const repository = new FakeRepository();
    const importedIdea = makeIdea({ id: generatedId, title: "Imported" });
    repository.importResult = {
      vault: { ...createEmptyVault(), ideas: [importedIdea] },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository });
    await store.getState().initialize();

    await store.getState().importVault("C:/import.json", "merge");

    expect(repository.importedMode).toBe("merge");
    expect(store.getState().ideas).toEqual([importedIdea]);
    expect(store.getState().loadStatus).toBe("ready");
  });
});
