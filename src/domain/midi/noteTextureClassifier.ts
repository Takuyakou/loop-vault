import type { NoteTextureFeatures } from "./noteTextureFeatures";

export const p5211NoteTextureClassifierVersion = "p5211-note-texture-shadow-v1";

export type NoteTextureCandidateClass = "harmonic" | "melody-like" | "uncertain";

export const p5211ShadowNoteMultipliers = Object.freeze({
  harmonic: 1,
  uncertain: 0.9,
  "melody-like": 0.25,
});

export type NoteTextureEvidenceKind =
  | "short-over-stable-lower-bed"
  | "independent-top-onset"
  | "coherent-top-line"
  | "monophonic-moving-line"
  | "sustained-aligned-texture"
  | "protected-extension-texture"
  | "insufficient-separation-evidence";

export interface NoteTextureClassification {
  readonly noteId: string;
  readonly candidateClass: NoteTextureCandidateClass;
  readonly evidenceScore: number;
  readonly evidenceKinds: readonly NoteTextureEvidenceKind[];
  readonly proposedMultiplier: number;
}

/** Shadow-only classification. It is intentionally not imported by production analysis. */
export function classifyNoteTextureFeatures(
  feature: NoteTextureFeatures,
): NoteTextureClassification {
  const kinds: NoteTextureEvidenceKind[] = [];
  const shortness = 1 - feature.durationRatioToLowerBed;
  const supportedTop = feature.isLocalTop
    && feature.lowerSupportCount >= 2
    && feature.lowerSupportCoverage >= 0.75;
  if (supportedTop && shortness >= 0.55) kinds.push("short-over-stable-lower-bed");
  if (supportedTop && feature.onsetIndependence >= 0.5) kinds.push("independent-top-onset");
  if (feature.isLocalTop && feature.topLineContinuity >= 0.5) kinds.push("coherent-top-line");
  const monophonicMovingLine = feature.lowerSupportCount === 0
    && feature.topLineContinuity >= 0.5
    && feature.melodicMotionContinuity >= 0.5;
  if (monophonicMovingLine) kinds.push("monophonic-moving-line");
  if (feature.localTextureStability >= 0.75 && feature.onsetIndependence <= 0.25) {
    kinds.push("sustained-aligned-texture");
  }
  if (feature.sustainedExtensionProtection >= 0.8) kinds.push("protected-extension-texture");

  const overlayEvidence = supportedTop
    ? clamp01(
        shortness * 0.35
        + feature.onsetIndependence * 0.3
        + feature.topLineContinuity * 0.2
        + feature.melodicMotionContinuity * 0.15,
      )
    : 0;
  const protection = feature.sustainedExtensionProtection;
  const melodyScore = monophonicMovingLine
    ? clamp01(0.65 + feature.melodicMotionContinuity * 0.2 + feature.topLineContinuity * 0.15)
    : clamp01(overlayEvidence - protection * 0.35);
  let candidateClass: NoteTextureCandidateClass;
  if (melodyScore >= 0.55 && (supportedTop || monophonicMovingLine)) {
    candidateClass = "melody-like";
  } else if (protection >= 0.8 || (!feature.isLocalTop && feature.localTextureStability >= 0.7)) {
    candidateClass = "harmonic";
  } else {
    candidateClass = "uncertain";
    kinds.push("insufficient-separation-evidence");
  }
  return {
    noteId: feature.noteId,
    candidateClass,
    evidenceScore: round(candidateClass === "melody-like" ? melodyScore : protection),
    evidenceKinds: kinds,
    proposedMultiplier: p5211ShadowNoteMultipliers[candidateClass],
  };
}

export function classifyNoteTextureFeatureSet(
  features: readonly NoteTextureFeatures[],
): readonly NoteTextureClassification[] {
  return features.map(classifyNoteTextureFeatures);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
