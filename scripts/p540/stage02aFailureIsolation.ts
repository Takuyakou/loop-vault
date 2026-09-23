/** Evaluation-only isolation of frozen Shadow outputs; no ranking policy lives here. */
import { normalizePc } from "../../src/domain/chords";
import type { UnionChimeraDecision } from "../../src/domain/midi/unionChimera";
import { renderBlindReview, type BlindRegionEvidence } from "../p539/groundTruthPacket";
import type { ShadowRankedCandidate, ShadowRankingResult } from "../p539/shadowCandidateRanking";
import {
  isBoundedShadowGrammarIdentity,
  shadowIdentityKey,
  shadowUpperIntervals,
  type ShadowRootRelativeIdentity,
} from "../p539/shadowRootRelativeIdentity";
import type { Stage03bWindowInteraction } from "../p539/stage03bInteraction";

export type LocalFailureCategory = "GENERATION-MISSING" | "GENERATED-BUT-MISRANKED"
  | "SEMANTIC-GRAMMAR-MISMATCH" | "TIE-BREAK-LOSS" | "OTHER";
export type DivergenceStage = "RANKING" | "FAMILY-B-TRIGGER" | "PARTITION"
  | "SMOOTHING" | "IDENTITY-REPRESENTATION" | "INTERACTION" | "UNRESOLVED";

export function renderStage02aSourceOnly(regions: readonly BlindRegionEvidence[]): string {
  const html = renderBlindReview(regions).replaceAll(
    "before opening the separate candidate-choices page",
    "from source evidence only",
  );
  if (/candidate|score|origin|model-a|shadow|production/i.test(html)) {
    throw new Error("Source-only packet contaminated by comparison language");
  }
  return html;
}

export interface ScoreContributions {
  hitRatio: number;
  outsideRatio: number;
  rootEvidence: number;
  bassCompatibility: number;
  semanticComplexity: number;
  qualityEvidencePenalty: number;
  explicitModifierPenalty: number;
  omissionConflictPenalty: number;
}

function contributions(candidate: ShadowRankedCandidate): ScoreContributions {
  const detail = candidate.explanation;
  return {
    hitRatio: detail.hitRatio,
    outsideRatio: -detail.outsideRatio * 0.12,
    rootEvidence: detail.rootEvidence * 0.12,
    bassCompatibility: detail.bassCompatibility,
    semanticComplexity: -detail.extensionPenalty,
    qualityEvidencePenalty: -detail.qualityEvidencePenalty,
    explicitModifierPenalty: -detail.explicitModifierPenalty,
    omissionConflictPenalty: -detail.omissionConflictPenalty,
  };
}

function scoreDifference(winner: ShadowRankedCandidate, comparator: ShadowRankedCandidate) {
  const first = contributions(winner);
  const second = contributions(comparator);
  const delta = Object.fromEntries(Object.keys(first).map((key) => (
    [key, first[key as keyof ScoreContributions] - second[key as keyof ScoreContributions]]
  ))) as unknown as ScoreContributions;
  const winnerAdvantage = winner.score - comparator.score;
  if (Math.abs(Object.values(delta).reduce((sum, value) => sum + value, 0) - winnerAdvantage) > 1e-12) {
    throw new Error("Score contribution delta did not recompose");
  }
  return { winnerAdvantage, delta, tieBreakInvolved: winner.score === comparator.score };
}

export function isolateLocalFailure(result: ShadowRankingResult, correct: ShadowRootRelativeIdentity) {
  const key = shadowIdentityKey(correct);
  const intervals = shadowUpperIntervals(correct);
  if (!key || !intervals) throw new Error("Frozen local identity invalid");
  const root = normalizePc(correct.rootPitchClass);
  const bass = correct.bassPitchClass === undefined || normalizePc(correct.bassPitchClass) === root
    ? null : normalizePc(correct.bassPitchClass);
  const pitchContent = [...new Set(intervals.map((interval) => normalizePc(root + interval)))].sort((a, b) => a - b);
  const literal = result.rankedCandidates.find((entry) => entry.identityKey === key) ?? null;
  const equivalents = result.rankedCandidates.filter((entry) => (
    entry.identity.rootPitchClass === root
    && (entry.identity.bassPitchClass ?? null) === bass
    && [...entry.explanation.scoreTemplatePcs].sort((a, b) => a - b).join(",") === pitchContent.join(",")
    && entry.identityKey !== key
  ));
  const winner = result.topCandidate;
  const category: LocalFailureCategory = !literal
    ? isBoundedShadowGrammarIdentity(correct) ? "GENERATION-MISSING" : "SEMANTIC-GRAMMAR-MISMATCH"
    : literal.rank === 1 ? "OTHER"
      : literal.score === winner.score ? "TIE-BREAK-LOSS" : "GENERATED-BUT-MISRANKED";
  return {
    category,
    correctIdentityKey: key,
    literalInBoundedGrammar: isBoundedShadowGrammarIdentity(correct),
    literalGenerated: literal !== null,
    winner: {
      identityKey: winner.identityKey,
      rank: winner.rank,
      score: winner.score,
      contributions: contributions(winner),
      hitRatio: winner.explanation.hitRatio,
      outsideRatio: winner.explanation.outsideRatio,
      semanticTemplateSize: winner.explanation.semanticTemplateSize,
    },
    correct: literal && {
      identityKey: literal.identityKey,
      rank: literal.rank,
      score: literal.score,
      contributions: contributions(literal),
      hitRatio: literal.explanation.hitRatio,
      outsideRatio: literal.explanation.outsideRatio,
      semanticTemplateSize: literal.explanation.semanticTemplateSize,
    },
    winnerVsCorrect: literal ? scoreDifference(winner, literal) : null,
    pitchEquivalent: equivalents.map((entry) => ({
      identityKey: entry.identityKey,
      rank: entry.rank,
      score: entry.score,
      semanticOnly: true,
      winnerVsEquivalent: scoreDifference(winner, entry),
    })),
  };
}

