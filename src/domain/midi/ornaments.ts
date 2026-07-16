import type { NormalizedTimedNote } from "./types";
import type { AnalyzerWeights } from "./weights";
import { defaultAnalyzerWeights } from "./weights";

export interface OrnamentFeatures {
  passingTone: boolean;
  neighborTone: boolean;
  chromaticApproach: boolean;
  shortUpperVoice: boolean;
  suspensionCandidate: boolean;
  anticipationCandidate: boolean;
  pedalPoint: boolean;
  penalty: number;
}

export function extractOrnamentFeatures(
  notes: readonly NormalizedTimedNote[], weights: AnalyzerWeights = defaultAnalyzerWeights,
): Map<NormalizedTimedNote, OrnamentFeatures> {
  const result = new Map<NormalizedTimedNote, OrnamentFeatures>();
  const groups = new Map<number, NormalizedTimedNote[]>();
  notes.forEach((note) => groups.set(note.trackIndex, [...(groups.get(note.trackIndex) ?? []), note]));
  for (const trackNotes of groups.values()) {
    const sorted = [...trackNotes].sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
    sorted.forEach((note, index) => {
      const previous = sorted[index - 1];
      const next = sorted[index + 1];
      const duration = note.sustainedEndBeat - note.startBeat;
      const passingTone = Boolean(previous && next && duration <= 0.75
        && Math.abs(note.pitch - previous.pitch) <= 2 && Math.abs(next.pitch - note.pitch) <= 2
        && Math.sign(note.pitch - previous.pitch) === Math.sign(next.pitch - note.pitch));
      const neighborTone = Boolean(previous && next && duration <= 0.75
        && previous.pitch === next.pitch && Math.abs(note.pitch - previous.pitch) <= 2);
      const chromaticApproach = Boolean(next && duration <= 0.5 && Math.abs(next.pitch - note.pitch) === 1);
      const shortUpperVoice = note.pitch >= 72 && duration <= 0.5;
      const suspensionCandidate = duration >= 1 && !Number.isInteger(note.sustainedEndBeat);
      const anticipationCandidate = next !== undefined && duration <= 0.5 && note.startBeat % 1 >= 0.5;
      const pedalPoint = duration >= 4 || (note.pitch < 52 && countPitch(sorted, note.pitch) >= 3);
      const penalty = [
        passingTone ? weights.passingTonePenalty : 1,
        neighborTone ? weights.passingTonePenalty : 1,
        chromaticApproach ? weights.chromaticApproachPenalty : 1,
        shortUpperVoice ? weights.shortUpperVoicePenalty : 1,
      ].reduce((value, factor) => value * factor, 1);
      result.set(note, { passingTone, neighborTone, chromaticApproach, shortUpperVoice,
        suspensionCandidate, anticipationCandidate, pedalPoint, penalty });
    });
  }
  return result;
}

function countPitch(notes: readonly NormalizedTimedNote[], pitch: number): number {
  return notes.filter((note) => note.pitch === pitch).length;
}
