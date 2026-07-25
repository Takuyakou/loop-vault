import type { ChordTimelineItem, ProgressionBlockCandidate } from "../types";
import { normaliseEvidence, scoreBlockQuality } from "./blockQuality";
import { recoverRawMatchScore, summaryFromEvents } from "./candidateBlock";
import { selectOccurrencesByCoverage, type CoverageSelectionOptions } from "./coverageSelector";
import { buildPatternCandidates } from "./patternCandidate";
import { selectPatternsByCoverage, type PatternSelectionOptions } from "./patternSelection";
import {
  buildOccurrences, groupIntoPatterns, occurrenceToCandidate, scoreOccurrences,
  type CandidatePattern,
} from "./occurrence";
import type { MidiSongData } from "./types";
import { beatsPerBar } from "./timing";
import { selectChordEvidenceNotes } from "./voices";

/**
 * Candidate list built to cover the song rather than to rank it.
 *
 * Wraps occurrence generation, scoring, coverage selection and pattern grouping
 * into the shape the rest of the app already consumes, so the selector can be
 * evaluated and promoted without the UI or the save path changing.
 */

export interface CoverageCandidateResult {
  candidates: ProgressionBlockCandidate[];
  patterns: CandidatePattern[];
  harmonicActiveBars: number[];
  coverage: number;
  coverageAtVisible: number;
  longestUncoveredRun: number;
  uncoveredBars: number[];
  stoppedBecause: string;
}

/**
 * Bars carrying harmony, using the same evidence selection as the analyzer.
 *
 * Silent and percussion-only bars are excluded: a candidate cannot meaningfully
 * cover a bar with no harmony, and counting them would make coverage
 * unreachable by construction.
 */
export function harmonicActiveBars(data: MidiSongData, totalBars: number): number[] {
  const meter = beatsPerBar(data.timeSignature);
  const evidence = selectChordEvidenceNotes(data.notes);
  const bars: number[] = [];
  for (let bar = 1; bar <= totalBars; bar += 1) {
    const startTick = (bar - 1) * meter * data.ticksPerBeat;
    const endTick = bar * meter * data.ticksPerBeat;
    const sounding = evidence.some(
      (note) => note.startTick < endTick && note.startTick + note.durationTick > startTick,
    );
    if (sounding) bars.push(bar);
  }
  return bars;
}

/**
 * Candidate list built one card per pattern.
 *
 * Occurrences still carry the evidence and the score; the difference is that a
 * display slot is spent on a pattern, so the same progression cannot occupy two
 * of them. The occurrence list behind each card is unchanged, so nothing becomes
 * unreachable — the second chorus is still one click away, it just no longer
 * costs a slot of its own.
 */
export function buildPatternCoverageCandidates(
  timeline: readonly ChordTimelineItem[],
  data: MidiSongData,
  totalBars: number,
  rankingScores: readonly number[] | undefined,
  options: Partial<PatternSelectionOptions> = {},
): CoverageCandidateResult {
  const meter = beatsPerBar(data.timeSignature);
  const rawMatchScores = rankingScores
    ? rankingScores.map(recoverRawMatchScore)
    : timeline.map((item) => item.confidence);
  const normalise = normaliseEvidence(rawMatchScores);

  const occurrences = scoreOccurrences(
    buildOccurrences(timeline, totalBars, { beatsPerBar: meter, rawMatchScores }),
    { beatsPerBar: meter, rawMatchScores, normaliseEvidence: normalise, scoreBlockQuality },
  );

  const active = harmonicActiveBars(data, totalBars);
  const patterns = groupIntoPatterns(occurrences);
  const patternCandidates = buildPatternCandidates(patterns, active);
  const selection = selectPatternsByCoverage(patternCandidates, {
    harmonicActiveBars: active,
    ...options,
  });

  return {
    candidates: selection.selected.map((pattern) => occurrenceToCandidate(
      pattern.representative,
      summaryFromEvents(pattern.representative.events, pattern.representative.lengthBars, meter),
      pattern.representative.stats.densityClass === "vamp" ? ["variation"] : ["main"],
    )),
    patterns,
    harmonicActiveBars: active,
    coverage: selection.coverage,
    coverageAtVisible: selection.coverageAtVisible,
    longestUncoveredRun: selection.longestUncoveredRun,
    uncoveredBars: selection.uncoveredBars,
    stoppedBecause: selection.stoppedBecause,
  };
}

export function buildCoverageCandidates(
  timeline: readonly ChordTimelineItem[],
  data: MidiSongData,
  totalBars: number,
  rankingScores: readonly number[] | undefined,
  options: Partial<CoverageSelectionOptions> = {},
): CoverageCandidateResult {
  const meter = beatsPerBar(data.timeSignature);
  const rawMatchScores = rankingScores
    ? rankingScores.map(recoverRawMatchScore)
    : timeline.map((item) => item.confidence);
  const normalise = normaliseEvidence(rawMatchScores);

  const occurrences = scoreOccurrences(
    buildOccurrences(timeline, totalBars, { beatsPerBar: meter, rawMatchScores }),
    { beatsPerBar: meter, rawMatchScores, normaliseEvidence: normalise, scoreBlockQuality },
  );

  const active = harmonicActiveBars(data, totalBars);
  const selection = selectOccurrencesByCoverage(occurrences, {
    harmonicActiveBars: active,
    ...options,
  });

  // Grouping runs over every occurrence, not just the selected ones, so a card
  // can offer the other appearances of a progression the user picked.
  const patterns = groupIntoPatterns(occurrences);

  return {
    candidates: selection.selected.map((occurrence) => occurrenceToCandidate(
      occurrence,
      summaryFromEvents(occurrence.events, occurrence.lengthBars, meter),
      occurrence.stats.densityClass === "vamp" ? ["variation"] : ["main"],
    )),
    patterns,
    harmonicActiveBars: active,
    coverage: selection.coverage,
    coverageAtVisible: selection.coverageAtVisible,
    longestUncoveredRun: selection.longestUncoveredRun,
    uncoveredBars: selection.uncoveredBars,
    stoppedBecause: selection.stoppedBecause,
  };
}
