import { normalizePc } from "../../src/domain/chords";
import { detectorQualities } from "../../src/domain/midi/evaluation/metricsV2";
import { phase4QualityEvidence } from "../../src/domain/midi/phase4Analyzer";
import {
  attenuateRootBonus,
  defaultPresenceThreshold,
  evaluateQualityEvidence,
  missingQualityTonePenalty,
} from "../../src/domain/midi/qualityEvidence";
import type { ChordQuality } from "../../src/domain/types";
import {
  FAMILY_C_TARGET_ARCHETYPES,
  buildFamilyCTargetIdentities,
  formatShadowIdentity,
  normalizeShadowIdentity,
  productionControlIdentity,
  shadowIdentityKey,
  shadowUpperIntervals,
  type ShadowAlteration,
  type ShadowExtension,
  type ShadowOmission,
  type ShadowRootRelativeIdentity,
  type ShadowSourceNote,
  type ShadowTargetArchetype,
} from "./shadowRootRelativeIdentity";

/** Evaluation-only P5.39-02 candidate expansion. Nothing in `src/` consumes it. */
export type ShadowCandidateGenerationReason =
  | "production-base-candidate"
  | "family-c-target-a"
  | "family-c-target-b"
  | "individual-alteration-neighbor";

export type ShadowTargetRankingClassification =
  | "GENERATION_FAILURE"
  | "RANKING_FAILURE"
  | "TOP1_CORRECT"
  | "AMBIGUOUS_BY_CONTRACT";

export interface ShadowRankingEvidence {
  /** Production legacy scorer's weighted pitch-class evidence. */
  histogram: readonly number[];
  /** Structural bass is separate from the upper identity and note order. */
  bassPitchClass: number;
}

export interface ShadowRankingCandidate {
  enumerationIndex: number;
  generationReason: ShadowCandidateGenerationReason;
  identity: ShadowRootRelativeIdentity;
  identityKey: string;
  canonicalLabel: string;
  upperIntervals: readonly number[];
  productionQuality?: ChordQuality;
  targetArchetypeId?: ShadowTargetArchetype["id"];
}

export interface ShadowRankingExplanation {
  /** Diagnostic-only fields; no ranking decision consumes these values. */
  scoreTemplatePcs: readonly number[];
  observedMaterialPcs: readonly number[];
  explicitModifierPcs: readonly number[];
  omittedPcs: readonly number[];
  rawBassCompatibility: number;
  bassAttenuation: number;
  qualityEvidenceCoverage: number;
  semanticTemplateSize: number;
  matchedStructuralPcs: readonly number[];
  matchedExplicitModifiers: readonly number[];
  missingExpectedTones: readonly number[];
  conflictingPresentTones: readonly number[];
  omissionConflicts: readonly number[];
  bassCompatibility: number;
  hitRatio: number;
  outsideRatio: number;
  rootEvidence: number;
  extensionPenalty: number;
  qualityEvidencePenalty: number;
  explicitModifierPenalty: number;
  omissionConflictPenalty: number;
  totalScore: number;
}

export interface ShadowRankedCandidate extends ShadowRankingCandidate {
  rank: number;
  score: number;
  explanation: ShadowRankingExplanation;
}

export interface ShadowRankingResult {
  candidateVisits: number;
  generatedCandidates: readonly ShadowRankingCandidate[];
  rankedCandidates: readonly ShadowRankedCandidate[];
  topCandidate: ShadowRankedCandidate;
}

export interface ShadowTargetRankingDiagnostic {
  classification: ShadowTargetRankingClassification;
  candidateGenerated: boolean;
  candidatePresentBeforeRanking: boolean;
  candidateRank: number | null;
  candidateScore: number | null;
  topIdentityKey: string;
}

export const PRODUCTION_BASE_CANDIDATE_COUNT = 21 * 12;
export const FAMILY_C_SHADOW_CANDIDATE_COUNT = 2 * 12;
export const STAGE02_SHADOW_CANDIDATE_VISITS =
  PRODUCTION_BASE_CANDIDATE_COUNT + FAMILY_C_SHADOW_CANDIDATE_COUNT;
export const STAGE02_MAX_CANDIDATE_VISITS = 300;
/** Shadow-only penalties; deliberately separate from active production's 0.08 quality penalty. */
export const STAGE02_MISSING_EXPLICIT_FACT_PENALTY = missingQualityTonePenalty;
export const STAGE02_OMISSION_CONFLICT_PENALTY = missingQualityTonePenalty;

let cachedStage02Candidates: readonly ShadowRankingCandidate[] | undefined;

