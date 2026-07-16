import { describe, expect, it } from "vitest";
import { readAnalysisFeedbackJsonl } from "../analysisFeedback";
import {
  analysisFeedbackEventSchema,
  correctionPropagationFeedbackEventSchema,
  midiChordCorrectionEventSchema,
} from "./schema";

const correctionEvent = {
  schemaVersion: 1 as const,
  sourceFingerprint: `sha256-${"a".repeat(64)}`,
  analyzerVersion: "voice-aware-rerank-v1",
  weightsVersion: "voice-aware-rerank-v1",
  segment: { startBeat: 0, endBeat: 4 },
  detected: { primary: "C", alternatives: ["Dm"] },
  corrected: "Dm",
};

const propagationEvent = {
  schemaVersion: 1 as const,
  eventType: "correction-propagation" as const,
  sourceFingerprint: `sha256-${"b".repeat(64)}`,
  analyzerVersion: "voice-aware-rerank-v1",
  sourceSegment: { id: "segment-1", startBeat: 0, endBeat: 4 },
  shownSegmentIds: ["segment-2", "segment-3"],
  acceptedSegmentIds: ["segment-2"],
  rejectedSegmentIds: ["segment-3"],
  threshold: 0.82,
};

describe("real evaluation schemas", () => {
  it.each(["manual-label", "alternative-selection", "structure-editor"] as const)(
    "accepts the persisted %s correction method",
    (editMethod) => {
      expect(midiChordCorrectionEventSchema.parse({ ...correctionEvent, editMethod }).editMethod)
        .toBe(editMethod);
    },
  );

  it("still rejects unknown correction methods", () => {
    expect(midiChordCorrectionEventSchema.safeParse({
      ...correctionEvent,
      editMethod: "automatic",
    }).success).toBe(false);
  });

  it("accepts strict propagation feedback", () => {
    expect(correctionPropagationFeedbackEventSchema.parse(propagationEvent)).toEqual(propagationEvent);
    expect(correctionPropagationFeedbackEventSchema.safeParse({
      ...propagationEvent,
      unexpected: true,
    }).success).toBe(false);
    expect(correctionPropagationFeedbackEventSchema.safeParse({
      ...propagationEvent,
      sourceSegment: { ...propagationEvent.sourceSegment, unexpected: true },
    }).success).toBe(false);
  });

  it.each([
    { sourceSegment: { ...propagationEvent.sourceSegment, endBeat: 0 } },
    { threshold: 1.01 },
    { acceptedSegmentIds: ["not-shown"] },
    { rejectedSegmentIds: ["segment-2"] },
    { rejectedSegmentIds: [] },
    { shownSegmentIds: ["segment-2", "segment-2"] },
  ])("rejects invalid propagation feedback %#", (patch) => {
    expect(correctionPropagationFeedbackEventSchema.safeParse({
      ...propagationEvent,
      ...patch,
    }).success).toBe(false);
  });

  it("normalizes legacy correction lines into the discriminated union", () => {
    const parsed = analysisFeedbackEventSchema.parse({
      ...correctionEvent,
      editMethod: "manual-label",
    });
    expect(parsed.eventType).toBe("chord-correction");
  });

  it("routes mixed JSONL without sending propagation feedback to correction promotion", () => {
    const legacy = { ...correctionEvent, editMethod: "manual-label" };
    const tagged = { ...legacy, eventType: "chord-correction" };
    const raw = [
      JSON.stringify(legacy),
      JSON.stringify(propagationEvent),
      JSON.stringify(tagged),
      JSON.stringify({ ...propagationEvent, eventType: "unknown" }),
      "{invalid-json",
      "",
    ].join("\n");

    const result = readAnalysisFeedbackJsonl(raw);

    expect(result.events).toHaveLength(3);
    expect(result.correctionEvents).toHaveLength(2);
    expect(result.correctionEvents.every((event) => event.eventType === "chord-correction")).toBe(true);
    expect(result.propagationEvents).toEqual([propagationEvent]);
    expect(result.rejected).toEqual([
      { line: 4, reason: "schema-validation" },
      { line: 5, reason: "invalid-json" },
    ]);
  });

  it("does not reroute invalid discriminators as legacy corrections", () => {
    expect(analysisFeedbackEventSchema.safeParse({
      ...correctionEvent,
      eventType: "correction-propagation",
      editMethod: "manual-label",
    }).success).toBe(false);
  });
});
