import { describe, expect, it } from "vitest";
import { parseMidi } from "../../src/domain/midi/parser";
import {
  encodeTemporalGoldMidi, temporalBoundaryStarts, temporalCategories,
  temporalGoldCases, temporalGoldVersion, validateTemporalGoldCase,
} from "./temporalGold";

describe("P7 temporal Gold v1", () => {
  it("provides a complete, valid, independently authored taxonomy", () => {
    expect(temporalGoldCases.map((entry) => entry.category)).toEqual(temporalCategories);
    for (const entry of temporalGoldCases) {
      expect(entry.goldVersion).toBe(temporalGoldVersion);
      expect(validateTemporalGoldCase(entry)).toEqual([]);
    }
  });

  it("keeps harmonic, voicing, and note-event boundaries distinct", () => {
    const byCategory = new Map(temporalGoldCases.map((entry) => [entry.category, entry]));
    const passing = byCategory.get("single-voice-passing-note")!;
    expect(temporalBoundaryStarts(passing.harmonicSpans)).toEqual([]);
    expect(temporalBoundaryStarts(passing.voicingSpans)).toEqual([]);
    expect(passing.noteEvents.map((event) => event.kind)).toEqual(["passing"]);

    const reStrike = byCategory.get("same-voicing-restrike")!;
    expect(temporalBoundaryStarts(reStrike.harmonicSpans)).toEqual([]);
    expect(temporalBoundaryStarts(reStrike.voicingSpans)).toEqual([]);
    expect(reStrike.noteEvents[0]?.startBeat).toBe(2);

    const voicing = byCategory.get("voicing-only-change")!;
    expect(temporalBoundaryStarts(voicing.harmonicSpans)).toEqual([]);
    expect(temporalBoundaryStarts(voicing.voicingSpans)).toEqual([2]);

    for (const [category, expected] of [
      ["one-beat-passing-chord", [2, 3]],
      ["half-beat-passing-chord", [2, 2.5]],
    ] as const) {
      const entry = byCategory.get(category)!;
      expect(temporalBoundaryStarts(entry.harmonicSpans)).toEqual(expected);
      expect(temporalBoundaryStarts(entry.voicingSpans)).toEqual(expected);
    }

    const residual = byCategory.get("sustained-pedal-residual")!;
    const pedal = byCategory.get("bass-pedal-point")!;
    expect(residual.voicingSpans[1]?.targetMidi).not.toContain(48);
    expect(pedal.voicingSpans[1]?.targetMidi).toContain(48);
  });

  it("encodes source notes without deriving Gold from analyzer output", () => {
    for (const entry of temporalGoldCases) {
      const parsed = parseMidi(encodeTemporalGoldMidi(entry));
      expect(parsed.notes.map((note) => note.pitch).sort((a, b) => a - b))
        .toEqual(entry.notes.map((note) => note.pitch).sort((a, b) => a - b));
      expect(encodeTemporalGoldMidi(entry)).toEqual(encodeTemporalGoldMidi(entry));
    }
  });

  it("rejects broken span continuity and invalid target note numbers", () => {
    const original = temporalGoldCases[0]!;
    expect(validateTemporalGoldCase({
      ...original,
      harmonicSpans: [{ ...original.harmonicSpans[0]!, endBeat: 3 }],
      voicingSpans: [{ ...original.voicingSpans[0]!, targetMidi: [48, 48, 128] }],
    })).toEqual(expect.arrayContaining(["harmonic-coverage", "voicing-target", "target-not-observed"]));
  });
});
