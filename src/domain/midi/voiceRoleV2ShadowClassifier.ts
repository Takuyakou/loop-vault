import type { VoiceRole } from "./types";
import type { RoleV2ShadowFeatures } from "./voiceRoleV2ShadowFeatures";

/**
 * This candidate is intentionally shadow-only. Nothing in production imports
 * it: it evaluates the fixed Stage 01 aggregate feature vector without
 * changing Role v1, Analyzer inputs, or persisted state.
 */
export const roleV2ShadowClassifierVersion = "p521-role-v2-shadow-v1";

export type RoleV2ShadowConfidenceBucket = "high" | "medium" | "low";

export type RoleV2ShadowEvidenceKind =
  | "channel-10"
  | "dominant-program"
  | "track-name-hint"
  | "low-pitch-center"
  | "high-pitch-center"
  | "time-weighted-monophony"
  | "time-weighted-polyphony"
  | "sustained-duration"
  | "stepwise-motion"
  | "percussion-soft-signature"
  | "mixed-fallback";

export interface RoleV2ShadowInference {
  role: VoiceRole;
  confidenceBucket: RoleV2ShadowConfidenceBucket;
  /** Privacy-safe evidence categories; no raw track name or MIDI is retained. */
  evidenceKinds: readonly RoleV2ShadowEvidenceKind[];
}

const roles: readonly VoiceRole[] = ["bass", "harmony", "pad", "melody", "percussion", "mixed"];

/**
 * Fixed, global heuristic weights selected from the Role v2 feature contract.
 * They are intentionally not trained or adjusted from any P5.21 fixture.
 */
const candidateWeights = Object.freeze({
  program: 0.72,
  trackName: 0.62,
  bassLowRegister: 0.8,
  bassMonophony: 0.28,
  melodyHighRegister: 0.72,
  melodyMonophony: 0.44,
  melodyStepwise: 0.2,
  harmonyPolyphony: 0.8,
  harmonyCentralRegister: 0.2,
  harmonySustain: 0.18,
  padPolyphony: 0.6,
  padSustain: 0.64,
  mixedBase: 0.32,
  mixedPolyphony: 0.16,
  percussionSoftSignal: 0.3,
  minimumScore: 0.58,
  minimumMargin: 0.1,
  highScore: 1.15,
  highMargin: 0.34,
  minimumMeasuredCorroboration: 0.45,
});

/**
 * Classifies only a Stage 01 aggregate feature vector. MIDI Channel 10
 * (zero-based index 9) remains the sole hard percussion signal. All other
 * evidence is fused, so a GM program or short-note signature cannot by itself
 * force a pitched Voice into percussion.
 */
export function inferRoleV2Shadow(features: RoleV2ShadowFeatures): RoleV2ShadowInference {
  if (features.percussionEvidence.channel10) {
    return {
      role: "percussion",
      confidenceBucket: "high",
      evidenceKinds: ["channel-10"],
    };
  }

  const scores = zeroScores();
  const measuredScores = zeroScores();
  const evidenceKinds: RoleV2ShadowEvidenceKind[] = [];
  scores.mixed = candidateWeights.mixedBase
    + candidateWeights.mixedPolyphony * clamp01(features.timeWeightedPolyphony - 1);

  applyMeasuredEvidence(measuredScores, features, evidenceKinds);
  for (const role of roles) scores[role] += measuredScores[role];
  applyProgramEvidence(scores, features, evidenceKinds);
  applyTrackNameEvidence(scores, features, evidenceKinds);
  applySoftPercussionEvidence(scores, features, evidenceKinds);

  const ranked = roles
    .map((role) => ({ role, score: scores[role] }))
    .sort((left, right) => right.score - left.score || roles.indexOf(left.role) - roles.indexOf(right.role));
  const top = ranked[0];
  const margin = top.score - ranked[1].score;
  const uncorroboratedSoftRole = top.role !== "mixed"
    && softSignalCount(features, top.role) === 1
    && measuredScores[top.role] < candidateWeights.minimumMeasuredCorroboration;
  if (top.role === "mixed" || top.score < candidateWeights.minimumScore || margin < candidateWeights.minimumMargin || uncorroboratedSoftRole) {
    return {
      role: "mixed",
      confidenceBucket: "low",
      evidenceKinds: stableEvidenceKinds([...evidenceKinds, "mixed-fallback"]),
    };
  }
  return {
    role: top.role,
    confidenceBucket: top.score >= candidateWeights.highScore && margin >= candidateWeights.highMargin
      ? "high"
      : "medium",
    evidenceKinds: stableEvidenceKinds(evidenceKinds),
  };
}

