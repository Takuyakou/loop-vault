import { describe, expect, it } from "vitest";
import type { ProgressionBlockCandidate } from "./types";
import {
  areTimelineCandidatesRelated,
  compareTimelineCandidateSelectedVariants,
  groupTimelineCandidates,
  timelineCandidateIntervalMetrics,
} from "./timelineCandidateGrouping";

function candidate(
  id: string,
  startBar: number,
  endBar: number,
  options: {
    confidence?: number;
    selectionScore?: number;
    lengthBars?: ProgressionBlockCandidate["lengthBars"];
  } = {},
): ProgressionBlockCandidate {
  return {
    id,
    startBar,
    endBar,
    lengthBars: options.lengthBars ?? ((endBar - startBar + 1) as ProgressionBlockCandidate["lengthBars"]),
    chords: [],
    summaryText: id,
    confidence: options.confidence ?? options.selectionScore ?? 0.9,
    ...(options.selectionScore === undefined ? {} : { selectionScore: options.selectionScore }),
    labels: [],
    warnings: [],
  };
}

describe("timeline candidate grouping", () => {
  it("uses inclusive overlap coefficient and the locked proximity threshold", () => {
    const nested4 = candidate("nested-4", 37, 40);
    const nested16 = candidate("nested-16", 37, 52);
    const shiftedA = candidate("shifted-a", 37, 44);
    const shiftedB = candidate("shifted-b", 39, 46);
    const separated = candidate("separated", 69, 76);

    expect(timelineCandidateIntervalMetrics(nested4, nested16)).toEqual({
      intersection: 4,
      union: 16,
      iou: 0.25,
      overlapCoefficient: 1,
      startDistance: 0,
      endDistance: 12,
      centerDistance: 6,
    });
    expect(timelineCandidateIntervalMetrics(shiftedA, shiftedB)).toEqual({
      intersection: 6,
      union: 10,
      iou: 0.6,
      overlapCoefficient: 0.75,
      startDistance: 2,
      endDistance: 2,
      centerDistance: 2,
    });
    expect(areTimelineCandidatesRelated(nested4, nested16)).toBe(true);
    expect(areTimelineCandidatesRelated(shiftedA, shiftedB)).toBe(true);
    expect(areTimelineCandidatesRelated(shiftedA, separated)).toBe(false);
  });

  it("uses fixed-anchor membership without transitive expansion", () => {
    const groups = groupTimelineCandidates([
      candidate("chain-c", 5, 12),
      candidate("chain-b", 3, 10),
      candidate("chain-a", 1, 8),
    ]);

    expect(groups.map(({ anchor, variants }) => ({
      anchor: anchor.id,
      variants: variants.map(({ id }) => id),
    }))).toEqual([
      { anchor: "chain-a", variants: ["chain-a", "chain-b"] },
      { anchor: "chain-c", variants: ["chain-c"] },
    ]);
  });

  it("is deterministic and preserves every candidate ID exactly once", () => {
    const candidates = [
      candidate("nested-4", 37, 40, { selectionScore: 0.82 }),
      candidate("nested-8", 37, 44, { selectionScore: 0.91 }),
      candidate("nested-16", 37, 52, { selectionScore: 0.88 }),
      candidate("later", 73, 80, { selectionScore: 0.9 }),
    ];
    const summarize = (input: readonly ProgressionBlockCandidate[]) => (
      groupTimelineCandidates(input).map(({ anchor, variants, representative, selectedVariant }) => ({
        anchor: anchor.id,
        variants: variants.map(({ id }) => id),
        representative: representative.id,
        selectedVariant: selectedVariant.id,
      }))
    );

    expect(summarize([...candidates].reverse())).toEqual(summarize(candidates));
    const flattened = groupTimelineCandidates(candidates)
      .flatMap(({ variants }) => variants.map(({ id }) => id));
    expect(flattened).toHaveLength(candidates.length);
    expect([...flattened].sort()).toEqual(candidates.map(({ id }) => id).sort());
    expect(new Set(flattened).size).toBe(candidates.length);
  });

  it("keeps the display representative separate from the selected variant", () => {
    const [group] = groupTimelineCandidates([
      candidate("nested-4", 37, 40, { selectionScore: 0.82 }),
      candidate("nested-8", 37, 44, { selectionScore: 0.91 }),
      candidate("nested-16", 37, 52, { selectionScore: 0.88 }),
    ]);

    expect(group?.representative.id).toBe("nested-16");
    expect(group?.selectedVariant.id).toBe("nested-8");
  });

  it("applies every selected-variant tie breaker and non-finite score fallback", () => {
    const selectedId = (values: ProgressionBlockCandidate[]) =>
      [...values].sort(compareTimelineCandidateSelectedVariants)[0]?.id;

    expect(selectedId([
      candidate("finite", 1, 4, { selectionScore: 0.95, confidence: 0.95 }),
      candidate("nan-fallback", 1, 4, { selectionScore: Number.NaN, confidence: 0.96 }),
    ])).toBe("nan-fallback");
    expect(selectedId([
      candidate("confidence-low", 1, 4, { selectionScore: 0.9, confidence: 0.8 }),
      candidate("confidence-high", 1, 4, { selectionScore: 0.9, confidence: 0.9 }),
    ])).toBe("confidence-high");
    expect(selectedId([
      candidate("later", 2, 5, { selectionScore: 0.9 }),
      candidate("earlier", 1, 4, { selectionScore: 0.9 }),
    ])).toBe("earlier");
    expect(selectedId([
      candidate("longer", 1, 8, { selectionScore: 0.9 }),
      candidate("shorter", 1, 4, { selectionScore: 0.9 }),
    ])).toBe("shorter");
    expect(selectedId([
      candidate("end-late", 1, 9, { selectionScore: 0.9, lengthBars: 8 }),
      candidate("end-early", 1, 8, { selectionScore: 0.9, lengthBars: 8 }),
    ])).toBe("end-early");
    expect(selectedId([
      candidate("b-id", 1, 4, { selectionScore: 0.9 }),
      candidate("a-id", 1, 4, { selectionScore: 0.9 }),
    ])).toBe("a-id");
  });
});