function freezeCandidate(
  sourceCandidate: ShadowRankingCandidate,
): Readonly<ShadowRankingCandidate> {
  const identity = Object.freeze({
    ...sourceCandidate.identity,
    extensions: Object.freeze([...sourceCandidate.identity.extensions]),
    alterations: Object.freeze([...sourceCandidate.identity.alterations]),
    omissions: Object.freeze([...sourceCandidate.identity.omissions]),
  });
  return Object.freeze({
    ...sourceCandidate,
    identity,
    upperIntervals: Object.freeze([...sourceCandidate.upperIntervals]),
  });
}

/* Frozen production legacy order and intervals from src/domain/midi/legacy.ts. */
const LEGACY_TEMPLATES: readonly {
  quality: ChordQuality;
  intervals: readonly number[];
}[] = [
  { quality: "maj", intervals: [0, 4, 7] },
  { quality: "min", intervals: [0, 3, 7] },
  { quality: "dim", intervals: [0, 3, 6] },
  { quality: "aug", intervals: [0, 4, 8] },
  { quality: "maj7", intervals: [0, 4, 7, 11] },
  { quality: "min7", intervals: [0, 3, 7, 10] },
  { quality: "dom7", intervals: [0, 4, 7, 10] },
  { quality: "min7b5", intervals: [0, 3, 6, 10] },
  { quality: "dim7", intervals: [0, 3, 6, 9] },
  { quality: "six", intervals: [0, 4, 7, 9] },
  { quality: "min6", intervals: [0, 3, 7, 9] },
  { quality: "sixNine", intervals: [0, 2, 4, 7, 9] },
  { quality: "sus2", intervals: [0, 2, 7] },
  { quality: "sus4", intervals: [0, 5, 7] },
  { quality: "dom7sus4", intervals: [0, 5, 7, 10] },
  { quality: "add9", intervals: [0, 2, 4, 7] },
  { quality: "maj9", intervals: [0, 2, 4, 7, 11] },
  { quality: "min9", intervals: [0, 2, 3, 7, 10] },
  { quality: "dom9", intervals: [0, 2, 4, 7, 10] },
  { quality: "min11", intervals: [0, 2, 3, 5, 7, 10] },
  { quality: "dom13", intervals: [0, 2, 4, 7, 10, 21] },
] as const;

const EXTENSION_INTERVAL: Readonly<Record<ShadowExtension, number>> = {
  "6": 9,
  "9": 2,
  "11": 5,
  "13": 9,
};

const ALTERATION_INTERVAL: Readonly<Record<ShadowAlteration, number>> = {
  b9: 1,
  "#9": 3,
  "#11": 6,
  b13: 8,
  "#5": 8,
};

const OMITTED_INTERVAL: Readonly<Record<ShadowOmission, number>> = {
  no3: 4,
  no5: 7,
};

function generationReason(
  archetypeId: ShadowTargetArchetype["id"],
): ShadowCandidateGenerationReason {
  return archetypeId === "altered-dominant-no5"
    ? "family-c-target-a"
    : "family-c-target-b";
}

function candidate(
  identity: ShadowRootRelativeIdentity,
  enumerationIndex: number,
  reason: ShadowCandidateGenerationReason,
  options: {
    productionQuality?: ChordQuality;
    targetArchetypeId?: ShadowTargetArchetype["id"];
  } = {},
): ShadowRankingCandidate {
  const identityKey = shadowIdentityKey(identity);
  const canonicalLabel = formatShadowIdentity(identity);
  const upperIntervals = shadowUpperIntervals(identity);
  if (!identityKey || !canonicalLabel || !upperIntervals) {
    throw new Error("Stage02 candidate is outside the frozen Stage01 grammar");
  }
  return {
    enumerationIndex,
    generationReason: reason,
    identity,
    identityKey,
    canonicalLabel,
    upperIntervals,
    ...options,
  };
}

/**
 * Fixed enumeration: the unchanged legacy 252 first, then only Target A/B x12.
 * The Stage01 neighbor catalog remains evaluation-only and is never enumerated.
 */
export function buildStage02ShadowCandidates(): readonly ShadowRankingCandidate[] {
  if (cachedStage02Candidates) return cachedStage02Candidates;
  const candidates: ShadowRankingCandidate[] = [];
  for (let root = 0; root < 12; root += 1) {
    for (const template of LEGACY_TEMPLATES) {
      candidates.push(candidate(
        productionControlIdentity(root, template.quality),
        candidates.length,
        "production-base-candidate",
        { productionQuality: template.quality },
      ));
    }
  }
  for (const { archetypeId, identity } of buildFamilyCTargetIdentities()) {
    candidates.push(candidate(identity, candidates.length, generationReason(archetypeId), {
      targetArchetypeId: archetypeId,
    }));
  }
  if (candidates.length !== STAGE02_SHADOW_CANDIDATE_VISITS) {
    throw new Error(`Unexpected Stage02 candidate count: ${candidates.length}`);
  }
  cachedStage02Candidates = Object.freeze(candidates.map(freezeCandidate));
  return cachedStage02Candidates;
}

