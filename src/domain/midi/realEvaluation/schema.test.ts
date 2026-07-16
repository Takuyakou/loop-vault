import { describe, expect, it } from "vitest";
import { midiChordCorrectionEventSchema } from "./schema";

const correctionEvent = {
  schemaVersion: 1 as const,
  sourceFingerprint: `sha256-${"a".repeat(64)}`,
  analyzerVersion: "voice-aware-rerank-v1",
  weightsVersion: "voice-aware-rerank-v1",
  segment: { startBeat: 0, endBeat: 4 },
  detected: { primary: "C", alternatives: ["Dm"] },
  corrected: "Dm",
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
});
