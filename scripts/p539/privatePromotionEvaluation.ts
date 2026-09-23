import { parseMidi } from "../../src/domain/midi/parser";
import { diagnoseLegacyWindowCandidates } from "../../src/domain/midi/legacy";
import { phase4QualityEvidence } from "../../src/domain/midi/phase4Analyzer";
import {
  parseShadowChordLabel,
  shadowIdentityKey,
} from "./shadowRootRelativeIdentity";
import {
  rankStage02ShadowCandidates,
  type ShadowRankedCandidate,
} from "./shadowCandidateRanking";

export type ChangeReview =
  | "CONFIRMED-KNOWN-TARGET"
  | "SUPPORTED-LIKELY-CORRECTION"
  | "UNRESOLVED"
  | "SUSPICIOUS";

export interface FamilyCPrivateTargetAssessment {
  anonymousFamily: "altered-dominant-omission" | "dominant-11-omission";
  independentGroundTruthBinding: "UNAVAILABLE";
  privateRepresentability: "NOT_VERIFIABLE";
  privateCandidatePresence: null;
  privateRankMovement: null;
  canonicalPrivateResult: null;
}

export interface FamilyCPromotionPrivateAggregate {
  fixtureId: "LF-MIDI-001";
  candidateCount: 276;
  candidateVisitDefinition: string;
  candidateVisits: { min: number; max: number };
  totalComparableRegions: number;
  existingRepresentableRegions: number;
  newFamilyCCandidateWins: number;
  legacyIdentitiesUnchanged: number;
  changedIdentities: number;
  knownImprovements: 0;
  changeReview: Record<ChangeReview, number>;
  targetFamilies: FamilyCPrivateTargetAssessment[];
  ambiguityAssessment: "UNVERIFIED";
  classificationConserved: true;
  deterministic: boolean;
  sourceBytesUnchanged: boolean;
  sourceNotesAndTimingUnchanged: boolean;
}

interface WindowEvaluation {
  changed: boolean;
  topIsFamilyC: boolean;
  topReview?: Exclude<ChangeReview, "CONFIRMED-KNOWN-TARGET">;
  visits: number;
}

function maxIndex(values: readonly number[]): number {
  return values.reduce((best, value, index) => value > values[best] ? index : best, 0);
}

function classifyChangedWinner(
  winner: ShadowRankedCandidate,
  margin: number,
): Exclude<ChangeReview, "CONFIRMED-KNOWN-TARGET"> {
  if (winner.explanation.missingExpectedTones.length > 0
    || winner.explanation.omissionConflicts.length > 0) {
    return "SUSPICIOUS";
  }
  if (margin < 0.02) return "UNRESOLVED";
  return "SUPPORTED-LIKELY-CORRECTION";
}

function evaluateWindows(bytes: Uint8Array): WindowEvaluation[] {
  const diagnostics = diagnoseLegacyWindowCandidates(bytes, {
    useQualityEvidence: true,
    qualityEvidence: phase4QualityEvidence,
  });
  return diagnostics.map((diagnostic) => {
    if (!diagnostic.histogram || !diagnostic.bassHistogram || !diagnostic.candidates[0]) {
      throw new Error("Private promotion diagnostic omitted bounded window evidence");
    }
    const ranking = rankStage02ShadowCandidates({
      histogram: diagnostic.histogram,
      bassPitchClass: maxIndex(diagnostic.bassHistogram),
    });
    const legacyShadow = parseShadowChordLabel(diagnostic.candidates[0].chord.label);
    const legacyKey = legacyShadow ? shadowIdentityKey(legacyShadow) : null;
    const runnerUpMargin = ranking.rankedCandidates[1]
      ? ranking.topCandidate.score - ranking.rankedCandidates[1].score
      : 0;
    const topIsFamilyC = ranking.topCandidate.generationReason === "family-c-target-a"
      || ranking.topCandidate.generationReason === "family-c-target-b";
    return {
      changed: legacyKey !== ranking.topCandidate.identityKey,
      topIsFamilyC,
      ...(topIsFamilyC
        ? { topReview: classifyChangedWinner(ranking.topCandidate, runnerUpMargin) }
        : {}),
      visits: ranking.candidateVisits,
    };
  });
}

