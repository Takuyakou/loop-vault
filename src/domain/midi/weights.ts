import type { NormalizedTimedNote, NoteSegmentOverlap } from "./types";

export interface AnalyzerWeights {
  overlapExponent: number;
  downbeatWeight: number;
  strongBeatWeight: number;
  beatWeight: number;
  offbeatWeight: number;
  subdivisionWeight: number;
  chordRoleWeight: number;
  padRoleWeight: number;
  arpeggioRoleWeight: number;
  bassRoleQualityWeight: number;
  bassRoleRootWeight: number;
  melodyRoleWeight: number;
  leadRoleWeight: number;
  counterRoleWeight: number;
  unknownRoleWeight: number;
  stableNoteBonus: number;
  repeatedPitchClassBonus: number;
  passingTonePenalty: number;
  chromaticApproachPenalty: number;
  shortUpperVoicePenalty: number;
  suspensionPenalty: number;
}

export const defaultAnalyzerWeights: Readonly<AnalyzerWeights> = {
  overlapExponent: 0.5,
  downbeatWeight: 1.35, strongBeatWeight: 1.18, beatWeight: 1.08,
  offbeatWeight: 0.86, subdivisionWeight: 0.72,
  chordRoleWeight: 1.25, padRoleWeight: 1.18, arpeggioRoleWeight: 1.12,
  bassRoleQualityWeight: 0.55, bassRoleRootWeight: 1.5,
  melodyRoleWeight: 0.48, leadRoleWeight: 0.42, counterRoleWeight: 0.68,
  unknownRoleWeight: 0.9,
  stableNoteBonus: 1.12, repeatedPitchClassBonus: 1.08,
  passingTonePenalty: 0.58, chromaticApproachPenalty: 0.52,
  shortUpperVoicePenalty: 0.64, suspensionPenalty: 0.75,
};

export interface NoteFeatures {
  overlapWeight: number;
  beatStrengthWeight: number;
  trackRoleWeight: number;
  registerWeight: number;
  stabilityWeight: number;
  velocityWeight: number;
  ornamentPenalty: number;
  finalWeight: number;
}

export function noteFeatures(
  overlap: NoteSegmentOverlap,
  options: { beatsPerBar: number; roleWeight: number; ornamentPenalty?: number },
  weights: AnalyzerWeights = defaultAnalyzerWeights,
): NoteFeatures {
  const note = overlap.note;
  const overlapWeight = Math.pow(clamp(overlap.overlapRatio, 0.04, 1), weights.overlapExponent);
  const beatStrengthWeight = beatStrength(note.startBeat, options.beatsPerBar, weights);
  const trackRoleWeight = options.roleWeight;
  const registerWeight = registerQualityWeight(note);
  const stabilityWeight = overlap.overlapRatio >= 0.7 ? weights.stableNoteBonus : 1;
  const velocityWeight = 0.88 + clamp(note.velocity, 0, 1) * 0.24;
  const ornamentPenalty = options.ornamentPenalty ?? 1;
  const finalWeight = overlapWeight * beatStrengthWeight * trackRoleWeight * registerWeight
    * stabilityWeight * velocityWeight * ornamentPenalty;
  return { overlapWeight, beatStrengthWeight, trackRoleWeight, registerWeight, stabilityWeight, velocityWeight, ornamentPenalty, finalWeight };
}

export function beatStrength(startBeat: number, beatsPerBar: number, weights: AnalyzerWeights): number {
  const position = ((startBeat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  if (Math.abs(position) < 1e-6) return weights.downbeatWeight;
  if (Number.isInteger(position) && beatsPerBar >= 4 && Math.abs(position - beatsPerBar / 2) < 1e-6) return weights.strongBeatWeight;
  if (Number.isInteger(position)) return weights.beatWeight;
  if (Math.abs(position * 2 - Math.round(position * 2)) < 1e-6) return weights.offbeatWeight;
  return weights.subdivisionWeight;
}

function registerQualityWeight(note: NormalizedTimedNote): number {
  if (note.pitch < 48) return 0.68;
  if (note.pitch >= 76) return 0.72;
  return 1;
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
