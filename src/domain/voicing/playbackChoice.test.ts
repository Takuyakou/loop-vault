import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import { DATA_PATH, JsonVaultRepository, createEmptyVault, type VaultStorage } from "../repository";
import { makeIdea } from "../testFactory";
import type { ChordTimelineItem, VaultFile } from "../types";
import { normalizedChordKey } from "./normalizeVoicing";
import { migratePlaybackChoice, restoreOriginalPlayback, setAllEligibleCardsToSource } from "./playbackChoice";
import { createTimelineVoicingPlaybackPlan, resolveTimelineItemVoicing } from "./resolveVoicing";

class MemoryStorage implements VaultStorage {
  private files = new Map<string, string>();
  async ensureDir(): Promise<void> {}
  async exists(path: string): Promise<boolean> { return this.files.has(path); }
  async readText(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error("missing record");
    return value;
  }
  async writeText(path: string, value: string): Promise<void> { this.files.set(path, value); }
  async rename(from: string, to: string): Promise<void> {
    this.files.set(to, await this.readText(from));
    this.files.delete(from);
  }
  async copyFile(from: string, to: string): Promise<void> { this.files.set(to, await this.readText(from)); }
  async removeFile(path: string): Promise<void> { this.files.delete(path); }
  async listFiles(path: string): Promise<string[]> {
    return [...this.files.keys()].filter(key => key.startsWith(path + "/")).map(key => key.slice(path.length + 1));
  }
}

async function roundtrip(chords: ChordTimelineItem[]) {
  const storage = new MemoryStorage();
  const repository = new JsonVaultRepository(storage, { now: () => new Date("2026-01-01T00:00:00.000Z") });
  const vault = createEmptyVault();
  vault.ideas = [makeIdea({ progressionBlocks: [{
    id: "22222222-2222-4222-8222-222222222222",
    summaryText: "Public synthetic", chords, bpm: 120, timeSignature: "4/4",
    tags: [], capturedAt: "2026-01-01T00:00:00.000Z", analyzerVersion: "p8-shared",
  }] })];
  await repository.save(vault);
  const saved = JSON.parse(await storage.readText(DATA_PATH)) as VaultFile;
  const loaded = await repository.load();
  expect(loaded.created).toBe(false);
  expect(loaded.quarantine).toHaveLength(0);
  return {
    save: saved.ideas[0]!.progressionBlocks![0]!.chords,
    reload: loaded.vault.ideas[0]!.progressionBlocks![0]!.chords,
  };
}

