/** P5.40-02b final opt-in Shadow projection. Production Family B/smoothing are unchanged. */
import { normalizePc } from "../../src/domain/chords";
import { defaultPresenceThreshold } from "../../src/domain/midi/qualityEvidence";
import type { MidiSongData, TimedNote } from "../../src/domain/midi/types";
import {
  evaluateStage03bInteractions,
  smoothStage03bPlannedTimeline,
  type PlannedStage03bSpan,
  type ProjectedStage03bSpan,
  type Stage03bWindowInteraction,
} from "../p539/stage03bInteraction";
import type { ShadowRankedCandidate, ShadowRankingResult } from "../p539/shadowCandidateRanking";
import { rankStage02bShadowCandidates } from "./stage02bShadowRanking";

interface HalfBeatState {
  startBeat: number;
  evidencePcs: ReadonlySet<number>;
  ranking: ShadowRankingResult;
  coherent: boolean;
}

export interface Stage02bWindowTrace {
  index: number;
  frozenTriggered: boolean;
  correctedTriggered: boolean;
  guardedTriggered: boolean;
  microPartitioned: boolean;
  preSmoothing: readonly PlannedStage03bSpan[];
  halfBeatRankings: readonly ShadowRankingResult[];
}

function plan(candidate: ShadowRankedCandidate, startBeat: number, durationBeats: number): PlannedStage03bSpan {
  return {
    startBeat, durationBeats,
    identityKey: candidate.identityKey,
    familyC: candidate.generationReason !== "production-base-candidate",
    confidence: Math.max(0, Math.min(1, candidate.score)),
  };
}

function overlapTicks(note: TimedNote, startTick: number, endTick: number): number {
  return Math.max(0, Math.min(note.startTick + note.durationTick, endTick) - Math.max(note.startTick, startTick));
}

function halfBeatState(data: MidiSongData, startBeat: number): HalfBeatState | null {
  const startTick = startBeat * data.ticksPerBeat;
  const endTick = startTick + data.ticksPerBeat / 2;
  const active = data.notes.filter((note) => overlapTicks(note, startTick, endTick) > 0);
  if (active.length === 0) return null;
  const histogram = Array(12).fill(0) as number[];
  for (const note of active) {
    histogram[normalizePc(note.pitch)] += overlapTicks(note, startTick, endTick)
      / data.ticksPerBeat * Math.max(1, note.velocity) / 127;
  }
  const total = histogram.reduce((sum, weight) => sum + weight, 0);
  const evidencePcs = new Set(histogram.flatMap((weight, pc) => (
    total > 0 && weight / total > defaultPresenceThreshold ? [pc] : []
  )));
  const materialNotes = active.filter((note) => evidencePcs.has(normalizePc(note.pitch)));
  if (materialNotes.length === 0) return null;
  const lowest = Math.min(...materialNotes.map((note) => note.pitch));
  const ranking = rankStage02bShadowCandidates({ histogram, bassPitchClass: normalizePc(lowest) });
  const winner = ranking.topCandidate;
  return {
    startBeat,
    evidencePcs,
    ranking,
    coherent: evidencePcs.size >= 3
      && winner.explanation.hitRatio >= 0.85
      && winner.explanation.outsideRatio <= 0.15
      && winner.explanation.missingExpectedTones.length === 0,
  };
}

function symmetricPitchDifference(left: readonly number[], right: readonly number[]): number {
  const a = new Set(left);
  const b = new Set(right);
  return [...a].filter((pc) => !b.has(pc)).length + [...b].filter((pc) => !a.has(pc)).length;
}

