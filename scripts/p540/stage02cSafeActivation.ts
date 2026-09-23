/** P5.40-02c opt-in arbitration over the frozen P5.40-02b ranking result. */
import { normalizePc } from "../../src/domain/chords";
import { defaultPresenceThreshold } from "../../src/domain/midi/qualityEvidence";
import type { MidiSongData } from "../../src/domain/midi/types";
import { evaluateUnionChimeraWindow, type UnionChimeraDecision } from "../../src/domain/midi/unionChimera";
import {
  evaluateStage03bInteractions,
  smoothStage03bPlannedTimeline,
  type PlannedStage03bSpan,
  type ProjectedStage03bSpan,
  type RankedWindowPair,
  type Stage03bWindowInteraction,
} from "../p539/stage03bInteraction";
import {
  STAGE02_SHADOW_CANDIDATE_VISITS,
  type ShadowRankedCandidate,
  type ShadowRankingEvidence,
  type ShadowRankingResult,
} from "../p539/shadowCandidateRanking";
import { inspectStage02bHalfBeatState } from "./stage02bFinalShadow";
import { rankStage02bShadowCandidates } from "./stage02bShadowRanking";

export type ActivationReason = "same" | "certified" | "structural" | "conflict" | "no-improvement";

export interface CertifiedWinner {
  baseline: ShadowRankedCandidate;
  enriched: ShadowRankedCandidate;
  selected: ShadowRankedCandidate;
  reason: ActivationReason;
}

export interface Stage02cWindowTrace {
  index: number;
  w2: ActivationReason;
  b0: ActivationReason | null;
  b1: ActivationReason | null;
  baselineTriggered: boolean;
  proposedTriggered: boolean;
  finalTriggered: boolean;
  temporalCertified: boolean;
  microPartitioned: boolean;
  microRejected: boolean;
  halfReasons: readonly ActivationReason[];
  baselinePlan: readonly PlannedStage03bSpan[];
  selectedPlan: readonly PlannedStage03bSpan[];
  candidateVisits: readonly number[];
}

function material(evidence: ShadowRankingEvidence, pc: number): boolean {
  const total = evidence.histogram.reduce((sum, value) => sum + Math.max(0, value ?? 0), 0);
  return total > 0 && Math.max(0, evidence.histogram[normalizePc(pc)] ?? 0) / total
    > defaultPresenceThreshold;
}

function subset(left: readonly number[], right: readonly number[]): boolean {
  const allowed = new Set(right);
  return left.every((pc) => allowed.has(pc));
}

function samePcs(left: readonly number[], right: readonly number[]): boolean {
  return subset(left, right) && subset(right, left);
}

function completeSupport(candidate: ShadowRankedCandidate, evidence: ShadowRankingEvidence): boolean {
  const explanation = candidate.explanation;
  return explanation.scoreTemplatePcs.every((pc) => material(evidence, pc))
    && material(evidence, candidate.identity.rootPitchClass)
    && (candidate.identity.bassPitchClass ?? candidate.identity.rootPitchClass) === evidence.bassPitchClass
    && explanation.missingExpectedTones.length === 0
    && explanation.omissionConflicts.length === 0
    && explanation.explicitModifierPcs.every((pc) => material(evidence, pc));
}

/** The frozen first-276 score rows are never re-scored or re-enumerated. */
export function frozenPrefixWinner(result: ShadowRankingResult): ShadowRankedCandidate {
  if (result.candidateVisits < STAGE02_SHADOW_CANDIDATE_VISITS || result.candidateVisits > 300
    || result.generatedCandidates.slice(0, STAGE02_SHADOW_CANDIDATE_VISITS)
      .some((candidate, index) => candidate.enumerationIndex !== index)) {
    throw new Error("Frozen candidate prefix or hard bound changed");
  }
  const first = result.rankedCandidates
    .filter((candidate) => candidate.enumerationIndex < STAGE02_SHADOW_CANDIDATE_VISITS)
    .sort((left, right) => right.score - left.score
      || left.canonicalLabel.localeCompare(right.canonicalLabel)
      || left.enumerationIndex - right.enumerationIndex)[0];
  if (!first) throw new Error("Frozen prefix winner unavailable");
  return first;
}

