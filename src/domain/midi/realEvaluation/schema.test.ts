import { describe, expect, it } from "vitest";
import {
  buildProgressionSaveFeedbackEvent,
  readAnalysisFeedbackJsonl,
} from "../analysisFeedback";
import { parseChordLabel } from "../../chords";
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

const progressionSaveEvent = {
  schemaVersion: 1 as const,
  eventType: "progression-save" as const,
  sourceFingerprint: `sha256-${"c".repeat(64)}`,
  analyzerVersion: "phase5-accuracy-first-v1",
  occurredAt: "2026-07-28T00:00:00.000Z",
  range: { startBeat: 0, endBeat: 8 },
  savedEventCount: 2,
  userEdited: false,
  userVerified: true,
  decisions: [
    {
      startBeat: 0,
      endBeat: 4,
      detected: "Cmaj7",
      saved: "Cmaj7",
      outcome: "rank1" as const,
    },
    {
      startBeat: 4,
      endBeat: 8,
      detected: "G7",
      saved: "G7",
      outcome: "rank1" as const,
    },
  ],
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

  it("accepts harmonic context candidate selection metadata", () => {
    const quickCandidateSelection = {
      source: "harmonicContext" as const,
      sources: ["harmonicContext", "smoothConnection"] as const,
      candidateRank: 1,
      displayedCandidateCount: 5,
    };
    expect(midiChordCorrectionEventSchema.parse({
      ...correctionEvent,
      editMethod: "alternative-selection",
      quickCandidateSelection,
    }).quickCandidateSelection).toEqual(quickCandidateSelection);
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

  it("builds one privacy-safe progression-save record for an accepted block", () => {
    const cmaj7 = parseChordLabel("Cmaj7")!;
    const g7 = parseChordLabel("G7")!;
    const event = buildProgressionSaveFeedbackEvent(
      {
        chords: [
          {
            bar: 1,
            beat: 1,
            durationBeats: 4,
            chord: cmaj7,
            confidence: 0.9,
            alternatives: [{ chord: g7, confidence: 0.7 }],
            warnings: [],
          },
          {
            bar: 2,
            beat: 1,
            durationBeats: 4,
            chord: g7,
            confidence: 0.9,
            alternatives: [],
            warnings: [],
          },
        ],
      },
      {
        chords: [
          {
            bar: 1,
            beat: 1,
            durationBeats: 4,
            chord: g7,
            confidence: 0.9,
            alternatives: [],
            warnings: [],
          },
          {
            bar: 2,
            beat: 1,
            durationBeats: 4,
            chord: g7,
            confidence: 0.9,
            alternatives: [],
            warnings: [],
          },
        ],
      },
      {
        sourceFingerprint: progressionSaveEvent.sourceFingerprint,
        timeSignature: "4/4",
        analyzerVersion: progressionSaveEvent.analyzerVersion,
      },
      ["alternative", undefined],
      {
        occurredAt: progressionSaveEvent.occurredAt,
        userEdited: true,
        userVerified: true,
      },
    );

    expect(event).toMatchObject({
      eventType: "progression-save",
      range: { startBeat: 0, endBeat: 8 },
      savedEventCount: 2,
      decisions: [
        { detected: "Cmaj7", saved: "G7", outcome: "rank2" },
        { detected: "G7", saved: "G7", outcome: "rank1" },
      ],
    });
    expect(JSON.stringify(event)).not.toContain(".mid");
    expect(analysisFeedbackEventSchema.parse(event)).toEqual(event);
  });

  it("routes mixed JSONL without sending propagation feedback to correction promotion", () => {
    const legacy = { ...correctionEvent, editMethod: "manual-label" };
    const tagged = { ...legacy, eventType: "chord-correction" };
    const raw = [
      JSON.stringify(legacy),
      JSON.stringify(propagationEvent),
      JSON.stringify(progressionSaveEvent),
      JSON.stringify(tagged),
      JSON.stringify({ ...propagationEvent, eventType: "unknown" }),
      "{invalid-json",
      "",
    ].join("\n");

    const result = readAnalysisFeedbackJsonl(raw);

    expect(result.events).toHaveLength(4);
    expect(result.correctionEvents).toHaveLength(2);
    expect(result.correctionEvents.every((event) => event.eventType === "chord-correction")).toBe(true);
    expect(result.propagationEvents).toEqual([propagationEvent]);
    expect(result.progressionSaveEvents).toEqual([progressionSaveEvent]);
    expect(result.rejected).toEqual([
      { line: 5, reason: "schema-validation" },
      { line: 6, reason: "invalid-json" },
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