function sourceBoundary(data: MidiSongData, prior: HalfBeatState, next: HalfBeatState): boolean {
  const tick = next.startBeat * data.ticksPerBeat;
  const hasOnset = data.notes.some((note) => note.startTick === tick);
  const endedPc = [...prior.evidencePcs].some((pc) => !next.evidencePcs.has(pc));
  const distinctUpper = symmetricPitchDifference(
    prior.ranking.topCandidate.explanation.scoreTemplatePcs,
    next.ranking.topCandidate.explanation.scoreTemplatePcs,
  ) >= 2;
  return hasOnset && endedPc && distinctUpper
    && prior.coherent && next.coherent
    && prior.ranking.topCandidate.identityKey !== next.ranking.topCandidate.identityKey;
}

function halfBeatRefinement(
  data: MidiSongData,
  index: number,
  coarse: PlannedStage03bSpan,
): { spans: readonly PlannedStage03bSpan[]; rankings: readonly ShadowRankingResult[] } {
  const halves = Array.from({ length: 4 }, (_, half) => halfBeatState(data, index * 2 + half / 2));
  const rankings = halves.flatMap((half) => half ? [half.ranking] : []);
  if (halves.some((half) => !half || !half.coherent)) return { spans: [coarse], rankings };
  const states = halves as HalfBeatState[];
  const boundaries = [1, 2, 3].filter((half) => sourceBoundary(data, states[half - 1]!, states[half]!));
  if (boundaries.length === 0) return { spans: [coarse], rankings };
  const spans = [...boundaries, 4].map((endHalf, indexInPlan) => {
    const startHalf = indexInPlan === 0 ? 0 : boundaries[indexInPlan - 1]!;
    return plan(states[startHalf]!.ranking.topCandidate,
      index * 2 + startHalf / 2, (endHalf - startHalf) / 2);
  });
  return { spans, rankings };
}

/** Stable baseline partition guard, then source-onset micro-partition when needed. */
export function evaluateStage02bFinalShadow(bytes: Uint8Array): {
  data: MidiSongData;
  frozen: readonly Stage03bWindowInteraction[];
  corrected: readonly Stage03bWindowInteraction[];
  traces: readonly Stage02bWindowTrace[];
  final: readonly ProjectedStage03bSpan[];
} {
  const frozen = evaluateStage03bInteractions(bytes);
  const corrected = evaluateStage03bInteractions(bytes, rankStage02bShadowCandidates);
  if (JSON.stringify(frozen.data) !== JSON.stringify(corrected.data)) {
    throw new Error("Source evidence changed between Shadow rankers");
  }
  const frozenByIndex = new Map(frozen.windows.map((window) => [window.index, window]));
  const traces = corrected.windows.map((window): Stage02bWindowTrace => {
    const original = frozenByIndex.get(window.index);
    if (!original) throw new Error("Frozen window missing");
    const frozenTriggered = original.expandedDecision.triggered;
    const correctedTriggered = window.expandedDecision.triggered;
    const guardedTriggered = frozenTriggered !== correctedTriggered ? frozenTriggered : correctedTriggered;
    let preSmoothing: readonly PlannedStage03bSpan[];
    if (guardedTriggered) {
      if (!window.b0 || !window.b1) throw new Error("Partition has no local evidence");
      preSmoothing = [
        plan(window.b0.expanded, window.index * 2, 1),
        plan(window.b1.expanded, window.index * 2 + 1, 1),
      ];
    } else {
      const winner = frozenTriggered !== correctedTriggered
        ? original.w2.expanded : window.w2.expanded;
      preSmoothing = [plan(winner, window.index * 2, 2)];
    }
    const refined = guardedTriggered
      ? { spans: preSmoothing, rankings: [] }
      : halfBeatRefinement(corrected.data, window.index, preSmoothing[0]!);
    return {
      index: window.index,
      frozenTriggered, correctedTriggered, guardedTriggered,
      microPartitioned: refined.spans.length > 1,
      preSmoothing: refined.spans,
      halfBeatRankings: refined.rankings,
    };
  });
  const final = smoothStage03bPlannedTimeline(corrected.data,
    traces.flatMap((trace) => trace.preSmoothing));
  return { data: corrected.data, frozen: frozen.windows, corrected: corrected.windows, traces, final };
}
