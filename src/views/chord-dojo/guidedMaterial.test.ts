import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../../domain/chords";
import type { VaultProgression } from "../../domain/chordDojo/collect";
import { DEFAULT_GUIDED_MATERIAL, defaultGuidedRange, guidedMaterialView } from "./guidedMaterial";

/**
 * P23-38: the small adapter between the two material sources and the guide's window. The expected values
 * are literals (the public 「3-6-2-5」 table and a hand-written saved progression), not recomputed from the
 * product's target generator.
 */
const occurrence = (eventId: string) => ({
  ideaId: "idea-p2338", blockId: "block-p2338", eventId,
  source: "saved" as const, voicingKey: `notes:${eventId}`,
});

const saved: VaultProgression = {
  key: "vault:p2338-1",
  blockId: "block-p2338",
  ideaId: "idea-p2338",
  name: "手書きの進行",
  keyContext: "C",
  beatsPerBar: 4,
  chords: [
    { chord: parseChordLabel("Cmaj7")!, notes: [48, 55, 59, 64], beats: 4, source: occurrence("e0") },
    { chord: parseChordLabel("Cmaj7/E")!, notes: [52, 55, 59, 60], beats: 4, source: occurrence("e1") },
    { chord: parseChordLabel("Dm7")!, notes: [50, 57, 60, 65], beats: 4, source: occurrence("e2") },
    { chord: parseChordLabel("G7")!, notes: [55, 59, 62, 65], beats: 4, source: occurrence("e3") },
  ],
  chordBars: [1, 2, 3, 4],
  chordBeatRanges: [{ start: 0, end: 4 }, { start: 4, end: 8 }, { start: 8, end: 12 }, { start: 12, end: 16 }],
  legacyConfirmed: true,
  pinned: false,
  capturedAt: "2026-11-10T00:00:00.000Z",
};

describe("P23-38 the guide's material adapter", () => {
  it("resolves the default material from the public stable id, with all four chords", () => {
    const view = guidedMaterialView(DEFAULT_GUIDED_MATERIAL, []);
    expect(view).toMatchObject({ name: "3-6-2-5", keyLabel: "C", start: 0, end: 3, count: 4 });
    expect(view?.chords.map((chord) => chord.chord.label)).toEqual(["Em7", "A7", "Dm7", "G7"]);
  });

  it("uses the saved progression's own chords and key for a 2–4 card window", () => {
    const view = guidedMaterialView({ task: { kind: "progression", key: saved.key, review: false, roots: [0], seconds: 120 }, range: { start: 1, end: 3 } }, [saved]);
    expect(view).toMatchObject({ name: "手書きの進行", keyLabel: "C", start: 1, end: 3, count: 3 });
    expect(view?.chords.map((chord) => chord.chord.label)).toEqual(["Cmaj7", "Cmaj7/E", "Dm7", "G7"]);
    expect(view?.chords[1]!.notes).toEqual([52, 55, 59, 60]);
    expect(view?.chords[1]!.source?.source).toBe("saved");
  });

  it("refuses a material the guide cannot use (missing, or fewer than two chords)", () => {
    expect(guidedMaterialView({ task: { kind: "progression", key: "vault:missing", review: false, roots: [0], seconds: 120 } }, [])).toBeUndefined();
    const one = { ...saved, chords: saved.chords.slice(0, 1), chordBars: [1], chordBeatRanges: [{ start: 0, end: 4 }] };
    expect(guidedMaterialView({ task: { kind: "progression", key: saved.key, review: false, roots: [0], seconds: 120 } }, [one])).toBeUndefined();
  });

  it("defaults to the first four cards (or all of a short material)", () => {
    expect(defaultGuidedRange(4)).toEqual({ start: 0, end: 3 });
    expect(defaultGuidedRange(9)).toEqual({ start: 0, end: 3 });
    expect(defaultGuidedRange(3)).toEqual({ start: 0, end: 2 });
  });
});
