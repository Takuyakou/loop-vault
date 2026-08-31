import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../src/domain/chords";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import {
  applyKeyAwareChordSpelling,
  keyAwareChordSpellingVersion,
} from "../../src/domain/midi/keyAwareChordSpelling";
import type {
  ChordSymbol, ChordTimelineItem, MidiProgressionAnalysis,
} from "../../src/domain/types";
import { captureP526CurrentActual, p526SyntheticMidiHeader } from "./baseline";
import { buildP526EightBarPreparedData, p526ExpectedEightBarTruth } from "./fixtures";
import { evaluateP526EightBarBaseline } from "./metrics";

describe("P5.26-01 key-aware surface spelling", () => {
  it("is literal-true-only and keeps omitted/false analysis byte-equivalent", () => {
    const options = { preparedData: buildP526EightBarPreparedData(), mode: "phase4-v1" as const };
    const omitted = analyzeMidi(p526SyntheticMidiHeader, options);
    const disabled = analyzeMidi(p526SyntheticMidiHeader, {
      ...options, enableKeyAwareChordSpelling: false,
    });
    const nonLiteral = analyzeMidi(p526SyntheticMidiHeader, {
      ...options,
      enableKeyAwareChordSpelling: 1 as unknown as boolean,
    });
    expect(disabled).toEqual(omitted);
    expect(JSON.stringify(disabled)).toBe(JSON.stringify(omitted));
    expect(nonLiteral).toEqual(omitted);
  });

  it("uses the E-major signature only for diatonic roots", () => {
    const input = analysis([
      makeChordSymbol(4, "maj"), makeChordSymbol(6, "maj"), makeChordSymbol(8, "maj"),
      makeChordSymbol(9, "maj"), makeChordSymbol(11, "maj"), makeChordSymbol(1, "maj"),
      makeChordSymbol(3, "maj"), makeChordSymbol(0, "maj"), makeChordSymbol(10, "maj"),
    ], "E major");
    const result = applyKeyAwareChordSpelling(input);
    expect(result.fullTimeline.map((item) => item.chord.label)).toEqual([
      "E", "F#", "G#", "A", "B", "C#", "D#", "C", "Bb",
    ]);
    expect(result.fullTimeline.map((item) => item.chord.root))
      .toEqual(input.fullTimeline.map((item) => item.chord.root));
  });

  it("adapts both primary and alternative labels", () => {
    const input = analysis([makeChordSymbol(8, "dom7")], "E major");
    input.fullTimeline[0]!.alternatives = [{
      chord: makeChordSymbol(4, "maj", [], 8),
      confidence: 0.7,
    }];
    const result = applyKeyAwareChordSpelling(input);
    expect(result.fullTimeline[0]?.chord.label).toBe("G#7");
    expect(result.fullTimeline[0]?.alternatives[0]?.chord.label).toBe("E/G#");
  });

  it("spells slash basses from the chord interval without globally sharpening them", () => {
    const result = applyKeyAwareChordSpelling(analysis([
      makeChordSymbol(4, "maj", [], 8),
      makeChordSymbol(8, "aug", [], 4),
      makeChordSymbol(8, "dim7", [], 5),
      makeChordSymbol(0, "aug", [], 8),
      makeChordSymbol(4, "maj", [], 10),
      makeChordSymbol(9, "maj7", [], 11),
      makeChordSymbol(4, "sixNine"),
    ], "E major"));
    expect(result.fullTimeline.map((item) => item.chord.label)).toEqual([
      "E/G#", "G#aug/D##", "G#dim7/F", "Caug/G#",
      "E/Bb", "Amaj7/B", "E6/9",
    ]);
  });

  it("fails closed for ambiguous degrees and unsupported runtime qualities", () => {
    const ambiguous = makeChordSymbol(8, "dim7", ["13"], 5);
    const unsupported: ChordSymbol = {
      root: 4,
      quality: "unsupported-runtime-quality" as ChordSymbol["quality"],
      tensions: [],
      bass: 8,
      label: "Ecustom/Ab",
    };
    const result = applyKeyAwareChordSpelling(analysis([ambiguous, unsupported], "E major"));
    expect(result.fullTimeline.map((item) => item.chord.label)).toEqual([
      "G#dim7(13)/F", "Ecustom/Ab",
    ]);
  });

  it("preserves b9/b13 vocabulary while changing only the target root surface", () => {
    const result = applyKeyAwareChordSpelling(analysis([
      makeChordSymbol(8, "dom7", ["b13"]),
      makeChordSymbol(1, "dom7", ["b9"]),
    ], "E major"));
    expect(result.fullTimeline.map((item) => item.chord.label))
      .toEqual(["G#7(b13)", "C#7(b9)"]);
    expect(result.fullTimeline.map((item) => item.chord.tensions))
      .toEqual([["b13"], ["b9"]]);
  });

  it("returns the original analysis for unknown/unparseable keys", () => {
    for (const key of [undefined, "unknown", "E dorian"]) {
      const input = analysis([makeChordSymbol(8, "dom7")], key);
      const output = applyKeyAwareChordSpelling(input);
      expect(output).toBe(input);
      expect(JSON.stringify(output)).toBe(JSON.stringify(input));
    }
  });

  it("updates every documented runtime surface without changing identities", () => {
    const options = { preparedData: buildP526EightBarPreparedData(), mode: "phase4-v1" as const };
    const before = withPatternAndCatalogSurfaces(analyzeMidi(p526SyntheticMidiHeader, options));
    const after = applyKeyAwareChordSpelling(before);
    const beforeSurfaces = surfaceGroups(before);
    const afterSurfaces = surfaceGroups(after);
    expect(normalizeSurfaceOnly(after)).toEqual(normalizeSurfaceOnly(before));
    expect(collectSurfaceLabels(before)).toContain("E/Ab");
    expect(collectSurfaceLabels(after)).toContain("E/G#");
    expect(collectSurfaceLabels(after)).not.toContain("E/Ab");
    for (const [name, labels] of Object.entries(beforeSurfaces)) {
      expect(labels, `${name} baseline coverage`).toContain("E/Ab");
      expect(afterSurfaces[name], `${name} adapter parity`).toContain("E/G#");
      expect(afterSurfaces[name], `${name} stale spelling`).not.toContain("E/Ab");
    }
    expect(after.blockCandidates.some((candidate) => candidate.summaryText.includes("E/G#")))
      .toBe(true);
    expect(after.analyzerVersion).toBe(`${before.analyzerVersion}+${keyAwareChordSpellingVersion}`);
  });

  it("improves the eligible synthetic spelling axis from 9/10 to 10/10", () => {
    const before = evaluateP526EightBarBaseline(
      p526ExpectedEightBarTruth, captureP526CurrentActual(),
    );
    const afterAnalysis = analyzeMidi(p526SyntheticMidiHeader, {
      preparedData: buildP526EightBarPreparedData(),
      mode: "phase4-v1",
      enableKeyAwareChordSpelling: true,
    });
    const after = evaluateP526EightBarBaseline(
      p526ExpectedEightBarTruth,
      afterAnalysis.fullTimeline.map((item) => {
        const startBeat = (item.bar - 1) * 4 + item.beat - 1;
        return { bar: item.bar, startBeat, endBeat: startBeat + item.durationBeats, chord: item.chord };
      }),
    );
    expect(before.surfaceSpelling).toMatchObject({ matchedSlots: 9, eligibleSlots: 10 });
    expect(after.surfaceSpelling).toMatchObject({ matchedSlots: 10, eligibleSlots: 10, accuracy: 1 });
  });

  it("is deterministic and leaves already-spelled analyses unversioned", () => {
    const options = {
      preparedData: buildP526EightBarPreparedData(), mode: "phase4-v1" as const,
      enableKeyAwareChordSpelling: true,
    };
    expect(analyzeMidi(p526SyntheticMidiHeader, options))
      .toEqual(analyzeMidi(p526SyntheticMidiHeader, options));
    const unchanged = analysis([makeChordSymbol(4, "maj")], "E major");
    expect(applyKeyAwareChordSpelling(unchanged)).toBe(unchanged);
    expect(applyKeyAwareChordSpelling(unchanged).analyzerVersion).toBe("fixture-v1");
  });
});

