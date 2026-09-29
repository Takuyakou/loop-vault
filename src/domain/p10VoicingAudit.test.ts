import { describe, expect, it } from "vitest";
import type { ChordSymbol, VoicingSnapshot } from "./types";
import { canChooseSource, normalizedChordKey, resolveVoicingForUse } from "./voicing";

/**
 * P10.0-00 audit: pins today's playback choice so P10.0-01 can change it on purpose.
 * "Compatible" means the snapshot's capturedForChordKey equals the chord's key; the
 * notes themselves are never compared with the name.
 * (Lives here, not in src/domain/voicing/, because that folder is edit-protected.)
 */

const c: ChordSymbol = { root: 0, quality: "maj", tensions: [], label: "C" };
const g7sus4: ChordSymbol = { root: 7, quality: "sus4", tensions: [], label: "Gsus4" };
const generated = [55, 60, 62, 67];

function snapshot(chord: ChordSymbol, midiNotes: number[], overrides: Partial<VoicingSnapshot> = {}): VoicingSnapshot {
  return {
    schemaVersion: 1,
    source: "midi-extracted",
    representation: "simultaneous-voicing",
    midiNotes,
    bassNote: midiNotes[0],
    capturedForChordKey: normalizedChordKey(chord),
    confidence: 0.9,
    ...overrides,
  };
}

describe("P10.0-00 current behavior: playback choice versus the chord name", () => {
  it("P10.0-00 current behavior (a): CUSTOM notes captured for another name fall back to generated", () => {
    const custom = snapshot(c, [48, 55, 60, 64, 67], { source: "manual", userVerified: true });
    const resolved = resolveVoicingForUse(g7sus4, { practiceVoicingOverride: custom, playbackChoice: "CUSTOM" }, generated);
    expect(resolved).toEqual({ midiNotes: generated, origin: "generated" });
  });

  it("P10.0-00 current behavior (b): SOURCE notes captured for another name fall back to generated, even when verified", () => {
    const source = snapshot(c, [48, 55, 60, 64], { userVerified: true });
    const resolved = resolveVoicingForUse(g7sus4, { sourceVoicing: source, playbackChoice: "SOURCE" }, generated);
    expect(resolved).toEqual({ midiNotes: generated, origin: "generated" });
    expect(canChooseSource({ chord: g7sus4, voicingMemory: { sourceVoicing: source } })).toBe(false);
  });

  it("P10.0-00 current behavior (c): without playbackChoice a compatible override wins over the source voicing", () => {
    const source = snapshot(c, [48, 55, 60, 64], { userVerified: true });
    const practice = snapshot(c, [48, 60, 64, 67], { source: "live-played" });
    const resolved = resolveVoicingForUse(c, { sourceVoicing: source, practiceVoicingOverride: practice }, generated);
    expect(resolved.origin).toBe("practice-override");
    expect(resolved.midiNotes).toEqual([48, 60, 64, 67]);
  });

  it("P10.0-00 current behavior (d): notes that do not fit the name still play when the key tag matches", () => {
    // A human added D to a C card (C E G + D): the name and the tag stay C, so it plays as is.
    const edited = snapshot(c, [48, 55, 60, 62, 64], { source: "manual", userVerified: true });
    const resolved = resolveVoicingForUse(c, { practiceVoicingOverride: edited, playbackChoice: "CUSTOM" }, generated);
    expect(resolved.origin).toBe("practice-override");
    expect(resolved.midiNotes).toEqual([48, 55, 60, 62, 64]);
  });

  it("P10.0-00 current behavior (e): a snapshot outside 2–10 notes is invalid and falls back to generated", () => {
    const single = snapshot(c, [60]);
    const resolved = resolveVoicingForUse(c, { practiceVoicingOverride: single, playbackChoice: "CUSTOM" }, generated);
    expect(resolved.origin).toBe("generated");
  });
});
