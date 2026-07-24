import { describe, expect, it } from "vitest";
import { makeChordSymbol, parseChordLabel } from "../../chords";
import type { ChordTimelineItem } from "../../types";
import {
  aggregateV2, classifyRepresentability, evaluateCaseV2, pairedComparison, pitchClassesOf,
} from "./metricsV2";
import type { MidiEvaluationCase } from "./types";

function timelineItem(label: string, bar: number, durationBeats = 4, alternatives: string[] = []): ChordTimelineItem {
  return {
    bar,
    beat: 1,
    durationBeats,
    chord: parseChordLabel(label)!,
    confidence: 0.9,
    alternatives: alternatives.map((entry) => ({ chord: parseChordLabel(entry)!, confidence: 0.5 })),
    warnings: [],
  };
}

function caseWith(expected: Array<{ label: string; startBeat: number; endBeat: number }>): MidiEvaluationCase {
  return {
    id: "case",
    title: "case",
    midiPath: "case.mid",
    recipeFamily: "test",
    split: "tune",
    category: ["chord-drip"],
    difficulty: "easy",
    expected: {
      chordTimeline: expected.map((entry) => {
        const parsed = parseChordLabel(entry.label)!;
        return {
          startBeat: entry.startBeat,
          endBeat: entry.endBeat,
          primary: entry.label,
          root: parsed.root,
          quality: parsed.quality,
          ...(parsed.bass !== undefined ? { bass: parsed.bass } : {}),
        };
      }),
    },
  };
}

describe("representability", () => {
  it("accepts identities the detector vocabulary can emit", () => {
    expect(classifyRepresentability("Cm7").representability).toBe("representable");
    expect(classifyRepresentability("C6/9").representability).toBe("representable");
    expect(classifyRepresentability("Cm7/G").representability).toBe("representable");
  });

  it("flags identities outside the detector vocabulary", () => {
    // The detector only emits its 21 qualities with an empty tension array.
    expect(classifyRepresentability("C13sus").representability).toBe("detector-vocabulary-unsupported");
    expect(classifyRepresentability("Cmaj13").representability).toBe("detector-vocabulary-unsupported");
    expect(classifyRepresentability("C7(b9)").representability).toBe("detector-vocabulary-unsupported");
  });

  it("separates no-chord from unparsable input", () => {
    expect(classifyRepresentability("N.C.").representability).toBe("no-chord");
    expect(classifyRepresentability("Hmaj7").representability).toBe("parser-unsupported");
  });

  it("resolves enharmonic spellings to the same representability", () => {
    expect(classifyRepresentability("Gbadd9").representability).toBe("representable");
    expect(classifyRepresentability("F#add9").representability).toBe("representable");
  });
});

describe("pitch class derivation", () => {
  it("spells a dominant seventh", () => {
    expect(pitchClassesOf(classifyRepresentability("C7").identity!)).toEqual([0, 4, 7, 10]);
  });

  it("includes a slash bass outside the chord", () => {
    expect(pitchClassesOf(classifyRepresentability("D/E").identity!)).toEqual([2, 4, 6, 9]);
  });

  it("returns nothing for no-chord", () => {
    expect(pitchClassesOf({ rootPitchClass: -1, triad: "unknown", extensions: [], alterations: [], noChord: true }))
      .toEqual([]);
  });
});