const notes = [40, 52, 55, 59];
function item(confidence: number, choice?: "SOURCE" | "GENERATED" | "CUSTOM", verified = false): ChordTimelineItem {
  const chord = parseChordLabel("Em7")!;
  return {
    eventId: "public-1", bar: 1, beat: 1, durationBeats: 4, chord,
    confidence: 0.5, alternatives: [], warnings: [],
    voicingMemory: {
      ...(choice ? { playbackChoice: choice } : {}),
      sourceVoicing: {
        schemaVersion: 1, source: "midi-extracted", representation: "simultaneous-voicing",
        midiNotes: [...notes], capturedForChordKey: normalizedChordKey(chord),
        confidence, userVerified: verified,
      },
    },
  };
}
describe("P8.1 explicit source playback contract", () => {
  it.each([0.1, 0.95])("plays exact source through Vault, card and capture at confidence %s", async (confidence) => {
    const result = await roundtrip([item(confidence, "SOURCE")]);
    expect(result.save[0]?.voicingMemory?.playbackChoice).toBe("SOURCE");
    expect(result.reload[0]?.voicingMemory?.sourceVoicing?.midiNotes).toEqual(notes);
    expect(resolveTimelineItemVoicing(result.reload[0]!).midiNotes).toEqual(notes);
    const capture = createTimelineVoicingPlaybackPlan(result.reload);
    expect(capture.explicitMidiNotesByEventId[capture.timeline[0]!.eventId!]).toEqual(notes);
  });
  it("compares OFF legacy and ON source intent, including a reversible choice", async () => {
    const off = item(0.1);
    const on = item(0.1, "SOURCE");
    const result = await roundtrip([off, on]);
    expect(resolveTimelineItemVoicing(result.reload[0]!).origin).toBe("generated");
    expect(resolveTimelineItemVoicing(result.reload[1]!).midiNotes).toEqual(notes);
    const rolledBack = {
      ...result.reload[1]!,
      voicingMemory: { ...result.reload[1]!.voicingMemory!, playbackChoice: undefined },
    };
    expect(resolveTimelineItemVoicing(rolledBack).origin).toBe("generated");
    expect(result.reload[0]?.voicingMemory?.playbackChoice).toBeUndefined();
  });
  it("respects generated and custom choices", () => {
    const generated = item(1, "GENERATED");
    expect(resolveTimelineItemVoicing(generated).midiNotes).not.toEqual(notes);
    const custom = item(1, "CUSTOM");
    custom.voicingMemory!.practiceVoicingOverride = {
      ...custom.voicingMemory!.sourceVoicing!, source: "manual", midiNotes: [41, 53, 56, 60],
    };
    expect(resolveTimelineItemVoicing(custom).midiNotes).toEqual([41, 53, 56, 60]);
  });
  it("keeps a stale snapshot from playing after an identity edit", () => {
    const stale = item(1, "SOURCE");
    stale.chord = parseChordLabel("Am7")!;
    expect(resolveTimelineItemVoicing(stale).midiNotes).not.toEqual(notes);
  });
  it("compares deterministic legacy migration policies and preserves user intent", () => {
    const legacy = item(0.2);
    expect(migratePlaybackChoice(legacy, "KEEP_LEGACY_AND_SUGGEST_SOURCE")?.playbackChoice).toBeUndefined();
    expect(migratePlaybackChoice(legacy, "EVIDENCE_BASED_MIGRATION")?.playbackChoice).toBeUndefined();
    expect(migratePlaybackChoice(legacy, "AUTO_MIGRATE_ALL_SOURCE")?.playbackChoice).toBe("SOURCE");
    const verified = item(0.2, undefined, true);
    expect(migratePlaybackChoice(verified, "EVIDENCE_BASED_MIGRATION")?.playbackChoice).toBe("SOURCE");
    const cards = [legacy, verified, item(1, "CUSTOM"), item(1, "GENERATED")];
    const bulk = setAllEligibleCardsToSource(cards);
    expect(bulk.changedCount).toBe(2);
    expect(bulk.cards.map(card => card.voicingMemory?.playbackChoice)).toEqual(["SOURCE", "SOURCE", "CUSTOM", "GENERATED"]);
    expect(cards[0]?.voicingMemory?.playbackChoice).toBeUndefined();
  });

  describe("P25 V33 restoreOriginalPlayback", () => {
    /** A text card: it keeps the sound it was taken in with, and has no 元MIDI. */
    function textCard(choice?: "SOURCE" | "GENERATED" | "CUSTOM"): ChordTimelineItem {
      const card = item(1, choice);
      const source = card.voicingMemory!.sourceVoicing!;
      const { sourceVoicing, ...rest } = card.voicingMemory!;
      void sourceVoicing;
      card.voicingMemory = { ...rest, practiceVoicingOverride: { ...source, source: "manual", midiNotes: [50, 57, 60, 64] } };
      return card;
    }

    it("takes a MIDI card back to 元MIDI and leaves 自分で直した音 alone", () => {
      const generated = item(1, "GENERATED");
      const unset = item(1);
      const source = item(1, "SOURCE");
      const custom = item(1, "CUSTOM");
      const result = restoreOriginalPlayback([generated, unset, source, custom]);
      expect(result.changedCount).toBe(2);
      expect(result.keptCustomCount).toBe(1);
      expect(result.cards.map(card => card.voicingMemory?.playbackChoice))
        .toEqual(["SOURCE", "SOURCE", "SOURCE", "CUSTOM"]);
      expect(generated.voicingMemory?.playbackChoice).toBe("GENERATED");
    });

    it("takes a text card back to its saved sound and leaves an unset one alone", () => {
      const generated = textCard("GENERATED");
      const unset = textCard();
      const unchanged = textCard("SOURCE");
      const result = restoreOriginalPlayback([generated, unset, unchanged]);
      expect(result.changedCount).toBe(1);
      expect(result.keptCustomCount).toBe(0);
      expect(result.cards[0]?.voicingMemory).toEqual({ practiceVoicingOverride: generated.voicingMemory?.practiceVoicingOverride });
      expect(result.cards[0]?.voicingMemory?.playbackChoice).toBeUndefined();
      expect(result.cards[1]).toBe(unset);
      expect(result.cards[2]).toBe(unchanged);
    });

    it("keeps a card that has both a 元MIDI and an unset choice as it is", () => {
      const both = item(1);
      both.voicingMemory!.practiceVoicingOverride = { ...both.voicingMemory!.sourceVoicing!, source: "manual", midiNotes: [41, 53, 56, 60] };
      const result = restoreOriginalPlayback([both]);
      expect(result.changedCount).toBe(0);
      expect(result.cards[0]).toBe(both);
    });

    it("does nothing to a card with no memory", () => {
      const bare: ChordTimelineItem = { ...item(1), voicingMemory: undefined };
      const result = restoreOriginalPlayback([bare]);
      expect(result).toEqual({ cards: [bare], changedCount: 0, keptCustomCount: 0 });
    });
  });
});
