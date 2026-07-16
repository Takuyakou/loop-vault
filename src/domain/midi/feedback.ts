import type { MidiProgressionAnalysis, ProgressionBlockCandidate } from "../types";
export { fingerprintMidiBytes, legacyFingerprintMidiBytes } from "./fingerprint";

export interface MidiChordCorrectionEvent {
  schemaVersion: 1;
  sourceFingerprint: string;
  analyzerVersion: string;
  weightsVersion: string;
  segment: {
    startBeat: number;
    endBeat: number;
  };
  detected: {
    primary: string;
    alternatives: string[];
  };
  corrected: string;
  editMethod: "manual-label" | "alternative-selection";
  keyContext?: string;
  previousChord?: string;
  nextChord?: string;
}

export function buildCorrectionEvents(
  original: ProgressionBlockCandidate,
  edited: ProgressionBlockCandidate,
  analysis: MidiProgressionAnalysis,
): MidiChordCorrectionEvent[] {
  const sourceFingerprint = analysis.sourceFingerprint;
  if (!sourceFingerprint) return [];
  const beatsPerBar = Number(analysis.timeSignature?.split("/")[0]) || 4;

  return original.chords.flatMap((detected, index) => {
    const corrected = edited.chords[index];
    if (!corrected || corrected.chord.label === detected.chord.label) return [];
    const startBeat = (detected.bar - 1) * beatsPerBar + detected.beat - 1;
    return [{
      schemaVersion: 1 as const,
      sourceFingerprint,
      analyzerVersion: analysis.analyzerVersion,
      weightsVersion: "phase3.6-v1",
      segment: { startBeat, endBeat: startBeat + detected.durationBeats },
      detected: {
        primary: detected.chord.label,
        alternatives: detected.alternatives.map((item) => item.chord.label),
      },
      corrected: corrected.chord.label,
      editMethod: detected.alternatives.some((item) => item.chord.label === corrected.chord.label)
        ? "alternative-selection" as const
        : "manual-label" as const,
      ...(analysis.detectedKey ? { keyContext: analysis.detectedKey } : {}),
      ...(original.chords[index - 1] ? { previousChord: original.chords[index - 1].chord.label } : {}),
      ...(original.chords[index + 1] ? { nextChord: original.chords[index + 1].chord.label } : {}),
    }];
  });
}
