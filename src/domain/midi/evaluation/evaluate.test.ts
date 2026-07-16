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
    expect(result.operationCorrectionCost).toMatchObject({ total: 0, mean: 0, byCost: { 0: 1 } });
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

  it("reports independent Root, Quality and Exact Top-3 using only three candidates", () => {
    const definition = {
      id: "top-three", title: "top three", midiPath: "top-three.mid", recipeFamily: "family", split: "holdout" as const,
      category: ["chord-only" as const], difficulty: "hard" as const,
      expected: { chordTimeline: [{ startBeat: 0, endBeat: 4, primary: "Dm7", root: 2, quality: "min7" as const }] },
    };
    const result = evaluateCase(definition, [{
      bar: 1, beat: 1, durationBeats: 4, chord: makeChordSymbol(0, "maj"), confidence: 1, warnings: [],
      alternatives: [
        { chord: makeChordSymbol(2, "maj"), confidence: 0.8 },
        { chord: makeChordSymbol(5, "min7"), confidence: 0.7 },
        { chord: makeChordSymbol(2, "min7"), confidence: 0.6 },
      ],
    }]);
    expect(result.rootTop3Accuracy).toBe(1);
    expect(result.qualityTop3Accuracy).toBe(1);
    expect(result.exactTop3Accuracy).toBe(0);
    expect(result.top3Accuracy).toBe(0);
    expect(result.operationCorrectionCost).toMatchObject({
      total: 1,
      mean: 1,
      byCategory: { alternative: 1 },
    });
  });

  it("reports editor, manual-input, and unrepresentable operation costs independently from the old proxy", () => {
    const definition = {
      id: "operation-cost", title: "operation cost", midiPath: "operation.mid", recipeFamily: "family", split: "holdout" as const,
      category: ["chord-only" as const], difficulty: "hard" as const,
      expected: { chordTimeline: [
        { startBeat: 0, endBeat: 1, primary: "Dmaj7", root: 2, quality: "maj7" as const },
        { startBeat: 1, endBeat: 2, primary: "C7b9", root: 0, quality: "dom7" as const },
        { startBeat: 2, endBeat: 3, primary: "not-a-chord", root: 0, quality: "maj" as const },
      ] },
    };
    const result = evaluateCase(definition, [{
      bar: 1, beat: 1, durationBeats: 2, chord: makeChordSymbol(0, "maj7"), confidence: 1, alternatives: [], warnings: [],
    }]);
    expect(result.correctionCost).toBe(3);
    expect(result.operationCorrectionCost).toMatchObject({
      segmentCount: 3,
      total: 9,
      byCost: { 2: 1, 3: 1, 4: 1 },
    });
  });
});
