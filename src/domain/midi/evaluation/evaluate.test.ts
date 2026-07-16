import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../chords";
import { adaptChordDripManifest, type ChordDripCorpusManifest } from "./manifest";
import { evaluateCase } from "./evaluate";

describe("MIDI evaluation", () => {
  it("accepts alternatives and weights scores by duration", () => {
    const definition = {
      id: "case", title: "case", midiPath: "case.mid", recipeFamily: "family", split: "tune" as const,
      category: ["chord-only" as const], difficulty: "easy" as const,
      expected: { chordTimeline: [{ startBeat: 0, endBeat: 4, primary: "Cmaj7", acceptableAlternatives: ["Cmaj9"], root: 0, quality: "maj7" as const }] },
    };
    const chord = makeChordSymbol(0, "maj9");
    const result = evaluateCase(definition, [{ bar: 1, beat: 1, durationBeats: 4, chord, confidence: 0.8, alternatives: [], warnings: [] }]);
    expect(result.rootAccuracy).toBe(1);
    expect(result.exactAccuracy).toBe(1);
  });

  it("keeps recipe families in only one deterministic split", () => {
    const file = (caseId: string) => ({ caseId, midiFile: `${caseId}.mid`, generationRecord: { presetId: "p", voicingId: "v", patternId: "block", bars: 4 }, chordTimeline: [] });
    const manifest = { schemaVersion: 1, generatorVersion: "test", recipeSha256: "x", files: [file("a"), file("b")] } as ChordDripCorpusManifest;
    const cases = adaptChordDripManifest(manifest);
    expect(new Set(cases.map((entry) => entry.split)).size).toBe(1);
  });

  it("uses the corpus-defined 4/4 coordinate grid", () => {
    const definition = {
      id: "bar-two", title: "bar two", midiPath: "bar-two.mid", recipeFamily: "family", split: "holdout" as const,
      category: ["chord-only" as const], difficulty: "easy" as const,
      expected: { chordTimeline: [{ startBeat: 4, endBeat: 8, primary: "C", root: 0, quality: "maj" as const }] },
    };
    const chord = makeChordSymbol(0, "maj");

    expect(evaluateCase(definition, [{
      bar: 2, beat: 1, durationBeats: 4, chord, confidence: 1, alternatives: [], warnings: [],
    }]).exactAccuracy).toBe(1);
  });
});
