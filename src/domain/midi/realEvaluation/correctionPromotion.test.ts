import { describe, expect, it } from "vitest";
import type { MidiChordCorrectionEvent } from "../feedback";
import { promoteCorrectionEvents } from "./correctionPromotion";

const fingerprint = "fnv1a32-1234abcd";
const event = (corrected = "Dm7"): MidiChordCorrectionEvent => ({
  schemaVersion: 1,
  sourceFingerprint: fingerprint,
  analyzerVersion: "legacy-v1",
  weightsVersion: "phase3.6-v1",
  segment: { startBeat: 4, endBeat: 8 },
  detected: { primary: "D", alternatives: ["Dm"] },
  corrected,
  editMethod: "manual-label",
});

describe("correction promotion", () => {
  it("promotes explicit corrections to path-free Gold cases and deduplicates", () => {
    const result = promoteCorrectionEvents([event(), event()], [{
      fingerprint,
      assetId: "asset-1",
      fileName: "song.mid",
      lastKnownPath: "D:/private/song.mid",
    }]);
    expect(result.promoted).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.promoted[0].label.strength).toBe("gold");
    expect(JSON.stringify(result.promoted)).not.toContain("D:/private");
  });

  it("keeps unknown sources as orphans", () => {
    const result = promoteCorrectionEvents([event()], []);
    expect(result.orphans).toEqual([event()]);
    expect(result.promoted).toEqual([]);
  });

  it("does not auto-promote conflicting corrections", () => {
    const result = promoteCorrectionEvents([event("Dm7"), event("D7")], [{ fingerprint }]);
    expect(result.promoted).toEqual([]);
    expect(result.conflicts[0].corrections).toHaveLength(2);
  });

  it("separates live MIDI feedback", () => {
    const live = { ...event(), analyzerVersion: "live-chord-v1" };
    const result = promoteCorrectionEvents([live], [{ fingerprint }]);
    expect(result.liveMidiSkipped).toBe(1);
    expect(result.promoted).toEqual([]);
  });
});
