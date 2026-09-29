import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../../src/domain/chords";
import { JsonVaultRepository, createEmptyVault, type VaultStorage } from "../../src/domain/repository";
import { makeIdea } from "../../src/domain/testFactory";
import { normalizedChordKey } from "../../src/domain/voicing/normalizeVoicing";
import { resolveTimelineItemVoicing, createTimelineVoicingPlaybackPlan } from "../../src/domain/voicing/resolveVoicing";
import { buildProgressionVoicingPracticeSnapshot } from "../../src/domain/progressionVoicingPractice/snapshot";
import type { ChordTimelineItem, SavedProgressionBlock } from "../../src/domain/types";
import { extractSourceV2 } from "./sourceExtractionV2";
class MemoryStorage implements VaultStorage {
  files = new Map<string, string>();
  async ensureDir(): Promise<void> {}
  async exists(path: string): Promise<boolean> { return this.files.has(path); }
  async readText(path: string): Promise<string> { const value = this.files.get(path); if (value === undefined) throw new Error("Missing file"); return value; }
  async writeText(path: string, value: string): Promise<void> { this.files.set(path, value); }
  async rename(from: string, to: string): Promise<void> { this.files.set(to, await this.readText(from)); this.files.delete(from); }
  async copyFile(from: string, to: string): Promise<void> { this.files.set(to, await this.readText(from)); }
  async removeFile(path: string): Promise<void> { this.files.delete(path); }
  async listFiles(path: string): Promise<string[]> { return [...this.files.keys()].filter((key) => key.startsWith(path + "/")).map((key) => key.slice(path.length + 1)); }
}
describe("P9.3 conditional SourceSnapshot roundtrip", () => {
  it("preserves selected source numbers through Vault v2 and Card/Capture/Whole plans", async () => {
    const raw = [48, 55, 60, 64].map((pitch) => ({ pitch, startTick: 0, durationTick: 480,
      velocity: 80, trackIndex: 0, channel: 0 }));
    const extracted = extractSourceV2(raw, 480, { startBeat: 0, endBeat: 1 }, [],
      [48, 55, 60, 64], "PRODUCT_GUARDED");
    const chord = parseChordLabel("Cmaj7");
    expect(chord).toBeDefined();
    if (!chord) return;
    const item: ChordTimelineItem = { bar: 1, beat: 1, durationBeats: 1, chord,
      confidence: 1, alternatives: [], warnings: [], voicingMemory: {
        sourceVoicing: { schemaVersion: 1, source: "midi-extracted", representation: "simultaneous-voicing",
          midiNotes: extracted.selected, bassNote: extracted.selected[0], capturedForChordKey: normalizedChordKey(chord),
          capturedForChordLabel: chord.label, confidence: 1, extractorVersion: "p9.3-research" },
        playbackChoice: "SOURCE",
      } };
    const block: SavedProgressionBlock = { id: "22222222-2222-4222-8222-222222222222", summaryText: "Public synthetic",
      chords: [item], bpm: 120, timeSignature: "4/4", tags: [], capturedAt: "2026-01-01T00:00:00.000Z",
      analyzerVersion: "p9-research" };
    const vault = createEmptyVault();
    vault.ideas = [makeIdea({ title: "Public synthetic", progressionBlocks: [block] })];
    const repo = new JsonVaultRepository(new MemoryStorage(), { now: () => new Date("2026-01-01T00:00:00.000Z") });
    await repo.save(vault);
    const loaded = await repo.load();
    expect(loaded.quarantine).toHaveLength(0);
    const saved = loaded.vault.ideas[0]?.progressionBlocks?.[0];
    expect(saved).toBeDefined();
    if (!saved) return;
    expect(saved.chords[0]?.voicingMemory?.sourceVoicing?.midiNotes).toEqual(extracted.selected);
    expect(resolveTimelineItemVoicing(saved.chords[0]!).midiNotes).toEqual(extracted.selected);
    const capture = createTimelineVoicingPlaybackPlan([item], "p93-capture");
    const eventId = capture.timeline[0]?.eventId;
    expect(eventId && capture.explicitMidiNotesByEventId[eventId]).toEqual(extracted.selected);
    const whole = buildProgressionVoicingPracticeSnapshot({ sourceReference: {
      ideaId: "11111111-1111-4111-8111-111111111111", blockId: saved.id },
      block: saved, selection: "source-midi" });
    expect(whole.ok).toBe(true);
    if (whole.ok) expect(whole.snapshot.events[0]?.voicing?.midiNotes).toEqual(extracted.selected);
  });
});