function applyProgramEvidence(
  scores: Record<VoiceRole, number>,
  features: RoleV2ShadowFeatures,
  evidenceKinds: RoleV2ShadowEvidenceKind[],
): void {
  const evidence = features.programEvidence;
  if (!evidence) return;
  // Off-Channel-10 percussion needs independent corroboration below.
  if (evidence.role !== "percussion") scores[evidence.role] += candidateWeights.program;
  evidenceKinds.push("dominant-program");
}

function applyTrackNameEvidence(
  scores: Record<VoiceRole, number>,
  features: RoleV2ShadowFeatures,
  evidenceKinds: RoleV2ShadowEvidenceKind[],
): void {
  for (const evidence of features.trackNameEvidence) {
    // A percussion-like name is soft evidence, never an off-channel hard override.
    if (evidence.role !== "percussion") scores[evidence.role] += candidateWeights.trackName;
    evidenceKinds.push("track-name-hint");
  }
}

function applyMeasuredEvidence(
  scores: Record<VoiceRole, number>,
  features: RoleV2ShadowFeatures,
  evidenceKinds: RoleV2ShadowEvidenceKind[],
): void {
  const pitchRank = features.pitchCenterRank ?? 0.5;
  const monophony = clamp01(features.timeWeightedMonophony);
  const polyphony = clamp01(features.timeWeightedPolyphony - 1);
  const sustained = clamp01(features.robustDurationBeats / 2);
  const central = clamp01(1 - Math.abs(pitchRank - 0.5) * 2);

  scores.bass += candidateWeights.bassLowRegister * (1 - pitchRank)
    + candidateWeights.bassMonophony * monophony;
  scores.melody += candidateWeights.melodyHighRegister * pitchRank
    + candidateWeights.melodyMonophony * monophony
    + candidateWeights.melodyStepwise * clamp01(features.stepwiseMotionRatio);
  scores.harmony += candidateWeights.harmonyPolyphony * polyphony
    + candidateWeights.harmonyCentralRegister * central
    + candidateWeights.harmonySustain * sustained;
  scores.pad += candidateWeights.padPolyphony * polyphony
    + candidateWeights.padSustain * sustained;

  if (pitchRank <= 1 / 3) evidenceKinds.push("low-pitch-center");
  if (pitchRank >= 2 / 3) evidenceKinds.push("high-pitch-center");
  if (monophony >= 0.75) evidenceKinds.push("time-weighted-monophony");
  if (polyphony >= 0.4) evidenceKinds.push("time-weighted-polyphony");
  if (sustained >= 0.5) evidenceKinds.push("sustained-duration");
  if (features.stepwiseMotionRatio >= 0.5) evidenceKinds.push("stepwise-motion");
}

function applySoftPercussionEvidence(
  scores: Record<VoiceRole, number>,
  features: RoleV2ShadowFeatures,
  evidenceKinds: RoleV2ShadowEvidenceKind[],
): void {
  const soft = features.percussionEvidence;
  const shortDenseNarrow = soft.softSignature.robustDurationBeats <= 0.35
    && soft.softSignature.noteDensityPerActiveBeat >= 2
    && soft.softSignature.pitchRange <= 24;
  const signalCount = Number(soft.gmPercussionProgram)
    + Number(soft.trackNameHint)
    + Number(shortDenseNarrow);
  if (shortDenseNarrow) evidenceKinds.push("percussion-soft-signature");
  if (signalCount >= 2) {
    scores.percussion += candidateWeights.percussionSoftSignal * signalCount;
  }
}

/**
 * Off-Channel-10 program/name evidence is never a hard classifier override.
 * A role needs a sufficient measured signal or a second independent soft
 * signal of the same role before it can be emitted.
 */
function softSignalCount(features: RoleV2ShadowFeatures, role: VoiceRole): number {
  const program = features.programEvidence?.role === role ? 1 : 0;
  const trackName = features.trackNameEvidence.some((entry) => entry.role === role) ? 1 : 0;
  const soft = features.percussionEvidence;
  const shortDenseNarrow = soft.softSignature.robustDurationBeats <= 0.35
    && soft.softSignature.noteDensityPerActiveBeat >= 2
    && soft.softSignature.pitchRange <= 24;
  const percussionSignature = role === "percussion" && shortDenseNarrow ? 1 : 0;
  return program + trackName + percussionSignature;
}
function zeroScores(): Record<VoiceRole, number> {
  return { bass: 0, harmony: 0, pad: 0, melody: 0, percussion: 0, mixed: 0 };
}

function stableEvidenceKinds(values: readonly RoleV2ShadowEvidenceKind[]): readonly RoleV2ShadowEvidenceKind[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
