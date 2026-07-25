import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol } from "../chords";
import type { ChordTimelineItem } from "../types";
import { buildCandidateEvents, candidateStats, relativeSignature, structuredSignature } from "./candidateBlock";
import { buildCandidateCatalog } from "./candidateCatalog";
import { recommendPatterns } from "./candidateRecommendation";
import { groupIntoPatterns, type CandidateOccurrence } from "./occurrence";

/**
 * The recommendation count follows the material, not the layout.
 *
 * These are the six cases the H0 contract names as critical guards. Each one is a
 * shape the previous selectors got wrong in a way a user noticed: a single
 * progression presented as ten cards, one vamp taking four slots, an empty
 * recommendation padded with fragments.
 */
function chord(root: number, quality: Parameters<typeof makeChordSymbol>[1] = "maj7") {
  const symbol = makeChordSymbol(root, quality, []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

function bars(startBar: number, roots: readonly number[], offset = 0): ChordTimelineItem[] {
  return roots.map((root, index) => ({
    bar: startBar + index,
    beat: 1,
    durationBeats: 4,
    chord: chord((root + offset) % 12),
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  }));
}

function occurrenceOf(
  timeline: readonly ChordTimelineItem[],
  startBar: number,
  lengthBars: number,
  score: number,
): CandidateOccurrence {
  const events = buildCandidateEvents(timeline, startBar, lengthBars, 4);
  return {
    id: `occ-${startBar}-${startBar + lengthBars - 1}`,
    startBar,
    endBar: startBar + lengthBars - 1,
    startBeat: (startBar - 1) * 4,
    endBeat: (startBar - 1 + lengthBars) * 4,
    lengthBars,
    events,
    stats: candidateStats(events, lengthBars),
    structuredSignature: structuredSignature(events),
    relativeSignature: relativeSignature(events),
    score,
    warnings: [],
    transposeOffset: 0,
    sectionIds: [],
  };
}

function catalogOf(occurrences: CandidateOccurrence[], totalBars = 64) {
  return buildCandidateCatalog({
    patterns: groupIntoPatterns(occurrences),
    harmonicActiveBars: Array.from({ length: totalBars }, (_unused, index) => index + 1),
    qualityFloor: 0.35,
    rawWindowCount: occurrences.length,
  });
}

describe("dynamic recommendation count", () => {
  it("recommends one when the file contains one progression", () => {
    // A clean eight-bar file. The four-bar halves are sub-windows of it, and a
    // sub-window is the same music shorter, not a second suggestion.
    const timeline = bars(1, [0, 9, 5, 7, 3, 10, 5, 7]);
    const catalog = catalogOf([
      occurrenceOf(timeline, 1, 8, 0.80),
      occurrenceOf(timeline, 1, 4, 0.78),
      occurrenceOf(timeline, 5, 4, 0.76),
      occurrenceOf(timeline, 3, 4, 0.70),
    ], 8);
    const result = recommendPatterns(catalog);

    expect(result.recommendations).toHaveLength(1);
    expect(result.paddingCount).toBe(0);
    expect(result.stoppedBecause).toBe("all-eligible-used");
    // Nothing was deleted to achieve it.
    expect(catalog.patterns.length).toBeGreaterThan(1);
  });

  it("recommends two when two distinct progressions exist", () => {
    const timeline = [...bars(1, [0, 9, 5, 7]), ...bars(9, [2, 7, 4, 11])];
    const catalog = catalogOf([
      occurrenceOf(timeline, 1, 4, 0.80),
      occurrenceOf(timeline, 9, 4, 0.78),
    ], 16);
    const result = recommendPatterns(catalog);

    expect(result.recommendations).toHaveLength(2);
    expect(result.paddingCount).toBe(0);
  });

  it("recommends nothing rather than padding when no progression is eligible", () => {
    // One chord held: a vamp, and the only thing in the file.
    const vamp: ChordTimelineItem[] = [{
      bar: 1, beat: 1, durationBeats: 32, chord: chord(4, "min11"),
      confidence: 0.9, alternatives: [], warnings: [],
    }];
    const catalog = catalogOf([occurrenceOf(vamp, 1, 8, 0.9)], 8);
    const result = recommendPatterns(catalog);

    expect(result.recommendations).toHaveLength(0);
    expect(result.stoppedBecause).toBe("no-eligible-pattern");
    // The vamp stays in the catalog and in its own lane.
    expect(catalog.vampPatternIds.length + catalog.uncertainPatternIds.length)
      .toBeGreaterThan(0);
  });

  it("gives one pattern with four occurrences a single recommendation slot", () => {
    const timeline = [
      ...bars(1, [0, 9, 5, 7]), ...bars(5, [0, 9, 5, 7]),
      ...bars(9, [0, 9, 5, 7]), ...bars(13, [0, 9, 5, 7]),
    ];
    const catalog = catalogOf([
      occurrenceOf(timeline, 1, 4, 0.80),
      occurrenceOf(timeline, 5, 4, 0.79),
      occurrenceOf(timeline, 9, 4, 0.78),
      occurrenceOf(timeline, 13, 4, 0.77),
    ], 16);
    const result = recommendPatterns(catalog);

    expect(catalog.patterns).toHaveLength(1);
    expect(catalog.patterns[0].occurrences).toHaveLength(4);
    expect(result.recommendations).toHaveLength(1);
  });

  it("caps the recommendation while leaving every pattern in the catalog", () => {
    const timeline: ChordTimelineItem[] = [];
    const occurrences: CandidateOccurrence[] = [];
    for (let index = 0; index < 200; index += 1) {
      const start = index * 4 + 1;
      timeline.push(...bars(start, [
        0,
        1 + (index % 11),
        1 + (Math.floor(index / 11) % 11),
        1 + (Math.floor(index / 121) % 11),
      ]));
    }
    for (let index = 0; index < 200; index += 1) {
      occurrences.push(occurrenceOf(timeline, index * 4 + 1, 4, 0.5 + (index % 40) / 200));
    }
    const catalog = catalogOf(occurrences, 800);
    const result = recommendPatterns(catalog);

    expect(catalog.patterns.length).toBeGreaterThanOrEqual(190);
    expect(result.recommendations.length).toBeLessThanOrEqual(10);
    expect(result.stoppedBecause).toBe("display-cap");
    // Every pattern is still addressable, cap or not.
    expect(new Set(catalog.patterns.map((pattern) => pattern.patternId)).size)
      .toBe(catalog.patterns.length);
  });

  it("stops at the eligible count rather than filling with weak candidates", () => {
    // Three usable progressions and a crowd of barely-passing ones.
    const timeline: ChordTimelineItem[] = [];
    const occurrences: CandidateOccurrence[] = [];
    for (let index = 0; index < 12; index += 1) {
      const start = index * 4 + 1;
      timeline.push(...bars(start, [0, 1 + index, 2 + index, 3 + index]));
      occurrences.push(occurrenceOf(timeline, start, 4, index < 3 ? 0.85 : 0.20));
    }
    const catalog = catalogOf(occurrences, 48);
    const result = recommendPatterns(catalog);

    // The weak ones are below the floor and are neither recommended nor kept.
    expect(result.recommendations).toHaveLength(3);
    expect(result.eligiblePatternCount).toBe(3);
    expect(result.paddingCount).toBe(0);
  });

  it("marks the single-candidate case in its reasons", () => {
    const timeline = bars(1, [0, 9, 5, 7]);
    const result = recommendPatterns(catalogOf([occurrenceOf(timeline, 1, 4, 0.8)], 4));

    expect(result.recommendations[0].reasons).toContain("only-candidate-of-its-kind");
  });

  it("produces the same recommendations on a rerun", () => {
    const timeline = [...bars(1, [0, 9, 5, 7]), ...bars(9, [2, 7, 4, 11])];
    const catalog = catalogOf([
      occurrenceOf(timeline, 1, 4, 0.8),
      occurrenceOf(timeline, 9, 4, 0.8),
    ], 16);

    expect(JSON.stringify(recommendPatterns(catalog)))
      .toBe(JSON.stringify(recommendPatterns(catalog)));
  });

  it("never returns more recommendations than eligible patterns", () => {
    const timeline = [...bars(1, [0, 9, 5, 7]), ...bars(9, [2, 7, 4, 11])];
    const catalog = catalogOf([
      occurrenceOf(timeline, 1, 4, 0.8),
      occurrenceOf(timeline, 9, 4, 0.8),
    ], 16);
    const result = recommendPatterns(catalog, { displayCap: 10 });

    expect(result.recommendations.length).toBeLessThanOrEqual(result.eligiblePatternCount);
  });
});