function analysis(chords: readonly ChordSymbol[], detectedKey?: string): MidiProgressionAnalysis {
  return {
    totalBars: Math.max(1, chords.length),
    ...(detectedKey ? { detectedKey } : {}),
    fullTimeline: chords.map(timeline),
    blockCandidates: [],
    analyzedAt: "1970-01-01T00:00:00.000Z",
    analyzerVersion: "fixture-v1",
  };
}

function timeline(chord: ChordSymbol, index: number): ChordTimelineItem {
  return {
    eventId: `event-${index}`, bar: index + 1, beat: 1, durationBeats: 4,
    chord, confidence: 0.9, alternatives: [], warnings: [],
  };
}

function withPatternAndCatalogSurfaces(value: MidiProgressionAnalysis): MidiProgressionAnalysis {
  const target = value.blockCandidates.flatMap((candidate) => candidate.events ?? [])
    .find((event) => event.chord.label === "E/Ab");
  if (!target) throw new Error("P5.26 spelling target event is unavailable");
  const occurrence = {
    id: "p526-spelling-occurrence",
    startBar: 7,
    endBar: 8,
    startBeat: 24,
    endBeat: 32,
    lengthBars: 2,
    events: [target],
    stats: {
      eventCount: 1,
      harmonicChangeCount: 1,
      uniqueChordCount: 1,
      chordEventsPerBar: 0.5,
      densityClass: "vamp" as const,
    },
    structuredSignature: "stable-structured-signature",
    relativeSignature: "stable-relative-signature",
    score: 0.8,
    warnings: [],
    transposeOffset: 0,
    sectionIds: [],
    sourceKinds: ["p526-synthetic"],
  };
  return {
    ...value,
    candidatePatterns: [{
      patternId: "p526-spelling-pattern",
      normalizedProgressionIdentity: "stable-normalized-identity",
      occurrences: [occurrence],
      representativeOccurrenceId: occurrence.id,
    }],
    candidateCatalog: {
      catalogVersion: "candidate-catalog-v1",
      patterns: [{
        patternId: "p526-spelling-pattern",
        normalizedProgressionIdentity: "stable-normalized-identity",
        occurrences: [occurrence],
        representativeOccurrenceId: occurrence.id,
        candidateKind: "progression",
        qualitySummary: {
          representativeScore: 0.8, bestScore: 0.8, worstScore: 0.8,
          occurrenceCount: 1, lengthBars: 2, uniqueChordCount: 1, warnings: [],
        },
        sourceKinds: ["p526-synthetic"],
        reachableBars: [7, 8],
      }],
      progressionPatternIds: ["p526-spelling-pattern"],
      vampPatternIds: [], fragmentPatternIds: [], uncertainPatternIds: [],
      diagnostics: {
        rawWindowCount: 1, occurrenceCount: 1, patternCount: 1,
        exactDuplicateCount: 0, unreachablePatternCount: 0, unreachableOccurrenceCount: 0,
        progressionCount: 1, vampCount: 0, fragmentCount: 0, uncertainCount: 0,
        belowQualityFloorPatternCount: 0,
      },
    },
  };
}

