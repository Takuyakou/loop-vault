import { normalizePc } from "../chords";
import type { ChordTimelineItem, ProgressionBlockCandidate } from "../types";
import {
  buildCandidateEvents, candidateStats, relativeSignature, structuredSignature,
  type CandidateChordEvent, type CandidateChordStats,
} from "./candidateBlock";

/**
 * Pattern / Occurrence model.
 *
 * The same progression usually appears several times in a song. Dedup collapsed
 * those into one candidate, so a user who wanted the second chorus rather than
 * the first had no way to reach it: the other positions were not ranked lower,
 * they were gone.
 *
 * Occurrences are the unit that generation, selection and coverage work on.
 * Grouping into Patterns happens afterwards and is presentational — it never
 * removes an occurrence, and every occurrence keeps its own absolute chords,
 * voicing and bar position so it can be auditioned and saved on its own.
 */

export interface CandidateOccurrence {
  id: string;
  startBar: number;
  endBar: number;
  startBeat: number;
  endBeat: number;
  lengthBars: number;
  events: CandidateChordEvent[];
  stats: CandidateChordStats;
  /** Exact position and chords: differs between occurrences of one pattern. */
  structuredSignature: string;
  /** Shape without absolute pitch: shared by transposed repeats. */
  relativeSignature: string;
  score: number;
  warnings: string[];
  /** Semitones this occurrence sits above the pattern's representative. */
  transposeOffset: number;
  sectionIds: string[];
  sourceCandidateId?: string;
}

export interface CandidatePattern {
  patternId: string;
  /** Transposition-invariant identity shared by every occurrence. */
  normalizedProgressionIdentity: string;
  occurrences: CandidateOccurrence[];
  representativeOccurrenceId: string;
}

function beatsOf(startBar: number, lengthBars: number, beatsPerBar: number) {
  const startBeat = (startBar - 1) * beatsPerBar;
  return { startBeat, endBeat: startBeat + lengthBars * beatsPerBar };
}

/**
 * Every window of the requested lengths, as occurrences.
 *
 * Nothing is removed here. Two windows with identical structure both survive;
 * deciding which to show is selection's job, not generation's.
 */
export function buildOccurrences(
  timeline: readonly ChordTimelineItem[],
  totalBars: number,
  options: {
    beatsPerBar?: number;
    lengths?: readonly number[];
    rawMatchScores?: readonly number[];
    scoreOf?: (events: readonly CandidateChordEvent[], lengthBars: number, repeatCount: number) => number;
  } = {},
): CandidateOccurrence[] {
  const beatsPerBar = options.beatsPerBar ?? 4;
  const lengths = options.lengths ?? [2, 4, 8, 16];
  const occurrences: CandidateOccurrence[] = [];

  for (const lengthBars of lengths) {
    if (totalBars < lengthBars) continue;
    for (let startBar = 1; startBar <= totalBars - lengthBars + 1; startBar += 1) {
      const events = buildCandidateEvents(
        timeline, startBar, lengthBars, beatsPerBar, options.rawMatchScores,
      );
      if (events.length === 0) continue;
      const { startBeat, endBeat } = beatsOf(startBar, lengthBars, beatsPerBar);
      occurrences.push({
        id: `occ-${startBar}-${startBar + lengthBars - 1}`,
        startBar,
        endBar: startBar + lengthBars - 1,
        startBeat,
        endBeat,
        lengthBars,
        events,
        stats: candidateStats(events, lengthBars),
        structuredSignature: structuredSignature(events),
        relativeSignature: relativeSignature(events),
        score: 0,
        warnings: [...new Set(events.flatMap((event) => event.warnings))],
        transposeOffset: 0,
        sectionIds: [],
      });
    }
  }

  return occurrences;
}

/**
 * Occurrences scored the way the product scores candidates.
 *
 * Uses the same evidence normalisation, repeat counting and block quality as
 * `extractBlockCandidates`, so a score here is comparable with the recorded
 * baseline. Scoring occurrences differently would make every quality
 * comparison against that baseline meaningless.
 */
