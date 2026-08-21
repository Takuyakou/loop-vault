import { describe, expect, it, vi } from "vitest";
import {
  canonicalVaultJson,
  createEmptyVault,
  type VaultLoadResult,
  type VaultRepository,
} from "../domain/repository";
import { extractSourceBasslineSnapshot } from "../domain/sourceBassline";
import type { ProgressionBlockCandidate, VaultFile } from "../domain/types";
import { createUndoSnapshot, ideaAnchor, progressionBlockAnchor } from "../domain/undoDeletion";
import { createVaultStore } from "./vaultStore";
import { MAX_EXTERNAL_VAULT_BYTES, utf8ByteLength } from "../security/intakeBudgets";

class MemoryRepository implements VaultRepository {
  saved: VaultFile[] = [];
  failSave = false;
  async load(): Promise<VaultLoadResult> {
    return { vault: createEmptyVault(), quarantine: [], created: false };
  }
  async save(vault: VaultFile): Promise<void> {
    if (this.failSave) throw new Error("Synthetic atomic save failure.");
    this.saved.push(structuredClone(vault));
  }
  async exportTo(): Promise<void> { return undefined; }
  async importFrom(): Promise<VaultLoadResult> { return this.load(); }
  async listBackups() { return []; }
  async restore(): Promise<VaultLoadResult> { return this.load(); }
}

const snapshot = extractSourceBasslineSnapshot({
  selectedSourceId: "transient-source",
  selectedVoiceId: "transient-voice",
  notes: [{
    sourceId: "transient-source",
    voiceId: "transient-voice",
    pitch: 36,
    velocity: 0.8,
    startTick: 0,
    durationTick: 480,
    ticksPerQuarter: 480,
  }],
  range: {
    authority: "raw-integer-ticks",
    constantMeterProven: true,
    barAlignmentProven: true,
    sourceId: "transient-source",
    startTick: 0,
    endTick: 3840,
    sourceEndTick: 3840,
    ticksPerQuarter: 480,
    meter: { numerator: 4, denominator: 4 },
  },
});

const candidate: ProgressionBlockCandidate = {
  id: "candidate",
  startBar: 1,
  endBar: 2,
  lengthBars: 2,
  chords: [],
  summaryText: "Synthetic progression",
  confidence: 1,
  labels: [],
  warnings: [],
};

