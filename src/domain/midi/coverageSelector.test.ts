import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordTimelineItem } from "../types";
import { selectOccurrencesByCoverage } from "./coverageSelector";
import { buildOccurrences, type CandidateOccurrence } from "./occurrence";

function timeline(labels: readonly string[]): ChordTimelineItem[] {
  return labels.map((label, index) => ({
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord: parseChordLabel(label)!,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  }));
}

function repeated(pattern: readonly string[], times: number): string[] {
  return Array.from({ length: times }, () => [...pattern]).flat();
}

/** Occurrences with an explicit score so selection behaviour is testable. */
function scored(
  items: ChordTimelineItem[],
  totalBars: number,
  scoreOf: (occurrence: CandidateOccurrence) => number,
  lengths: readonly number[] = [4],
): CandidateOccurrence[] {
  return buildOccurrences(items, totalBars, { lengths })
    .map((occurrence) => ({ ...occurrence, score: scoreOf(occurrence) }));
}

const allBars = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

describe("coverage selection", () => {
  it("spreads across the song instead of clustering", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 8));
    const occurrences = scored(items, 32, () => 0.6);
    const result = selectOccurrencesByCoverage(occurrences, { harmonicActiveBars: allBars(32) });

    expect(result.coverage).toBeGreaterThanOrEqual(0.9);
    // Picks are spread rather than piled onto the opening bars.
    const starts = result.selected.map((occurrence) => occurrence.startBar);
    expect(Math.max(...starts) - Math.min(...starts)).toBeGreaterThan(16);
  });

  it("reaches a region that ranking alone would skip", () => {
    const items = timeline([
      ...repeated(["C", "Am", "F", "G"], 4),
      ...repeated(["Dm", "Bb", "F", "C"], 2),
      ...repeated(["C", "Am", "F", "G"], 2),
    ]);
    const occurrences = scored(items, 32, (occurrence) => (
      // The middle section scores lower, as the real corpus does.
      occurrence.startBar >= 17 && occurrence.startBar <= 24 ? 0.45 : 0.7
    ));
    // Ranking alone never reaches these bars because every window over them
    // scores lower than the ones elsewhere.
    const result = selectOccurrencesByCoverage(occurrences, {
      harmonicActiveBars: allBars(32),
      coverageTarget: 1,
    });
    const covered = new Set<number>();
    for (const occurrence of result.selected) {
      for (let bar = occurrence.startBar; bar <= occurrence.endBar; bar += 1) covered.add(bar);
    }
    for (let bar = 17; bar <= 24; bar += 1) expect(covered.has(bar)).toBe(true);

    const rankingOnly = [...occurrences]
      .sort((left, right) => right.score - left.score)
      .slice(0, result.selected.length);
    const rankedCovered = new Set<number>();
    for (const occurrence of rankingOnly) {
      for (let bar = occurrence.startBar; bar <= occurrence.endBar; bar += 1) rankedCovered.add(bar);
    }
    expect([...rankedCovered].some((bar) => bar >= 17 && bar <= 24)).toBe(false);
  });

  it("never admits a candidate below the quality floor", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 8));
    const occurrences = scored(items, 32, (occurrence) => (
      occurrence.startBar > 8 ? 0.10 : 0.8
    ));
    const result = selectOccurrencesByCoverage(occurrences, {
      harmonicActiveBars: allBars(32),
      qualityFloor: 0.35,
    });
    expect(result.selected.every((occurrence) => occurrence.score >= 0.35)).toBe(true);
    // Coverage is left incomplete rather than bought with weak candidates.
    expect(result.coverage).toBeLessThan(1);
  });

  it("stops instead of filling the list once nothing new is covered", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 2));
    const occurrences = scored(items, 8, () => 0.7);
    const result = selectOccurrencesByCoverage(occurrences, {
      harmonicActiveBars: allBars(8),
      allVisibleLimit: 30,
    });
    expect(result.selected.length).toBeLessThan(30);
    expect(["stopped-coverage-target", "stopped-no-marginal-value"])
      .toContain(result.stoppedBecause);
  });

  it("keeps every unselected occurrence available", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 4));
    const occurrences = scored(items, 16, () => 0.7);
    const result = selectOccurrencesByCoverage(occurrences, { harmonicActiveBars: allBars(16) });
    expect(result.selected.length + result.unselected.length).toBe(occurrences.length);
  });

  it("separates the immediately visible list from the full list", () => {
    const items = timeline(repeated(["C", "Am", "F", "G", "Dm", "Bb", "Em", "A"], 8));
    const occurrences = scored(items, 64, () => 0.7, [4, 8]);
    const result = selectOccurrencesByCoverage(occurrences, {
      harmonicActiveBars: allBars(64),
      visibleLimit: 3,
      coverageTarget: 1,
    });
    expect(result.visible).toHaveLength(3);
    expect(result.selected.length).toBeGreaterThanOrEqual(result.visible.length);
    expect(result.coverageAtVisible).toBeLessThanOrEqual(result.coverage);
  });

  it("respects the all-visible limit", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 25));
    const occurrences = scored(items, 100, () => 0.7);
    const result = selectOccurrencesByCoverage(occurrences, {
      harmonicActiveBars: allBars(100),
      allVisibleLimit: 5,
      coverageTarget: 1,
    });
    expect(result.selected.length).toBeLessThanOrEqual(5);
  });

  it("ignores bars that carry no harmony", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 4));
    // Bars 5-8 are silent and must not count against coverage.
    const active = [1, 2, 3, 4, 9, 10, 11, 12, 13, 14, 15, 16];
    const result = selectOccurrencesByCoverage(scored(items, 16, () => 0.7), {
      harmonicActiveBars: active,
    });
    expect(result.uncoveredBars.every((bar) => active.includes(bar))).toBe(true);
  });

  it("reports the longest remaining gap", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 8));
    const occurrences = scored(items, 32, (occurrence) => (
      occurrence.startBar >= 13 && occurrence.startBar <= 20 ? 0.1 : 0.8
    ));
    const result = selectOccurrencesByCoverage(occurrences, {
      harmonicActiveBars: allBars(32),
      qualityFloor: 0.35,
    });
    expect(result.longestUncoveredRun).toBeGreaterThan(0);
    expect(result.uncoveredBars.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 8));
    const occurrences = scored(items, 32, () => 0.7);
    const first = selectOccurrencesByCoverage(occurrences, { harmonicActiveBars: allBars(32) });
    const second = selectOccurrencesByCoverage(occurrences, { harmonicActiveBars: allBars(32) });
    expect(second.selected.map((o) => o.id)).toEqual(first.selected.map((o) => o.id));
  });

  it("handles a song with no harmonic bars", () => {
    const result = selectOccurrencesByCoverage([], { harmonicActiveBars: [] });
    expect(result.selected).toEqual([]);
    expect(result.coverage).toBe(0);
  });
});
