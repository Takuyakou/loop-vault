import { describe, expect, it } from "vitest";
import { buildBuiltin } from "./chordDojo/builtins";
import { normalizeMidiNotes } from "./voicing/normalizeVoicing";
import { SAMPLE_PROGRESSIONS, buildSampleProgression } from "./sampleProgressions";

describe("P24-03 the sample progressions", () => {
  it("is the three fixed builtins at their fixed keys", () => {
    expect(SAMPLE_PROGRESSIONS.map((spec) => [spec.id, spec.keyLabel, spec.title, spec.name])).toEqual([
      ["ouudou", "C major", "サンプル：王道進行", "王道進行"],
      ["marusa", "F major", "サンプル：丸サ進行", "丸サ進行"],
      ["circle", "Bb major", "サンプル：循環進行", "循環進行"],
    ]);
  });

  it("keeps the built voicing of every chord as the card's saved sound", () => {
    for (const spec of SAMPLE_PROGRESSIONS) {
      const draft = buildSampleProgression(spec);
      const built = buildBuiltin(spec.id, spec.keyRoot);
      expect(draft.chords.length).toBe(built.chords.length);
      draft.chords.forEach((card, index) => {
        const source = built.chords[index]!;
        expect(card.chord).toEqual(source.chord);
        expect(card.durationBeats).toBe(source.beats ?? 4);
        expect(normalizeMidiNotes(card.voicingMemory?.practiceVoicingOverride?.midiNotes ?? []))
          .toEqual(normalizeMidiNotes(source.notes));
      });
    }
  });

  it("lays the chords out in 4/4 bars from their beats", () => {
    const bars = SAMPLE_PROGRESSIONS.map((spec) => {
      const draft = buildSampleProgression(spec);
      const last = draft.chords[draft.chords.length - 1]!;
      return {
        id: spec.id,
        bars: new Set(draft.chords.map((card) => card.bar)),
        beats: draft.chords.map((card) => card.durationBeats),
        end: draft.scoreLengthBeats,
        lastBar: last.bar,
      };
    });
    expect(bars.map((entry) => entry.end)).toEqual([16, 16, 16]);
    expect(bars.every((entry) => entry.lastBar === 4)).toBe(true);
    expect(bars.find((entry) => entry.id === "marusa")!.beats).toEqual([4, 4, 4, 2, 2]);
  });
});
