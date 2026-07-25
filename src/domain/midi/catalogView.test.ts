import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol } from "../chords";
import type { ChordTimelineItem } from "../types";
import { buildCandidateEvents, candidateStats, relativeSignature, structuredSignature } from "./candidateBlock";
import { buildCandidateCatalog } from "./candidateCatalog";
import { recommendPatterns } from "./candidateRecommendation";
import {
  buildCatalogView, catalogPageSize, laneRenderPlan, reachableOccurrenceIds, reachablePatternIds,
} from "./catalogView";
import { groupIntoPatterns, type CandidateOccurrence } from "./occurrence";

/**
 * Lane layout.
 *
 * Each of these is a shape a reader complained about: one progression presented
 * as a long list, a vamp-only file headed "recommended progressions", and a large
 * catalog whose tail could not be reached.
 */
function chord(root: number, quality: Parameters<typeof makeChordSymbol>[1] = "maj7") {
  const symbol = makeChordSymbol(root, quality, []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

function bars(startBar: number, roots: readonly number[]): ChordTimelineItem[] {
  return roots.map((root, index) => ({
    bar: startBar + index,
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

function viewOf(occurrences: CandidateOccurrence[], totalBars: number) {
  const catalog = buildCandidateCatalog({
    patterns: groupIntoPatterns(occurrences),
    harmonicActiveBars: Array.from({ length: totalBars }, (_unused, index) => index + 1),
    qualityFloor: 0.35,
    rawWindowCount: occurrences.length,
  });
  return { catalog, view: buildCatalogView(catalog, recommendPatterns(catalog)) };
}

describe("catalog view", () => {
  it("merges the two sections when they are the same short list", () => {
    const timeline = [...bars(1, [0, 9, 5, 7]), ...bars(5, [2, 7, 4, 11])];
    const { view } = viewOf([
      occurrenceOf(timeline, 1, 4, 0.8),
      occurrenceOf(timeline, 5, 4, 0.8),
    ], 8);

    // Two patterns, both recommended: one list, not "recommended 2 / all 2".
    expect(view.mode).toBe("unified");
    expect(view.lanes).toHaveLength(1);
    expect(view.lanes[0].entries).toHaveLength(2);
  });

  it("shows one recommendation and keeps the rest reachable in their lanes", () => {
    // A clean eight-bar file: one loop, several restatements of it.
    const timeline = bars(1, [0, 9, 5, 7, 0, 9, 5, 7]);
    const { catalog, view } = viewOf([
      occurrenceOf(timeline, 1, 8, 0.80),
      occurrenceOf(timeline, 1, 4, 0.82),
      occurrenceOf(timeline, 5, 4, 0.81),
      occurrenceOf(timeline, 2, 4, 0.70),
      occurrenceOf(timeline, 1, 2, 0.60),
    ], 8);

    expect(view.recommendationCount).toBe(1);
    expect(view.lanes[0].kind).toBe("recommended");
    expect(view.lanes[0].entries).toHaveLength(1);
    // Nothing was deleted to get there.
    expect(reachablePatternIds(view).size).toBe(catalog.patterns.length);
  });

  it("omits the recommendation lane entirely when nothing is eligible", () => {
    const vamp: ChordTimelineItem[] = [{
      bar: 1, beat: 1, durationBeats: 32, chord: chord(4, "min11"),
      confidence: 0.9, alternatives: [], warnings: [],
    }];
    const { catalog, view } = viewOf([occurrenceOf(vamp, 1, 8, 0.9)], 8);

    expect(view.recommendationCount).toBe(0);
    expect(view.lanes.some((lane) => lane.kind === "recommended")).toBe(false);
    // The vamp is still there, under its own heading.
    expect(reachablePatternIds(view).size).toBe(catalog.patterns.length);
    expect(view.lanes.every((lane) => lane.entries.length > 0)).toBe(true);
  });

  it("never shows one pattern as two cards", () => {
    const timeline = [
      ...bars(1, [0, 9, 5, 7]), ...bars(5, [2, 7, 4, 11]),
      ...bars(9, [3, 8, 1, 6]), ...bars(13, [5, 10, 3, 8]),
    ];
    const { view } = viewOf([
      occurrenceOf(timeline, 1, 4, 0.9),
      occurrenceOf(timeline, 5, 4, 0.85),
      occurrenceOf(timeline, 9, 4, 0.8),
      occurrenceOf(timeline, 13, 4, 0.75),
    ], 16);

    const ids = view.lanes.flatMap((lane) => lane.entries.map((entry) => entry.patternId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reports the recommended patterns a kind lane is not repeating", () => {
    const timeline: ChordTimelineItem[] = [];
    const occurrences: CandidateOccurrence[] = [];
    for (let index = 0; index < 14; index += 1) {
      const start = index * 4 + 1;
      timeline.push(...bars(start, [
        0, 1 + (index % 11), 1 + (Math.floor(index / 11) % 11), 2 + (index % 9),
      ]));
      occurrences.push(occurrenceOf(timeline, start, 4, 0.6 + (index % 8) / 100));
    }
    const { view } = viewOf(occurrences, 56);
    const progressionLane = view.lanes.find((lane) => lane.kind === "progression");

    expect(view.mode).toBe("laned");
    expect(progressionLane?.recommendedElsewhere).toBeGreaterThan(0);
  });

  it("keeps every pattern of a large catalog reachable, page size aside", () => {
    const timeline: ChordTimelineItem[] = [];
    const occurrences: CandidateOccurrence[] = [];
    for (let index = 0; index < 300; index += 1) {
      const start = index * 4 + 1;
      timeline.push(...bars(start, [
        0,
        1 + (index % 11),
        1 + (Math.floor(index / 11) % 11),
        1 + (Math.floor(index / 121) % 11),
      ]));
      occurrences.push(occurrenceOf(timeline, start, 4, 0.5 + (index % 40) / 200));
    }
    const { catalog, view } = viewOf(occurrences, 1200);

    expect(catalog.patterns.length).toBeGreaterThanOrEqual(280);
    expect(reachablePatternIds(view).size).toBe(catalog.patterns.length);
    expect(view.recommendationCount).toBeLessThanOrEqual(10);
    // The page size governs rendering, not membership, and is not the cap.
    expect(view.pageSize).toBe(catalogPageSize);
    expect(view.pageSize).not.toBe(view.recommendationCount);
  });

  it("collapses fragments and uncertain candidates without hiding them", () => {
    const timeline = [...bars(1, [0, 9, 5, 7]), ...bars(5, [2, 7, 4, 11])];
    const short = occurrenceOf(timeline, 1, 2, 0.7);
    const { view } = viewOf([
      occurrenceOf(timeline, 1, 4, 0.9),
      occurrenceOf(timeline, 5, 4, 0.85),
      short,
    ], 8);

    for (const lane of view.lanes) {
      if (lane.kind === "fragment" || lane.kind === "uncertain") {
        expect(lane.initiallyCollapsed).toBe(true);
        expect(lane.entries.length).toBe(lane.totalCount);
      }
    }
    expect(reachableOccurrenceIds(view).has(short.id)).toBe(true);
  });

  it("reaches every occurrence of every pattern", () => {
    const timeline = [
      ...bars(1, [0, 9, 5, 7]), ...bars(5, [0, 9, 5, 7]),
      ...bars(9, [0, 9, 5, 7]), ...bars(13, [2, 7, 4, 11]),
    ];
    const occurrences = [
      occurrenceOf(timeline, 1, 4, 0.9),
      occurrenceOf(timeline, 5, 4, 0.85),
      occurrenceOf(timeline, 9, 4, 0.8),
      occurrenceOf(timeline, 13, 4, 0.75),
    ];
    const { catalog, view } = viewOf(occurrences, 16);

    const reachable = reachableOccurrenceIds(view);
    for (const pattern of catalog.patterns) {
      for (const occurrence of pattern.occurrences) {
        expect(reachable.has(occurrence.id)).toBe(true);
      }
    }
  });

  it("builds the same view on a rerun", () => {
    const timeline = [...bars(1, [0, 9, 5, 7]), ...bars(5, [2, 7, 4, 11])];
    const occurrences = [occurrenceOf(timeline, 1, 4, 0.8), occurrenceOf(timeline, 5, 4, 0.8)];

    expect(JSON.stringify(viewOf(occurrences, 8).view))
      .toBe(JSON.stringify(viewOf(occurrences, 8).view));
  });
});

describe("lane rendering", () => {
  const timeline: ChordTimelineItem[] = [];
  const occurrences: CandidateOccurrence[] = [];
  for (let index = 0; index < 120; index += 1) {
    const start = index * 4 + 1;
    timeline.push(...bars(start, [
      0,
      1 + (index % 11),
      1 + (Math.floor(index / 11) % 11),
      1 + (Math.floor(index / 121) % 11),
    ]));
    occurrences.push(occurrenceOf(timeline, start, 4, 0.5 + (index % 30) / 200));
  }
  const { view } = viewOf(occurrences, 480);
  const bigLane = [...view.lanes].sort((left, right) => right.totalCount - left.totalCount)[0];

  it("renders a page at a time rather than the whole lane", () => {
    const plan = laneRenderPlan(bigLane, { open: true, limit: view.pageSize });

    expect(plan.visible.length).toBe(view.pageSize);
    expect(plan.remaining).toBe(bigLane.entries.length - view.pageSize);
    expect(bigLane.entries.length).toBeGreaterThan(view.pageSize);
  });

  it("renders nothing for a closed lane and still holds everything", () => {
    const plan = laneRenderPlan(bigLane, { open: false, limit: view.pageSize });

    expect(plan.visible).toHaveLength(0);
    expect(bigLane.entries.length).toBe(bigLane.totalCount);
  });

  it("reaches the end of the lane by asking for more pages", () => {
    let limit = view.pageSize;
    let plan = laneRenderPlan(bigLane, { open: true, limit });
    let guard = 0;
    while (plan.remaining > 0 && guard < 500) {
      limit += view.pageSize;
      plan = laneRenderPlan(bigLane, { open: true, limit });
      guard += 1;
    }

    expect(plan.remaining).toBe(0);
    expect(plan.visible.length).toBe(bigLane.totalCount);
  });
});