function winners(window: Stage03bWindowInteraction) {
  return {
    w2: window.w2.expanded.identityKey,
    b0: window.b0?.expanded.identityKey ?? null,
    b1: window.b1?.expanded.identityKey ?? null,
  };
}

function decisionInputs(decision: UnionChimeraDecision) {
  return {
    winnerWinsNeitherBeat: decision.winnerWinsNeitherBeat,
    bucketsDifferentIdentity: decision.bucketsDifferentIdentity,
    supportSpansBothBeats: decision.supportSpansBothBeats,
    triggered: decision.triggered,
    reason: decision.reason,
  };
}

/** One window before smoothing, with the same frozen Model-A partition rule. */
export function plannedWindowStates(window: Stage03bWindowInteraction) {
  if (window.expandedDecision.triggered) {
    if (!window.b0 || !window.b1) throw new Error("Triggered window has no beat evidence");
    return [
      { startBeat: window.index * 2, durationBeats: 1, identityKey: window.b0.expanded.identityKey, confidence: Math.max(0, Math.min(1, window.b0.expanded.score)) },
      { startBeat: window.index * 2 + 1, durationBeats: 1, identityKey: window.b1.expanded.identityKey, confidence: Math.max(0, Math.min(1, window.b1.expanded.score)) },
    ];
  }
  return [{
    startBeat: window.index * 2, durationBeats: 2,
    identityKey: window.w2.expanded.identityKey,
    confidence: Math.max(0, Math.min(1, window.w2.expanded.score)),
  }];
}

export function isolateWindowDivergence(
  frozen: Stage03bWindowInteraction,
  shadow: Stage03bWindowInteraction,
  frozenFinal: readonly string[],
  shadowFinal: readonly string[],
): {
  firstDivergence: DivergenceStage;
  rankingChanged: boolean;
  triggerChanged: boolean;
  partitionChanged: boolean;
  smoothingCausal: boolean;
  frozenWinners: ReturnType<typeof winners>;
  shadowWinners: ReturnType<typeof winners>;
  frozenDecision: ReturnType<typeof decisionInputs>;
  shadowDecision: ReturnType<typeof decisionInputs>;
  frozenPlanned: ReturnType<typeof plannedWindowStates>;
  shadowPlanned: ReturnType<typeof plannedWindowStates>;
  frozenFinal: readonly string[];
  shadowFinal: readonly string[];
} {
  if (frozen.index !== shadow.index || frozenFinal.length !== 2 || shadowFinal.length !== 2) {
    throw new Error("Window comparison boundary mismatch");
  }
  const frozenWinners = winners(frozen);
  const shadowWinners = winners(shadow);
  const rankingChanged = JSON.stringify(frozenWinners) !== JSON.stringify(shadowWinners);
  const triggerChanged = frozen.expandedDecision.triggered !== shadow.expandedDecision.triggered;
  const frozenPlanned = plannedWindowStates(frozen);
  const shadowPlanned = plannedWindowStates(shadow);
  const partitionChanged = frozenPlanned.length !== shadowPlanned.length;
  const finalChanged = JSON.stringify(frozenFinal) !== JSON.stringify(shadowFinal);
  const smoothingCausal = !partitionChanged && !rankingChanged && finalChanged;
  const firstDivergence: DivergenceStage = rankingChanged ? "RANKING"
    : triggerChanged ? "FAMILY-B-TRIGGER"
      : partitionChanged ? "PARTITION"
        : smoothingCausal ? "SMOOTHING"
          : finalChanged ? "IDENTITY-REPRESENTATION" : "UNRESOLVED";
  return {
    firstDivergence, rankingChanged, triggerChanged, partitionChanged,
    smoothingCausal,
    frozenWinners, shadowWinners,
    frozenDecision: decisionInputs(frozen.expandedDecision),
    shadowDecision: decisionInputs(shadow.expandedDecision),
    frozenPlanned, shadowPlanned, frozenFinal, shadowFinal,
  };
}
