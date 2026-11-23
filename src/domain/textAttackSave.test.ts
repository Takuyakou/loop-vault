import { describe, expect, it } from "vitest";
import { parseUnifiedText, asExtendedTextResult } from "./textUnified";
import { extendedTextSaveData } from "./extendedTextSave";
import { buildSavedTextSource } from "./textSource";
import { buildProgressionVoicingPracticeSnapshot } from "./progressionVoicingPractice/snapshot";
import type { VoicingSnapshot } from "./types";
import {
  createEmptyVault,
  type VaultBackup,
  type VaultLoadResult,
  type VaultRepository,
} from "./repository";
import type { VaultFile } from "./types";
import { createVaultStore } from "../store/vaultStore";
import { BrowserMemoryVaultStorage } from "../storage/browserMemoryVaultStorage";
import { JsonVaultRepository } from "./repository";

class MemoryRepository implements VaultRepository {
  vault: VaultFile = createEmptyVault();
  async load(): Promise<VaultLoadResult> {
    return { vault: this.vault, quarantine: [], created: false };
  }
  async save(vault: VaultFile): Promise<void> { this.vault = vault; }
  async exportTo(): Promise<void> {}
  async importFrom(): Promise<VaultLoadResult> {
    return { vault: this.vault, quarantine: [], created: false };
  }
  async listBackups(): Promise<VaultBackup[]> { return []; }
  async restore(): Promise<VaultLoadResult> {
    return { vault: this.vault, quarantine: [], created: false };
  }
}
const saveOf = (text: string) => {
  const unified = parseUnifiedText(text, { beat: "4/4" });
  return { unified, data: extendedTextSaveData(asExtendedTextResult(unified)) };
};
const durations = (text: string) => saveOf(text).data.chords.map((item) => item.durationBeats);
const count = (text: string) => saveOf(text).data.chords.length;

describe("P24-fix-1 one saved chord per attack", () => {
  it("saves the four examples with one chord per written attack", () => {
    expect(count("| C | C |")).toBe(2);
    expect(durations("| C | C |")).toEqual([4, 4]);
    expect(count("| C % |")).toBe(2);
    expect(durations("| C % |")).toEqual([2, 2]);
    expect(count("| C = |")).toBe(1);
    expect(durations("| C = |")).toEqual([4]);
    expect(count("| Cmaj7 = Am7 Fmaj7 |")).toBe(3);
    expect(durations("| Cmaj7 = Am7 Fmaj7 |")).toEqual([2, 1, 1]);
  });

  it("keeps each attack's own keys, so a repeated chord keeps both presses", () => {
    const unified = parseUnifiedText("| C | C |", { beat: "4/4" });
    const played = (notes: number[]): VoicingSnapshot => ({
      schemaVersion: 1, source: "live-played", representation: "simultaneous-voicing",
      midiNotes: notes, bassNote: notes[0]!, capturedForChordKey: "x", capturedForChordLabel: "C",
      confidence: 1, userVerified: true,
    });
    const data = extendedTextSaveData(asExtendedTextResult(unified), {
      byAttackBeat: new Map([[0, played([48, 52, 55, 59])], [4, played([48, 52, 55, 60])]]),
    });
    expect(data.chords.map((item) => item.voicingMemory?.practiceVoicingOverride?.midiNotes))
      .toEqual([[48, 52, 55, 59], [48, 52, 55, 60]]);
  });

  it("opens a saved repeat as two practice cards", () => {
    const { data } = saveOf("| C % |");
    const snapshot = buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea", blockId: "block" },
      selection: "basic-full",
      block: {
        id: "block", summaryText: data.summaryText, chords: [...data.chords],
        sourceStartBeat: 0, sourceEndBeat: data.scoreLengthBeats,
        startBar: 1, endBar: 1, lengthBars: 1, bpm: 120, timeSignature: "4/4",
        tags: [], capturedAt: "2000-01-01T00:00:00.000Z", analyzerVersion: "text-progression-v1",
        textSource: data.textSource,
      },
    });
    expect(snapshot.ok).toBe(true);
    if (snapshot.ok) expect(snapshot.snapshot.events).toHaveLength(2);
  });

  it("still accepts the old one-card-per-span save (a chart saved before this fix)", async () => {
    const repository = new MemoryRepository();
    const store = createVaultStore({ repository });
    await store.getState().initialize();
    const unified = parseUnifiedText("| C % |", { beat: "4/4" });
    const extended = asExtendedTextResult(unified);
    const spanWise = unified.spans.map((span) => ({
      bar: Math.floor(span.startBeat / 4) + 1,
      beat: (span.startBeat % 4) + 1,
      durationBeats: span.durationBeats,
      chord: { ...span.chord },
      confidence: 0, alternatives: [], warnings: [],
    }));
    const ideaId = store.getState().createIdeaFromTextProgression({
      title: "old span-wise save",
      summaryText: "ignored",
      chords: spanWise,
      scoreLengthBeats: extended.scoreLengthBeats,
      beatsPerBar: 4,
      textSource: buildSavedTextSource(extended),
    });
    expect(ideaId).toBeDefined();
    const block = store.getState().ideas.find((idea) => idea.id === ideaId)!.progressionBlocks![0]!;
    expect(block.chords).toHaveLength(1);
  });
});


describe("REL-03 legacy persisted text", () => {
  it.each([false, true])("reopens the v3.0.0 save shape (textSource: %s)", async extended => {
    const source = "| C % |";
    const parsed = parseUnifiedText(source, { beat: "4/4" });
    const result = asExtendedTextResult(parsed);
    // v3.0.0 saved one card per harmonic span. Extended also serialized the written attacks.
    const chords = parsed.spans.map(span => ({
      bar: 1, beat: span.startBeat + 1, durationBeats: span.durationBeats,
      chord: span.chord, confidence: 0, alternatives: [], warnings: [],
    }));
    const storage = new BrowserMemoryVaultStorage();
    const repository = new JsonVaultRepository(storage);
    const store = createVaultStore({ repository });
    await store.getState().initialize();
    const id = store.getState().createIdeaFromTextProgression({
      title: "Synthetic v3.0.0 progression", summaryText: source, chords,
      scoreLengthBeats: 4, beatsPerBar: 4,
      ...(extended ? { textSource: buildSavedTextSource(result) } : {}),
    });
    expect(id).toBeDefined();
    await store.getState().flush();
    const reopened = await new JsonVaultRepository(storage).load();
    expect(reopened.quarantine).toEqual([]);
    expect(reopened.vault.fileVersion).toBe(2);
    const block = reopened.vault.ideas.find(idea => idea.id === id)?.progressionBlocks?.[0];
    expect(block?.chords.map(chord => [chord.chord.label, chord.durationBeats])).toEqual([["C", 4]]);
    if (extended) expect(block?.textSource?.rawText).toBe(source);
    else expect(block?.textSource).toBeUndefined();
  });
});