describe("canonical scoring", () => {
  it("scores enharmonic spellings as an exact match", () => {
    const definition = caseWith([{ label: "Gbadd9", startBeat: 0, endBeat: 4 }]);
    const result = evaluateCaseV2(definition, [timelineItem("F#add9", 1)]);
    expect(result.durationWeighted.canonicalExactAccuracy).toBe(1);
    expect(result.durationWeighted.rootAccuracy).toBe(1);
  });

  it("separates root, triad, seventh and bass when the chord is partly right", () => {
    const definition = caseWith([{ label: "Cmaj7", startBeat: 0, endBeat: 4 }]);
    const result = evaluateCaseV2(definition, [timelineItem("Cm7", 1)]);
    expect(result.durationWeighted.rootAccuracy).toBe(1);
    expect(result.durationWeighted.triadAccuracy).toBe(0);
    expect(result.durationWeighted.seventhAccuracy).toBe(0);
    expect(result.durationWeighted.canonicalExactAccuracy).toBe(0);
  });

  it("keeps a slash chord distinct from its root position", () => {
    const definition = caseWith([{ label: "C6/E", startBeat: 0, endBeat: 4 }]);
    const result = evaluateCaseV2(definition, [timelineItem("C6", 1)]);
    expect(result.durationWeighted.bassSlashAccuracy).toBe(0);
    expect(result.durationWeighted.canonicalExactAccuracy).toBe(0);
  });

  it("credits an alternative that carries the expected identity", () => {
    const definition = caseWith([{ label: "D/E", startBeat: 0, endBeat: 4 }]);
    const result = evaluateCaseV2(definition, [timelineItem("Em11", 1, 4, ["D/E", "Dadd9/E"])]);
    expect(result.durationWeighted.canonicalExactAccuracy).toBe(0);
    expect(result.durationWeighted.top3CanonicalAccuracy).toBe(1);
  });

  it("tracks root and quality Top-3 independently of canonical Top-3", () => {
    const definition = caseWith([{ label: "Cmaj9", startBeat: 0, endBeat: 4 }]);
    // C7 carries the expected root but a dominant seventh, so root hits while
    // quality and the full identity both miss.
    const result = evaluateCaseV2(definition, [timelineItem("Am7", 1, 4, ["C7", "G"])]);
    expect(result.durationWeighted.top3CanonicalAccuracy).toBe(0);
    expect(result.durationWeighted.top3RootAccuracy).toBe(1);
    expect(result.durationWeighted.top3QualityAccuracy).toBe(0);
  });

  it("counts quality as a hit when only the extension differs", () => {
    const definition = caseWith([{ label: "Cmaj9", startBeat: 0, endBeat: 4 }]);
    const result = evaluateCaseV2(definition, [timelineItem("Cmaj7", 1)]);
    expect(result.durationWeighted.qualityAccuracy).toBe(1);
    expect(result.durationWeighted.extensionAccuracy).toBe(0);
    expect(result.durationWeighted.canonicalExactAccuracy).toBe(0);
  });
});

describe("weighting", () => {
  it("weights by duration and by event separately", () => {
    const definition = caseWith([
      { label: "C", startBeat: 0, endBeat: 12 },
      { label: "G", startBeat: 12, endBeat: 16 },
    ]);
    // The long chord is right, the short one is wrong.
    const result = evaluateCaseV2(definition, [timelineItem("C", 1, 12), timelineItem("Am", 4, 4)]);
    expect(result.durationWeighted.canonicalExactAccuracy).toBe(0.75);
    expect(result.eventWeighted.canonicalExactAccuracy).toBe(0.5);
  });
});

describe("reporting discipline", () => {
  it("counts unreachable expectations instead of dropping them", () => {
    const definition = caseWith([
      { label: "Cm7", startBeat: 0, endBeat: 4 },
      { label: "C13sus", startBeat: 4, endBeat: 8 },
    ]);
    const result = evaluateCaseV2(definition, [timelineItem("Cm7", 1), timelineItem("C7sus4", 2)]);
    expect(result.representabilityBeats.total).toBe(8);
    expect(result.representabilityBeats.representable).toBe(4);
    expect(result.representabilityBeats.detectorVocabularyUnsupported).toBe(4);
    // The unreachable segment still counts against the denominator.
    expect(result.durationWeighted.denominator).toBe(8);
    expect(result.durationWeighted.canonicalExactAccuracy).toBe(0.5);
  });

  it("aggregates representability across cases", () => {
    const definition = caseWith([{ label: "Cm7", startBeat: 0, endBeat: 4 }]);
    const one = evaluateCaseV2(definition, [timelineItem("Cm7", 1)]);
    const aggregate = aggregateV2([one, one]);
    expect(aggregate.caseCount).toBe(2);
    expect(aggregate.representabilityBeats.total).toBe(8);
    expect(aggregate.durationWeighted.canonicalExactAccuracy).toBe(1);
  });
});

describe("paired comparison", () => {
  it("splits cases into improved, regressed and unchanged", () => {
    const definition = caseWith([{ label: "Cmaj7", startBeat: 0, endBeat: 4 }]);
    const baseline = [{ ...evaluateCaseV2(definition, [timelineItem("Am7", 1)]), id: "a" }];
    const candidate = [{ ...evaluateCaseV2(definition, [timelineItem("Cmaj7", 1)]), id: "a" }];
    expect(pairedComparison(baseline, candidate).improved).toEqual(["a"]);
    expect(pairedComparison(candidate, baseline).regressed).toEqual(["a"]);
    expect(pairedComparison(candidate, candidate).unchanged).toEqual(["a"]);
  });
});

describe("detector output is scoreable", () => {
  it("normalises every quality the detector can emit", () => {
    for (const quality of ["maj", "min7", "dom7sus4", "sixNine", "min11", "dom13"] as const) {
      const label = makeChordSymbol(0, quality).label;
      expect(classifyRepresentability(label).representability).toBe("representable");
    }
  });
});
