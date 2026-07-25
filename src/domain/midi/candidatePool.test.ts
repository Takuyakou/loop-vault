import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol } from "../chords";
import type { ChordTimelineItem } from "../types";
import { buildCandidateEvents, candidateStats, relativeSignature, structuredSignature } from "./candidateBlock";
import { normalizeCandidatePool } from "./candidatePool";
import type { CandidateOccurrence } from "./occurrence";

/**
 * Pool normalisation must never cost reach.
 *
 * It removes a candidate only when another says the same thing over the same
 * bars and scores at least as well. These tests pin the cases where it must not
 * fire — nesting in particular, which is the shape a length-based rule would
 * destroy.
 */
function chord(root: number) {
  const symbol = makeChordSymbol(root, "maj7", []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

function timelineOf(roots: readonly number[]): ChordTimelineItem[] {
  return roots.map((root, index) => ({
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord: chord(root),
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

describe("candidate pool normalisation", () => {
  const timeline = timelineOf([0, 9, 5, 7, 2, 7, 0, 9, 5, 7, 2, 7, 0, 9, 5, 7]);
  const active = Array.from({ length: 16 }, (_unused, index) => index + 1);

  it("keeps a four-bar motif nested inside an eight-bar phrase", () => {
    // Length alone would prune the motif. Its chord sequence differs from the
    // phrase's, so it must survive.
    const pool = [occurrenceOf(timeline, 1, 8, 0.8), occurrenceOf(timeline, 1, 4, 0.6)];
    const { occurrences } = normalizeCandidatePool(pool, active);

    expect(occurrences).toHaveLength(2);
  });

  it("keeps a candidate that reaches a bar no other reaches", () => {
    const pool = [occurrenceOf(timeline, 1, 8, 0.9), occurrenceOf(timeline, 9, 8, 0.5)];
    const { occurrences } = normalizeCandidatePool(pool, active);

    expect(occurrences).toHaveLength(2);
  });

  it("drops a candidate another covers with the same chords and a better score", () => {
    // Bars 15-16 carry no harmony here, so 1-14 and 1-16 state the same chords
    // over the same sounding bars.
    const shortActive = Array.from({ length: 14 }, (_unused, index) => index + 1);
    const longer = occurrenceOf(timeline, 1, 16, 0.9);
    const shorter = { ...occurrenceOf(timeline, 1, 14, 0.7), relativeSignature: longer.relativeSignature };
    // Same chord sequence by construction: the extra bars add no event.
    shorter.events = longer.events;
    const { occurrences, diagnostics } = normalizeCandidatePool([longer, shorter], shortActive);

    expect(diagnostics.dominatedRemoved).toBe(1);
    expect(occurrences.map((entry) => entry.id)).toEqual([longer.id]);
  });

  it("never drops the better-scoring candidate", () => {
    const strong = occurrenceOf(timeline, 1, 16, 0.9);
    const weak = { ...occurrenceOf(timeline, 1, 14, 0.4), relativeSignature: strong.relativeSignature };
    weak.events = strong.events;
    const { occurrences } = normalizeCandidatePool([weak, strong], active);

    expect(occurrences.some((entry) => entry.id === strong.id)).toBe(true);
  });

  it("reports what it did", () => {
    const pool = [occurrenceOf(timeline, 1, 8, 0.8), occurrenceOf(timeline, 9, 8, 0.7)];
    const { diagnostics } = normalizeCandidatePool(pool, active);

    expect(diagnostics.occurrencesBefore).toBe(2);
    expect(diagnostics.occurrencesAfter).toBe(2);
    expect(diagnostics.poolMultiplier).toBe(1);
  });
});