/** A score or label-order win is never sufficient for activation. */
export function certifyStage02cWinner(
  result: ShadowRankingResult,
  evidence: ShadowRankingEvidence,
): CertifiedWinner {
  const baseline = frozenPrefixWinner(result);
  const enriched = result.topCandidate;
  if (baseline.identityKey === enriched.identityKey) {
    return { baseline, enriched, selected: baseline, reason: "same" };
  }
  if (!completeSupport(enriched, evidence)) {
    return { baseline, enriched, selected: baseline, reason: "structural" };
  }
  const before = baseline.explanation;
  const after = enriched.explanation;
  if (!subset(after.missingExpectedTones, before.missingExpectedTones)
    || !subset(after.conflictingPresentTones, before.conflictingPresentTones)
    || !subset(after.omissionConflicts, before.omissionConflicts)) {
    return { baseline, enriched, selected: baseline, reason: "conflict" };
  }
  const strictlyFewerConflicts = after.conflictingPresentTones.length < before.conflictingPresentTones.length;
  const strictlyFewerMissing = after.missingExpectedTones.length < before.missingExpectedTones.length;
  const newlyNamedMaterialFact = enriched.identity.rootPitchClass === baseline.identity.rootPitchClass
    && (enriched.identity.bassPitchClass ?? null) === (baseline.identity.bassPitchClass ?? null)
    && samePcs(after.scoreTemplatePcs, before.scoreTemplatePcs)
    && after.matchedExplicitModifiers.some((pc) => !before.explicitModifierPcs.includes(pc));
  if (!strictlyFewerConflicts && !strictlyFewerMissing && !newlyNamedMaterialFact) {
    return { baseline, enriched, selected: baseline, reason: "no-improvement" };
  }
  return { baseline, enriched, selected: enriched, reason: "certified" };
}

function candidateDecision(
  w2: ShadowRankedCandidate,
  b0: ShadowRankedCandidate | null,
  b1: ShadowRankedCandidate | null,
  first: RankedWindowPair | null,
  second: RankedWindowPair | null,
): UnionChimeraDecision {
  const pcs = (pair: RankedWindowPair | null) => new Set(pair?.evidence.histogram.flatMap(
    (weight, pc) => weight > 0 ? [pc] : [],
  ) ?? []);
  return evaluateUnionChimeraWindow({
    w2WinnerLabel: w2.canonicalLabel,
    w2WinnerRoot: w2.identity.rootPitchClass,
    w2WinnerPcs: w2.explanation.scoreTemplatePcs,
    b0WinnerLabel: b0?.canonicalLabel ?? null,
    b0WinnerRoot: b0?.identity.rootPitchClass ?? null,
    b0Pcs: pcs(first),
    b0HasEvidence: first !== null,
    b1WinnerLabel: b1?.canonicalLabel ?? null,
    b1WinnerRoot: b1?.identity.rootPitchClass ?? null,
    b1Pcs: pcs(second),
    b1HasEvidence: second !== null,
  });
}

function symmetricDifference(left: readonly number[], right: readonly number[]): number {
  return left.filter((pc) => !right.includes(pc)).length
    + right.filter((pc) => !left.includes(pc)).length;
}

function temporalBoundary(
  data: MidiSongData,
  beat: number,
  left: { evidence: ShadowRankingEvidence; candidate: ShadowRankedCandidate },
  right: { evidence: ShadowRankingEvidence; candidate: ShadowRankedCandidate },
): boolean {
  const materialPcs = (evidence: ShadowRankingEvidence) => evidence.histogram.flatMap(
    (_, pc) => material(evidence, pc) ? [pc] : [],
  );
  const before = materialPcs(left.evidence);
  const after = materialPcs(right.evidence);
  return data.notes.some((note) => note.startTick === beat * data.ticksPerBeat)
    && before.length >= 3 && after.length >= 3
    && before.some((pc) => !after.includes(pc))
    && completeSupport(left.candidate, left.evidence)
    && completeSupport(right.candidate, right.evidence)
    && subset(before, left.candidate.explanation.scoreTemplatePcs)
    && subset(after, right.candidate.explanation.scoreTemplatePcs)
    && symmetricDifference(left.candidate.explanation.scoreTemplatePcs,
      right.candidate.explanation.scoreTemplatePcs) >= 2;
}

function plan(candidate: ShadowRankedCandidate, startBeat: number, durationBeats: number): PlannedStage03bSpan {
  return {
    startBeat, durationBeats, identityKey: candidate.identityKey,
    familyC: candidate.generationReason !== "production-base-candidate",
    confidence: Math.max(0, Math.min(1, candidate.score)),
  };
}