function totalWeight(histogram: readonly number[]): number {
  return histogram.reduce((sum, value) => sum + Math.max(0, value ?? 0), 0);
}

function absolutePcs(root: number, intervals: readonly number[]): number[] {
  return [...new Set(intervals.map((interval) => normalizePc(root + interval)))];
}

function weightRatio(
  histogram: readonly number[],
  pitchClass: number,
  total: number,
): number {
  return total <= 0 ? 0 : Math.max(0, histogram[pitchClass] ?? 0) / total;
}

function scoreCandidate(
  sourceCandidate: ShadowRankingCandidate,
  evidence: ShadowRankingEvidence,
): Omit<ShadowRankedCandidate, "rank"> {
  const hasShadowExplicitFacts = sourceCandidate.targetArchetypeId !== undefined
    || sourceCandidate.generationReason === "individual-alteration-neighbor";
  const histogram = Array.from({ length: 12 }, (_, pc) => (
    Math.max(0, evidence.histogram[pc] ?? 0)
  ));
  const total = totalWeight(histogram);
  const normalizedTotal = Math.max(Number.EPSILON, total);
  const root = normalizePc(sourceCandidate.identity.rootPitchClass);
  const bassPitchClass = normalizePc(evidence.bassPitchClass);
  const legacyTemplate = sourceCandidate.productionQuality === undefined
    ? undefined
    : LEGACY_TEMPLATES.find((entry) => entry.quality === sourceCandidate.productionQuality);
  // Existing candidates use the legacy scorer's literal template intervals.
  // The semantic Stage01 descriptor intentionally folds natural extensions,
  // so it is not a score-template substitute for qualities such as 11/13.
  const scoreIntervals = legacyTemplate?.intervals ?? sourceCandidate.upperIntervals;
  const allowed = absolutePcs(root, scoreIntervals);
  const hit = allowed.reduce((sum, pc) => sum + histogram[pc], 0);
  const outside = histogram.reduce(
    (sum, value, pc) => sum + (allowed.includes(pc) ? 0 : value),
    0,
  );
  const rootEvidence = histogram[root] / normalizedTotal;
  const bassInChord = allowed.includes(bassPitchClass);

  const baseQuality = sourceCandidate.productionQuality ?? "dom7";
  const qualityEvidence = evaluateQualityEvidence(
    root,
    baseQuality,
    histogram,
    normalizedTotal,
    phase4QualityEvidence,
  );
  const rawBassCompatibility = bassPitchClass === root
    ? 0.18
    : bassInChord ? 0.08 : -0.04;
  const bassCompatibility = bassPitchClass === root
    ? attenuateRootBonus(rawBassCompatibility, qualityEvidence.coverage)
    : rawBassCompatibility;

  const normalized = normalizeShadowIdentity(sourceCandidate.identity);
  if (!normalized) throw new Error("Invalid normalized Stage02 candidate");
  const explicitIntervals = hasShadowExplicitFacts
    ? [
      ...normalized.extensions.map((extension) => EXTENSION_INTERVAL[extension]),
      ...normalized.alterations.map((alteration) => ALTERATION_INTERVAL[alteration]),
    ]
    : [];
  const explicitPcs = absolutePcs(root, explicitIntervals);
  const matchedExplicitModifiers = explicitPcs.filter(
    (pc) => weightRatio(histogram, pc, normalizedTotal) > defaultPresenceThreshold,
  );
  const missingExplicitModifiers = explicitPcs.filter(
    (pc) => weightRatio(histogram, pc, normalizedTotal) <= defaultPresenceThreshold,
  );
  const missingQualityTones = qualityEvidence.requiredPitchClasses.filter(
    (pc) => weightRatio(histogram, pc, normalizedTotal) <= defaultPresenceThreshold,
  );
  const missingExpectedTones = [...new Set([
    ...missingQualityTones,
    ...missingExplicitModifiers,
  ])].sort((left, right) => left - right);
  const omittedPcs = hasShadowExplicitFacts
    ? absolutePcs(root, normalized.omissions.map((omission) => OMITTED_INTERVAL[omission]))
    : [];
  const omissionConflicts = omittedPcs.filter(
    (pc) => weightRatio(histogram, pc, normalizedTotal) > defaultPresenceThreshold,
  );

  // The production scorer charges semantic complexity from the full template.
  // Count omitted structural tones as part of that semantic template so `no5`
  // never gains an intrinsic fewer-notes bonus.
  const semanticTemplateSize = legacyTemplate?.intervals.length
    ?? allowed.length + omittedPcs.length;
  const extensionPenalty = Math.max(0, semanticTemplateSize - 4) * 0.015;
  const explicitModifierPenalty = hasShadowExplicitFacts
    ? missingExplicitModifiers.length * STAGE02_MISSING_EXPLICIT_FACT_PENALTY
    : 0;
  const omissionConflictPenalty = hasShadowExplicitFacts
    ? omissionConflicts.length * STAGE02_OMISSION_CONFLICT_PENALTY
    : 0;
  const hitRatio = hit / normalizedTotal;
  const outsideRatio = outside / normalizedTotal;
  const totalScore = hitRatio
    - outsideRatio * 0.12
    + rootEvidence * 0.12
    + bassCompatibility
    - extensionPenalty
    - qualityEvidence.missingPenalty
    - explicitModifierPenalty
    - omissionConflictPenalty;

  const presentAllowed = allowed.filter((pc) => histogram[pc] > 0);
  const conflictingPresentTones = Array.from({ length: 12 }, (_, pc) => pc)
    .filter((pc) => histogram[pc] > 0 && !allowed.includes(pc));
  const bass = bassPitchClass !== root && bassInChord ? bassPitchClass : undefined;
  const identity = bass === undefined
    ? sourceCandidate.identity
    : { ...sourceCandidate.identity, bassPitchClass: bass };
  const identityKey = shadowIdentityKey(identity);
  const canonicalLabel = formatShadowIdentity(identity);
  if (!identityKey || !canonicalLabel) {
    throw new Error("Ranked candidate lost its frozen Stage01 identity");
  }
  return {
    ...sourceCandidate,
    identity,
    identityKey,
    canonicalLabel,
    score: totalScore,
    explanation: {
      scoreTemplatePcs: allowed,
      observedMaterialPcs: histogram.flatMap((weight, pc) => weight > defaultPresenceThreshold * normalizedTotal ? [pc] : []),
      explicitModifierPcs: explicitPcs,
      omittedPcs,
      rawBassCompatibility,
      bassAttenuation: rawBassCompatibility - bassCompatibility,
      qualityEvidenceCoverage: qualityEvidence.coverage,
      semanticTemplateSize,
      matchedStructuralPcs: presentAllowed,
      matchedExplicitModifiers,
      missingExpectedTones,
      conflictingPresentTones,
      omissionConflicts,
      bassCompatibility,
      hitRatio,
      outsideRatio,
      rootEvidence,
      extensionPenalty,
      qualityEvidencePenalty: qualityEvidence.missingPenalty,
      explicitModifierPenalty,
      omissionConflictPenalty,
      totalScore,
    },
  };
}

