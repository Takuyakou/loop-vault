/** Stage03b counterfactual only: the frozen 252/276 rankings against Family B v1. */
import { chordPitchSet } from "../../src/domain/midi/candidateDiversity";
import { buildWeightedWindows, inferTrackRoles, smoothTimeline, type WeightedWindow } from "../../src/domain/midi/legacy";
import { parseMidi } from "../../src/domain/midi/parser";
import { detectorQualities } from "../../src/domain/midi/evaluation/metricsV2";
import { beatsPerBar } from "../../src/domain/midi/timing";
import type { MidiSongData } from "../../src/domain/midi/types";
import { evaluateUnionChimeraWindow, type UnionChimeraDecision } from "../../src/domain/midi/unionChimera";
import { selectChordEvidenceNotes } from "../../src/domain/midi/voices";
import { makeChordSymbol } from "../../src/domain/chords";
import type { ChordTimelineItem } from "../../src/domain/types";
import { analyzeUnionChimera } from "../p537/unionChimera";
import {
  rankStage02ShadowCandidates,
  type ShadowRankedCandidate,
  type ShadowRankingEvidence,
  type ShadowRankingResult,
} from "./shadowCandidateRanking";

export type ShadowWindowRanker = (evidence: ShadowRankingEvidence) => ShadowRankingResult;

export interface RankedWindowPair {
  evidence: ShadowRankingEvidence;
  control: ShadowRankedCandidate;
  expanded: ShadowRankedCandidate;
  result: ShadowRankingResult;
}

export interface Stage03bWindowInteraction {
  index: number;
  productionTriggered: boolean;
  controlDecision: UnionChimeraDecision;
  expandedDecision: UnionChimeraDecision;
  w2: RankedWindowPair;
  b0: RankedWindowPair | null;
  b1: RankedWindowPair | null;
}

export interface ProjectedStage03bSpan {
  startBeat: number;
  durationBeats: number;
  identityKey: string;
  familyC: boolean;
}

export interface PlannedStage03bSpan extends ProjectedStage03bSpan {
  confidence: number;
}

export type Stage03bProjectionMode = "control" | "model-a" | "model-b";

function maxIndex(values: readonly number[]): number {
  return values.reduce((best, value, index) => value > values[best] ? index : best, 0);
}

function ranked(window: WeightedWindow | undefined, ranker: ShadowWindowRanker): RankedWindowPair | null {
  if (!window || window.totalWeight <= 0) return null;
  const evidence = {
    histogram: window.histogram,
    bassPitchClass: maxIndex(window.bassHistogram),
  };
  const result = ranker(evidence);
  const control = result.rankedCandidates.find((candidate) => (
    candidate.generationReason === "production-base-candidate"
  ));
  if (!control || result.candidateVisits < 276 || result.candidateVisits > 300) {
    throw new Error("Bounded Shadow ranking or production control unavailable");
  }
  return { evidence, control, expanded: result.topCandidate, result };
}

function pitchClasses(winner: ShadowRankedCandidate): number[] {
  if (winner.productionQuality) {
    return chordPitchSet(makeChordSymbol(winner.identity.rootPitchClass, winner.productionQuality));
  }
  return [...new Set(winner.upperIntervals.map((interval) => (
    (winner.identity.rootPitchClass + interval) % 12
  )))];
}

function pitchClassSet(window: WeightedWindow | undefined): Set<number> {
  return new Set(window?.histogram.flatMap((weight, pc) => weight > 0 ? [pc] : []) ?? []);
}

function decision(
  w2: RankedWindowPair,
  b0: RankedWindowPair | null,
  b1: RankedWindowPair | null,
  b0Window: WeightedWindow | undefined,
  b1Window: WeightedWindow | undefined,
  mode: "control" | "expanded",
): UnionChimeraDecision {
  const winner = w2[mode];
  const beat0 = b0?.[mode];
  const beat1 = b1?.[mode];
  return evaluateUnionChimeraWindow({
    w2WinnerLabel: winner.canonicalLabel,
    w2WinnerRoot: winner.identity.rootPitchClass,
    w2WinnerPcs: pitchClasses(winner),
    b0WinnerLabel: beat0?.canonicalLabel ?? null,
    b0WinnerRoot: beat0?.identity.rootPitchClass ?? null,
    b0Pcs: pitchClassSet(b0Window),
    b0HasEvidence: (b0Window?.totalWeight ?? 0) > 0,
    b1WinnerLabel: beat1?.canonicalLabel ?? null,
    b1WinnerRoot: beat1?.identity.rootPitchClass ?? null,
    b1Pcs: pitchClassSet(b1Window),
    b1HasEvidence: (b1Window?.totalWeight ?? 0) > 0,
  });
}

