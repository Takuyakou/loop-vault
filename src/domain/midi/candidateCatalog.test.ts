import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol } from "../chords";
import type { ChordTimelineItem } from "../types";
import { buildCandidateEvents, candidateStats, relativeSignature, structuredSignature } from "./candidateBlock";
import { buildCandidateCatalog } from "./candidateCatalog";
import { groupIntoPatterns, type CandidateOccurrence } from "./occurrence";

/**
 * The catalog keeps what the recommender does not want.
 *
 * Every earlier stage ended with candidates disappearing because a selector did
 * not choose them. These tests pin the opposite property: a pattern is removed
 * only when every one of its occurrences is below the quality floor.
 */
function chord(root: number, quality: Parameters<typeof makeChordSymbol>[1] = "maj7") {
  const symbol = makeChordSymbol(root, quality, []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

function phrase(startBar: number, roots: readonly number[], offset = 0): ChordTimelineItem[] {
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
  sourceKinds: string[] = ["fixed-length"],
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
    sourceKinds,
  };
}

const active = Array.from({ length: 40 }, (_unused, index) => index + 1);
const build = (occurrences: CandidateOccurrence[], qualityFloor = 0.35) => buildCandidateCatalog({
  patterns: groupIntoPatterns(occurrences),
  harmonicActiveBars: active,
  qualityFloor,
  rawWindowCount: occurrences.length,
});

describe("candidate catalog", () => {
  const timeline = [
    ...phrase(1, [0, 9, 5, 7]), ...phrase(5, [0, 9, 5, 7]),
    ...phrase(9, [0, 9, 5, 7]), ...phrase(13, [0, 9, 5, 7]),
    ...phrase(17, [2, 7, 0, 5]),
  ];

  it("keeps one pattern with four occurrences rather than four patterns", () => {
    const catalog = build([
      occurrenceOf(timeline, 1, 4, 0.8),
      occurrenceOf(timeline, 5, 4, 0.7),
      occurrenceOf(timeline, 9, 4, 0.75),
      occurrenceOf(timeline, 13, 4, 0.6),
    ]);

    expect(catalog.patterns).toHaveLength(1);
    expect(catalog.patterns[0].occurrences).toHaveLength(4);
    expect(catalog.diagnostics.exactDuplicateCount).toBe(0);
  });

  it("keeps the four-bar motif and the eight-bar phrase that contains it", () => {
    const catalog = build([occurrenceOf(timeline, 1, 8, 0.8), occurrenceOf(timeline, 1, 4, 0.7)]);

    expect(catalog.patterns).toHaveLength(2);
    expect(catalog.patterns.map((pattern) => pattern.qualitySummary.lengthBars).sort())
      .toEqual([4, 8]);
  });

  it("does not merge spans that share a chord order but not a duration pattern", () => {
    // Same roots, one bar each versus two bars each: different loops.
    const wide = [
      ...phrase(1, [0, 9, 5, 7]),
      { bar: 5, beat: 1, durationBeats: 8, chord: chord(0), confidence: 0.9, alternatives: [], warnings: [] },
      { bar: 7, beat: 1, durationBeats: 8, chord: chord(9), confidence: 0.9, alternatives: [], warnings: [] },
    ] as ChordTimelineItem[];
    const catalog = build([occurrenceOf(wide, 1, 4, 0.8), occurrenceOf(wide, 5, 4, 0.8)]);

    expect(catalog.patterns).toHaveLength(2);
  });

  it("groups a transposed repeat while each occurrence keeps its own chords", () => {
    const transposed = [...phrase(1, [0, 9, 5, 7]), ...phrase(5, [0, 9, 5, 7], 2)];
    const catalog = build([occurrenceOf(transposed, 1, 4, 0.8), occurrenceOf(transposed, 5, 4, 0.7)]);

    expect(catalog.patterns).toHaveLength(1);
    const roots = catalog.patterns[0].occurrences.map(
      (occurrence) => occurrence.events[0].chord.root,
    );
    expect(roots).toEqual([0, 2]);
  });

  it("records every generator that proposed a window without duplicating the candidate", () => {
    const catalog = build([
      occurrenceOf(timeline, 1, 4, 0.8, ["section-boundary", "repeat-cycle"]),
    ]);

    expect(catalog.patterns).toHaveLength(1);
    expect(catalog.patterns[0].sourceKinds).toEqual(["repeat-cycle", "section-boundary"]);
  });

  it("keeps patterns the recommender would never choose", () => {
    // A second, weaker shape. Nothing about recommendation reaches the catalog.
    const catalog = build([
      occurrenceOf(timeline, 1, 4, 0.9),
      occurrenceOf(timeline, 17, 4, 0.40),
    ]);

    expect(catalog.patterns).toHaveLength(2);
  });

  it("removes a pattern only when every occurrence is below the floor", () => {
    const catalog = build([
      occurrenceOf(timeline, 1, 4, 0.9),
      occurrenceOf(timeline, 17, 4, 0.10),
    ]);

    expect(catalog.patterns).toHaveLength(1);
    expect(catalog.diagnostics.belowQualityFloorPatternCount).toBe(1);
  });

  it("keeps a pattern whose best occurrence clears the floor even when others do not", () => {
    const catalog = build([
      occurrenceOf(timeline, 1, 4, 0.9),
      occurrenceOf(timeline, 5, 4, 0.05),
    ]);

    expect(catalog.patterns).toHaveLength(1);
    expect(catalog.patterns[0].occurrences).toHaveLength(2);
  });

  it("reports no unreachable pattern or occurrence", () => {
    const catalog = build([occurrenceOf(timeline, 1, 4, 0.8), occurrenceOf(timeline, 17, 4, 0.7)]);

    expect(catalog.diagnostics.unreachablePatternCount).toBe(0);
    expect(catalog.diagnostics.unreachableOccurrenceCount).toBe(0);
    expect(catalog.diagnostics.occurrenceCount).toBe(2);
  });

  it("orders the catalog by position rather than by score", () => {
    const catalog = build([
      occurrenceOf(timeline, 17, 4, 0.95),
      occurrenceOf(timeline, 1, 4, 0.50),
    ]);

    expect(catalog.patterns.map((pattern) => pattern.occurrences[0].startBar)).toEqual([1, 17]);
  });

  it("produces the same catalog on a rerun", () => {
    const pool = [
      occurrenceOf(timeline, 1, 4, 0.8),
      occurrenceOf(timeline, 9, 4, 0.8),
      occurrenceOf(timeline, 17, 4, 0.7),
    ];

    expect(JSON.stringify(build(pool))).toBe(JSON.stringify(build(pool)));
  });
});

describe("catalog at scale", () => {
  it("keeps a thousand patterns reachable and builds them inside the runtime budget", () => {
    // A thousand distinct four-bar shapes, built so no two share a relative
    // signature. Nothing may be dropped for being numerous.
    const timeline: ChordTimelineItem[] = [];
    const occurrences: CandidateOccurrence[] = [];
    for (let index = 0; index < 1000; index += 1) {
      const start = index * 4 + 1;
      // The three intervals are varied independently. Deriving them all from one
      // multiple of `index` gives only eleven distinct interval patterns, because
      // the pattern identity is transposition-invariant — the first version of
      // this fixture produced 11 patterns, not 1000.
      const roots = [
        0,
        1 + (index % 11),
        1 + (Math.floor(index / 11) % 11),
        1 + (Math.floor(index / 121) % 11),
      ];
      timeline.push(...phrase(start, roots));
    }
    for (let index = 0; index < 1000; index += 1) {
      occurrences.push(occurrenceOf(timeline, index * 4 + 1, 4, 0.5 + (index % 40) / 100));
    }

    const started = performance.now();
    const catalog = buildCandidateCatalog({
      patterns: groupIntoPatterns(occurrences),
      harmonicActiveBars: Array.from({ length: 4000 }, (_unused, index) => index + 1),
      qualityFloor: 0.35,
      rawWindowCount: occurrences.length,
    });
    const elapsed = performance.now() - started;

    expect(catalog.patterns.length).toBeGreaterThanOrEqual(900);
    expect(catalog.diagnostics.unreachablePatternCount).toBe(0);
    expect(catalog.diagnostics.exactDuplicateCount).toBe(0);
    expect(elapsed).toBeLessThan(3000);
  });

  it("marks a shape it cannot classify as uncertain instead of guessing", () => {
    // Sixteen chord events inside four bars: what an arpeggio looks like after
    // per-window matching, not a progression anyone wrote. Four per bar clears
    // the "more than three" threshold; three per bar deliberately does not,
    // because a bar with three real chords is ordinary music.
    const dense: ChordTimelineItem[] = Array.from({ length: 16 }, (_unused, index) => ({
      bar: 1 + Math.floor(index / 4),
      beat: 1 + (index % 4),
      durationBeats: 1,
      chord: chord((index * 5) % 12),
      confidence: 0.9,
      alternatives: [],
      warnings: [],
    }));
    const catalog = build([occurrenceOf(dense, 1, 4, 0.8)]);

    expect(catalog.patterns[0].candidateKind).toBe("uncertain");
    expect(catalog.uncertainPatternIds).toHaveLength(1);
  });
});
