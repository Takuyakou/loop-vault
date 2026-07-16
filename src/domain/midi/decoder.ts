import { canonicalChord, type ChordCandidateScore, type ScoredSegment } from "./candidates";

export interface DecoderWeights {
  chordChangePenalty: number;
  weakBeatChangePenalty: number;
  shortSegmentPenalty: number;
  repeatedChordReward: number;
  sameRootReward: number;
  keyPriorWeight: number;
}

export const defaultDecoderWeights: Readonly<DecoderWeights> = {
  chordChangePenalty: 0.12,
  weakBeatChangePenalty: 0.1,
  shortSegmentPenalty: 0.95,
  repeatedChordReward: 0.08,
  sameRootReward: 0.04,
  keyPriorWeight: 0.08,
};

export interface DecodedSegment {
  scored: ScoredSegment;
  candidate: ChordCandidateScore;
  pathScore: number;
}

interface State { endBeat: number; candidate: ChordCandidateScore; score: number; path: DecodedSegment[]; tieKey: string }

export function decodeChordPath(
  scoredSegments: readonly ScoredSegment[], beatsPerBar: number,
  weights: DecoderWeights = defaultDecoderWeights,
  context?: ReadonlyMap<number, string>,
): DecodedSegment[] {
  if (!scoredSegments.length) return [];
  const starts = [...new Set(scoredSegments.map((entry) => entry.segment.startBeat))].sort((a, b) => a - b);
  const firstBeat = starts[0];
  const lastBeat = Math.max(...scoredSegments.map((entry) => entry.segment.endBeat));
  const statesByEnd = new Map<number, State[]>();
  for (const startBeat of starts) {
    const edges = scoredSegments.filter((entry) => sameBeat(entry.segment.startBeat, startBeat));
    const previousStates = sameBeat(startBeat, firstBeat) ? [undefined] : statesByEnd.get(startBeat) ?? [];
    if (!previousStates.length) continue;
    for (const edge of edges) {
      for (const candidate of edge.candidates) {
        for (const previous of previousStates) {
          const score = (previous?.score ?? 0) + edgeScore(edge, candidate, Math.min(beatsPerBar, lastBeat - firstBeat), weights)
            + transitionScore(previous?.candidate, candidate, edge.segment.startBeat, beatsPerBar, weights)
            + (context?.get(edge.segment.startBeat) === canonicalChord(candidate.chord) ? 0.025 : 0);
          const decoded: DecodedSegment = { scored: edge, candidate, pathScore: score };
          const tieKey = `${previous?.tieKey ?? ""}|${edge.segment.endBeat}:${canonicalChord(candidate.chord)}`;
          const state: State = { endBeat: edge.segment.endBeat, candidate, score, path: [...(previous?.path ?? []), decoded], tieKey };
          statesByEnd.set(edge.segment.endBeat, keepBest([...(statesByEnd.get(edge.segment.endBeat) ?? []), state]));
        }
      }
    }
  }
  return (statesByEnd.get(lastBeat) ?? []).sort(compareState)[0]?.path ?? [];
}

export function decodeTwoPass(
  scoredSegments: readonly ScoredSegment[], beatsPerBar: number,
  weights: DecoderWeights = defaultDecoderWeights,
): DecodedSegment[] {
  const provisional = decodeChordPath(scoredSegments, beatsPerBar, weights);
  const context = new Map(provisional.map((entry) => [entry.scored.segment.startBeat, canonicalChord(entry.candidate.chord)]));
  return decodeChordPath(scoredSegments, beatsPerBar, weights, context);
}

export function decodeGreedy(scoredSegments: readonly ScoredSegment[]): DecodedSegment[] {
  if (!scoredSegments.length) return [];
  const lastBeat = Math.max(...scoredSegments.map((entry) => entry.segment.endBeat));
  let beat = Math.min(...scoredSegments.map((entry) => entry.segment.startBeat));
  const path: DecodedSegment[] = [];
  while (beat < lastBeat) {
    const edge = scoredSegments.filter((entry) => sameBeat(entry.segment.startBeat, beat))
      .sort((a, b) => (b.candidates[0]?.totalScore ?? -Infinity) - (a.candidates[0]?.totalScore ?? -Infinity)
        || b.segment.durationBeats - a.segment.durationBeats)[0];
    const candidate = edge?.candidates[0];
    if (!edge || !candidate) break;
    path.push({ scored: edge, candidate, pathScore: candidate.totalScore });
    beat = edge.segment.endBeat;
  }
  return path;
}

function edgeScore(edge: ScoredSegment, candidate: ChordCandidateScore, referenceBeats: number, weights: DecoderWeights): number {
  const shortPenalty = edge.segment.durationBeats < referenceBeats
    ? weights.shortSegmentPenalty * (referenceBeats - edge.segment.durationBeats) / referenceBeats
    : 0;
  return candidate.totalScore + candidate.keyCompatibilityScore * weights.keyPriorWeight
    + (edge.segment.startBoundaryStrength + edge.segment.endBoundaryStrength) * 0.025 - shortPenalty;
}

function transitionScore(
  previous: ChordCandidateScore | undefined, current: ChordCandidateScore,
  startBeat: number, beatsPerBar: number, weights: DecoderWeights,
): number {
  if (!previous) return 0;
  const same = canonicalChord(previous.chord) === canonicalChord(current.chord);
  if (same) return weights.repeatedChordReward;
  const sameRoot = previous.chord.root === current.chord.root;
  const weakBeat = startBeat % beatsPerBar !== 0 && startBeat % 1 !== 0;
  return -weights.chordChangePenalty - (weakBeat ? weights.weakBeatChangePenalty : 0) + (sameRoot ? weights.sameRootReward : 0);
}

function keepBest(states: State[]): State[] {
  const byChord = new Map<string, State>();
  for (const state of states) {
    const key = canonicalChord(state.candidate.chord);
    const previous = byChord.get(key);
    if (!previous || compareState(state, previous) < 0) byChord.set(key, state);
  }
  return [...byChord.values()].sort(compareState).slice(0, 24);
}

function compareState(left: State, right: State): number { return right.score - left.score || left.tieKey.localeCompare(right.tieKey); }
function sameBeat(left: number, right: number): boolean { return Math.abs(left - right) < 1e-6; }