function collectSurfaceLabels(value: MidiProgressionAnalysis): string[] {
  const labels = value.fullTimeline.flatMap((item) => [
    item.chord.label, ...item.alternatives.map((entry) => entry.chord.label),
  ]);
  for (const candidate of value.blockCandidates) {
    labels.push(...candidate.chords.flatMap((item) => [
      item.chord.label, ...item.alternatives.map((entry) => entry.chord.label),
    ]));
    for (const event of candidate.events ?? []) labels.push(event.chord.label, event.source.chord.label);
  }
  for (const pattern of value.candidatePatterns ?? []) {
    for (const occurrence of pattern.occurrences) {
      for (const event of occurrence.events) labels.push(event.chord.label, event.source.chord.label);
    }
  }
  for (const pattern of value.candidateCatalog?.patterns ?? []) {
    for (const occurrence of pattern.occurrences) {
      for (const event of occurrence.events) labels.push(event.chord.label, event.source.chord.label);
    }
  }
  return labels;
}

function surfaceGroups(value: MidiProgressionAnalysis): Record<string, string[]> {
  const timelineLabels = (items: readonly ChordTimelineItem[]) => items.flatMap((item) => [
    item.chord.label, ...item.alternatives.map((entry) => entry.chord.label),
  ]);
  const occurrenceEvents = (patterns: NonNullable<typeof value.candidatePatterns>) => patterns.flatMap(
    (pattern) => pattern.occurrences.flatMap((occurrence) => occurrence.events),
  );
  const catalogEvents = value.candidateCatalog?.patterns.flatMap(
    (pattern) => pattern.occurrences.flatMap((occurrence) => occurrence.events),
  ) ?? [];
  const blockEvents = value.blockCandidates.flatMap((candidate) => candidate.events ?? []);
  const patternEvents = occurrenceEvents(value.candidatePatterns ?? []);
  return {
    fullTimeline: timelineLabels(value.fullTimeline),
    blockCandidateChords: timelineLabels(value.blockCandidates.flatMap((candidate) => candidate.chords)),
    blockCandidateEventChords: blockEvents.map((event) => event.chord.label),
    blockCandidateEventSources: blockEvents.map((event) => event.source.chord.label),
    candidatePatternEventChords: patternEvents.map((event) => event.chord.label),
    candidatePatternEventSources: patternEvents.map((event) => event.source.chord.label),
    candidateCatalogEventChords: catalogEvents.map((event) => event.chord.label),
    candidateCatalogEventSources: catalogEvents.map((event) => event.source.chord.label),
  };
}

function normalizeSurfaceOnly(value: MidiProgressionAnalysis): unknown {
  const visit = (input: unknown, root = false): unknown => {
    if (Array.isArray(input)) return input.map((entry) => visit(entry));
    if (input === null || typeof input !== "object") return input;
    const record = input as Record<string, unknown>;
    const isChordSymbol = typeof record.root === "number"
      && typeof record.quality === "string"
      && Array.isArray(record.tensions)
      && typeof record.label === "string";
    return Object.fromEntries(Object.entries(record).map(([key, entry]) => {
      if (isChordSymbol && key === "label") return [key, "<surface-label>"];
      if (key === "summaryText") return [key, "<surface-summary>"];
      if (root && key === "analyzerVersion") return [key, "<surface-version>"];
      return [key, visit(entry)];
    }));
  };
  return visit(value, true);
}
