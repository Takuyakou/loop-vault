import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../domain/chords";
import { analyzeMidi } from "../domain/midi/analysis";
import { keyAwareChordSpellingVersion } from "../domain/midi/keyAwareChordSpelling";
import { createEmptyVault, type VaultRepository } from "../domain/repository";
import type { ChordTimelineItem, SavedProgressionBlock, VaultFile } from "../domain/types";
import { p526SyntheticMidiHeader } from "../../scripts/p526/baseline";
import { buildP526EightBarPreparedData } from "../../scripts/p526/fixtures";
import { createVaultStore } from "./vaultStore";

describe("P5.26-01 save projection", () => {
  it("persists adapted labels and leaves existing serialized blocks untouched", async () => {
    const existing: SavedProgressionBlock = {
      id: "saved",
      summaryText: "| E/Ab |",
      chords: [timelineItem()],
      detectedKey: "E major",
      tags: [],
      capturedAt: "2026-01-01T00:00:00.000Z",
      analyzerVersion: "phase4-symbolic-v1",
    };
    const existingSnapshot = structuredClone(existing);
    const existingSerialized = JSON.stringify(existing);
    const adapted = analyzeMidi(p526SyntheticMidiHeader, {
      preparedData: buildP526EightBarPreparedData(),
      mode: "phase4-v1",
      enableKeyAwareChordSpelling: true,
    });
    const candidate = adapted.blockCandidates.find((entry) => (
      entry.events?.some((event) => event.chord.label === "E/G#")
    ));
    if (!candidate) throw new Error("adapted candidate for save integration is unavailable");

    const repository = new CapturingRepository();
    let nextId = 0;
    const store = createVaultStore({
      repository,
      idFactory: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
      now: () => new Date("2026-08-31T00:00:00.000Z"),
    });
    await store.getState().initialize();
    const ideaId = store.getState().createIdeaFromDraft({ title: "P5.26 synthetic save" });
    if (!ideaId) throw new Error("test idea could not be created");
    expect(store.getState().appendBlockToIdea(ideaId, candidate, adapted)).toBe(true);
    await store.getState().flush();

    const writtenVault = repository.saved[repository.saved.length - 1];
    const persisted = writtenVault?.ideas[0]?.progressionBlocks?.[0];
    expect(persisted?.chords.some((item) => item.chord.label === "E/G#")).toBe(true);
    expect(persisted?.analyzerVersion).toContain(keyAwareChordSpellingVersion);
    expect(writtenVault?.fileVersion).toBe(2);
    expect(existing).toEqual(existingSnapshot);
    expect(JSON.stringify(existing)).toBe(existingSerialized);
  });
});

function timelineItem(): ChordTimelineItem {
  return {
    eventId: "existing-event",
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord: makeChordSymbol(4, "maj", [], 8),
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  };
}

class CapturingRepository implements VaultRepository {
  readonly saved: VaultFile[] = [];

  async load() {
    return { vault: createEmptyVault(), quarantine: [], created: false };
  }

  async save(vault: VaultFile): Promise<void> {
    this.saved.push(structuredClone(vault));
  }

  async exportTo(_path: string): Promise<void> {}
  async importFrom(_path: string): Promise<never> { throw new Error("unused in P5.26 test"); }
  async listBackups() { return []; }
  async restore(_backupName: string): Promise<never> { throw new Error("unused in P5.26 test"); }
}
