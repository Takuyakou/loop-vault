import type { MidiProgressionAnalysis, ProgressionBlockCandidate } from "../types";
import type { ProgressionEditSource } from "../progressionEditing/types";
import { beatsPerBar } from "./timing";
export { fingerprintMidiBytes, legacyFingerprintMidiBytes } from "./fingerprint";

export interface MidiChordCorrectionEvent {
  schemaVersion: 1;
  eventType?: "chord-correction";
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
  editMethod: "manual-label" | "alternative-selection" | "structure-editor";
  keyContext?: string;
  previousChord?: string;
  nextChord?: string;
}

export function buildCorrectionEvents(
  original: ProgressionBlockCandidate,
  edited: ProgressionBlockCandidate,
  analysis: MidiProgressionAnalysis,
  editSources?: readonly (ProgressionEditSource | undefined)[],
): MidiChordCorrectionEvent[] {
  const sourceFingerprint = analysis.sourceFingerprint;
  if (!sourceFingerprint) return [];
  const barLengthBeats = beatsPerBar(analysis.timeSignature);

  return original.chords.flatMap((detected, index) => {
    const corrected = edited.chords[index];
    if (!corrected || corrected.chord.label === detected.chord.label) return [];
    const editSource = editSources?.[index];
    if (editSources && editSource !== "manual-label" && editSource !== "alternative" && editSource !== "structure-editor") {
      return [];
    }
    const startBeat = (detected.bar - 1) * barLengthBeats + detected.beat - 1;
    return [{
      schemaVersion: 1 as const,
      eventType: "chord-correction" as const,
      sourceFingerprint,
      analyzerVersion: analysis.analyzerVersion,
      weightsVersion: "phase3.6-v1",
      segment: { startBeat, endBeat: startBeat + detected.durationBeats },
      detected: {
        primary: detected.chord.label,
        alternatives: detected.alternatives.map((item) => item.chord.label),
      },
      corrected: corrected.chord.label,
      editMethod: correctionMethod(
        editSource,
        detected.alternatives.some((item) => item.chord.label === corrected.chord.label),
      ),
      ...(analysis.detectedKey ? { keyContext: analysis.detectedKey } : {}),
      ...(original.chords[index - 1] ? { previousChord: original.chords[index - 1].chord.label } : {}),
      ...(original.chords[index + 1] ? { nextChord: original.chords[index + 1].chord.label } : {}),
    }];
  });
}

function correctionMethod(
  source: ProgressionEditSource | undefined,
  matchesAlternative: boolean,
): MidiChordCorrectionEvent["editMethod"] {
  if (source === "structure-editor") return "structure-editor";
  if (source === "alternative") return "alternative-selection";
  return matchesAlternative ? "alternative-selection" : "manual-label";
}