function rankCandidateSet(
  evidence: ShadowRankingEvidence,
  generatedCandidates: readonly ShadowRankingCandidate[],
): ShadowRankingResult {
  if (evidence.histogram.length !== 12) {
    throw new Error(`Stage02 evidence must contain 12 pitch classes, got ${evidence.histogram.length}`);
  }
  if (generatedCandidates.length > STAGE02_MAX_CANDIDATE_VISITS) {
    throw new Error(`Stage02 candidate visit bound exceeded: ${generatedCandidates.length}`);
  }
  const rankedCandidates = generatedCandidates
    .map((entry) => scoreCandidate(entry, evidence))
    .sort((left, right) => (
      right.score - left.score
      || left.canonicalLabel.localeCompare(right.canonicalLabel)
      || left.enumerationIndex - right.enumerationIndex
    ))
    .map((entry, index): ShadowRankedCandidate => ({ ...entry, rank: index + 1 }));
  const topCandidate = rankedCandidates[0];
  if (!topCandidate) throw new Error("Stage02 ranking unexpectedly produced no candidates");
  return {
    candidateVisits: generatedCandidates.length,
    generatedCandidates,
    rankedCandidates,
    topCandidate,
  };
}

/** Pure deterministic ranking adapter over the frozen 276-candidate Shadow set. */
export function rankStage02ShadowCandidates(
  evidence: ShadowRankingEvidence,
): ShadowRankingResult {
  return rankCandidateSet(evidence, buildStage02ShadowCandidates());
}

