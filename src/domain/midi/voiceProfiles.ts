import { normalizePc } from "../chords";
import { overlapWithSegment } from "./normalize";
import type { OrnamentFeatures } from "./ornaments";
import type {
  NormalizedTimedNote,
  SegmentRange,
  Voice,
  VoiceContributionWeights,
  VoiceEvidenceProfiles,
  VoiceFeatureInput,
  VoiceRole,
  VoiceRoleInference,
} from "./types";
import { resolveVoiceRole } from "./voiceRoles";
import { voiceId } from "./voices";
import { defaultAnalyzerWeights, noteFeatures, type AnalyzerWeights } from "./weights";

export interface VoiceRoleProfile {
  voiceId: string;
  inference: VoiceRoleInference;
  contribution: VoiceContributionWeights;
}

export function contributionWeightsForRole(role: VoiceRole): VoiceContributionWeights {
  if (role === "bass") return { root: 0.9, bass: 1, quality: 0.25, tension: 0 };
  if (role === "harmony") return { root: 0.65, bass: 0.35, quality: 1, tension: 0.55 };
  if (role === "pad") return { root: 0.6, bass: 0.2, quality: 0.8, tension: 0.55 };
  if (role === "melody") return { root: 0.15, bass: 0, quality: 0.22, tension: 0.35 };
  if (role === "percussion") return zeroContribution();
  return { root: 0.35, bass: 0.15, quality: 0.45, tension: 0.25 };
}

export function buildVoiceRoleProfiles(
  voices: readonly Voice[],
  features: ReadonlyMap<string, VoiceFeatureInput>,
  overrides: Readonly<Record<string, VoiceRole>> = {},
): ReadonlyMap<string, VoiceRoleProfile> {
  return new Map(voices.flatMap((voice) => {
    const input = features.get(voice.id);
    if (!input) return [];
    const inference = resolveVoiceRole(input, overrides[voice.id]);
    return [[voice.id, {
      voiceId: voice.id,
      inference,
      contribution: contributionWeightsForRole(inference.role),
    }] as const];
  }));
}

/**
 * Builds profiles from an already-promoted Role v2 annotation. This keeps the
 * role-aware reranker on the same decision that pre-analysis and source
 * voicing display, while preserving authoritative non-drum manual overrides.
 */
export function buildAnnotatedVoiceRoleProfiles(
  voices: readonly Voice[],
  overrides: Readonly<Record<string, VoiceRole>> = {},
): ReadonlyMap<string, VoiceRoleProfile> {
  return new Map(voices.map((voice) => {
    const override = voice.channel === 9 ? undefined : overrides[voice.id];
    const role = voice.channel === 9 ? "percussion" : override ?? voice.inferredRole;
    const inference: VoiceRoleInference = {
      role,
      confidence: override ? 1 : voice.roleConfidence,
      scores: { bass: 0, harmony: 0, pad: 0, melody: 0, percussion: 0, mixed: 0 },
      reasons: override
        ? [`override:${override}`]
        : [voice.roleInferenceVersion ?? "role-v1"],
    };
    return [voice.id, {
      voiceId: voice.id,
      inference,
      contribution: contributionWeightsForRole(role),
    }] as const;
  }));
}

export function buildVoiceAwarePitchProfile(
  notes: readonly NormalizedTimedNote[],
  segment: SegmentRange,
  roles: ReadonlyMap<string, VoiceRoleProfile>,
  ornaments: ReadonlyMap<NormalizedTimedNote, OrnamentFeatures>,
  beatsPerBar: number,
  weights: AnalyzerWeights = defaultAnalyzerWeights,
): VoiceEvidenceProfiles {
  const profile = emptyEvidenceProfile();
  for (const note of notes) {
    if (note.channel === undefined || note.channel === 9) continue;
    const overlap = overlapWithSegment(note, segment);
    if (overlap.overlapBeats <= 0) continue;

    const role = roles.get(voiceId(note.trackIndex, note.channel));
    const contribution = role?.contribution ?? contributionWeightsForRole("mixed");
    if (isZeroContribution(contribution)) continue;
    const features = noteFeatures(
      { ...overlap, overlapRatio: 1 },
      { beatsPerBar, roleWeight: 1, ornamentPenalty: ornaments.get(note)?.penalty },
      weights,
    );
    const baseWeight = features.finalWeight * overlap.overlapBeats;
    const pitchClass = normalizePc(note.pitch);
    const register = registerContribution(note.pitch, contribution);

    profile.rootEvidence[pitchClass] += baseWeight * register.root;
    profile.bassEvidence[pitchClass] += baseWeight * register.bass;
    profile.qualityEvidence[pitchClass] += baseWeight * register.quality;
    profile.tensionEvidence[pitchClass] += baseWeight * register.tension;
  }
  return profile;
}

function registerContribution(
  pitch: number,
  contribution: VoiceContributionWeights,
): VoiceContributionWeights {
  const lowEvidence = pitch < 48 ? 1 : pitch < 55 ? 0.65 : 0;
  const lowQualityScale = pitch < 48 ? 0.42 : pitch < 55 ? 0.72 : 1;
  const lowTensionScale = pitch < 48 ? 0 : pitch < 55 ? 0.3 : 1;
  return {
    root: Math.max(contribution.root, lowEvidence * 0.9),
    bass: Math.max(contribution.bass, lowEvidence),
    quality: contribution.quality * lowQualityScale,
    tension: contribution.tension * lowTensionScale,
  };
}

function emptyEvidenceProfile(): VoiceEvidenceProfiles {
  return {
    rootEvidence: zeros(),
    bassEvidence: zeros(),
    qualityEvidence: zeros(),
    tensionEvidence: zeros(),
  };
}

function zeroContribution(): VoiceContributionWeights {
  return { root: 0, bass: 0, quality: 0, tension: 0 };
}

function isZeroContribution(contribution: VoiceContributionWeights): boolean {
  return contribution.root === 0
    && contribution.bass === 0
    && contribution.quality === 0
    && contribution.tension === 0;
}

function zeros(): number[] {
  return Array(12).fill(0) as number[];
}
