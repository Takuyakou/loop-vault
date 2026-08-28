import { describe, expect, it } from "vitest";
import { createSourceBasslineHistoryEntry, resolveSourceBasslineHistory } from "./sourceBasslineHistory";

function entry(capturedHarmonySignature: string | null = "c".repeat(64)) {
  return createSourceBasslineHistoryEntry({
    id: "source-history:synthetic",
    completedAt: "2026-08-21T12:00:00.000Z",
    reference: { ideaId: "idea-a", blockId: "block-a" },
    snapshotSignature: "a".repeat(64),
    ...(capturedHarmonySignature === null ? {} : { capturedHarmonySignature }),
    requestedBars: 2,
    startBar: 3,
    endBar: 3,
    actualBars: 1,
    level: 2,
    croppedSourceNoteCount: 7,
    projectedNoteCount: 5,
    omittedSimultaneousNoteCount: 1,
    boundaryClippedNoteCount: 1,
    overlapClippedNoteCount: 1,
    pitchReplacementCount: 3,
    capturedHarmonyComparison: "mismatch",
    retainedTakeReference: "take:opaque",
  });
}

describe("Source Bassline reference-only History", () => {
  it("keeps version 1 and represents partial actual lengths without note data", () => {
    for (const actualBars of [3, 5, 6, 7] as const) {
      const created = createSourceBasslineHistoryEntry({
        id: `source-history:partial-${actualBars}`,
        completedAt: "2026-08-21T12:00:00.000Z",
        reference: { ideaId: "idea-a", blockId: "block-a" },
        snapshotSignature: "a".repeat(64),
        requestedBars: 8,
        startBar: 1,
        endBar: actualBars,
        actualBars,
        level: 3,
        croppedSourceNoteCount: actualBars,
        projectedNoteCount: actualBars,
        omittedSimultaneousNoteCount: 0,
        boundaryClippedNoteCount: 0,
        overlapClippedNoteCount: 0,
        pitchReplacementCount: 0,
        capturedHarmonyComparison: "comparison-unavailable",
      });
      expect(created.version).toBe(1);
      expect(created.window).toMatchObject({ requestedBars: 8, actualBars });
      expect(JSON.stringify(created)).not.toMatch(/"notes"\s*:/i);
    }
  });
  it("stores source and captured-harmony signatures without duplicating harmony spans", () => {
    const created = entry();
    expect(created).toMatchObject({
      source: {
        kind: "source-bassline",
        reference: { ideaId: "idea-a", blockId: "block-a" },
        snapshotSchemaVersion: 1,
        snapshotSignature: "a".repeat(64),
        capturedHarmonySignature: "c".repeat(64),
      },
      window: { requestedBars: 2, startBar: 3, endBar: 3, actualBars: 1 },
      level: 2,
      monophonicProjection: true,
      selfReview: "completed",
      retainedTakeReference: "take:opaque",
    });
    expect(Object.isFrozen(created)).toBe(true);
    expect(JSON.stringify(created)).not.toMatch(/"(?:notes|capturedHarmony|path|title|fileName|device|audio|voice)"\s*:/i);
  });

  it("omits the captured-harmony signature when the source has no captured harmony", () => {
    const created = entry(null);
    expect(created.source).not.toHaveProperty("capturedHarmonySignature");
    const withoutHarmony = {
      reference: { ideaId: "idea-a", blockId: "block-a" },
      sourceBassline: { snapshotSignature: "a".repeat(64) },
    };
    expect(resolveSourceBasslineHistory(created, [withoutHarmony])).toEqual({ available: true, asset: withoutHarmony });
  });

  it("resolves only exact logical, snapshot, and present captured-harmony signatures", () => {
    const exact = {
      reference: { ideaId: "idea-a", blockId: "block-a" },
      sourceBassline: {
        snapshotSignature: "a".repeat(64),
        capturedHarmony: { signature: "c".repeat(64) },
      },
    };
    const snapshotReplacement = {
      reference: exact.reference,
      sourceBassline: {
        snapshotSignature: "b".repeat(64),
        capturedHarmony: { signature: "c".repeat(64) },
      },
    };
    const harmonyReplacement = {
      reference: exact.reference,
      sourceBassline: {
        snapshotSignature: "a".repeat(64),
        capturedHarmony: { signature: "d".repeat(64) },
      },
    };
    const harmonyRemoved = {
      reference: exact.reference,
      sourceBassline: { snapshotSignature: "a".repeat(64) },
    };
    const unrelated = {
      reference: { ideaId: "idea-b", blockId: "block-b" },
      sourceBassline: {
        snapshotSignature: "a".repeat(64),
        capturedHarmony: { signature: "c".repeat(64) },
      },
    };

    expect(resolveSourceBasslineHistory(entry(), [exact])).toEqual({ available: true, asset: exact });
    expect(resolveSourceBasslineHistory(entry(), [snapshotReplacement])).toEqual({ available: false, reason: "snapshot-mismatch" });
    expect(resolveSourceBasslineHistory(entry(), [harmonyReplacement])).toEqual({ available: false, reason: "snapshot-mismatch" });
    expect(resolveSourceBasslineHistory(entry(), [harmonyRemoved])).toEqual({ available: false, reason: "snapshot-mismatch" });
    expect(resolveSourceBasslineHistory(entry(), [unrelated])).toEqual({ available: false, reason: "missing-source" });
    expect(resolveSourceBasslineHistory(entry(), [unrelated, harmonyReplacement])).toEqual({ available: false, reason: "snapshot-mismatch" });
  });
});
