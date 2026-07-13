import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyVault,
  VaultRepositoryError,
  type VaultBackup,
  type VaultImportMode,
  type VaultLoadResult,
  type VaultRepository,
} from "../domain/repository";
import { pickFocus } from "../domain/focus";
import type { ProgressionBlockCandidate, VaultFile } from "../domain/types";
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
  saveError?: Error;
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
    if (this.saveError) {
      throw this.saveError;
    }
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
        settings: { monthlyGoal: 2, language: "ja" },
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

  it("updates the UI language setting through autosave", async () => {
    const repository = new FakeRepository();
    const store = createVaultStore({ repository });
    await store.getState().initialize();

    store.getState().setLanguage("en");
    await store.getState().flush();

    expect(store.getState().settings.language).toBe("en");
    expect(repository.saved[0]?.settings.language).toBe("en");
  });

  it("persists the chord degree display preference", async () => {
    const repository = new FakeRepository();
    const store = createVaultStore({ repository });
    await store.getState().initialize();

    store.getState().setShowRomanNumerals?.(false);
    await store.getState().flush();

    expect(store.getState().settings.showRomanNumerals).toBe(false);
    expect(repository.saved[0]?.settings.showRomanNumerals).toBe(false);
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

  it("keeps unsaved changes when save fails", async () => {
    const repository = new FakeRepository();
    repository.saveError = new Error("Disk full");
    const store = createVaultStore({
      repository,
      idFactory: () => generatedId,
      now: () => now,
    });
    await store.getState().initialize();

    store.getState().createIdea("Unsaved");
    await vi.advanceTimersByTimeAsync(500);

    expect(store.getState().unsaved).toBe(true);
    expect(store.getState().error).toBe("Disk full");
    expect(repository.saved).toHaveLength(0);
  });

  it("keeps current ideas when import fails", async () => {
    const repository = new FakeRepository();
    const currentIdea = makeIdea({ id: generatedId, title: "Current" });
    repository.loadResult = {
      vault: { ...createEmptyVault(), ideas: [currentIdea] },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository });
    await store.getState().initialize();

    await store.getState().importVault("C:/broken.json", "replace");

    expect(store.getState().ideas).toEqual([currentIdea]);
    expect(store.getState().loadStatus).toBe("ready");
    expect(store.getState().error).toBe("Not implemented");
  });

  it("keeps MIDI analysis transient and persists only appended progression blocks", async () => {
    const repository = new FakeRepository();
    const idea = makeIdea({ id: generatedId, progressionBlocks: [] });
    repository.loadResult = {
      vault: { ...createEmptyVault(), ideas: [idea] },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({
      repository,
      idFactory: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      now: () => now,
    });
    const candidate: ProgressionBlockCandidate = {
      id: "candidate-1",
      startBar: 1,
      endBar: 4,
      lengthBars: 4,
      chords: [
        {
          bar: 1,
          beat: 1,
          durationBeats: 4,
          chord: {
            root: 0,
            quality: "maj",
            tensions: [],
            label: "C",
          },
          confidence: 0.9,
          alternatives: [],
          warnings: [],
        },
      ],
      summaryText: "C",
      confidence: 0.9,
      labels: ["C"],
      warnings: [],
    };
    await store.getState().initialize();

    store.getState().appendBlockToIdea(generatedId, candidate, {
      fileName: "capture.mid",
      totalBars: 4,
      bpm: 120,
      timeSignature: "4/4",
      fullTimeline: candidate.chords,
      blockCandidates: [candidate],
      analyzedAt: "1970-01-01T00:00:00.000Z",
      analyzerVersion: "1.0.0",
    });
    await store.getState().flush();

    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]).not.toHaveProperty("analysis");
    expect(repository.saved[0]?.ideas[0]?.progressionBlocks).toHaveLength(1);
    expect(repository.saved[0]?.ideas[0]?.progressionBlocks?.[0]).toMatchObject({
      sourceFileName: "capture.mid",
      summaryText: "C",
      analyzerVersion: "1.0.0",
    });
  });

  it("supports the weekly workflow from capture to done", async () => {
    const repository = new FakeRepository();
    const store = createVaultStore({
      repository,
      idFactory: () => generatedId,
      now: () => now,
    });
    await store.getState().initialize();

    const createdId = store.getState().createIdea("Night Drive");
    expect(createdId).toBe(generatedId);

    store.getState().updateNextAction(generatedId, "Print the bass stem", now);
    const loopAt = new Date("2026-07-21T12:00:00.000Z");
    expect(store.getState().transitionIdea(generatedId, "loop", loopAt).ok).toBe(
      true,
    );

    const staleAt = new Date("2026-07-29T12:00:00.000Z");
    const staleIdea = store.getState().ideas[0];
    expect(staleIdea).toBeDefined();
    const focusBeforeHold = pickFocus([staleIdea!], staleAt);
    expect(focusBeforeHold.stale[0]).toMatchObject({
      idleDays: 8,
      suggestHold: false,
    });

    expect(
      store.getState().transitionIdea(generatedId, "hold", staleAt).ok,
    ).toBe(true);
    expect(store.getState().ideas[0]?.prevStatus).toBe("loop");

    const restoreAt = new Date("2026-07-30T12:00:00.000Z");
    expect(
      store.getState().transitionIdea(generatedId, "loop", restoreAt).ok,
    ).toBe(true);
    store.getState().updateNextAction(
      generatedId,
      "Balance the hook layers",
      restoreAt,
    );

    expect(
      store
        .getState()
        .transitionIdea(generatedId, "arrange", new Date("2026-07-31T12:00:00.000Z"))
        .ok,
    ).toBe(true);
    expect(
      store
        .getState()
        .transitionIdea(generatedId, "mix", new Date("2026-08-01T12:00:00.000Z"))
        .ok,
    ).toBe(true);
    const doneAt = new Date("2026-08-02T12:00:00.000Z");
    expect(store.getState().transitionIdea(generatedId, "done", doneAt).ok).toBe(
      true,
    );

    expect(store.getState().ideas[0]).toMatchObject({
      status: "done",
      completedAt: doneAt.toISOString(),
      nextAction: {
        text: "Balance the hook layers",
      },
    });
  });
});