/** Stage01-only opt-in: append at most 24 candidates without changing Stage02. */
export function rankShadowCandidatesWithAdditions(
  evidence: ShadowRankingEvidence,
  additions: readonly ShadowRankingCandidate[],
): ShadowRankingResult {
  const base = buildStage02ShadowCandidates();
  if (additions.length > STAGE02_MAX_CANDIDATE_VISITS - base.length) {
    throw new Error("Stage01 candidate visit bound exceeded");
  }
  const known = new Set(base.map((entry) => entry.identityKey));
  additions.forEach((entry, index) => {
    if (entry.generationReason !== "individual-alteration-neighbor"
      || entry.enumerationIndex !== base.length + index
      || known.has(entry.identityKey)
      || shadowIdentityKey(entry.identity) !== entry.identityKey
      || formatShadowIdentity(entry.identity) !== entry.canonicalLabel) {
      throw new Error("Invalid Stage01 candidate addition");
    }
    known.add(entry.identityKey);
  });
  return rankCandidateSet(evidence, Object.freeze([
    ...base,
    ...additions.map(freezeCandidate),
  ]));
}

export function diagnoseStage02Target(
  result: ShadowRankingResult,
  expected: ShadowRootRelativeIdentity,
): ShadowTargetRankingDiagnostic {
  const expectedKey = shadowIdentityKey(expected);
  if (!expectedKey) throw new Error("Expected target is outside the frozen Stage01 grammar");
  const generated = result.generatedCandidates.find((entry) => (
    shadowIdentityKey(entry.identity) === expectedKey
  ));
  if (!generated) {
    return {
      classification: "GENERATION_FAILURE",
      candidateGenerated: false,
      candidatePresentBeforeRanking: false,
      candidateRank: null,
      candidateScore: null,
      topIdentityKey: result.topCandidate.identityKey,
    };
  }
  const ranked = result.rankedCandidates.find((entry) => entry.identityKey === expectedKey);
  if (!ranked) {
    return {
      classification: "RANKING_FAILURE",
      candidateGenerated: true,
      candidatePresentBeforeRanking: true,
      candidateRank: null,
      candidateScore: null,
      topIdentityKey: result.topCandidate.identityKey,
    };
  }
  return {
    classification: ranked.rank === 1 ? "TOP1_CORRECT" : "RANKING_FAILURE",
    candidateGenerated: true,
    candidatePresentBeforeRanking: true,
    candidateRank: ranked.rank,
    candidateScore: ranked.score,
    topIdentityKey: result.topCandidate.identityKey,
  };
}

/** Exact-PC fixture helper. Doublings affect weights; order/register do not. */
export function rankingEvidenceFromNotes(
  notes: readonly ShadowSourceNote[],
  bassPitchClass: number,
): ShadowRankingEvidence {
  const histogram = Array(12).fill(0) as number[];
  notes.forEach((note) => { histogram[normalizePc(note.pitch)] += 1; });
  return { histogram, bassPitchClass: normalizePc(bassPitchClass) };
}

export function exactRankingEvidence(
  identity: ShadowRootRelativeIdentity,
  options: { includeOmittedFifth?: boolean; omitExplicitIndex?: number } = {},
): ShadowRankingEvidence {
  const intervals = shadowUpperIntervals(identity);
  const normalized = normalizeShadowIdentity(identity);
  if (!intervals || !normalized) throw new Error("Cannot build evidence for invalid identity");
  const explicitIntervals = [
    ...normalized.extensions.map((extension) => EXTENSION_INTERVAL[extension]),
    ...normalized.alterations.map((alteration) => ALTERATION_INTERVAL[alteration]),
  ];
  const omittedExplicit = options.omitExplicitIndex === undefined
    ? undefined
    : explicitIntervals[options.omitExplicitIndex];
  const selected = intervals.filter((interval) => interval !== omittedExplicit);
  if (options.includeOmittedFifth && normalized.omissions.includes("no5")) selected.push(7);
  const histogram = Array(12).fill(0) as number[];
  selected.forEach((interval) => { histogram[normalizePc(identity.rootPitchClass + interval)] += 1; });
  return {
    histogram,
    bassPitchClass: identity.bassPitchClass ?? normalizePc(identity.rootPitchClass),
  };
}


export function detectorVocabularyParityGuard(): boolean {
  return detectorQualities.length === LEGACY_TEMPLATES.length
    && new Set(detectorQualities).size === LEGACY_TEMPLATES.length
    && LEGACY_TEMPLATES.every((entry) => detectorQualities.includes(entry.quality));
}

export function familyCTargetArchetypeCount(): number {
  return FAMILY_C_TARGET_ARCHETYPES.length;
}