const TARGET_FAMILY_ASSESSMENTS: readonly FamilyCPrivateTargetAssessment[] = [
  {
    anonymousFamily: "altered-dominant-omission",
    independentGroundTruthBinding: "UNAVAILABLE",
    privateRepresentability: "NOT_VERIFIABLE",
    privateCandidatePresence: null,
    privateRankMovement: null,
    canonicalPrivateResult: null,
  },
  {
    anonymousFamily: "dominant-11-omission",
    independentGroundTruthBinding: "UNAVAILABLE",
    privateRepresentability: "NOT_VERIFIABLE",
    privateCandidatePresence: null,
    privateRankMovement: null,
    canonicalPrivateResult: null,
  },
];

function assertClassificationConservation(
  changedCount: number,
  review: Readonly<Record<ChangeReview, number>>,
): void {
  const classifiedCount = Object.values(review).reduce((sum, count) => sum + count, 0);
  if (classifiedCount !== changedCount) {
    throw new Error("Private change classification count does not conserve changed identities");
  }
  if (review["CONFIRMED-KNOWN-TARGET"] !== 0) {
    throw new Error("Private target confirmation requires independent ground-truth binding");
  }
}

/**
 * Emits only anonymous aggregate evidence. It deliberately exposes no path,
 * filename, chord root, timeline position, raw note, byte, hash, or progression.
 *
 * The tracked repository contains no independent private-window locator. The
 * evaluator therefore never upgrades a model-selected winner to a confirmed
 * known target. That missing binding is reported explicitly and fails Gate G.
 */
export function evaluateFamilyCPrivatePromotion(
  bytes: Uint8Array,
): FamilyCPromotionPrivateAggregate {
  const sourceBytes = Uint8Array.from(bytes);
  const parsedBefore = parseMidi(bytes);
  const first = evaluateWindows(bytes);
  const second = evaluateWindows(bytes);
  const parsedAfter = parseMidi(bytes);
  const changed = first.filter((row) => row.changed);
  const familyWins = first.filter((row) => row.topIsFamilyC);
  const review: Record<ChangeReview, number> = {
    "CONFIRMED-KNOWN-TARGET": 0,
    "SUPPORTED-LIKELY-CORRECTION": 0,
    UNRESOLVED: 0,
    SUSPICIOUS: 0,
  };
  for (const row of changed) {
    review[row.topIsFamilyC ? row.topReview ?? "SUSPICIOUS" : "SUSPICIOUS"] += 1;
  }
  assertClassificationConservation(changed.length, review);

  const visits = first.map((row) => row.visits);
  if (visits.length === 0) {
    throw new Error("Private fixture has no comparable harmonic windows");
  }
  return {
    fixtureId: "LF-MIDI-001",
    candidateCount: 276,
    candidateVisitDefinition:
      "one score evaluation for one fixed generated candidate in one harmonic window",
    candidateVisits: {
      min: Math.min(...visits),
      max: Math.max(...visits),
    },
    totalComparableRegions: first.length,
    existingRepresentableRegions: first.length,
    newFamilyCCandidateWins: familyWins.length,
    legacyIdentitiesUnchanged: first.length - changed.length,
    changedIdentities: changed.length,
    knownImprovements: 0,
    changeReview: review,
    targetFamilies: TARGET_FAMILY_ASSESSMENTS.map((assessment) => ({ ...assessment })),
    ambiguityAssessment: "UNVERIFIED",
    classificationConserved: true,
    deterministic: JSON.stringify(second) === JSON.stringify(first),
    sourceBytesUnchanged: sourceBytes.length === bytes.length
      && sourceBytes.every((value, index) => value === bytes[index]),
    sourceNotesAndTimingUnchanged: JSON.stringify(parsedAfter.notes) === JSON.stringify(parsedBefore.notes),
  };
}
