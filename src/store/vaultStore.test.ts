import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyVault,
  serializeVault,
  VaultRepositoryError,
  type VaultBackup,
  type VaultImportMode,
  type VaultLoadResult,
  type VaultRepository,
} from "../domain/repository";
import { pickFocus } from "../domain/focus";
import { parseChordLabel } from "../domain/chords";
import type {
  ChordTimelineItem,
  ProgressionBlockCandidate,
  SavedProgressionBlock,
  VaultFile,
} from "../domain/types";
import { makeIdea } from "../domain/testFactory";
import {
  assetAnchor,
  createUndoSnapshot,
  ideaAnchor,
  progressionBlockAnchor,
} from "../domain/undoDeletion";
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
  saveImplementation?: (vault: VaultFile) => Promise<void>;

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
    if (this.saveImplementation) {
      await this.saveImplementation(structuredClone(vault));
      return;
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

function textTimelineChord(
  label: string,
  bar: number,
  beat = 1,
  durationBeats = 4,
): ChordTimelineItem {
  const chord = parseChordLabel(label);
  if (!chord) throw new Error(`Expected test chord label to parse: ${label}`);
  return {
    bar,
    beat,
    durationBeats,
    chord,
    confidence: 0,
    alternatives: [],
    warnings: [],
  };
}

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

  it("does not report a successful creation before the Vault is writable", () => {
    const repository = new FakeRepository();
    const store = createVaultStore({
      repository,
      idFactory: () => generatedId,
      now: () => now,
    });

    const createdId = store.getState().createIdea("Too early");

    expect(createdId).toBeUndefined();
    expect(store.getState().ideas).toHaveLength(0);
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

  it("commits every delayed deletion from its exact snapshot", async () => {
    const repository = new FakeRepository();
    const blocks: SavedProgressionBlock[] = ["block-1", "block-2", "block-3"].map(
      (id) => ({
        id,
        summaryText: id,
        chords: [],
        tags: [],
        capturedAt: now.toISOString(),
        analyzerVersion: "test",
      }),
    );
    const target = makeIdea({
      id: "idea-2",
      progressionBlocks: blocks,
      references: [
        { title: "Reference 1" },
        { title: "Reference 2" },
        { title: "Reference 3" },
      ],
      assets: [
        { id: "asset-1", type: "midi" },
        { id: "asset-2", type: "audio" },
        { id: "asset-3", type: "flp" },
      ],
    });
    repository.loadResult = {
      vault: {
        ...createEmptyVault(),
        ideas: [
          makeIdea({ id: "idea-1" }),
          target,
          makeIdea({ id: "idea-3" }),
        ],
      },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();

    const vaultEpoch = store.getState().vaultEpoch;
    const blockSnapshot = createUndoSnapshot(
      blocks,
      1,
      target.id,
      progressionBlockAnchor,
    )!;
    expect(store.getState().removeProgressionBlock({
      kind: "progressionBlock",
      vaultEpoch,
      snapshot: blockSnapshot,
    })).toBe(true);
    expect(store.getState().ideas[1]?.progressionBlocks?.map((block) => block.id)).toEqual([
      "block-1",
      "block-3",
    ]);

    const referenceSnapshot = createUndoSnapshot(target.references, 1, target.id)!;
    expect(store.getState().removeReference({
      kind: "reference",
      vaultEpoch,
      snapshot: referenceSnapshot,
    })).toBe(true);
    expect(store.getState().ideas[1]?.references.map((reference) => reference.title)).toEqual([
      "Reference 1",
      "Reference 3",
    ]);

    const assetSnapshot = createUndoSnapshot(target.assets, 1, target.id, assetAnchor)!;
    expect(store.getState().unlinkAsset({
      kind: "asset",
      vaultEpoch,
      snapshot: assetSnapshot,
    })).toBe(true);
    expect(store.getState().ideas[1]?.assets.map((asset) => asset.id)).toEqual([
      "asset-1",
      "asset-3",
    ]);

    const ideaSnapshot = createUndoSnapshot(
      store.getState().ideas,
      1,
      "vault",
      ideaAnchor,
    )!;
    expect(store.getState().deleteIdea({
      kind: "idea",
      vaultEpoch,
      snapshot: ideaSnapshot,
    })).toBe(true);
    expect(store.getState().ideas.map((idea) => idea.id)).toEqual(["idea-1", "idea-3"]);
  });

  it("treats a child commit after its parent commit as already deleted", async () => {
    const repository = new FakeRepository();
    const child = {
      id: "block-1",
      summaryText: "Child",
      chords: [],
      tags: [],
      capturedAt: now.toISOString(),
      analyzerVersion: "test",
    };
    const idea = makeIdea({ id: generatedId, progressionBlocks: [child] });
    repository.loadResult = {
      vault: { ...createEmptyVault(), ideas: [idea] },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();
    const vaultEpoch = store.getState().vaultEpoch;
    const parent = {
      kind: "idea" as const,
      vaultEpoch,
      snapshot: createUndoSnapshot([idea], 0, "vault", ideaAnchor)!,
    };
    const pendingChild = {
      kind: "progressionBlock" as const,
      vaultEpoch,
      snapshot: createUndoSnapshot([child], 0, idea.id, progressionBlockAnchor)!,
    };

    expect(store.getState().deleteIdea(parent)).toBe(true);
    expect(store.getState().removeProgressionBlock(pendingChild)).toBe(true);
    expect(store.getState().ideas).toEqual([]);
  });

  it("does not mark a newer change saved when an older flush completes", async () => {
    const repository = new FakeRepository();
    const idea = makeIdea({ id: generatedId, title: "Original" });
    repository.loadResult = {
      vault: { ...createEmptyVault(), ideas: [idea] },
      quarantine: [],
      created: false,
    };
    let releaseFirstSave!: () => void;
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    repository.saveImplementation = async (vault) => {
      repository.saved.push(vault);
      if (repository.saved.length === 1) await firstSaveGate;
    };
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();

    store.getState().updateIdea(generatedId, { title: "First edit" });
    const firstFlush = store.getState().flush();
    await Promise.resolve();
    expect(repository.saved).toHaveLength(1);
    store.getState().updateIdea(generatedId, { title: "Undo or later edit" });

    releaseFirstSave();
    await firstFlush;

    expect(store.getState().unsaved).toBe(true);
    expect(repository.saved[0]?.ideas[0]?.title).toBe("First edit");
    await store.getState().flush();
    expect(repository.saved[1]?.ideas[0]?.title).toBe("Undo or later edit");
    expect(store.getState().unsaved).toBe(false);
  });

  it("serializes concurrent flushes and saves the latest revision", async () => {
    const repository = new FakeRepository();
    const idea = makeIdea({ id: generatedId, title: "Original" });
    repository.loadResult = {
      vault: { ...createEmptyVault(), ideas: [idea] },
      quarantine: [],
      created: false,
    };
    let releaseFirstSave!: () => void;
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    repository.saveImplementation = async (vault) => {
      repository.saved.push(vault);
      if (repository.saved.length === 1) await firstSaveGate;
    };
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();

    store.getState().updateIdea(generatedId, { title: "First edit" });
    const firstFlush = store.getState().flush();
    await Promise.resolve();
    expect(repository.saved).toHaveLength(1);
    store.getState().updateIdea(generatedId, { title: "Latest edit" });
    const secondFlush = store.getState().flush();
    releaseFirstSave();
    await Promise.all([firstFlush, secondFlush]);

    expect(repository.saved.map((vault) => vault.ideas[0]?.title)).toEqual([
      "First edit",
      "Latest edit",
    ]);
    expect(store.getState().unsaved).toBe(false);
  });

  it("autosaves Hold reasons only in status history", async () => {
    const repository = new FakeRepository();
    const originalMemo = "Fmaj7 - Am7 - Gm7 - C7";
    repository.loadResult = {
      vault: {
        ...createEmptyVault(),
        ideas: [makeIdea({ id: generatedId, chordMemo: originalMemo })],
      },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();

    const result = store.getState().transitionIdea(generatedId, "hold", now, {
      reason: "  Arrangement direction is undecided  ",
    });

    expect(result.ok).toBe(true);
    expect(store.getState().unsaved).toBe(true);
    expect(store.getState().ideas[0]?.chordMemo).toBe(originalMemo);
    const currentHistory = store.getState().ideas[0]?.statusHistory ?? [];
    expect(currentHistory[currentHistory.length - 1]).toEqual({
      status: "hold",
      at: now.toISOString(),
      reason: "Arrangement direction is undecided",
    });

    await store.getState().flush();
    expect(repository.saved[0]?.fileVersion).toBe(1);
    expect(repository.saved[0]?.ideas[0]?.chordMemo).toBe(originalMemo);
    const savedHistory = repository.saved[0]?.ideas[0]?.statusHistory ?? [];
    expect(savedHistory[savedHistory.length - 1]?.reason).toBe(
      "Arrangement direction is undecided",
    );
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

  it("waits for an active autosave before replacing the Vault", async () => {
    const repository = new FakeRepository();
    const currentIdea = makeIdea({ id: generatedId, title: "Current" });
    const importedIdea = makeIdea({ id: generatedId, title: "Imported" });
    repository.loadResult = {
      vault: { ...createEmptyVault(), ideas: [currentIdea] },
      quarantine: [],
      created: false,
    };
    repository.importResult = {
      vault: { ...createEmptyVault(), ideas: [importedIdea] },
      quarantine: [],
      created: false,
    };
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
    repository.saveImplementation = async (vault) => {
      repository.saved.push(vault);
      await saveGate;
    };
    const store = createVaultStore({ repository });
    await store.getState().initialize();
    store.getState().updateIdea(generatedId, { title: "Saving" });
    const flush = store.getState().flush();
    await Promise.resolve();

    const importing = store.getState().importVault("C:/import.json", "replace");
    await Promise.resolve();
    expect(repository.importedMode).toBeUndefined();

    releaseSave();
    await Promise.all([flush, importing]);
    expect(repository.importedMode).toBe("replace");
    expect(store.getState().ideas[0]?.title).toBe("Imported");
    expect(store.getState().unsaved).toBe(false);
    expect(store.getState().saving).toBe(false);
  });

  it("ignores a pending deletion captured from the Vault before import", async () => {
    const repository = new FakeRepository();
    const oldIdea = makeIdea({ id: generatedId, title: "Old" });
    const newIdea = makeIdea({ id: generatedId, title: "New" });
    repository.loadResult = {
      vault: { ...createEmptyVault(), ideas: [oldIdea] },
      quarantine: [],
      created: false,
    };
    repository.importResult = {
      vault: { ...createEmptyVault(), ideas: [newIdea] },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository });
    await store.getState().initialize();
    const pending = {
      kind: "idea" as const,
      vaultEpoch: store.getState().vaultEpoch,
      snapshot: createUndoSnapshot([oldIdea], 0, "vault", ideaAnchor)!,
    };

    await store.getState().importVault("C:/import.json", "replace");
    expect(store.getState().deleteIdea(pending)).toBe(true);
    expect(store.getState().ideas).toEqual([newIdea]);
    expect(store.getState().unsaved).toBe(false);
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
    repository.saveImplementation = async (vault) => {
      serializeVault(vault);
      repository.saved.push(vault);
    };
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
          bar: 2,
          beat: 1,
          durationBeats: 3,
          chord: {
            root: 0,
            quality: "maj",
            tensions: [],
            label: "C",
          },
          confidence: 0.9,
          alternatives: [
            {
              chord: { root: 5, quality: "maj", tensions: [], label: "F" },
              confidence: 0.8,
            },
            {
              chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
              confidence: 0.7,
            },
            {
              chord: { root: 9, quality: "min", tensions: [], label: "Am" },
              confidence: 0.6,
            },
          ],
          warnings: [],
        },
      ],
      summaryText: "C",
      confidence: 0.9,
      labels: ["C"],
      warnings: [],
    };
    await store.getState().initialize();

    const appended = store.getState().appendBlockToIdea(generatedId, candidate, {
      fileName: "capture.mid",
      sourceFingerprint: `sha256-${"a".repeat(64)}`,
      totalBars: 4,
      bpm: 120,
      timeSignature: "6/8",
      fullTimeline: candidate.chords,
      blockCandidates: [candidate],
      analyzedAt: "1970-01-01T00:00:00.000Z",
      analyzerVersion: "1.0.0",
    }, {
      sourcePath: "D:/music/capture.mid",
      userEdited: true,
      userVerified: true,
    });
    expect(appended).toBe(true);
    expect(store.getState().appendBlockToIdea("missing-idea", candidate)).toBe(false);
    await store.getState().flush();

    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]).not.toHaveProperty("analysis");
    expect(repository.saved[0]?.ideas[0]?.progressionBlocks).toHaveLength(1);
    expect(repository.saved[0]?.ideas[0]?.progressionBlocks?.[0]).toMatchObject({
      sourceFileName: "capture.mid",
      sourceFingerprint: `sha256-${"a".repeat(64)}`,
      sourceStartBeat: 3,
      sourceEndBeat: 6,
      timeSignature: "6/8",
      summaryText: "C",
      analyzerVersion: "1.0.0",
      sourceAnalyzerVersion: "1.0.0",
      sourceWeightsVersion: "phase3.6-v1",
      userEdited: true,
      userVerified: true,
    });
    expect(repository.saved[0]?.ideas[0]?.progressionBlocks?.[0]?.chords[0]?.eventId)
      .toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(
      repository.saved[0]?.ideas[0]?.progressionBlocks?.[0]?.chords[0]?.alternatives
        .map((alternative) => alternative.chord.label),
    ).toEqual(["F", "G7"]);
    expect(candidate.chords[0]?.alternatives).toHaveLength(3);
    expect(store.getState().unsaved).toBe(false);
    expect(repository.saved[0]?.ideas[0]?.assets).toEqual([
      expect.objectContaining({ type: "midi", path: "D:/music/capture.mid" }),
    ]);
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

  it("updates one saved progression through the debounced vault save path", async () => {
    const repository = new FakeRepository();
    const block: SavedProgressionBlock = {
      id: "block-1",
      summaryText: "Cmaj7",
      chords: [],
      tags: [],
      capturedAt: now.toISOString(),
      analyzerVersion: "test",
    };
    repository.loadResult = {
      vault: {
        ...createEmptyVault(),
        ideas: [makeIdea({ id: "idea-1", progressionBlocks: [block] })],
      },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();

    expect(store.getState().updateProgressionBlock("idea-1", "missing", { summaryText: "x" })).toBe(false);
    expect(store.getState().unsaved).toBe(false);
    expect(store.getState().updateProgressionBlock("idea-1", block.id, {
      id: "must-not-replace-id",
      summaryText: "Dm9 - G13",
      userEdited: true,
      practice: {
        schemaVersion: 1,
        progressionFingerprint: "practice-v1-test",
        provisional: {
          level: 1,
          clearedAt: now.toISOString(),
          clearedOnLocalDate: "2026-07-15",
          targetTempo: 60,
        },
        transposition: {
          schemaVersion: 1,
          clearedKeyPitchClasses: [2, 5, 7],
          updatedAt: now.toISOString(),
        },
      },
    })).toBe(true);
    expect(store.getState().ideas[0]?.progressionBlocks?.[0]).toMatchObject({
      id: block.id,
      summaryText: "Dm9 - G13",
      userEdited: true,
      practice: {
        progressionFingerprint: "practice-v1-test",
      },
    });
    expect(store.getState().unsaved).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.ideas[0]?.progressionBlocks?.[0]?.summaryText).toBe("Dm9 - G13");
    expect(repository.saved[0]?.ideas[0]?.progressionBlocks?.[0]?.practice?.provisional?.level).toBe(1);
    expect(
      repository.saved[0]?.ideas[0]?.progressionBlocks?.[0]
        ?.practice?.transposition?.clearedKeyPitchClasses,
    ).toEqual([2, 5, 7]);
  });

  it("duplicates a saved progression with a new id and cloned chord arrays", async () => {
    const repository = new FakeRepository();
    const block: SavedProgressionBlock = {
      id: "block-1",
      summaryText: "Cmaj7",
      chords: [{
        eventId: "old-event",
        bar: 1,
        beat: 1,
        durationBeats: 4,
        chord: { root: 0, quality: "maj7", tensions: ["9"], label: "Cmaj9" },
        confidence: 0.9,
        alternatives: [],
        warnings: [],
        voicingMemory: {
          sourceVoicing: {
            schemaVersion: 1,
            source: "midi-extracted",
            representation: "simultaneous-voicing",
            midiNotes: [48, 52, 55, 59],
            bassNote: 48,
            capturedForChordKey: "0:maj7:9:-",
          },
        },
      }],
      tags: ["main"],
      capturedAt: "2026-07-01T00:00:00.000Z",
      analyzerVersion: "test",
    };
    repository.loadResult = {
      vault: {
        ...createEmptyVault(),
        ideas: [makeIdea({ id: "idea-1", progressionBlocks: [block] })],
      },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository, idFactory: () => generatedId, now: () => now });
    await store.getState().initialize();

    expect(store.getState().duplicateProgressionBlock("idea-1", block.id)).toBe(generatedId);
    const blocks = store.getState().ideas[0]?.progressionBlocks ?? [];
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ id: generatedId, summaryText: block.summaryText, capturedAt: now.toISOString() });
    expect(blocks[1]?.chords).not.toBe(block.chords);
    expect(blocks[1]?.chords[0]?.eventId).toBe(generatedId);
    expect(blocks[1]?.chords[0]?.eventId).not.toBe(block.chords[0]?.eventId);
    expect(blocks[1]?.chords[0]?.voicingMemory?.sourceVoicing?.midiNotes)
      .not.toBe(block.chords[0]?.voicingMemory?.sourceVoicing?.midiNotes);
    expect(blocks[1]?.chords[0]?.chord.tensions).not.toBe(block.chords[0]?.chord.tensions);
    expect(blocks[1]?.tags).not.toBe(block.tags);
  });
  it("saves one- and twelve-bar text progressions with text-only provenance", async () => {
    const repository = new FakeRepository();
    let nextId = 0;
    const store = createVaultStore({
      repository,
      idFactory: () => `text-id-${++nextId}`,
      now: () => now,
    });
    await store.getState().initialize();

    const oneBarId = store.getState().createIdeaFromTextProgression({
      title: "  Cmaj7 text  ",
      summaryText: "untrusted summary",
      nextAction: "Practice it",
      chords: [textTimelineChord("Cmaj7", 1)],
      bpm: 120,
      confirmedKey: "C major",
    });
    expect(oneBarId).toBe("text-id-1");
    const oneBar = store.getState().ideas[0]?.progressionBlocks?.[0];
    expect(oneBar).toMatchObject({
      id: "text-id-2",
      startBar: 1,
      endBar: 1,
      lengthBars: 1,
      summaryText: "| Cmaj7 |",
      bpm: 120,
      detectedKey: "C major",
      timeSignature: "4/4",
      tags: [],
      analyzerVersion: "text-progression-v1",
    });
    const oneBarRecord = oneBar as unknown as Record<string, unknown>;
    for (const field of [
      "origin",
      "sourceAssetId",
      "sourceFileName",
      "sourceFingerprint",
      "sourceAnalyzerVersion",
      "sourceWeightsVersion",
      "sourceStartBeat",
      "sourceEndBeat",
      "progressionAnalysis",
    ]) {
      expect(oneBarRecord).not.toHaveProperty(field);
    }

    const twelveBarId = store.getState().createIdeaFromTextProgression({
      title: "Twelve bars",
      summaryText: "ignored",
      chords: Array.from({ length: 12 }, (_, index) => textTimelineChord("Cmaj7", index + 1)),
    });
    expect(twelveBarId).toBe("text-id-4");
    const twelveBar = store.getState().ideas[1]?.progressionBlocks?.[0];
    expect(twelveBar).toMatchObject({ startBar: 1, endBar: 12, lengthBars: 12 });
    expect(twelveBar?.chords).toHaveLength(12);
  });

  it("saves a confirmed key and explicit BPM only, and preserves practice-only voicing", async () => {
    const repository = new FakeRepository();
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();

    const practiceOnly = {
      schemaVersion: 1 as const,
      source: "live-played" as const,
      representation: "simultaneous-voicing" as const,
      midiNotes: [36, 43, 47, 52],
      bassNote: 36,
      capturedForChordKey: "0:maj7:-:-",
      capturedForChordLabel: "Cmaj7",
    };
    const chord = textTimelineChord("Cmaj7", 1);
    chord.voicingMemory = {
      sourceVoicing: {
        schemaVersion: 1,
        source: "midi-extracted",
        representation: "simultaneous-voicing",
        midiNotes: [48, 52, 55, 59],
        bassNote: 48,
        capturedForChordKey: "0:maj7:-:-",
      },
      practiceVoicingOverride: practiceOnly,
    };
    expect(store.getState().createIdeaFromTextProgression({
      title: "No inferred metadata",
      summaryText: "ignored",
      chords: [chord],
    })).toBeDefined();
    const saved = store.getState().ideas[0]?.progressionBlocks?.[0];
    expect(saved).not.toHaveProperty("bpm");
    expect(saved).not.toHaveProperty("detectedKey");
    expect(saved?.chords[0]?.voicingMemory).toEqual({ practiceVoicingOverride: practiceOnly });

    expect(store.getState().createIdeaFromTextProgression({
      title: "Invalid BPM",
      summaryText: "ignored",
      chords: [textTimelineChord("Cmaj7", 1)],
      bpm: 29,
    })).toBeUndefined();
    expect(store.getState().createIdeaFromTextProgression({
      title: "Inferred key is not save metadata",
      summaryText: "ignored",
      chords: [textTimelineChord("Cmaj7", 1)],
      confirmedKey: "not a key",
    })).toBeUndefined();
  });

  it("canonicalizes direct text aliases and drops every unsafe practice override", async () => {
    const repository = new FakeRepository();
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();

    const alias = textTimelineChord("Dmaj7", 1);
    alias.chord = { ...alias.chord, label: "DM7" };
    expect(store.getState().createIdeaFromTextProgression({
      title: "Alias",
      summaryText: "ignored",
      chords: [alias],
    })).toBeDefined();
    expect(store.getState().ideas[0]?.progressionBlocks?.[0]?.chords[0]?.chord.label).toBe("Dmaj7");

    const validPractice = {
      schemaVersion: 1 as const,
      source: "live-played" as const,
      representation: "simultaneous-voicing" as const,
      midiNotes: [36, 43, 47, 52],
      bassNote: 36,
      capturedForChordKey: "0:maj7:-:-",
      capturedForChordLabel: "Cmaj7",
    };
    const unsafeSnapshots = [
      { ...validPractice, source: "midi-extracted" as const },
      { ...validPractice, representation: "aggregated-note-set" as const },
      { ...validPractice, capturedForChordKey: "stale" },
      { ...validPractice, midiNotes: [43, 36, 47, 52] },
    ];
    for (const snapshot of unsafeSnapshots) {
      const chord = textTimelineChord("Cmaj7", 1);
      chord.voicingMemory = { practiceVoicingOverride: snapshot };
      expect(store.getState().createIdeaFromTextProgression({
        title: `Unsafe ${store.getState().ideas.length}`,
        summaryText: "ignored",
        chords: [chord],
      })).toBeDefined();
      const ideas = store.getState().ideas;
      const saved = ideas[ideas.length - 1]?.progressionBlocks?.[0]?.chords[0];
      expect(saved?.voicingMemory).toBeUndefined();
    }
  });
  it("fails closed for direct text saves that do not satisfy the text grammar", async () => {
    const repository = new FakeRepository();
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();
    const attempt = (chords: ChordTimelineItem[]) => store.getState().createIdeaFromTextProgression({
      title: "Unsafe direct input",
      summaryText: "ignored",
      chords,
    });

    expect(attempt([textTimelineChord("Cmaj7", 2)])).toBeUndefined();
    expect(attempt([
      textTimelineChord("Cmaj7", 1, 1, 1),
      textTimelineChord("Dm7", 1, 2, 1),
      textTimelineChord("Em7", 1, 3, 2),
    ])).toBeUndefined();
    expect(store.getState().ideas).toHaveLength(0);
  });
});