describe("Source bassline Vault persistence", () => {
  it("accepts only the validated detached snapshot at the save boundary", async () => {
    const repository = new MemoryRepository();
    const store = createVaultStore({ repository, debounceMs: 60_000, idFactory: idFactory() });
    await store.getState().initialize();
    const ideaId = store.getState().createIdeaFromDraft({
      title: "Synthetic",
      progressionBlock: candidate,
      progressionMetadata: { sourceBassline: snapshot },
    });
    const stored = store.getState().ideas[0]?.progressionBlocks?.[0]?.sourceBassline;
    expect(ideaId).toBeDefined();
    expect(stored).toEqual(snapshot);
    expect(stored).not.toBe(snapshot);
    expect(stored?.notes).not.toBe(snapshot.notes);
    expect(JSON.stringify(stored)).not.toMatch(/transient-source|transient-voice|path|filename|device|raw/i);
  });

  it("rejects mutation attempts, deep-copies duplicate, and deletes with its block", async () => {
    const store = createVaultStore({ repository: new MemoryRepository(), debounceMs: 60_000, idFactory: idFactory() });
    await store.getState().initialize();
    const ideaId = store.getState().createIdeaFromDraft({
      title: "Synthetic",
      progressionBlock: candidate,
      progressionMetadata: { sourceBassline: snapshot },
    })!;
    const block = store.getState().ideas[0]!.progressionBlocks![0]!;
    expect(store.getState().updateProgressionBlock(ideaId, block.id, { sourceBassline: snapshot })).toBe(false);
    const storedSnapshot = block.sourceBassline;
    expect(store.getState().updateProgressionBlock(
      ideaId, block.id, { summaryText: "Edited progression" },
    )).toBe(true);
    expect(store.getState().ideas[0]!.progressionBlocks![0]!.sourceBassline).toBe(storedSnapshot);
    const duplicateId = store.getState().duplicateProgressionBlock(ideaId, block.id)!;
    const duplicate = store.getState().ideas[0]!.progressionBlocks!.find((entry) => entry.id === duplicateId)!;
    expect(duplicate.sourceBassline).toEqual(block.sourceBassline);
    expect(duplicate.sourceBassline).not.toBe(block.sourceBassline);
    expect(duplicate.sourceBassline?.notes).not.toBe(block.sourceBassline?.notes);
    const snapshotForDelete = createUndoSnapshot(
      store.getState().ideas[0]!.progressionBlocks!,
      0,
      ideaId,
      progressionBlockAnchor,
    )!;
    expect(store.getState().removeProgressionBlock({
      kind: "progressionBlock",
      vaultEpoch: store.getState().vaultEpoch,
      snapshot: snapshotForDelete,
    })).toBe(true);
    expect(store.getState().ideas[0]!.progressionBlocks?.some((entry) => entry.id === block.id)).toBe(false);
  });

  it("keeps a locally quarantined Vault non-writing until explicit recovery", async () => {
    const repository = new MemoryRepository();
    const originalIdea = { ...makeOversizedIdea(), chordMemo: "Original", progressionBlocks: [] };
    repository.load = async () => ({
      vault: { ...createEmptyVault(), ideas: [originalIdea] },
      quarantine: [{ index: 1, value: {}, issues: [] }],
      created: false,
    });
    const importSpy = vi.spyOn(repository, "importFrom");
    const exportSpy = vi.spyOn(repository, "exportTo");
    const store = createVaultStore({ repository, debounceMs: 60_000, idFactory: idFactory() });
    await store.getState().initialize();

    store.getState().updateIdea(originalIdea.id, { chordMemo: "Must not persist" });
    await store.getState().flush();
    expect(store.getState().ideas[0]?.chordMemo).toBe("Original");
    expect(repository.saved).toHaveLength(0);
    expect(store.getState().error).toContain("非書込み");

    expect(await store.getState().importVault("synthetic.json", "merge")).toBe(false);
    expect(await store.getState().exportVault("synthetic.json")).toBe(false);
    expect(importSpy).not.toHaveBeenCalled();
    expect(exportSpy).not.toHaveBeenCalled();
    expect(repository.saved).toHaveLength(0);
  });
  it("keeps oversized legacy data read-only until an explicit delete yields a compliant Vault", async () => {
    const repository = new MemoryRepository();
    repository.load = async () => ({
      vault: {
        ...createEmptyVault(),
        ideas: [{
          id: "40000000-0000-4000-8000-000000000004",
          title: "Synthetic oversized legacy record",
          moods: [],
          status: "idea",
          nextAction: { text: "", updatedAt: "2026-08-21T00:00:00.000Z" },
          chordMemo: "x".repeat(17 * 1024 * 1024),
          references: [],
          assets: [],
          progressionBlocks: [],
          statusHistory: [{ status: "idea", at: "2026-08-21T00:00:00.000Z" }],
          createdAt: "2026-08-21T00:00:00.000Z",
          updatedAt: "2026-08-21T00:00:00.000Z",
        }],
      },
      quarantine: [],
      created: false,
      sizeRecovery: true,
    });
    const store = createVaultStore({ repository, debounceMs: 60_000, idFactory: idFactory() });
    await store.getState().initialize();
    expect(store.getState().sizeRecovery).toBe(true);
    expect(store.getState().createIdea("Blocked addition")).toBeUndefined();
    const deletion = createUndoSnapshot(store.getState().ideas, 0, "vault", ideaAnchor)!;
    expect(store.getState().deleteIdea({
      kind: "idea",
      vaultEpoch: store.getState().vaultEpoch,
      snapshot: deletion,
    })).toBe("pending");
    expect(store.getState().ideas).toHaveLength(1);
    expect(store.getState().sizeRecovery).toBe(true);
    await store.getState().flush();
    expect(store.getState().ideas).toHaveLength(0);
    expect(store.getState().sizeRecovery).toBe(false);

    const shrinkStore = createVaultStore({
      repository, debounceMs: 60_000, idFactory: idFactory(),
    });
    await shrinkStore.getState().initialize();
    shrinkStore.getState().updateIdea(
      "40000000-0000-4000-8000-000000000004",
      { chordMemo: "Recovered" },
    );
    expect(shrinkStore.getState().ideas[0]?.chordMemo).not.toBe("Recovered");
    expect(shrinkStore.getState().sizeRecovery).toBe(true);
    await shrinkStore.getState().flush();
    expect(shrinkStore.getState().ideas[0]?.chordMemo).toBe("Recovered");
    expect(shrinkStore.getState().sizeRecovery).toBe(false);
  });

  it("keeps recovery state and the original Vault when atomic shrink save fails", async () => {
    const repository = new MemoryRepository();
    repository.failSave = true;
    repository.load = async () => ({
      vault: {
        ...createEmptyVault(),
        ideas: [makeOversizedIdea()],
      },
      quarantine: [],
      created: false,
      sizeRecovery: true,
    });
    const store = createVaultStore({ repository, debounceMs: 60_000, idFactory: idFactory() });
    await store.getState().initialize();
    store.getState().updateIdea(
      "40000000-0000-4000-8000-000000000004",
      { chordMemo: "Recovered" },
    );
    await store.getState().flush();
    expect(store.getState().sizeRecovery).toBe(true);
    expect(store.getState().ideas[0]?.chordMemo).not.toBe("Recovered");
    expect(store.getState().error).toContain("変更されていません");
  });
  it("offers aggregate fallback only when omitting the new snapshot fits the exact budget", async () => {
    const fixedNow = () => new Date("2026-08-21T00:00:00.000Z");
    const baseIdea = {
      ...makeOversizedIdea(),
      chordMemo: "",
      progressionBlocks: [],
    };
    const probeRepository = new MemoryRepository();
    probeRepository.load = async () => ({
      vault: { ...createEmptyVault(), ideas: [baseIdea] },
      quarantine: [],
      created: false,
    });
    const probe = createVaultStore({
      repository: probeRepository,
      debounceMs: 60_000,
      idFactory: idFactory(),
      now: fixedNow,
    });
    await probe.getState().initialize();
    expect(probe.getState().appendBlockToIdea(
      baseIdea.id,
      candidate,
      undefined,
      { sourceBassline: snapshot },
    )).toBe(true);
    const withSnapshot = probe.getState().ideas[0]!.progressionBlocks![0]!;
    const { sourceBassline: omitted, ...withoutSnapshot } = withSnapshot;
    expect(omitted).toBeDefined();

    const projectedWithoutFiller = {
      ...createEmptyVault(),
      ideas: [{
        ...baseIdea,
        chordMemo: "",
        progressionBlocks: [withoutSnapshot],
        updatedAt: fixedNow().toISOString(),
      }],
    };
    const fixedBytes = utf8ByteLength(canonicalVaultJson(projectedWithoutFiller));
    const fillerLength = MAX_EXTERNAL_VAULT_BYTES - fixedBytes;
    expect(fillerLength).toBeGreaterThan(0);
    const exactVault = {
      ...createEmptyVault(),
      ideas: [{ ...baseIdea, chordMemo: "x".repeat(fillerLength) }],
    };
    const exactProjection = {
      ...projectedWithoutFiller,
      ideas: [{
        ...projectedWithoutFiller.ideas[0]!,
        chordMemo: "x".repeat(fillerLength),
      }],
    };
    expect(utf8ByteLength(canonicalVaultJson(exactProjection)))
      .toBe(MAX_EXTERNAL_VAULT_BYTES);

    const acceptedRepository = new MemoryRepository();
    acceptedRepository.load = async () => ({
      vault: exactVault,
      quarantine: [],
      created: false,
    });
    const accepted = createVaultStore({
      repository: acceptedRepository,
      debounceMs: 60_000,
      idFactory: idFactory(),
      now: fixedNow,
    });
    await accepted.getState().initialize();
    const confirm = vi.fn(() => true);
    expect(accepted.getState().appendBlockToIdea(
      baseIdea.id,
      candidate,
      undefined,
      {
        sourceBassline: snapshot,
        confirmSourceBasslineOmission: confirm,
      },
    )).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    expect(accepted.getState().ideas[0]!.progressionBlocks![0]!.sourceBassline)
      .toBeUndefined();
    expect(utf8ByteLength(canonicalVaultJson({
      ...createEmptyVault(),
      ideas: accepted.getState().ideas,
    }))).toBe(MAX_EXTERNAL_VAULT_BYTES);

    const cancelledRepository = new MemoryRepository();
    cancelledRepository.load = async () => ({
      vault: exactVault,
      quarantine: [],
      created: false,
    });
    const cancelled = createVaultStore({
      repository: cancelledRepository,
      debounceMs: 60_000,
      idFactory: idFactory(),
      now: fixedNow,
    });
    await cancelled.getState().initialize();
    const cancel = vi.fn(() => false);
    expect(cancelled.getState().appendBlockToIdea(
      baseIdea.id,
      candidate,
      undefined,
      {
        sourceBassline: snapshot,
        confirmSourceBasslineOmission: cancel,
      },
    )).toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancelled.getState().ideas[0]!.progressionBlocks).toHaveLength(0);

    const overRepository = new MemoryRepository();
    overRepository.load = async () => ({
      vault: {
        ...exactVault,
        ideas: [{ ...exactVault.ideas[0]!, chordMemo: "x".repeat(fillerLength + 1) }],
      },
      quarantine: [],
      created: false,
    });
    const over = createVaultStore({
      repository: overRepository,
      debounceMs: 60_000,
      idFactory: idFactory(),
      now: fixedNow,
    });
    await over.getState().initialize();
    const mustNotConfirm = vi.fn(() => true);
    expect(over.getState().appendBlockToIdea(
      baseIdea.id,
      candidate,
      undefined,
      {
        sourceBassline: snapshot,
        confirmSourceBasslineOmission: mustNotConfirm,
      },
    )).toBe(false);
    expect(mustNotConfirm).not.toHaveBeenCalled();
    expect(over.getState().ideas[0]!.progressionBlocks).toHaveLength(0);

    const genericRepository = new MemoryRepository();
    genericRepository.load = overRepository.load;
    const genericOver = createVaultStore({
      repository: genericRepository,
      debounceMs: 60_000,
      idFactory: idFactory(),
      now: fixedNow,
    });
    await genericOver.getState().initialize();
    const announce = vi.fn();
    expect(genericOver.getState().appendBlockToIdea(
      baseIdea.id,
      candidate,
      undefined,
      { onPersistenceError: announce },
    )).toBe(false);
    expect(announce).toHaveBeenCalledWith(expect.stringContaining("16 MiB"));
    expect(announce.mock.calls[0]?.[0]).toContain("既存内容を減らす");
    expect(announce.mock.calls[0]?.[0]).not.toMatch(/[A-Z]:[\\/]|\/Users\//);
    expect(genericOver.getState().ideas[0]!.progressionBlocks).toHaveLength(0);
  });
});

function makeOversizedIdea() {
  return {
    id: "40000000-0000-4000-8000-000000000004",
    title: "Synthetic oversized legacy record",
    moods: [],
    status: "idea" as const,
    nextAction: { text: "", updatedAt: "2026-08-21T00:00:00.000Z" },
    chordMemo: "x".repeat(17 * 1024 * 1024),
    references: [],
    assets: [],
    progressionBlocks: [],
    statusHistory: [{ status: "idea" as const, at: "2026-08-21T00:00:00.000Z" }],
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
  };
}

function idFactory(): () => string {
  let index = 1;
  return () => `00000000-0000-4000-8000-${String(index++).padStart(12, "0")}`;
}
