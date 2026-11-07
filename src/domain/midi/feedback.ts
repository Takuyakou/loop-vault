import type { MidiProgressionAnalysis, ProgressionBlockCandidate } from "../types";
import type { ProgressionEditSource } from "../progressionEditing/types";
import type { QuickCandidateSelectionMetadata } from "../progressionEditing/quickCandidates";
import { beatsPerBar } from "./timing";
import { screenToSource, type BeatRange } from "../correction/barMap";
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
  quickCandidateSelection?: QuickCandidateSelectionMetadata;
}

export function buildCorrectionEvents(
  original: Pick<ProgressionBlockCandidate, "chords">,
  edited: Pick<ProgressionBlockCandidate, "chords">,
  analysis: Pick<
    MidiProgressionAnalysis,
    "sourceFingerprint" | "timeSignature" | "analyzerVersion" | "detectedKey"
  >,
  editSources?: readonly (ProgressionEditSource | undefined)[],
  quickCandidateSelections?: readonly (QuickCandidateSelectionMetadata | undefined)[],
  removedBars?: readonly BeatRange[],
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
    const screenStart = (detected.bar - 1) * barLengthBeats + detected.beat - 1;
    const screenEnd = screenStart + detected.durationBeats;
    // P17-02: record the original position when the event maps back to one span;
    // an event that crosses a cut keeps the detected span.
    const mapped = screenToSource(screenStart, screenEnd, removedBars ?? []);
    const startBeat = mapped.length === 1 ? mapped[0]!.start : screenStart;
    const endBeat = mapped.length === 1 ? mapped[0]!.end : screenEnd;
    return [{
      schemaVersion: 1 as const,
      sourceFingerprint,
      analyzerVersion: analysis.analyzerVersion,
      weightsVersion: "phase3.6-v1",
      segment: { startBeat, endBeat },
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
      ...(quickCandidateSelections?.[index]
        ? { quickCandidateSelection: { ...quickCandidateSelections[index]! } }
        : {}),
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