/** Exactly one enriched candidate evaluation per W2/B0/B1/optional half-bin. */
export function evaluateStage02cSafeActivation(bytes: Uint8Array): {
  data: MidiSongData;
  windows: readonly Stage03bWindowInteraction[];
  traces: readonly Stage02cWindowTrace[];
  baselineFinal: readonly ProjectedStage03bSpan[];
  final: readonly ProjectedStage03bSpan[];
} {
  const evaluated = evaluateStage03bInteractions(bytes, rankStage02bShadowCandidates);
  const traces = evaluated.windows.map((window): Stage02cWindowTrace => {
    const w2 = certifyStage02cWinner(window.w2.result, window.w2.evidence);
    const b0 = window.b0 ? certifyStage02cWinner(window.b0.result, window.b0.evidence) : null;
    const b1 = window.b1 ? certifyStage02cWinner(window.b1.result, window.b1.evidence) : null;
    const baselineDecision = candidateDecision(w2.baseline, b0?.baseline ?? null,
      b1?.baseline ?? null, window.b0, window.b1);
    const proposedDecision = candidateDecision(w2.selected, b0?.selected ?? null,
      b1?.selected ?? null, window.b0, window.b1);
    const temporalCertified = baselineDecision.triggered !== proposedDecision.triggered
      && window.b0 !== null && window.b1 !== null && b0 !== null && b1 !== null
      && temporalBoundary(evaluated.data, window.index * 2 + 1,
        { evidence: window.b0.evidence, candidate: b0.selected },
        { evidence: window.b1.evidence, candidate: b1.selected });
    const fallBack = baselineDecision.triggered !== proposedDecision.triggered && !temporalCertified;
    const split = fallBack ? baselineDecision.triggered : proposedDecision.triggered;
    const baselinePlan = baselineDecision.triggered && b0 && b1
      ? [plan(b0.baseline, window.index * 2, 1), plan(b1.baseline, window.index * 2 + 1, 1)]
      : [plan(w2.baseline, window.index * 2, 2)];
    let selectedPlan = fallBack
      ? baselinePlan
      : split && b0 && b1
        ? [plan(b0.selected, window.index * 2, 1), plan(b1.selected, window.index * 2 + 1, 1)]
        : [plan(w2.selected, window.index * 2, 2)];
    const halfReasons: ActivationReason[] = [];
    const candidateVisits = [window.w2, window.b0, window.b1]
      .filter((pair): pair is RankedWindowPair => pair !== null)
      .map((pair) => pair.result.candidateVisits);
    let microPartitioned = false;
    let microRejected = false;
    if (!split) {
      const halves = Array.from({ length: 4 }, (_, half) => (
        inspectStage02bHalfBeatState(evaluated.data, window.index * 2 + half / 2)
      ));
      candidateVisits.push(...halves.flatMap((half) => half ? [half.ranking.candidateVisits] : []));
      const complete = halves.every((half) => half !== null && half.coherent);
      if (complete) {
        const states = halves.map((half) => {
          const selected = certifyStage02cWinner(half!.ranking, half!.evidence);
          halfReasons.push(selected.reason);
          return { evidence: half!.evidence, candidate: selected.selected };
        });
        const boundaries = [1, 2, 3].filter((half) => temporalBoundary(evaluated.data,
          window.index * 2 + half / 2, states[half - 1]!, states[half]!));
        if (boundaries.some((half) => half % 2 === 1)) {
          selectedPlan = [...boundaries, 4].map((end, ordinal) => {
            const start = ordinal === 0 ? 0 : boundaries[ordinal - 1]!;
            return plan(states[start]!.candidate, window.index * 2 + start / 2, (end - start) / 2);
          });
          microPartitioned = true;
        } else if (boundaries.length > 0) {
          microRejected = true;
        }
      } else {
        microRejected = true;
      }
    }
    return {
      index: window.index,
      w2: w2.reason, b0: b0?.reason ?? null, b1: b1?.reason ?? null,
      baselineTriggered: baselineDecision.triggered,
      proposedTriggered: proposedDecision.triggered,
      finalTriggered: split,
      temporalCertified,
      microPartitioned, microRejected, halfReasons,
      baselinePlan, selectedPlan, candidateVisits,
    };
  });
  const baselineFinal = smoothStage03bPlannedTimeline(evaluated.data,
    traces.flatMap((trace) => trace.baselinePlan));
  const final = smoothStage03bPlannedTimeline(evaluated.data,
    traces.flatMap((trace) => trace.selectedPlan));
  return { data: evaluated.data, windows: evaluated.windows, traces, baselineFinal, final };
}
