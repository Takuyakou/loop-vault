import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { MidiProgressionAnalysis, ProgressionBlockCandidate } from "../types";
import { buildCorrectionEvents, fingerprintMidiBytes } from "./feedback";

const c = parseChordLabel("C")!;
const dm = parseChordLabel("Dm")!;
const candidate: ProgressionBlockCandidate = {
  id: "candidate", startBar: 1, endBar: 4, lengthBars: 4, summaryText: "C",
  confidence: 0.6, repeatCount: 1, labels: ["C"], warnings: [],
  chords: [{ bar: 1, beat: 1, durationBeats: 4, chord: c, confidence: 0.6, alternatives: [{ chord: dm, confidence: 0.4 }], warnings: [] }],
};
const analysis: MidiProgressionAnalysis = {
  sourceFingerprint: "fnv1a32-test", totalBars: 4, fullTimeline: candidate.chords,
  blockCandidates: [candidate], analyzedAt: "1970-01-01T00:00:00.000Z", analyzerVersion: "hybrid-symbolic-v1",
};

describe("MIDI correction feedback", () => {
  it("fingerprints bytes deterministically without retaining their contents", () => {
    expect(fingerprintMidiBytes(new Uint8Array([1, 2, 3]))).toBe(fingerprintMidiBytes(new Uint8Array([1, 2, 3])));
    expect(fingerprintMidiBytes(new Uint8Array([1, 2, 4]))).not.toBe(fingerprintMidiBytes(new Uint8Array([1, 2, 3])));
  });

  it("records only explicit chord changes", () => {
    expect(buildCorrectionEvents(candidate, candidate, analysis)).toEqual([]);
    const edited = { ...candidate, chords: [{ ...candidate.chords[0], chord: dm }] };
    expect(buildCorrectionEvents(candidate, edited, analysis)).toMatchObject([
      { detected: { primary: "C", alternatives: ["Dm"] }, corrected: "Dm", editMethod: "alternative-selection" },
    ]);
    expect(buildCorrectionEvents(candidate, edited, analysis, ["structure-editor"])).toMatchObject([
      { corrected: "Dm", editMethod: "structure-editor" },
    ]);
    expect(buildCorrectionEvents(candidate, edited, analysis, ["split"])).toEqual([]);
  });

  it("uses quarter-note meter units for 6/8 correction ranges", () => {
    const detected = { ...candidate.chords[0], bar: 2, durationBeats: 3 };
    const original = { ...candidate, chords: [detected] };
    const edited = { ...candidate, chords: [{ ...detected, chord: dm }] };

    expect(buildCorrectionEvents(original, edited, {
      ...analysis,
      timeSignature: "6/8",
    })[0]?.segment).toEqual({ startBeat: 3, endBeat: 6 });
  });
});
