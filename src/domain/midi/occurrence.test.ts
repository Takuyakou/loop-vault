import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordTimelineItem } from "../types";
import {
  buildOccurrences, groupIntoPatterns, groupedReachableOccurrences,
  occurrenceToCandidate, siblingOccurrences,
} from "./occurrence";

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

describe("occurrences are kept, not collapsed", () => {
  it("keeps three appearances of one progression as three occurrences", () => {
    // Same eight-bar progression at bars 1-8, 9-16 and 17-24.
    const items = timeline(repeated(["C", "Am", "F", "G", "C", "Am", "F", "G"], 3));
    const occurrences = buildOccurrences(items, 24, { lengths: [8] });
    const patterns = groupIntoPatterns(occurrences);

    const eightBarStarts = occurrences
      .filter((occurrence) => occurrence.lengthBars === 8)
      .map((occurrence) => occurrence.startBar);
    expect(eightBarStarts).toContain(1);
    expect(eightBarStarts).toContain(9);
    expect(eightBarStarts).toContain(17);

    const pattern = patterns.find((candidate) =>
      candidate.occurrences.some((occurrence) => occurrence.startBar === 1));
    expect(pattern?.occurrences.map((occurrence) => occurrence.startBar))
      .toEqual(expect.arrayContaining([1, 9, 17]));
  });

  it("keeps the 9-16 / 33-40 / 65-72 positions distinct", () => {
    const block = ["Dmaj7", "Bm7", "Em7", "A7", "Dmaj7", "Bm7", "Em7", "A7"];
    const filler = ["C", "C", "C", "C", "C", "C", "C", "C"];
    const items = timeline([
      ...filler, ...block, ...filler, ...filler,
      ...block, ...filler, ...filler, ...filler,
      ...block,
    ]);
    const occurrences = buildOccurrences(items, 72, { lengths: [8] });
    const patterns = groupIntoPatterns(occurrences);
    const pattern = patterns.find((candidate) =>
      candidate.occurrences.some((occurrence) => occurrence.startBar === 9));

    expect(pattern?.occurrences.map((occurrence) => occurrence.startBar))
      .toEqual(expect.arrayContaining([9, 33, 65]));
  });

  it("groups a transposed repeat into the same pattern", () => {
    // C Am F G, then the same shape a tone higher.
    const items = timeline(["C", "Am", "F", "G", "D", "Bm", "G", "A"]);
    const occurrences = buildOccurrences(items, 8, { lengths: [4] });
    const patterns = groupIntoPatterns(occurrences);
    const pattern = patterns.find((candidate) =>
      candidate.occurrences.some((occurrence) => occurrence.startBar === 1)
      && candidate.occurrences.some((occurrence) => occurrence.startBar === 5));

    expect(pattern).toBeDefined();
    expect(pattern!.occurrences).toHaveLength(2);
  });

  it("keeps absolute chords different across occurrences of one pattern", () => {
    const items = timeline(["C", "Am", "F", "G", "D", "Bm", "G", "A"]);
    const patterns = groupIntoPatterns(buildOccurrences(items, 8, { lengths: [4] }));
    const pattern = patterns.find((candidate) => candidate.occurrences.length === 2)!;
    const [first, second] = pattern.occurrences;

    expect(first.events[0].chord.label).toBe("C");
    expect(second.events[0].chord.label).toBe("D");
    expect(first.structuredSignature).not.toBe(second.structuredSignature);
    expect(first.relativeSignature).toBe(second.relativeSignature);
  });

  it("records how far each occurrence is transposed from the representative", () => {
    const items = timeline(["C", "Am", "F", "G", "D", "Bm", "G", "A"]);
    const patterns = groupIntoPatterns(buildOccurrences(items, 8, { lengths: [4] }));
    const pattern = patterns.find((candidate) => candidate.occurrences.length === 2)!;

    expect(pattern.occurrences[0].transposeOffset).toBe(0);
    expect(pattern.occurrences[1].transposeOffset).toBe(2);
  });

  it("keeps each occurrence's own voicing", () => {
    const items = timeline(["C", "Am", "F", "G", "C", "Am", "F", "G"]);
    items[4] = { ...items[4], confidence: 0.5 };
    const occurrences = buildOccurrences(items, 8, { lengths: [4] });
    const first = occurrences.find((occurrence) => occurrence.startBar === 1)!;
    const second = occurrences.find((occurrence) => occurrence.startBar === 5)!;

    expect(first.events[0].source).not.toBe(second.events[0].source);
    expect(second.events[0].confidence).toBe(0.5);
  });
});

describe("pattern grouping is presentational", () => {
  it("exposes every sibling of a selected occurrence", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 3));
    const patterns = groupIntoPatterns(buildOccurrences(items, 12, { lengths: [4] }));
    const siblings = siblingOccurrences(patterns, "occ-1-4");
    expect(siblings.map((occurrence) => occurrence.startBar))
      .toEqual(expect.arrayContaining([1, 5, 9]));
  });

  it("makes siblings reachable from a single selection", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 3));
    const patterns = groupIntoPatterns(buildOccurrences(items, 12, { lengths: [4] }));
    const reachable = groupedReachableOccurrences(patterns, ["occ-1-4"]);
    expect(reachable.map((occurrence) => occurrence.startBar))
      .toEqual(expect.arrayContaining([1, 5, 9]));
  });

  it("saves a single occurrence rather than only the representative", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 3));
    const patterns = groupIntoPatterns(buildOccurrences(items, 12, { lengths: [4] }));
    const pattern = patterns.find((candidate) =>
      candidate.occurrences.some((occurrence) => occurrence.startBar === 9))!;
    const third = pattern.occurrences.find((occurrence) => occurrence.startBar === 9)!;

    const candidate = occurrenceToCandidate(third, "| C | Am | F | G |");
    expect(candidate.startBar).toBe(9);
    expect(candidate.endBar).toBe(12);
    expect(candidate.chords).toHaveLength(4);
    expect(candidate.id).not.toBe(pattern.representativeOccurrenceId);
  });
});

describe("determinism and duplicates", () => {
  it("produces the same occurrences on repeat runs", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 4));
    expect(buildOccurrences(items, 16)).toEqual(buildOccurrences(items, 16));
  });

  it("does not emit two occurrences for the same window", () => {
    const items = timeline(repeated(["C", "Am", "F", "G"], 4));
    const ids = buildOccurrences(items, 16).map((occurrence) => occurrence.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps structurally different windows apart", () => {
    const items = timeline(["C", "Am", "F", "G", "C", "Am", "F", "Bb"]);
    const patterns = groupIntoPatterns(buildOccurrences(items, 8, { lengths: [4] }));
    const first = patterns.find((candidate) =>
      candidate.occurrences.some((occurrence) => occurrence.startBar === 1));
    const second = patterns.find((candidate) =>
      candidate.occurrences.some((occurrence) => occurrence.startBar === 5));
    expect(first?.patternId).not.toBe(second?.patternId);
  });
});
