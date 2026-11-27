/** P9.4 research-only Tier 2 contract. Gold must be independently authored. */
import { audibleSignature, normalizedIdentity, type HarmonicGold, type HarmonicIdentity } from "../p7/harmonicTruth";

export const TIER2_METRIC_VERSION = "p9.4-tier2-v1" as const;
export interface Tier2Gold {
  readonly harmonic: HarmonicGold;
  /** Independently authored pitch classes that distinguish this harmony. */
  readonly definingPitchClasses: readonly number[];
  /** Independently authored optional pitch classes; omission is a separate diagnostic. */
  readonly optionalPitchClasses: readonly number[];
  readonly identityStatus: "RESOLVED" | "AMBIGUOUS" | "UNKNOWN";
  readonly vocabularyStatus: "SUPPORTED" | "UNSUPPORTED";
}
export interface Tier2Candidate {
  readonly label?: string;
  readonly identity?: HarmonicIdentity;
  readonly unknown?: boolean;
  /** Only notes produced by a candidate renderer or actual playback; never Gold/source notes as a proxy. */
  readonly playback?: { readonly origin: "CANDIDATE_RENDERER" | "PRODUCT_PLAYBACK"; readonly midi: readonly number[] };
}
export type Tier2Disposition = "CANONICAL" | "ACCEPTED_ALTERNATE" | "NOTATION_ONLY" |
  "SAME_SOUND_DIFFERENT_MEANING" | "DEFINING_TONE_LOSS" | "OPTIONAL_TONE_OMISSION" |
  "RENDERER_MISMATCH" | "UNSUPPORTED_VOCABULARY" | "AMBIGUOUS_UNKNOWN" |
  "UNKNOWN_INCORRECT" | "SEMANTIC_MISMATCH" | "IDENTITY_UNAVAILABLE";
const pc = (value: number) => ((value % 12) + 12) % 12;
const key = (value: { pitchClasses: readonly number[]; bassPitchClass: number }) =>
  `${[...value.pitchClasses].sort((a, b) => a - b).join(",")}|${value.bassPitchClass}`;
const sameStructure = (a: HarmonicIdentity, b: HarmonicIdentity) =>
  pc(a.root) === pc(b.root) && a.quality === b.quality && pc(a.bass) === pc(b.bass);