export function scoreOccurrences(
  occurrences: readonly CandidateOccurrence[],
  options: {
    beatsPerBar: number;
    rawMatchScores: readonly number[];
    normaliseEvidence: (value: number) => number;
    scoreBlockQuality: (
      events: readonly CandidateChordEvent[],
      settings: { repeatCount: number; beatsPerBar: number; normaliseEvidence: (value: number) => number },
    ) => { total: number };
  },
): CandidateOccurrence[] {
  // Repeat counts come from the structured signature, the same identity the
  // product uses, so a progression that recurs is credited once per length.
  const repeatCounts = new Map<string, number>();
  for (const occurrence of occurrences) {
    const key = `${occurrence.lengthBars}:${occurrence.structuredSignature}`;
    repeatCounts.set(key, (repeatCounts.get(key) ?? 0) + 1);
  }

  return occurrences.map((occurrence) => ({
    ...occurrence,
    score: options.scoreBlockQuality(occurrence.events, {
      repeatCount: repeatCounts.get(`${occurrence.lengthBars}:${occurrence.structuredSignature}`) ?? 1,
      beatsPerBar: options.beatsPerBar,
      normaliseEvidence: options.normaliseEvidence,
    }).total,
  }));
}

/**
 * Groups occurrences that share a shape, keeping every one of them.
 *
 * The representative is the earliest occurrence, so a pattern's identity is
 * stable regardless of which occurrence ranked highest. `transposeOffset`
 * records how far each occurrence sits from that representative, which is what
 * lets the UI say "same progression, up a tone" without losing the real chords.
 */
export function groupIntoPatterns(
  occurrences: readonly CandidateOccurrence[],
): CandidatePattern[] {
  const byIdentity = new Map<string, CandidateOccurrence[]>();
  for (const occurrence of occurrences) {
    const group = byIdentity.get(occurrence.relativeSignature) ?? [];
    group.push(occurrence);
    byIdentity.set(occurrence.relativeSignature, group);
  }

  return [...byIdentity]
    .map(([identity, group]) => {
      const ordered = [...group].sort(
        (left, right) => left.startBar - right.startBar || left.lengthBars - right.lengthBars,
      );
      const representative = ordered[0];
      const referenceRoot = representative.events[0]?.chord.root ?? 0;
      return {
        patternId: `pattern-${representative.id}`,
        normalizedProgressionIdentity: identity,
        representativeOccurrenceId: representative.id,
        occurrences: ordered.map((occurrence) => ({
          ...occurrence,
          transposeOffset: occurrence.events[0]
            ? normalizePc(occurrence.events[0].chord.root - referenceRoot)
            : 0,
        })),
      };
    })
    .sort((left, right) => left.representativeOccurrenceId.localeCompare(right.representativeOccurrenceId));
}

/** Occurrences of the same shape as the given one, including itself. */
export function siblingOccurrences(
  patterns: readonly CandidatePattern[],
  occurrenceId: string,
): CandidateOccurrence[] {
  const pattern = patterns.find(
    (candidate) => candidate.occurrences.some((occurrence) => occurrence.id === occurrenceId),
  );
  return pattern ? pattern.occurrences : [];
}

/**
 * Bars reachable from a selection once patterns are taken into account.
 *
 * A selected occurrence makes its siblings reachable in the UI, so coverage
 * should credit them: the user can get to the second chorus from the card that
 * shows the first.
 */
export function groupedReachableOccurrences(
  patterns: readonly CandidatePattern[],
  selectedIds: readonly string[],
): CandidateOccurrence[] {
  const selected = new Set(selectedIds);
  const reachable = new Map<string, CandidateOccurrence>();
  for (const pattern of patterns) {
    if (!pattern.occurrences.some((occurrence) => selected.has(occurrence.id))) continue;
    for (const occurrence of pattern.occurrences) reachable.set(occurrence.id, occurrence);
  }
  return [...reachable.values()].sort(
    (left, right) => left.startBar - right.startBar || left.lengthBars - right.lengthBars,
  );
}

/** Adapts an occurrence to the existing candidate shape for save and playback. */
export function occurrenceToCandidate(
  occurrence: CandidateOccurrence,
  summaryText: string,
  labels: string[] = [],
  kind?: ProgressionBlockCandidate["kind"],
): ProgressionBlockCandidate {
  return {
    id: occurrence.id,
    startBar: occurrence.startBar,
    endBar: occurrence.endBar,
    lengthBars: occurrence.lengthBars as ProgressionBlockCandidate["lengthBars"],
    chords: occurrence.events.map((event) => event.source),
    events: occurrence.events,
    stats: occurrence.stats,
    structuredSignature: occurrence.structuredSignature,
    summaryText,
    confidence: occurrence.events.length
      ? Number((occurrence.events.reduce((sum, event) => sum + event.confidence, 0)
        / occurrence.events.length).toFixed(4))
      : 0,
    selectionScore: occurrence.score,
    labels,
    ...(kind ? { kind } : {}),
    warnings: occurrence.warnings,
  };
}
