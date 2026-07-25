import { describe, expect, it } from "vitest";
import { buildCandidateEvents, candidateStats, relativeSignature, structuredSignature } from "./candidateBlock";
import { groupIntoPatterns, type CandidateOccurrence } from "./occurrence";
import { buildPatternCandidates } from "./patternCandidate";
import { selectPatternsByCoverage } from "./patternSelection";
import type { ChordTimelineItem } from "../types";
import { labelFromSymbol, makeChordSymbol } from "../chords";

/**
 * A display slot belongs to a pattern, not to an occurrence.
 *
 * Spending slots on occurrences is what let one progression take four of ten
 * cards on the reported file. These tests pin the unit, not the ranking: the
 * ordering rules are Stage C's and are checked there.
 */

function chord(root: number, quality: Parameters<typeof makeChordSymbol>[1]) {
  const symbol = makeChordSymbol(root, quality, []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

/** Four bars of I-vi-IV-V starting at `startBar`, transposed by `offset`. */
function phrase(startBar: number, offset = 0): ChordTimelineItem[] {
  return [0, 9, 5, 7].map((root, index) => ({
    bar: startBar + index,
    beat: 1,
    durationBeats: 4,
    chord: chord((root + offset) % 12, index === 3 ? "dom7" : "maj7"),
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

describe("pattern candidates", () => {
  // The same phrase at bars 1, 9 and 17: one pattern, three occurrences.
  const timeline = [...phrase(1), ...phrase(5), ...phrase(9), ...phrase(13), ...phrase(17), ...phrase(21)];
  const occurrences = [
    occurrenceOf(timeline, 1, 4, 0.70),
    occurrenceOf(timeline, 9, 4, 0.82),
    occurrenceOf(timeline, 17, 4, 0.75),
  ];
  const active = Array.from({ length: 24 }, (_, index) => index + 1);

  it("spends one candidate per pattern and keeps every occurrence", () => {
    const patterns = buildPatternCandidates(groupIntoPatterns(occurrences), active);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].occurrences.map((occurrence) => occurrence.startBar)).toEqual([1, 9, 17]);
  });

  it("deduplicates occurrences by id and orders them by position", () => {
    const withDuplicate = [...occurrences, occurrenceOf(timeline, 9, 4, 0.82)];
    const patterns = buildPatternCandidates(groupIntoPatterns(withDuplicate), active);

    expect(patterns[0].occurrences).toHaveLength(3);
    expect(patterns[0].occurrences.map((occurrence) => occurrence.startBar)).toEqual([1, 9, 17]);
  });

  it("leads with the highest scoring occurrence, deterministically", () => {
    const forward = buildPatternCandidates(groupIntoPatterns(occurrences), active);
    const reversed = buildPatternCandidates(groupIntoPatterns([...occurrences].reverse()), active);

    expect(forward[0].representative.startBar).toBe(9);
    expect(reversed[0].representative.id).toBe(forward[0].representative.id);
  });

  it("breaks a score tie by position rather than by input order", () => {
    const tied = [
      occurrenceOf(timeline, 17, 4, 0.8),
      occurrenceOf(timeline, 1, 4, 0.8),
      occurrenceOf(timeline, 9, 4, 0.8),
    ];
    const patterns = buildPatternCandidates(groupIntoPatterns(tied), active);

    expect(patterns[0].representative.startBar).toBe(1);
  });

  it("separates the bars the card shows from the bars it can reach", () => {
    const patterns = buildPatternCandidates(groupIntoPatterns(occurrences), active);

    // The card displays the representative's four bars.
    expect(patterns[0].coveredBars).toEqual([9, 10, 11, 12]);
    // Its siblings are one click away, so those bars are reachable too.
    expect(patterns[0].reachableBars).toEqual([1, 2, 3, 4, 9, 10, 11, 12, 17, 18, 19, 20]);
  });

  it("keeps each occurrence's own absolute chords", () => {
    // Same shape a tone up: one pattern, two occurrences, different chords.
    const transposedTimeline = [...phrase(1), ...phrase(5, 2)];
    const transposed = [
      occurrenceOf(transposedTimeline, 1, 4, 0.8),
      occurrenceOf(transposedTimeline, 5, 4, 0.7),
    ];
    const patterns = buildPatternCandidates(groupIntoPatterns(transposed), active);

    expect(patterns).toHaveLength(1);
    const roots = patterns[0].occurrences.map(
      (occurrence) => occurrence.events.map((event) => event.chord.root),
    );
    expect(roots[0]).not.toEqual(roots[1]);
    expect(roots[0][0]).toBe(0);
    expect(roots[1][0]).toBe(2);
  });
});

describe("pattern selection", () => {
  const timeline = [...phrase(1), ...phrase(5), ...phrase(9), ...phrase(13)];
  const active = Array.from({ length: 16 }, (_, index) => index + 1);

  it("never selects the same pattern twice", () => {
    // Four occurrences of one shape plus one distinct shape.
    const occurrences = [
      occurrenceOf(timeline, 1, 4, 0.9),
      occurrenceOf(timeline, 5, 4, 0.89),
      occurrenceOf(timeline, 9, 4, 0.88),
      occurrenceOf(timeline, 13, 4, 0.87),
    ];
    const patterns = buildPatternCandidates(groupIntoPatterns(occurrences), active);
    const result = selectPatternsByCoverage(patterns, { harmonicActiveBars: active });

    const ids = result.selected.map((pattern) => pattern.patternId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps quality as a gate rather than a currency", () => {
    const weak = occurrenceOf(timeline, 1, 4, 0.1);
    const patterns = buildPatternCandidates(groupIntoPatterns([weak]), active);
    const result = selectPatternsByCoverage(patterns, { harmonicActiveBars: active });

    // Below the floor, so it is not admitted even though it is the only candidate
    // and every bar is uncovered.
    expect(result.selected).toHaveLength(0);
  });

  it("produces the same selection on a rerun", () => {
    const occurrences = [
      occurrenceOf(timeline, 1, 4, 0.8),
      occurrenceOf(timeline, 5, 4, 0.8),
      occurrenceOf(timeline, 9, 4, 0.8),
    ];
    const patterns = buildPatternCandidates(groupIntoPatterns(occurrences), active);
    const first = selectPatternsByCoverage(patterns, { harmonicActiveBars: active });
    const second = selectPatternsByCoverage(patterns, { harmonicActiveBars: active });

    expect(second.steps).toEqual(first.steps);
  });
});