export function validateTier2Gold(gold: Tier2Gold): string[] {
  const issues: string[] = [];
  const source = gold.harmonic;
  if (!source.id || !source.identities.length || !source.audible.length) issues.push("harmonic-truth");
  if (gold.identityStatus === "RESOLVED" && !source.identities.length) issues.push("identity-empty");
  if (gold.identityStatus !== "RESOLVED" && gold.vocabularyStatus === "UNSUPPORTED") issues.push("ambiguous-unsupported-conflict");
  const all = [...gold.definingPitchClasses, ...gold.optionalPitchClasses];
  if (all.some((value) => !Number.isInteger(value) || value < 0 || value > 11) || new Set(all).size !== all.length)
    issues.push("pitch-class-metadata");
  const audible = new Set(source.audible.flatMap((entry) => entry.pitchClasses));
  if (all.some((value) => !audible.has(value))) issues.push("role-not-audible");
  try {
    const observed = key(audibleSignature(source.notes));
    if (!source.audible.some((entry) => key(entry) === observed)) issues.push("observed-not-allowed");
  } catch { issues.push("source-notes"); }
  return issues;
}
export function scoreTier2(gold: Tier2Gold, candidate: Tier2Candidate) {
  const issues = validateTier2Gold(gold);
  if (issues.length) throw new Error(`Invalid independent Tier 2 Gold: ${issues.join(",")}`);
  if (candidate.unknown && candidate.identity) throw new Error("UNKNOWN must not carry a resolved identity");
  if (candidate.playback && (!candidate.playback.midi.length || candidate.playback.midi.some((note) => !Number.isInteger(note) || note < 0 || note > 127)))
    throw new Error("Candidate playback requires valid rendered MIDI notes");
  const primary = gold.harmonic.identities[0];
  const identity = candidate.identity;
  const accepted = !!identity && gold.harmonic.identities.some((entry) => normalizedIdentity(entry) === normalizedIdentity(identity));
  const primaryExact = !!identity && !!primary && normalizedIdentity(primary) === normalizedIdentity(identity);
  const structural = !!identity && gold.harmonic.identities.some((entry) => sameStructure(entry, identity));
  const rendered = candidate.playback ? audibleSignature(candidate.playback.midi) : null;
  const playbackEquivalent = rendered ? gold.harmonic.audible.some((entry) => key(entry) === key(rendered)) : null;
  const renderedPcs = rendered ? new Set(rendered.pitchClasses) : null;
  const definingToneLoss = renderedPcs ? gold.definingPitchClasses.some((value) => !renderedPcs.has(value)) : null;
  const optionalToneOmission = renderedPcs ? gold.optionalPitchClasses.some((value) => !renderedPcs.has(value)) : null;
  const samePitchClasses = rendered ? gold.harmonic.audible.some((entry) =>
    [...entry.pitchClasses].sort((a, b) => a - b).join(",") === [...rendered.pitchClasses].sort((a, b) => a - b).join(",")) : null;
  const bassAgreement = rendered ? gold.harmonic.audible.some((entry) => entry.bassPitchClass === rendered.bassPitchClass) : null;
  let disposition: Tier2Disposition;
  if (candidate.unknown) disposition = gold.identityStatus === "RESOLVED" ? "UNKNOWN_INCORRECT" : "AMBIGUOUS_UNKNOWN";
  else if (gold.vocabularyStatus === "UNSUPPORTED") disposition = "UNSUPPORTED_VOCABULARY";
  else if (!identity) disposition = "IDENTITY_UNAVAILABLE";
  else if (definingToneLoss) disposition = "DEFINING_TONE_LOSS";
  else if (optionalToneOmission) disposition = "OPTIONAL_TONE_OMISSION";
  else if (accepted && playbackEquivalent === false) disposition = "RENDERER_MISMATCH";
  else if (primaryExact && candidate.label !== undefined && candidate.label !== gold.harmonic.primaryLabel)
    disposition = "NOTATION_ONLY";
  else if (primaryExact) disposition = "CANONICAL";
  else if (accepted) disposition = "ACCEPTED_ALTERNATE";
  else if (playbackEquivalent) disposition = "SAME_SOUND_DIFFERENT_MEANING";
  else disposition = "SEMANTIC_MISMATCH";
  return {
    metricVersion: TIER2_METRIC_VERSION, disposition,
    canonicalIdentityExact: primaryExact, acceptedIdentity: accepted,
    acceptedAlternate: accepted && !primaryExact, structuralAgreement: structural,
    rootAgreement: identity && primary ? pc(identity.root) === pc(primary.root) : null,
    qualityAgreement: identity && primary ? identity.quality === primary.quality : null,
    bassAgreementIdentity: identity && primary ? pc(identity.bass) === pc(primary.bass) : null,
    factorAgreement: identity && primary ? [...new Set(identity.factors)].sort().join(",") === [...new Set(primary.factors)].sort().join(",") : null,
    labelExact: candidate.label === undefined ? null : candidate.label === gold.harmonic.primaryLabel,
    playbackEquivalent, samePitchClasses, bassAgreement, definingToneLoss, optionalToneOmission,
    playbackAvailable: rendered !== null, unknownAppropriate: candidate.unknown ? gold.identityStatus !== "RESOLVED" : null,
  };
}

export function scoreTier2Ranking(gold: Tier2Gold, candidates: readonly Tier2Candidate[], bound = 32) {
  if (!Number.isInteger(bound) || bound < 1) throw new Error("Positive candidate bound required");
  const scored = candidates.map((candidate) => scoreTier2(gold, candidate));
  const hit = (items: typeof scored) => items.some((item) => item.acceptedIdentity);
  return { totalCandidates: scored.length, boundedCandidates: Math.min(bound, scored.length),
    fullAcceptedRecall: hit(scored), boundedAcceptedRecall: hit(scored.slice(0, bound)),
    top3Accepted: hit(scored.slice(0, 3)), top1Accepted: scored[0]?.acceptedIdentity ?? false,
    top1: scored[0] ?? null, top1PlaybackAvailable: scored[0]?.playbackAvailable ?? false };
}