/** Same weighted W2/B0/B1 evidence, same Family B trigger, fixed Stage02 ranking. */
export function evaluateStage03bInteractions(
  bytes: Uint8Array,
  ranker: ShadowWindowRanker = rankStage02ShadowCandidates,
): {
  data: MidiSongData;
  windows: Stage03bWindowInteraction[];
} {
  const parsed = parseMidi(bytes);
  const data = { ...parsed, notes: selectChordEvidenceNotes(parsed.notes) };
  const roles = inferTrackRoles(data);
  const w2Windows = buildWeightedWindows(data, roles, 2);
  const oneBeatWindows = buildWeightedWindows(data, roles, 1);
  const production = new Map(analyzeUnionChimera(data, roles).windows.map((row) => (
    [row.windowIndex, row.triggered]
  )));
  const windows: Stage03bWindowInteraction[] = [];
  w2Windows.forEach((window, index) => {
    const w2 = ranked(window, ranker);
    if (!w2) return;
    const b0Window = oneBeatWindows[2 * index];
    const b1Window = oneBeatWindows[2 * index + 1];
    const b0 = ranked(b0Window, ranker);
    const b1 = ranked(b1Window, ranker);
    windows.push({
      index,
      productionTriggered: production.get(index) ?? false,
      controlDecision: decision(w2, b0, b1, b0Window, b1Window, "control"),
      expandedDecision: decision(w2, b0, b1, b0Window, b1Window, "expanded"),
      w2,
      b0,
      b1,
    });
  });
  return { data, windows };
}

/**
 * Uses production's exported smoother unchanged. Distinct identities are mapped
 * to distinct existing ChordSymbols solely because the production ChordSymbol
 * cannot encode a Shadow omission; the smoother reads label equality and
 * confidence only. This is an evaluation projection, not a product adapter.
 */
export function projectStage03bTimeline(
  data: MidiSongData,
  windows: readonly Stage03bWindowInteraction[],
  mode: Stage03bProjectionMode,
): ProjectedStage03bSpan[] {
  const selected = mode === "control" ? "control" : "expanded";
  const planned = windows.flatMap((window) => {
    const split = mode === "control"
      ? window.controlDecision.triggered
      : mode === "model-a"
        ? window.expandedDecision.triggered
        : window.productionTriggered;
    const toPlan = (winner: ShadowRankedCandidate, startBeat: number, durationBeats: number) => ({
      startBeat,
      durationBeats,
      identityKey: winner.identityKey,
      familyC: winner.generationReason !== "production-base-candidate",
      confidence: Math.max(0, Math.min(1, winner.score)),
    });
    if (split) {
      if (!window.b0 || !window.b1) throw new Error("Triggered window has no beat evidence");
      return [
        toPlan(window.b0[selected], window.index * 2, 1),
        toPlan(window.b1[selected], window.index * 2 + 1, 1),
      ];
    }
    return [toPlan(window.w2[selected], window.index * 2, 2)];
  });
  return smoothStage03bPlannedTimeline(data, planned);
}

/** Shared evaluation-only adapter into the unchanged production smoother. */
export function smoothStage03bPlannedTimeline(
  data: MidiSongData,
  planned: readonly PlannedStage03bSpan[],
): ProjectedStage03bSpan[] {
  const uniqueKeys = [...new Set(planned.map((span) => span.identityKey))].sort();
  const aliases = Array.from({ length: 12 }, (_, root) => (
    detectorQualities.map((quality) => makeChordSymbol(root, quality))
  )).flat();
  if (uniqueKeys.length > aliases.length || new Set(aliases.map((alias) => alias.label)).size !== aliases.length) {
    throw new Error("Insufficient unique symbolic aliases for Shadow smoothing");
  }
  const keyToAlias = new Map(uniqueKeys.map((key, index) => [key, aliases[index]!]));
  const aliasToKey = new Map(uniqueKeys.map((key, index) => [aliases[index]!.label, key]));
  const familyCByKey = new Map(planned.map((span) => [span.identityKey, span.familyC]));
  const barLength = beatsPerBar(data.timeSignature);
  const items: ChordTimelineItem[] = planned.map((span) => ({
    bar: Math.floor(span.startBeat / barLength) + 1,
    beat: (span.startBeat % barLength) + 1,
    durationBeats: span.durationBeats,
    chord: keyToAlias.get(span.identityKey)!,
    confidence: span.confidence,
    alternatives: [],
    warnings: [],
  }));
  return smoothTimeline(items, barLength).map((item) => {
    const identityKey = aliasToKey.get(item.chord.label);
    if (!identityKey) throw new Error("Shadow alias disappeared during smoothing");
    return {
      startBeat: (item.bar - 1) * barLength + (item.beat - 1),
      durationBeats: item.durationBeats,
      identityKey,
      familyC: familyCByKey.get(identityKey) ?? false,
    };
  });
}

export function projectedStateAt(
  spans: readonly ProjectedStage03bSpan[],
  absoluteBeat: number,
): ProjectedStage03bSpan | null {
  return spans.find((span) => span.startBeat <= absoluteBeat
    && absoluteBeat < span.startBeat + span.durationBeats) ?? null;
}
