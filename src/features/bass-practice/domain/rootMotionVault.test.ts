import { describe, expect, it } from "vitest";
import { buildVaultChordContextSnapshot } from "./chordContextSnapshot";
import { STANDARD_BASS_TUNINGS } from "./constants";
import { createVaultRootMotionExercise, rootPathSignedDelta } from "./rootMotionVault";
import type { SavedProgressionBlock } from "../../../domain/types";

function block(roots: readonly number[]): SavedProgressionBlock {
  return {
    id: "block-safe", capturedAt: "2026-08-09T10:00:00.000Z", detectedKey: "C major", bpm: 96, timeSignature: "4/4", summaryText: "safe", tags: [], analyzerVersion: "test",
    chords: roots.map((root, index) => ({ bar: 1, beat: index + 1, durationBeats: 1, confidence: 1, alternatives: [], warnings: [], chord: { root, quality: "maj", tensions: [], label: "C" } })),
  };
}
function snapshot(roots: readonly number[]) {
  const result = buildVaultChordContextSnapshot({ sourceReference: { ideaId: "idea-safe", blockId: "block-safe" }, block: block(roots), sectionId: "bars:1-1" });
  if (!result.ok) throw new Error(result.error.message);
  return result.snapshot;
}
const input = (roots: readonly number[], level: 1 | 2 | 3 | 4 | 5 = 4) => ({ snapshot: snapshot(roots), level, tuning: STANDARD_BASS_TUNINGS[5], stringCount: 5 as const, fretRange: { min: 0, max: 12 }, pitchSpan: { minMidi: 23, maxMidi: 55 }, handedness: "right" as const });

describe("Vault-derived Root Motion", () => {
  it("uses policy v1 for repeated roots, downward fifths, and tritones", () => {
    expect(rootPathSignedDelta(0, 0)).toBe(0);
    expect(rootPathSignedDelta(0, 7)).toBe(-5);
    expect(rootPathSignedDelta(0, 6)).toBe(6);
  });

  it("builds a deterministic legal L4 root chain without claiming an original bassline", () => {
    const first = createVaultRootMotionExercise(input([0, 7, 6, 2]));
    const second = createVaultRootMotionExercise(input([0, 7, 6, 2]));
    expect(first).toEqual(second);
    if (!first.ok) throw new Error(first.error.message);
    expect(first.exercise.source).toMatchObject({ kind: "vault-root-path", rootPathPolicyVersion: "v1" });
    expect(first.exercise.targetEvents).toHaveLength(3);
    expect(first.exercise.motions.map((motion) => motion.signedSemitones)).toEqual([-5, -1]);
    expect(JSON.stringify(first.exercise)).not.toMatch(/title|midiSource|rawMidi|sourceFileName/i);
    for (const pair of first.exercise.fingering) {
      expect(pair.policyVersion).toBe("root-motion-fingering-v1");
      expect(pair.source.fret).toBeGreaterThanOrEqual(0);
      expect(pair.target.fret).toBeLessThanOrEqual(12);
    }
  });

  it("fails closed for an invalid or unplayable source", () => {
    const valid = snapshot([0, 2, 4, 5]);
    const invalid = createVaultRootMotionExercise({ ...input([0, 2, 4, 5], 4), snapshot: { ...valid, section: { ...valid.section, chords: [] } } as never });
    expect(invalid).toMatchObject({ ok: false, error: { code: "unsupported-source" } });
    const impossible = createVaultRootMotionExercise({ ...input([0, 2, 4, 5], 4), fretRange: { min: 30, max: 30 }, pitchSpan: { minMidi: 23, maxMidi: 55 } });
    expect(impossible).toMatchObject({ ok: false, error: { code: "unplayable-root-path" } });
  });
});