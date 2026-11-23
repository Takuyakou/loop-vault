import { describe, expect, it } from "vitest";
import {
  createEmptyVault,
  type VaultBackup,
  type VaultLoadResult,
  type VaultRepository,
} from "../domain/repository";
import type { VaultFile } from "../domain/types";
import { editProgressionMemo, splitProgressionMemo } from "../domain/progressionWorkspace/progressionWorkspace";
import { buildProgressionVoicingPracticeHandoffFromVault } from "../domain/progressionVoicingPractice";
import { SAMPLE_PROGRESSION_TAG, SAMPLE_PROGRESSIONS } from "../domain/sampleProgressions";
import { createVaultStore } from "./vaultStore";

class MemoryRepository implements VaultRepository {
  vault: VaultFile = createEmptyVault();
  async load(): Promise<VaultLoadResult> {
    return { vault: this.vault, quarantine: [], created: false };
  }
  async save(vault: VaultFile): Promise<void> {
    this.vault = vault;
  }
  async exportTo(): Promise<void> {}
  async importFrom(): Promise<VaultLoadResult> {
    return { vault: this.vault, quarantine: [], created: false };
  }
  async listBackups(): Promise<VaultBackup[]> {
    return [];
  }
  async restore(): Promise<VaultLoadResult> {
    return { vault: this.vault, quarantine: [], created: false };
  }
}

async function readyStore() {
  const store = createVaultStore({ repository: new MemoryRepository() });
  await store.getState().initialize();
  return store;
}

describe("P24-03 addSampleProgressions", () => {
  it("adds the three samples as ordinary progressions with the サンプル tag", async () => {
    const store = await readyStore();
    expect(store.getState().addSampleProgressions()).toBe(3);
    const ideas = store.getState().ideas;
    expect(ideas.map((idea) => idea.title)).toEqual(SAMPLE_PROGRESSIONS.map((spec) => spec.title));
    for (const [index, idea] of ideas.entries()) {
      const spec = SAMPLE_PROGRESSIONS[index]!;
      const block = idea.progressionBlocks?.[0];
      expect(block).toBeDefined();
      expect(block!.tags).toEqual([SAMPLE_PROGRESSION_TAG]);
      expect(block!.memo).toBe(editProgressionMemo(undefined, { name: spec.name }));
      expect(splitProgressionMemo(block!.memo).name).toBe(block!.memo);
      expect(block!.detectedKey).toBe(spec.keyLabel);
      expect(block!.chords).toHaveLength(index === 1 ? 5 : 4);
      expect(block!.startBar).toBe(1);
      expect(block!.endBar).toBe(4);
      expect(block!.lengthBars).toBe(4);
    }
  });

  it("does not add a second set when pressed twice", async () => {
    const store = await readyStore();
    expect(store.getState().addSampleProgressions()).toBe(3);
    expect(store.getState().addSampleProgressions()).toBe(0);
    expect(store.getState().ideas).toHaveLength(3);
  });

  it("opens in Voicing Loop with the saved notes of every card", async () => {
    const store = await readyStore();
    store.getState().addSampleProgressions();
    for (const idea of store.getState().ideas) {
      const block = idea.progressionBlocks![0]!;
      const result = buildProgressionVoicingPracticeHandoffFromVault([idea], { ideaId: idea.id, blockId: block.id });
      expect(result.ok, idea.title).toBe(true);
      if (!result.ok) continue;
      const snapshot = result.handoff.snapshots[result.handoff.initialSelection]!;
      expect(snapshot.events.map((event) => event.voicing?.midiNotes), idea.title)
        .toEqual(block.chords.map((card) => card.voicingMemory!.practiceVoicingOverride!.midiNotes));
    }
  });
});
