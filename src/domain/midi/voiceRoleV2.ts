import type {
  NormalizedTimedNote,
  Voice,
  VoiceFeatureInput,
  VoiceRole,
  VoiceRoleInference,
} from "./types";
import {
  buildVoiceFeatureInputs,
  voiceRoleEvidence,
} from "./voiceRoles";
import {
  inferRoleV2Shadow,
  type RoleV2ShadowConfidenceBucket,
  type RoleV2ShadowEvidenceKind,
} from "./voiceRoleV2ShadowClassifier";
import {
  extractRoleV2ShadowFeatures,
  type RoleV2ShadowFeatures,
} from "./voiceRoleV2ShadowFeatures";

/**
 * Production adapter for the locked P5.21-02 Role v2 algorithm. The shadow
 * evaluator and the application deliberately call the same classifier so its
 * promotion result cannot drift from the released behaviour.
 */
export const voiceRoleV2InferenceVersion = "p521-role-v2-v1";

export type VoiceRoleConfidenceBucket = RoleV2ShadowConfidenceBucket;
export type VoiceRoleEvidenceKind = RoleV2ShadowEvidenceKind | "manual-override";

export interface VoiceRoleV2Inference extends VoiceRoleInference {
  confidenceBucket: VoiceRoleConfidenceBucket;
  evidenceKinds: readonly VoiceRoleEvidenceKind[];
}

/**
 * Applies the exact Stage 02 classifier to one existing production Voice.
 * MIDI Channel 10 is resolved by the classifier before any override is
 * considered; non-drum manual overrides remain authoritative.
 */
export function inferVoiceRoleV2(
  input: VoiceFeatureInput,
  features: RoleV2ShadowFeatures,
): VoiceRoleV2Inference {
  const classified = inferRoleV2Shadow(features);
  return inferenceFromClassification(
    classified.role,
    classified.confidenceBucket,
    classified.evidenceKinds,
  );
}

export function resolveVoiceRoleV2(
  input: VoiceFeatureInput,
  features: RoleV2ShadowFeatures,
  override?: VoiceRole,
): VoiceRoleV2Inference {
  const inferred = inferVoiceRoleV2(input, features);
  if (!override || input.voice.channel === 9) return inferred;
  return {
    ...inferred,
    role: override,
    confidence: 1,
    confidenceBucket: "high",
    scores: {
      ...inferred.scores,
      [override]: Math.max(1, inferred.scores[override]),
    },
    reasons: [`override:${override}`, ...inferred.reasons],
    evidenceKinds: stableEvidenceKinds(["manual-override", ...inferred.evidenceKinds]),
  };
}

/**
 * Removes contradictory Channel 10 overrides before any downstream consumer
 * serializes or applies them. Unknown IDs are retained for caller compatibility.
 */
export function sanitizeVoiceRoleOverrides(
  voices: readonly Voice[],
  overrides: Readonly<Record<string, VoiceRole>> = {},
): Record<string, VoiceRole> {
  const channelByVoiceId = new Map(voices.map((voice) => [voice.id, voice.channel]));
  return Object.fromEntries(Object.entries(overrides).filter(([voiceId]) =>
    channelByVoiceId.get(voiceId) !== 9,
  ));
}

/**
 * Annotates the existing Voice model without touching normalized notes, raw
 * events, analyzer candidates, or persisted Vault data.
 */
export function annotateVoiceRolesV2(
  voices: readonly Voice[],
  notes: readonly NormalizedTimedNote[],
  overrides: Readonly<Record<string, VoiceRole>> = {},
): Voice[] {
  const v1Features = buildVoiceFeatureInputs(voices, notes);
  const v2Features = extractRoleV2ShadowFeatures(voices, notes);
  const safeOverrides = sanitizeVoiceRoleOverrides(voices, overrides);

  return voices.map((voice) => {
    const input = v1Features.get(voice.id);
    const features = v2Features.get(voice.id);
    if (!input || !features) return voice;
    const inference = resolveVoiceRoleV2(input, features, safeOverrides[voice.id]);
    return {
      ...voice,
      inferredRole: inference.role,
      roleConfidence: inference.confidence,
      roleConfidenceBucket: inference.confidenceBucket,
      roleEvidenceKinds: inference.evidenceKinds,
      roleInferenceVersion: voiceRoleV2InferenceVersion,
      roleEvidence: voiceRoleEvidence(input),
    };
  });
}

function inferenceFromClassification(
  role: VoiceRole,
  confidenceBucket: VoiceRoleConfidenceBucket,
  evidenceKinds: readonly RoleV2ShadowEvidenceKind[],
): VoiceRoleV2Inference {
  return {
    role,
    confidence: confidenceForBucket(confidenceBucket),
    confidenceBucket,
    evidenceKinds: stableEvidenceKinds(evidenceKinds),
    scores: { bass: 0, harmony: 0, pad: 0, melody: 0, percussion: 0, mixed: 0 },
    reasons: evidenceKinds.map((kind) => `role-v2:${kind}`),
  };
}

function confidenceForBucket(bucket: VoiceRoleConfidenceBucket): number {
  if (bucket === "high") return 0.9;
  if (bucket === "medium") return 0.65;
  return 0.3;
}

function stableEvidenceKinds(
  evidenceKinds: readonly VoiceRoleEvidenceKind[],
): readonly VoiceRoleEvidenceKind[] {
  return [...new Set(evidenceKinds)].sort((left, right) => left.localeCompare(right));
}
