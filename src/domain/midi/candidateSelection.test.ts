import { describe, expect, it } from "vitest";
import type { ProgressionBlockCandidate } from "../types";
import {
  candidateIntervalIou,
  candidateLimitForBars,
  candidateOverlapIouThreshold,
  candidateRegionCountForBars,
  candidateRegionIndex,
  selectProgressionCandidates,
  type CandidateSelectionEntry,
} from "./candidateSelection";

describe("progression candidate selection", () => {
  it("distributes saturated-confidence candidates across every populated long-song region", () => {
    const starts = [1, 3, 5, 7, 9, 27, 29, 53, 55, 79, 81, 83];
    const selected = selectProgressionCandidates(
      starts.map((startBar) => entry(`candidate-${startBar}`, startBar, 4, 1)),
      104,
    );

    expect(selected).toHaveLength(10);
    expect(new Set(selected.map((candidate) => candidateRegionIndex(candidate.startBar, 104))))
      .toEqual(new Set([0, 1, 2, 3]));
    expect(selected.some((candidate) => candidate.startBar >= 79)).toBe(true);
    expect(selected.every((candidate) => candidate.confidence === 1)).toBe(true);
  });

  it("keeps 4, 8, and 16-bar diversity when candidates share a start bar", () => {
    const raw = [
      entry("same-4", 1, 4, 1.3),
      entry("same-8", 1, 8, 1.2),
      entry("same-16", 1, 16, 1.1),
      entry("later-4", 9, 4, 1),
      entry("later-8", 9, 8, 0.9),
      entry("middle-4", 5, 4, 0.8),
    ];

    const selected = selectProgressionCandidates(raw, 16);

    expect(new Set(selected.map((candidate) => candidate.lengthBars)))
      .toEqual(new Set([4, 8, 16]));
  });

  it("suppresses near-duplicate intervals by IoU when alternatives exist", () => {
    const raw = [
      entry("best", 1, 8, 2),
      entry("near-duplicate", 2, 8, 1.9),
      entry("c", 10, 4, 1.8),
      entry("d", 17, 4, 1.7),
      entry("e", 22, 8, 1.6),
      entry("f", 33, 4, 1.5),
      entry("g", 40, 8, 1.4),
      entry("h", 49, 16, 1.3),
      entry("i", 57, 4, 1.2),
    ];

    const selected = selectProgressionCandidates(raw, 64);

    expect(candidateIntervalIou(raw[0].candidate, raw[1].candidate))
      .toBeGreaterThanOrEqual(candidateOverlapIouThreshold);
    expect(selected.map((candidate) => candidate.id)).toContain("best");
    expect(selected.map((candidate) => candidate.id)).not.toContain("near-duplicate");
  });

  it("does not invent representatives for regions with no raw candidates", () => {
    const selected = selectProgressionCandidates([
      entry("opening", 1, 4, 1),
      entry("opening-variation", 9, 8, 0.9),
      entry("ending", 79, 4, 1),
      entry("ending-variation", 91, 8, 0.9),
    ], 104);

    expect(new Set(selected.map((candidate) => candidateRegionIndex(candidate.startBar, 104))))
      .toEqual(new Set([0, 3]));
  });

  it("preserves populated regions when global de-duplication removes repeated material", () => {
    const selected = selectProgressionCandidates([
      entry("region-1", 1, 4, 1, "same-progression"),
      entry("region-2", 27, 4, 1, "same-progression"),
      entry("region-3", 53, 4, 1, "same-progression"),
      entry("region-4", 79, 4, 1, "same-progression"),
    ], 104);

    expect(new Set(selected.map((candidate) => candidateRegionIndex(candidate.startBar, 104))))
      .toEqual(new Set([0, 1, 2, 3]));
  });

  it("keeps the existing six-candidate scale and opening-first behavior for 16 bars", () => {
    const raw = [
      ...Array.from({ length: 13 }, (_, index) => entry(`four-${index + 1}`, index + 1, 4, 1)),
      ...Array.from({ length: 9 }, (_, index) => entry(`eight-${index + 1}`, index + 1, 8, 1)),
      entry("sixteen-1", 1, 16, 1),
    ];

    const selected = selectProgressionCandidates(raw, 16);

    expect(selected).toHaveLength(6);
    expect(selected[0]).toMatchObject({ startBar: 1, lengthBars: 4 });
  });

  it("is deterministic and uses the configured length-dependent limits", () => {
    const raw = Array.from({ length: 140 }, (_, index) =>
      entry(`candidate-${index + 1}`, index + 1, 4, 1 + (index % 7) / 100));

    expect(selectProgressionCandidates(raw, 140)).toEqual(selectProgressionCandidates(raw, 140));
    expect(candidateLimitForBars(16)).toBe(6);
    expect(candidateLimitForBars(64)).toBe(8);
    expect(candidateLimitForBars(104)).toBe(10);
    expect(candidateLimitForBars(240)).toBe(12);
    expect(candidateRegionCountForBars(32)).toBe(2);
    expect(candidateRegionCountForBars(64)).toBe(3);
    expect(candidateRegionCountForBars(104)).toBe(4);
  });
});

function entry(
  id: string,
  startBar: number,
  lengthBars: 4 | 8 | 16,
  selectionScore: number,
  dedupeKey = id,
): CandidateSelectionEntry {
  const candidate: ProgressionBlockCandidate = {
    id,
    startBar,
    endBar: startBar + lengthBars - 1,
    lengthBars,
    chords: [],
    summaryText: id,
    confidence: 1,
    labels: [],
    warnings: [],
  };
  return { candidate, dedupeKey, selectionScore };
}
