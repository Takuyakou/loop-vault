import { describe, expect, it } from "vitest";
import { buildDifferenceReviewCases, chordLabelsEquivalent } from "./differenceReview";
import { midiDifferenceReviewSchema } from "./schema";

const fingerprint = `sha256-${"a".repeat(64)}`;

describe("difference review", () => {
  it("normalizes enharmonic spelling but preserves slash bass", () => {
    expect(chordLabelsEquivalent("C#maj7", "Dbmaj7")).toBe(true);
    expect(chordLabelsEquivalent("Cmaj7/E", "Cmaj7/G")).toBe(false);
  });

  it("extracts only meaningful analyzer differences in deterministic priority order", () => {
    const cases = buildDifferenceReviewCases([{
      caseId: "stored-1",
      sourceFingerprint: fingerprint,
      range: { startBeat: 0, endBeat: 4 },
      segments: [{
        startBeat: 0,
        endBeat: 4,
        saved: "Cmaj7",
        legacy: "Cmaj7",
        reranker: "Am7/C",
        legacyAlternatives: [],
        rerankerAlternatives: [],
        legacyConfidence: 0.9,
        rerankerConfidence: 0.5,
        legacyMatches: true,
        rerankerMatches: false,
      }],
    }]);
    expect(cases).toHaveLength(1);
    expect(cases[0].priority.reasons).toEqual(expect.arrayContaining([
      "analyzer-disagreement", "low-confidence", "saved-label-mismatch", "slash-chord",
    ]));
  });

  it("requires a valid corrected chord when neither result is accepted", () => {
    const base = {
      schemaVersion: 1 as const,
      id: "review-1",
      sourceFingerprint: fingerprint,
      range: { startBeat: 0, endBeat: 4 },
      legacy: { primary: "C", alternatives: [] },
      reranker: { primary: "Dm", alternatives: [] },
      alternatives: [],
      judgment: "neither" as const,
      reviewedAt: "2026-07-15T00:00:00.000Z",
    };
    expect(midiDifferenceReviewSchema.safeParse(base).success).toBe(false);
    expect(midiDifferenceReviewSchema.safeParse({ ...base, correctedChord: "F#m7" }).success).toBe(true);
  });
});
