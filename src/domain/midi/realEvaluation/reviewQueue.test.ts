import { describe, expect, it } from "vitest";
import type { MidiDifferenceReview, MidiDifferenceReviewCase } from "./types";
import { buildActiveReviewQueue } from "./reviewQueue";

const fingerprint = (id: number) => `sha256-${id.toString(16).padStart(64, "0")}`;
const reviewCase = (id: string, source: number, beat: number, label = "C"): MidiDifferenceReviewCase => ({
  id,
  sourceFingerprint: fingerprint(source),
  range: { startBeat: beat, endBeat: beat + 1 },
  saved: { primary: label, alternatives: [] },
  legacy: { primary: label, alternatives: [] },
  reranker: { primary: label, alternatives: [] },
  priority: { score: 20, reasons: [] },
});

describe("active review queue", () => {
  it("excludes reviewed items and is deterministic", () => {
    const cases = [reviewCase("a", 1, 0), reviewCase("b", 2, 0, "Dm9")];
    const reviews = [{ id: "a" } as MidiDifferenceReview];
    expect(buildActiveReviewQueue(cases, reviews)).toEqual([expect.objectContaining({ id: "b" })]);
    expect(buildActiveReviewQueue(cases, reviews)).toEqual(buildActiveReviewQueue(cases, reviews));
  });

  it("caps each MIDI source and removes nearby duplicate ranges", () => {
    const cases = [
      reviewCase("a", 1, 0), reviewCase("b", 1, 0.5), reviewCase("c", 1, 4), reviewCase("d", 1, 8),
    ];
    const queue = buildActiveReviewQueue(cases, [], { maxPerSource: 2, nearbyBeatDistance: 1 });
    expect(queue).toHaveLength(2);
    expect(queue.map((item) => item.id)).not.toContain("b");
  });

  it("diversifies slash, tension and simple cases", () => {
    const cases = [reviewCase("simple", 1, 0), reviewCase("slash", 2, 0, "C/E"), reviewCase("tension", 3, 0, "Dm9")];
    expect(buildActiveReviewQueue(cases, [], { maxItems: 3 }).map((item) => item.id).sort()).toEqual([
      "simple", "slash", "tension",
    ]);
  });
});
