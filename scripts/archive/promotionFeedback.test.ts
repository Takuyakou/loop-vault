import { describe, expect, it } from "vitest";
import { readPromotionFeedback } from "./promotionFeedback";

const fingerprint = `sha256-${"a".repeat(64)}`;
const correction = {
  schemaVersion: 1,
  sourceFingerprint: fingerprint,
  analyzerVersion: "legacy-v1",
  weightsVersion: "phase3.6-v1",
  segment: { startBeat: 0, endBeat: 4 },
  detected: { primary: "C", alternatives: [] },
  corrected: "G7",
  editMethod: "manual-label",
};

describe("readPromotionFeedback", () => {
  it("promotes correction events, explicitly skips propagation, and rejects only invalid lines", () => {
    const propagation = {
      schemaVersion: 1,
      eventType: "correction-propagation",
      sourceFingerprint: fingerprint,
      analyzerVersion: "legacy-v1",
      sourceSegment: { id: "source", startBeat: 0, endBeat: 4 },
      shownSegmentIds: ["target"],
      acceptedSegmentIds: ["target"],
      rejectedSegmentIds: [],
      threshold: 0.86,
    };
    const result = readPromotionFeedback([
      JSON.stringify(correction),
      JSON.stringify({ ...correction, eventType: "chord-correction" }),
      JSON.stringify(propagation),
      JSON.stringify({ ...propagation, acceptedSegmentIds: ["missing"] }),
      "{invalid-json",
    ].join("\n"));

    expect(result.events).toHaveLength(2);
    expect(result.events.every((event) => event.eventType === "chord-correction")).toBe(true);
    expect(result.skippedPropagation).toBe(1);
    expect(result.rejected).toEqual([
      { line: 4, reason: "schema-validation" },
      { line: 5, reason: "invalid-json" },
    ]);
  });
});
