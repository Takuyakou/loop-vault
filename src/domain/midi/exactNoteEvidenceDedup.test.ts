import { describe, expect, it } from "vitest";
import { deduplicateExactNoteEvidence } from "./exactNoteEvidenceDedup";
import type { TimedNote } from "./types";

describe("deduplicateExactNoteEvidence", () => {
  it("collapses only an exact identity and emits deterministic safe provenance", () => {
    const notes = [note(), note(), note({ pitch: 64 })];
    const first = deduplicateExactNoteEvidence(notes, "asset-a");
    const second = deduplicateExactNoteEvidence(notes, "asset-a");

    expect(first).toEqual(second);
    expect(first.notes).toEqual([notes[0], notes[2]]);
    expect(first.diagnostics).toEqual({
      originalNoteCount: 3,
      effectiveNoteCount: 2,
      duplicateCount: 1,
      groups: [{
        representativeId: "evidence-000001",
        duplicateCount: 1,
        duplicateIds: ["evidence-000002"],
        reason: "exact-note-evidence",
      }],
    });
    expect(JSON.stringify(first.diagnostics)).not.toContain("asset-a");
  });

  it.each([
    ["source", { analysisProvenance: provenance({ sourceIdentity: "source-b" }) }],
    ["logical voice", { analysisProvenance: provenance({ logicalVoiceIdentity: "voice-b" }) }],
    ["source track", { analysisProvenance: provenance({ sourceTrackIndex: 2 }) }],
    ["analysis track", { trackIndex: 2 }],
    ["channel", { channel: 1 }],
    ["pitch/octave", { pitch: 72 }],
    ["onset/re-articulation", { startTick: 1, durationTick: 479 }],
    ["effective end", { durationTick: 481 }],
    ["velocity layer", { velocity: 0.5 }],
    ["program layer", { program: 4 }],
  ])("preserves a separate %s", (_label, difference) => {
    const notes = [note(), note(difference as Partial<TimedNote>)];
    const result = deduplicateExactNoteEvidence(notes, "asset-a");
    expect(result.notes).toHaveLength(2);
    expect(result.diagnostics.duplicateCount).toBe(0);
  });

  it("does not mutate the source notes or their runtime provenance", () => {
    const source = note();
    const snapshot = structuredClone(source);
    deduplicateExactNoteEvidence([source, { ...source }]);
    expect(source).toEqual(snapshot);
  });
});

function note(overrides: Partial<TimedNote> = {}): TimedNote {
  return {
    pitch: 60,
    startTick: 0,
    durationTick: 480,
    velocity: 0.75,
    trackIndex: 0,
    channel: 0,
    program: 0,
    programExplicit: true,
    analysisProvenance: provenance(),
    ...overrides,
  };
}

function provenance(overrides: Partial<NonNullable<TimedNote["analysisProvenance"]>> = {}) {
  return {
    sourceIdentity: "source-a",
    logicalVoiceIdentity: "voice-a",
    sourceTrackIndex: 1,
    ...overrides,
  };
}
