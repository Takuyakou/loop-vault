import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chordIdentityKey, normalizeChordLabel, normalizeChordSymbol } from "../src/domain/chordIdentity";
import type { ChordTimelineItem } from "../src/domain/types";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { normaliseEvidence, scoreBlockQuality } from "../src/domain/midi/blockQuality";
import { recoverRawMatchScore } from "../src/domain/midi/candidateBlock";
import { detectExtractionProfile } from "../src/domain/midi/extractionProfile";
import { selectOccurrencesByCoverage } from "../src/domain/midi/coverageSelector";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import { analyzeMidiWithRankingScores, inferTrackRoles } from "../src/domain/midi/legacy";
import {
  buildOccurrences, groupIntoPatterns, scoreOccurrences,
  type CandidateOccurrence, type CandidatePattern,
} from "../src/domain/midi/occurrence";
import { parseMidi } from "../src/domain/midi/parser";
import { phase4QualityEvidence } from "../src/domain/midi/phase4Analyzer";
import { beatsPerBar } from "../src/domain/midi/timing";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";
import { evaluateSegmentation } from "../src/domain/midi/sections";
import { structuralWindows } from "../src/domain/midi/structuralWindows";
import { selectChordEvidenceNotes } from "../src/domain/midi/voices";
import { attachSourceVoicings } from "../src/domain/voicing/sourceVoicing";
import {
  deriveRankConstraintGroups, evaluateRankConstraintGroups, loadContractAmendments,
  type GroupSatisfaction,
} from "./goldContract";

/**
 * Contract amendments, loaded once.
 *
 * Only S23 is amended today, and only because its rank constraint was
 * unsatisfiable by construction; see docs/phase4.1.2/00-gold-contract-audit.md.
 */
const amendments = loadContractAmendments();

/**
 * Synthetic Gold Corpus v1 evaluation.
 *
 * Everything measured here goes through the product's own public functions with
 * the product's own settings. The corpus is gold by construction, so a mismatch
 * localises to a stage rather than to a taste judgement — but only if the
 * measurement path is the shipped one. Reimplementing the pipeline would let a
 * harness bug masquerade as a product defect, which is how the P4.1-07
 * validation ran with the wrong quality-evidence constants.
 *
 * No MIDI bytes, absolute paths or corpus file names leave this module: callers
 * receive scenario ids, variant names and content fingerprints.
 */

export const VISIBLE_CARD_LIMIT = 10;

/** The five stages a candidate passes through, plus the four before it. */
export type LossStage =
  | "parse"
  | "role-extraction-profile"
  | "timeline-chord-label"
  | "event-boundary"
  | "candidate-generation"
  | "candidate-scoring"
  | "selection-objective"
  | "pattern-grouping"
  | "ui-projection";

export type CandidateKind = "progression" | "vamp" | "fragment";

export interface GoldEvent {
  eventIndex: number;
  startBeatAbsolute: number;
  durationBeats: number;
  startBar: number;
  endBeatAbsolute: number;
  primary: string;
  acceptableAlternatives: string[];
  rootPitchClass: number;
  bassPitchClass: number;
  intendedVoicingMidi: number[];
  pitchClasses: number[];
  confidence: string;
  sectionId: string | null;
  /**
   * Two gold rows claimed this exact span with different chords.
   *
   * Both readings are accepted and the span is left out of the exact-match
   * denominators. Picking a winner would mean deciding the ambiguity from the
   * detector's output, which is the one thing an audit must not do. See
   * docs/phase4.1.2/00-gold-contract-amendments.json.
   */
  ambiguousSpan?: boolean;
}

/**
 * Collapses gold rows that claim the same span.
 *
 * S23 carries ten such pairs per variant. Left alone they make one product chord
 * answer two contradictory expectations, which reads as a detector defect and is
 * not one.
 */
export function normalizeGoldEvents(events: readonly GoldEvent[]): GoldEvent[] {
  const bySpan = new Map<string, GoldEvent[]>();
  for (const event of events) {
    const key = `${event.startBeatAbsolute}:${event.endBeatAbsolute}`;
    const group = bySpan.get(key) ?? [];
    group.push(event);
    bySpan.set(key, group);
  }

  return [...bySpan.values()]
    .map((group) => {
      if (group.length === 1) return group[0];
      const [first, ...rest] = group;
      return {
        ...first,
        ambiguousSpan: true,
        acceptableAlternatives: [
          ...new Set([...first.acceptableAlternatives, ...rest.flatMap(
            (event) => [event.primary, ...event.acceptableAlternatives],
          )]),
        ],
      };
    })
    .sort((left, right) => left.startBeatAbsolute - right.startBeatAbsolute);
}

export interface GoldBlock {
  id: string;
  start_bar: number;
  end_bar: number;
  block_type: CandidateKind;
  usefulness: "must-show" | "secondary" | "exclude-from-main";
  chord_sequence: string[];
  pattern_id: string;
  expected_main_lane: boolean;
  rank_constraint: "top3" | "top10" | "after-progressions" | "other";
  notes: string;
}

export interface GoldPattern {
  pattern_id: string;
  normalized_description: string;
  expected_card_count: number;
  occurrences: { startBar: number; endBar: number }[];
  merge_policy: "merge" | "separate";
  notes: string;
}

export interface GoldVariant {
  fileName: string;
  sha256: string;
  bytes: number;
  variant: "clean" | "stress";
  events: GoldEvent[];
}

export interface GoldScenario {
  scenarioId: string;
  title: string;
  bars: number;
  bpm: number;
  split: "dev" | "validation" | "holdout";
  tags: string[];
  stressFeatures: string[];
  boundaryToleranceBeats: number;
  expectedInvariants: string[];
  sections: { id: string; startBar: number; endBar: number }[];
  expectedBlocks: GoldBlock[];
  expectedPatterns: GoldPattern[];
  variants: GoldVariant[];
}

export interface Corpus {
  root: string;
  generatorVersion: string;
  ppq: number;
  limitations: string[];
  scenarios: GoldScenario[];
  splits: Record<string, string[]>;
}

export function loadCorpus(root: string): Corpus {
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  const splits = JSON.parse(readFileSync(resolve(root, "splits.json"), "utf8"));
  return {
    root,
    generatorVersion: manifest.generatorVersion,
    ppq: manifest.ppq,
    limitations: manifest.limitations,
    scenarios: manifest.scenarios,
    splits,
  };
}

/**
 * Candidate classification.
 *
 * `uniqueChordCount` is built from `identityKey`, the canonical identity, so a
 * spelling difference never counts as a chord change. The rule is used to route
 * a candidate to a lane and to compare against the gold `block_type`; it is
 * deliberately not fed back into any score.
 */
export function classifyCandidate(occurrence: CandidateOccurrence): CandidateKind {
  const { uniqueChordCount, harmonicChangeCount } = occurrence.stats;
  if (uniqueChordCount <= 1) return "vamp";
  if (occurrence.lengthBars >= 4 && uniqueChordCount >= 2 && harmonicChangeCount >= 1) {
    return "progression";
  }
  return "fragment";
}

function startBeatOf(item: ChordTimelineItem, meter: number): number {
  return (item.bar - 1) * meter + item.beat - 1;
}

const pitchClassOfNote: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/**
 * Gold-side label reader.
 *
 * The corpus writes a few chords in a notation the product never emits —
 * `E11(no3)`, `A7#5` — so `normalizeChordLabel` returns null for them. Those are
 * acceptable *alternatives*, and scoring them as unreadable would report the
 * product as getting a root wrong when it in fact chose one of the readings the
 * corpus allows.
 *
 * This translates only the gold notation. The product's canonical contract is
 * untouched: nothing here is used to judge what the product may emit, only to
 * understand what the corpus said was acceptable.
 */
export function parseGoldLabel(label: string) {
  const direct = normalizeChordLabel(label);
  if (direct) return direct;

  const trimmed = label.trim();
  // `X11(no3)`: eleventh chord with the third deliberately omitted, so the triad
  // is genuinely undetermined rather than major or minor.
  const noThird = /^([A-G](?:#|b)?)(?:11)\(no3\)$/.exec(trimmed);
  if (noThird) {
    const root = pitchClassOfNote[noThird[1][0]] + (noThird[1][1] === "#" ? 1 : noThird[1][1] === "b" ? -1 : 0);
    return {
      rootPitchClass: ((root % 12) + 12) % 12,
      triad: "unknown" as const,
      seventh: "minor7" as const,
      extensions: [9, 11],
      alterations: [],
    };
  }
  // `X7#5`: dominant seventh with a raised fifth.
  const sharpFive = /^([A-G](?:#|b)?)7#5$/.exec(trimmed);
  if (sharpFive) {
    const root = pitchClassOfNote[sharpFive[1][0]] + (sharpFive[1][1] === "#" ? 1 : sharpFive[1][1] === "b" ? -1 : 0);
    return {
      rootPitchClass: ((root % 12) + 12) % 12,
      triad: "augmented" as const,
      seventh: "minor7" as const,
      extensions: [],
      alterations: ["#5"],
    };
  }
  return null;
}

export interface TimelineMetrics {
  goldEvents: number;
  /** Gold labels this harness cannot canonicalise; excluded from label metrics. */
  goldLabelUnparseable: number;
  /** Gold N.C. events; scored as correct when the product emits no chord there. */
  goldNoChordEvents: number;
  /** Spans two gold rows claimed with different chords; excluded from exact match. */
  goldAmbiguousSpans: number;
  /**
   * Gold onsets that repeat the previous chord's identity.
   *
   * Excluded from the onset metric: merging consecutive identical chords into one
   * event is intended behaviour, so charging the missing second onset would
   * report a feature as a boundary defect.
   */
  goldRepeatOnsets: number;
  sampledEvents: number;
  rootAccuracy: number;
  /**
   * Root agreement allowing any reading the corpus lists as acceptable.
   *
   * `rootAccuracy` alone treats a documented alternative as a wrong root, which
   * on the slash/pedal scenario reports 25% for a detector that picked one of the
   * corpus's own permitted readings every time.
   */
  rootAccuracyAgainstAnyAcceptable: number;
  triadAccuracy: number;
  seventhAccuracy: number;
  slashBassAccuracy: number;
  canonicalExact: number;
  acceptableAlternativeMatch: number;
  boundaryMatchWithinTolerance: number;
  averageStartBoundaryErrorBeats: number;
  averageEndBoundaryErrorBeats: number;
  mismatches: Array<{
    eventIndex: number;
    startBar: number;
    expected: string;
    acceptable: string[];
    got: string | null;
    rootMatch: boolean;
    rootMatchAgainstAcceptable: boolean;
    triadMatch: boolean;
    seventhMatch: boolean;
    bassMatch: boolean;
  }>;
}

/**
 * Timeline accuracy, sampled at the middle of each gold event.
 *
 * The midpoint is used rather than the onset so that a boundary landing a
 * fraction of a beat late is scored by `boundaryMatchWithinTolerance` instead of
 * corrupting every label metric — the two failures have different causes and
 * different fixes.
 */
export function evaluateTimeline(
  timeline: readonly ChordTimelineItem[],
  rawGold: readonly GoldEvent[],
  meter: number,
  toleranceBeats: number,
): TimelineMetrics {
  const gold = normalizeGoldEvents(rawGold);
  const productStarts = timeline.map((item) => startBeatOf(item, meter));
  const productEnds = timeline.map((item, index) => productStarts[index] + item.durationBeats);

  let unparseable = 0;
  let noChordEvents = 0;
  let ambiguousSpans = 0;
  let repeatOnsets = 0;
  let sampled = 0;
  let rootHit = 0;
  let rootAnyHit = 0;
  let triadHit = 0;
  let seventhHit = 0;
  let bassHit = 0;
  let exactHit = 0;
  let alternativeHit = 0;
  let boundaryHit = 0;
  let boundaryDenominator = 0;
  let labelDenominator = 0;
  const startErrors: number[] = [];
  const endErrors: number[] = [];
  const mismatches: TimelineMetrics["mismatches"] = [];

  gold.forEach((event, goldIndex) => {
    const midpoint = (event.startBeatAbsolute + event.endBeatAbsolute) / 2;
    const index = timeline.findIndex(
      (_, position) => productStarts[position] <= midpoint && productEnds[position] > midpoint,
    );
    const item = index >= 0 ? timeline[index] : undefined;
    const isNoChord = event.primary.trim().toUpperCase().startsWith("N.C");

    // Repeats of the previous gold chord have no onset of their own to find: the
    // detector merges them on purpose. They are excluded rather than failed.
    const previous = goldIndex > 0 ? gold[goldIndex - 1] : undefined;
    const repeatsPrevious = previous !== undefined
      && previous.primary === event.primary
      && Math.abs(previous.endBeatAbsolute - event.startBeatAbsolute) < 1e-6;
    if (repeatsPrevious) repeatOnsets += 1;

    if (!isNoChord && !repeatsPrevious) {
      boundaryDenominator += 1;
      const nearestStart = productStarts.length
        ? productStarts.reduce(
          (best, value) => (Math.abs(value - event.startBeatAbsolute) < Math.abs(best - event.startBeatAbsolute)
            ? value
            : best),
          productStarts[0],
        )
        : Number.NaN;
      if (Number.isFinite(nearestStart)) {
        const error = Math.abs(nearestStart - event.startBeatAbsolute);
        startErrors.push(error);
        if (error <= toleranceBeats) boundaryHit += 1;
      }
      const nearestEnd = productEnds.length
        ? productEnds.reduce(
          (best, value) => (Math.abs(value - event.endBeatAbsolute) < Math.abs(best - event.endBeatAbsolute)
            ? value
            : best),
          productEnds[0],
        )
        : Number.NaN;
      if (Number.isFinite(nearestEnd)) endErrors.push(Math.abs(nearestEnd - event.endBeatAbsolute));
    }

    // A gold rest is satisfied by the absence of a chord. Loop Vault represents
    // silence by emitting no timeline event rather than an explicit N.C. item, so
    // requiring one would report a notation difference as a detection failure.
    if (isNoChord) {
      noChordEvents += 1;
      if (!item) return;
      mismatches.push({
        eventIndex: event.eventIndex,
        startBar: event.startBar,
        expected: event.primary,
        acceptable: event.acceptableAlternatives,
        got: item.chord.label,
        rootMatch: false,
        rootMatchAgainstAcceptable: false,
        triadMatch: false,
        seventhMatch: false,
        bassMatch: false,
      });
      return;
    }

    if (!item) {
      mismatches.push({
        eventIndex: event.eventIndex,
        startBar: event.startBar,
        expected: event.primary,
        acceptable: event.acceptableAlternatives,
        got: null,
        rootMatch: false,
        rootMatchAgainstAcceptable: false,
        triadMatch: false,
        seventhMatch: false,
        bassMatch: false,
      });
      return;
    }
    sampled += 1;

    const got = normalizeChordSymbol(item.chord);
    // Root and bass come from the manifest as pitch classes, so they are
    // comparable even for the labels this harness cannot canonicalise.
    const rootMatch = got.rootPitchClass === event.rootPitchClass;
    const expectedBass = event.bassPitchClass === event.rootPitchClass
      ? undefined
      : event.bassPitchClass;
    const bassMatch = (expectedBass ?? -1) === (got.bassPitchClass ?? -1);
    if (rootMatch) rootHit += 1;
    if (bassMatch) bassHit += 1;

    const readings = [event.primary, ...event.acceptableAlternatives]
      .map(parseGoldLabel)
      .filter((identity): identity is NonNullable<typeof identity> => identity !== null);
    const rootMatchAgainstAcceptable = readings.some(
      (reading) => reading.rootPitchClass === got.rootPitchClass,
    );
    if (rootMatchAgainstAcceptable) rootAnyHit += 1;
    if (readings.map(chordIdentityKey).includes(chordIdentityKey(got))) alternativeHit += 1;

    // An ambiguous span has two contradictory gold rows. Matching either reading
    // is credited; the span is kept out of the exact-match denominators because
    // there is no single correct answer to be exact about.
    if (event.ambiguousSpan) {
      ambiguousSpans += 1;
      if (!rootMatchAgainstAcceptable) {
        mismatches.push({
          eventIndex: event.eventIndex,
          startBar: event.startBar,
          expected: `${event.primary} (ambiguous span)`,
          acceptable: event.acceptableAlternatives,
          got: item.chord.label,
          rootMatch,
          rootMatchAgainstAcceptable,
          triadMatch: false,
          seventhMatch: false,
          bassMatch,
        });
      }
      return;
    }

    const expected = normalizeChordLabel(event.primary);
    if (!expected) {
      unparseable += 1;
      if (!rootMatchAgainstAcceptable || !bassMatch) {
        mismatches.push({
          eventIndex: event.eventIndex,
          startBar: event.startBar,
          expected: event.primary,
          acceptable: event.acceptableAlternatives,
          got: item.chord.label,
          rootMatch,
          rootMatchAgainstAcceptable,
          triadMatch: false,
          seventhMatch: false,
          bassMatch,
        });
      }
      return;
    }
    labelDenominator += 1;

    const triadMatch = got.triad === expected.triad;
    const seventhMatch = (got.seventh ?? "-") === (expected.seventh ?? "-");
    const exact = chordIdentityKey(got) === chordIdentityKey(expected);
    if (triadMatch) triadHit += 1;
    if (seventhMatch) seventhHit += 1;
    if (exact) exactHit += 1;

    if (!exact) {
      mismatches.push({
        eventIndex: event.eventIndex,
        startBar: event.startBar,
        expected: event.primary,
        acceptable: event.acceptableAlternatives,
        got: item.chord.label,
        rootMatch,
        rootMatchAgainstAcceptable,
        triadMatch,
        seventhMatch,
        bassMatch,
      });
    }
  });

  const ratio = (hit: number, total: number) => (total === 0 ? 0 : Number((hit / total).toFixed(6)));
  const mean = (values: number[]) => (values.length === 0
    ? 0
    : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)));

  return {
    goldEvents: gold.length,
    goldLabelUnparseable: unparseable,
    goldNoChordEvents: noChordEvents,
    goldAmbiguousSpans: ambiguousSpans,
    goldRepeatOnsets: repeatOnsets,
    sampledEvents: sampled,
    rootAccuracy: ratio(rootHit, sampled),
    rootAccuracyAgainstAnyAcceptable: ratio(rootAnyHit, sampled),
    triadAccuracy: ratio(triadHit, labelDenominator),
    seventhAccuracy: ratio(seventhHit, labelDenominator),
    slashBassAccuracy: ratio(bassHit, sampled),
    canonicalExact: ratio(exactHit, labelDenominator),
    acceptableAlternativeMatch: ratio(alternativeHit, sampled),
    boundaryMatchWithinTolerance: ratio(boundaryHit, boundaryDenominator),
    averageStartBoundaryErrorBeats: mean(startErrors),
    averageEndBoundaryErrorBeats: mean(endErrors),
    mismatches: mismatches.slice(0, 40),
  };
}

export interface StageTrace {
  parsedNotes: number;
  parsedTracks: number;
  drumTracks: number;
  extractionProfileFired: boolean;
  harmonyTracks: number;
  bassTracks: number;
  melodyTracks: number;
  timelineEvents: number;
  generatedOccurrences: number;
  scoredOccurrences: number;
  eligibleAfterQualityFloor: number;
  selectedCandidates: number;
  groupedPatterns: number;
  visibleCards: number;
  patternModelAvailable: boolean;
}

export interface CardRow {
  visibleCardIndex: number;
  occurrenceId: string | null;
  sourceCandidateId: string;
  patternId: string | null;
  normalizedProgressionIdentity: string | null;
  startBar: number;
  endBar: number;
  startBeat: number;
  endBeat: number;
  barLength: number;
  chordEventCount: number;
  uniqueCanonicalChordCount: number;
  candidateType: CandidateKind | null;
  qualityScore: number | null;
  rankingScore: number | null;
  marginalCoverage: number | null;
  selectionUtility: number | null;
  selectedRank: number;
  occurrenceCount: number;
  chordLabels: string[];
}

export interface GenerationMetrics {
  mustShowBlocks: number;
  mustShowBlockRecall: number;
  /** Same quantity under the P4.1.2 name, so gate files read unambiguously. */
  mustShowGeneratedRecall: number;
  progressionBlockRecall: number;
  vampBlockRecall: number;
  fragmentFalsePromotionRate: number;
  candidateGenerationLoss: number;
  classificationAgreement: number;
  unmatchedMustShowBlocks: Array<{ id: string; startBar: number; endBar: number; blockType: string }>;
}

export interface SelectionMetrics {
  /**
   * Reachable anywhere in the selected list, before the visible cut.
   *
   * This is the metric that separates the two failures the coverage gates could
   * not tell apart: a must-show block that is generated but never selected is a
   * different defect from one that is selected and ranked eleventh.
   */
  mustShowSelectedRecall: number;
  /**
   * Selected recall counting only blocks the generator actually produced.
   *
   * Without this the selector is blamed for windows it was never offered: L04's
   * 14-bar section cannot be selected because it cannot be generated, and that is
   * Stage E's problem, not the selector's.
   */
  mustShowSelectedRecallAmongGenerated: number;
  selectedCount: number;
  /** Why the coverage selector stopped; null for the ranking selector. */
  stoppedBecause: string | null;
  mustShowTop3Recall: number;
  mustShowTop10Recall: number;
  top3SingleChordCount: number;
  top10SingleChordRate: number;
  top3ProgressionCount: number;
  top10ProgressionRate: number;
  progressionCandidateCoverage: number;
  allCandidateCoverage: number;
  /**
   * Coverage counting every occurrence a shown card can reach.
   *
   * Reported alongside `allCandidateCoverage`, never instead of it.
   * `allCandidateCoverage` counts only the bars a card itself displays, and that
   * is the definition the A2 gate was frozen on. A pattern-based list moves bars
   * from the first number to the second without losing them, so both are needed
   * to describe what happened; substituting one for the other would be moving a
   * frozen gate to fit a result.
   */
  reachableCandidateCoverage: number;
  longestUncoveredHarmonicRun: number;
  minimumSelectedCandidateScore: number | null;
  twoBarFragmentsInTop3: number;
  progressionCandidateAvailability: number;
  vampAheadOfProgression: boolean;
  /** Share of the first three cards that are progressions. */
  progressionPrecisionAt3: number;
  uniquePatternCountAt3: number;
  uniquePatternCountAt10: number;
  rankConstraintGroupSatisfaction: GroupSatisfaction[];
  allRankConstraintGroupsSatisfied: boolean;
}

export interface SegmentationMetrics {
  goldSections: number;
  detectedSections: number;
  boundaryPrecision: number;
  boundaryRecall: number;
  /** Mean best-match intersection over union between gold and detected sections. */
  segmentIoU: number;
}

export interface PatternUiMetrics {
  visiblePatternDuplicateCount: number;
  visiblePatternDuplicateRate: number;
  visibleSlotWasteCount: number;
  visibleUniquePatternCount: number;
  expectedCardCountMatch: number;
  expectedCardCountChecked: number;
  mergePolicyRespected: number;
  mergePolicyChecked: number;
  occurrenceRecall: number;
  occurrenceReachability: number;
  perOccurrenceAbsoluteChordRetention: number;
  perOccurrenceVoicingRetention: number;
  reachableOccurrences: number;
  goldOccurrences: number;
  /** Product timeline events over gold events; catches over-merge and over-split. */
  eventCountRatio: number;
}

export interface FileEvaluation {
  scenarioId: string;
  title: string;
  variant: string;
  split: string;
  fingerprint: string;
  byteLength: number;
  bars: number;
  stressFeatures: string[];
  boundaryToleranceBeats: number;
  stages: StageTrace;
  timeline: TimelineMetrics;
  generation: GenerationMetrics;
  selection: SelectionMetrics;
  patternUi: PatternUiMetrics;
  segmentation: SegmentationMetrics;
  cards: CardRow[];
  failures: Array<{
    stage: LossStage;
    kind: string;
    detail: string;
  }>;
  runtimeMs: number;
}

function harmonicActiveBarsOf(bytes: Uint8Array, totalBars: number, meter: number): number[] {
  const song = parseMidi(bytes);
  const evidence = selectChordEvidenceNotes(song.notes);
  const bars: number[] = [];
  for (let bar = 1; bar <= totalBars; bar += 1) {
    const startTick = (bar - 1) * meter * song.ticksPerBeat;
    const endTick = bar * meter * song.ticksPerBeat;
    if (evidence.some((note) => note.startTick < endTick && note.startTick + note.durationTick > startTick)) {
      bars.push(bar);
    }
  }
  return bars;
}

export function evaluateFile(
  bytes: Uint8Array,
  scenario: GoldScenario,
  variant: GoldVariant,
  mode: MidiAnalyzerMode,
): FileEvaluation {
  const started = performance.now();
  const normalizedGold = normalizeGoldEvents(variant.events);
  const collapsedGoldCount = normalizedGold.filter(
    (event, index) => index === 0 || event.primary !== normalizedGold[index - 1].primary,
  ).length;

  // Stage 1: parse.
  const song = parseMidi(bytes);
  const meter = beatsPerBar(song.timeSignature);

  // Stage 2: role inference and extraction profile.
  const profile = detectExtractionProfile(song);
  const roles = inferTrackRoles(song, profile);
  const roleCounts = { harmony: 0, bass: 0, melody: 0, percussion: 0, mixed: 0 };
  for (const role of roles.values()) roleCounts[role] += 1;

  // Stage 3: chord timeline, from the product analyzer in the requested mode.
  const analysis = analyzeMidi(bytes, { mode });
  const totalBars = analysis.totalBars;

  // Stages 4 and 5: occurrence generation and scoring, using the internal
  // ranking scores rather than `confidence`, which saturates and cannot
  // separate blocks.
  const internal = analyzeMidiWithRankingScores(bytes, {}, {
    useQualityEvidence: true,
    qualityEvidence: phase4QualityEvidence,
    useCoverageSelection: mode === "phase4.1-v1",
    useExtractionProfile: mode === "phase4.1-v1",
  });
  const rawMatchScores = internal.timelineRankingScores.map(recoverRawMatchScore);
  const normalise = normaliseEvidence(rawMatchScores);
  // The window set has to match the mode's own, or the harness cannot see the
  // candidates it generated: an odd-length window would be reported as ungenerated
  // and its card as unclassifiable, which reads as a product regression and is a
  // measurement gap.
  const extraWindows = mode === "phase4.1.2-v1"
    ? structuralWindows(analysis.fullTimeline, totalBars, meter, analysis.sections ?? [])
    : [];
  const generated = buildOccurrences(analysis.fullTimeline, totalBars, {
    beatsPerBar: meter,
    rawMatchScores,
    extraWindows,
  });
  const scored = scoreOccurrences(generated, {
    beatsPerBar: meter,
    rawMatchScores,
    normaliseEvidence: normalise,
    scoreBlockQuality,
  });
  const eligible = scored.filter((occurrence) => occurrence.score >= 0.35);

  // Marginal coverage and utility only exist for the coverage selector. The
  // ranking selector has no such notion, so those fields stay null for it
  // rather than being filled with a lookalike number.
  const active = harmonicActiveBarsOf(bytes, totalBars, meter);
  const coverageRun = mode === "phase4.1-v1"
    ? selectOccurrencesByCoverage(scored, { harmonicActiveBars: active })
    : null;
  const selectorSteps = new Map(
    (coverageRun?.steps ?? []).map((step) => [step.occurrenceId, step]),
  );

  // Stage 7: pattern grouping. Modes without a pattern model are grouped
  // analytically so the duplication metric is defined for them too — but their
  // cards cannot actually offer the other occurrences, which is recorded
  // separately as `patternModelAvailable`.
  const patterns: CandidatePattern[] = analysis.candidatePatterns ?? groupIntoPatterns(scored);
  const patternModelAvailable = analysis.candidatePatterns !== undefined;
  const patternOf = new Map<string, string>();
  const patternById = new Map<string, CandidatePattern>();
  for (const pattern of patterns) {
    patternById.set(pattern.patternId, pattern);
    for (const occurrence of pattern.occurrences) patternOf.set(occurrence.id, pattern.patternId);
  }
  const occurrenceByRange = new Map(
    scored.map((occurrence) => [`${occurrence.startBar}:${occurrence.endBar}`, occurrence]),
  );
  const kindOf = new Map(scored.map((occurrence) => [occurrence.id, classifyCandidate(occurrence)]));

  // Stages 6 and 8: the candidates the mode ships and the cards the UI renders.
  const selected = analysis.blockCandidates;
  const visible = selected.slice(0, VISIBLE_CARD_LIMIT);

  const cards: CardRow[] = visible.map((block, index) => {
    const occurrence = occurrenceByRange.get(`${block.startBar}:${block.endBar}`);
    const patternId = occurrence ? patternOf.get(occurrence.id) ?? null : null;
    const pattern = patternId ? patternById.get(patternId) : undefined;
    return {
      visibleCardIndex: index + 1,
      occurrenceId: occurrence?.id ?? null,
      sourceCandidateId: block.id,
      patternId,
      normalizedProgressionIdentity: pattern?.normalizedProgressionIdentity ?? null,
      startBar: block.startBar,
      endBar: block.endBar,
      startBeat: (block.startBar - 1) * meter,
      endBeat: block.endBar * meter,
      barLength: block.lengthBars,
      chordEventCount: block.stats?.eventCount ?? occurrence?.stats.eventCount ?? 0,
      uniqueCanonicalChordCount: block.stats?.uniqueChordCount ?? occurrence?.stats.uniqueChordCount ?? 0,
      candidateType: occurrence ? kindOf.get(occurrence.id) ?? null : null,
      qualityScore: block.selectionScore ?? null,
      rankingScore: occurrence ? Number(occurrence.score.toFixed(6)) : null,
      marginalCoverage: occurrence ? selectorSteps.get(occurrence.id)?.newBars ?? null : null,
      selectionUtility: occurrence ? selectorSteps.get(occurrence.id)?.utility ?? null : null,
      selectedRank: index + 1,
      occurrenceCount: pattern?.occurrences.length ?? 1,
      chordLabels: (block.events ?? occurrence?.events ?? []).map((event) => event.chord.label),
    };
  });

  // --- Generation ---------------------------------------------------------
  const generatedByRange = new Set(
    generated.map((occurrence) => `${occurrence.startBar}:${occurrence.endBar}`),
  );
  const mustShow = scenario.expectedBlocks.filter((block) => block.usefulness === "must-show");
  const matched = (block: GoldBlock) => generatedByRange.has(`${block.start_bar}:${block.end_bar}`);
  const unmatchedMustShow = mustShow.filter((block) => !matched(block));
  const byType = (type: CandidateKind) => scenario.expectedBlocks.filter((block) => block.block_type === type);
  const recallOf = (blocks: GoldBlock[]) => (blocks.length === 0
    ? 1
    : Number((blocks.filter(matched).length / blocks.length).toFixed(6)));

  const excludeFromMain = new Set(
    scenario.expectedBlocks
      .filter((block) => block.usefulness === "exclude-from-main")
      .map((block) => `${block.start_bar}:${block.end_bar}`),
  );
  const fragmentPromotions = cards.filter(
    (card) => excludeFromMain.has(`${card.startBar}:${card.endBar}`) || card.candidateType === "fragment",
  ).length;

  let classificationHits = 0;
  let classificationChecked = 0;
  for (const block of scenario.expectedBlocks) {
    const occurrence = occurrenceByRange.get(`${block.start_bar}:${block.end_bar}`);
    if (!occurrence) continue;
    classificationChecked += 1;
    if (kindOf.get(occurrence.id) === block.block_type) classificationHits += 1;
  }

  const generation: GenerationMetrics = {
    mustShowBlocks: mustShow.length,
    mustShowBlockRecall: recallOf(mustShow),
    mustShowGeneratedRecall: recallOf(mustShow),
    progressionBlockRecall: recallOf(byType("progression")),
    vampBlockRecall: recallOf(byType("vamp")),
    fragmentFalsePromotionRate: cards.length === 0
      ? 0
      : Number((fragmentPromotions / cards.length).toFixed(6)),
    candidateGenerationLoss: unmatchedMustShow.length,
    classificationAgreement: classificationChecked === 0
      ? 1
      : Number((classificationHits / classificationChecked).toFixed(6)),
    unmatchedMustShowBlocks: unmatchedMustShow.map((block) => ({
      id: block.id,
      startBar: block.start_bar,
      endBar: block.end_bar,
      blockType: block.block_type,
    })),
  };

  // --- Selection ----------------------------------------------------------
  const activeSet = new Set(active);
  const coverageOf = (blocks: ReadonlyArray<{ startBar: number; endBar: number }>) => {
    const covered = new Set<number>();
    for (const block of blocks) {
      for (let bar = block.startBar; bar <= block.endBar; bar += 1) {
        if (activeSet.has(bar)) covered.add(bar);
      }
    }
    return active.length === 0 ? 0 : Number((covered.size / active.length).toFixed(6));
  };
  const coveredBySelected = new Set<number>();
  for (const block of selected) {
    for (let bar = block.startBar; bar <= block.endBar; bar += 1) {
      if (activeSet.has(bar)) coveredBySelected.add(bar);
    }
  }
  let longestRun = 0;
  let run = 0;
  for (const bar of active) {
    if (coveredBySelected.has(bar)) run = 0;
    else {
      run += 1;
      longestRun = Math.max(longestRun, run);
    }
  }

  /**
   * Whether a gold block is reachable from a set of cards.
   *
   * Reachability is judged on the pattern, not the bar range: a card for the
   * first chorus reaches the second when both are occurrences of one pattern
   * and the UI can enumerate them. Without a pattern model only the card's own
   * range counts.
   */
  const reaches = (
    rows: ReadonlyArray<{ startBar: number; endBar: number; patternId: string | null }>,
    startBar: number,
    endBar: number,
  ) => rows.some((card) => {
    if (card.startBar === startBar && card.endBar === endBar) return true;
    if (!patternModelAvailable || !card.patternId) return false;
    const pattern = patternById.get(card.patternId);
    return pattern?.occurrences.some(
      (occurrence) => occurrence.startBar === startBar && occurrence.endBar === endBar,
    ) ?? false;
  });

  const top3 = cards.slice(0, 3);
  const top10 = cards.slice(0, VISIBLE_CARD_LIMIT);
  const top3Blocks = mustShow.filter((block) => block.rank_constraint === "top3");
  const top10Blocks = mustShow;
  const progressionPatterns = new Set(
    eligible.filter((occurrence) => kindOf.get(occurrence.id) === "progression")
      .map((occurrence) => patternOf.get(occurrence.id) ?? occurrence.id),
  );

  const firstProgressionIndex = cards.findIndex((card) => card.candidateType === "progression");
  const firstVampIndex = cards.findIndex((card) => card.candidateType === "vamp");
  const progressionExists = scenario.expectedBlocks.some(
    (block) => block.block_type === "progression",
  );

  // The whole selected list, not just the visible slice, so "generated but
  // never selected" is distinguishable from "selected but ranked below the cut".
  const allSelectedRows = selected.map((block) => {
    const occurrence = occurrenceByRange.get(`${block.startBar}:${block.endBar}`);
    return {
      startBar: block.startBar,
      endBar: block.endBar,
      patternId: occurrence ? patternOf.get(occurrence.id) ?? null : null,
    };
  });

  const generatedMustShow = mustShow.filter(matched);

  /** Whether a gold pattern is reachable from a row set, by pattern identity. */
  const patternIdsOf = (goldPatternId: string) => {
    const goldPattern = scenario.expectedPatterns.find((entry) => entry.pattern_id === goldPatternId);
    if (!goldPattern) return [];
    return [...new Set(goldPattern.occurrences
      .map((occurrence) => occurrenceByRange.get(`${occurrence.startBar}:${occurrence.endBar}`))
      .filter((occurrence): occurrence is CandidateOccurrence => occurrence !== undefined)
      .map((occurrence) => patternOf.get(occurrence.id))
      .filter((id): id is string => id !== undefined))];
  };
  const groups = deriveRankConstraintGroups(scenario, amendments);
  const groupSatisfaction = evaluateRankConstraintGroups(
    groups,
    (rows, goldPatternId) => {
      const ids = patternIdsOf(goldPatternId);
      const pool = rows === "top3" ? cards.slice(0, 3) : cards;
      return pool.some((card) => card.patternId !== null && ids.includes(card.patternId));
    },
    (goldPatternId) => {
      const ids = patternIdsOf(goldPatternId);
      const index = cards.findIndex((card) => card.patternId !== null && ids.includes(card.patternId));
      return index;
    },
  );

  const selection: SelectionMetrics = {
    mustShowSelectedRecall: mustShow.length === 0
      ? 1
      : Number((mustShow.filter((block) => reaches(allSelectedRows, block.start_bar, block.end_bar)).length
        / mustShow.length).toFixed(6)),
    mustShowSelectedRecallAmongGenerated: generatedMustShow.length === 0
      ? 1
      : Number((generatedMustShow.filter(
        (block) => reaches(allSelectedRows, block.start_bar, block.end_bar),
      ).length / generatedMustShow.length).toFixed(6)),
    selectedCount: selected.length,
    stoppedBecause: coverageRun?.stoppedBecause ?? null,
    mustShowTop3Recall: top3Blocks.length === 0
      ? 1
      : Number((top3Blocks.filter((block) => reaches(top3, block.start_bar, block.end_bar)).length
        / top3Blocks.length).toFixed(6)),
    mustShowTop10Recall: top10Blocks.length === 0
      ? 1
      : Number((top10Blocks.filter((block) => reaches(top10, block.start_bar, block.end_bar)).length
        / top10Blocks.length).toFixed(6)),
    top3SingleChordCount: top3.filter((card) => card.candidateType === "vamp").length,
    top10SingleChordRate: top10.length === 0
      ? 0
      : Number((top10.filter((card) => card.candidateType === "vamp").length / top10.length).toFixed(6)),
    top3ProgressionCount: top3.filter((card) => card.candidateType === "progression").length,
    top10ProgressionRate: top10.length === 0
      ? 0
      : Number((top10.filter((card) => card.candidateType === "progression").length / top10.length).toFixed(6)),
    progressionCandidateCoverage: coverageOf(
      selected.filter((block) => {
        const occurrence = occurrenceByRange.get(`${block.startBar}:${block.endBar}`);
        return occurrence !== undefined && kindOf.get(occurrence.id) === "progression";
      }),
    ),
    allCandidateCoverage: coverageOf(selected),
    reachableCandidateCoverage: coverageOf(selected.flatMap((block) => {
      const occurrence = occurrenceByRange.get(`${block.startBar}:${block.endBar}`);
      const patternId = occurrence ? patternOf.get(occurrence.id) : undefined;
      const pattern = patternId ? patternById.get(patternId) : undefined;
      return pattern ? pattern.occurrences : [block];
    })),
    longestUncoveredHarmonicRun: longestRun,
    minimumSelectedCandidateScore: selected.length
      ? Number(Math.min(...selected.map((block) => block.selectionScore ?? 0)).toFixed(6))
      : null,
    twoBarFragmentsInTop3: top3.filter(
      (card) => card.barLength < 4 && card.candidateType !== "progression",
    ).length,
    progressionCandidateAvailability: progressionPatterns.size,
    vampAheadOfProgression: progressionExists
      && firstVampIndex >= 0
      && (firstProgressionIndex < 0 || firstVampIndex < firstProgressionIndex),
    progressionPrecisionAt3: top3.length === 0
      ? 0
      : Number((top3.filter((card) => card.candidateType === "progression").length / top3.length).toFixed(6)),
    uniquePatternCountAt3: new Set(
      top3.map((card) => card.patternId ?? `unmatched-${card.sourceCandidateId}`),
    ).size,
    uniquePatternCountAt10: new Set(
      top10.map((card) => card.patternId ?? `unmatched-${card.sourceCandidateId}`),
    ).size,
    rankConstraintGroupSatisfaction: groupSatisfaction,
    allRankConstraintGroupsSatisfied: groupSatisfaction.every(
      (entry) => entry.top3Satisfied && entry.allVisibleSatisfied && entry.orderSatisfied,
    ),
  };

  // --- Pattern / Occurrence / UI -----------------------------------------
  const visiblePatternIds = cards.map((card) => card.patternId ?? `unmatched-${card.sourceCandidateId}`);
  const visibleUnique = new Set(visiblePatternIds).size;

  let cardCountMatch = 0;
  let cardCountChecked = 0;
  let mergeRespected = 0;
  let mergeChecked = 0;
  let reachableOccurrences = 0;
  let goldOccurrences = 0;
  let occurrencesInDisplayedPatterns = 0;
  let occurrencesReachableInDisplayed = 0;
  let chordRetentionHits = 0;
  let chordRetentionChecked = 0;
  let voicingRetentionHits = 0;
  let voicingRetentionChecked = 0;

  const collapsedProductCount = analysis.fullTimeline.filter((item, index) => index === 0
    || chordIdentityKey(normalizeChordSymbol(item.chord))
      !== chordIdentityKey(normalizeChordSymbol(analysis.fullTimeline[index - 1].chord))).length;

  const enriched = attachSourceVoicings(
    analysis.fullTimeline,
    { analysis, sourceData: song, sourceVoices: undefined },
    new Map(),
  );
  const voicingAt = new Map<string, number[]>();
  for (const item of enriched) {
    const notes = item.voicingMemory?.sourceVoicing?.midiNotes;
    if (notes && notes.length > 0) voicingAt.set(`${item.bar}:${item.beat}`, notes);
  }

  const separatePatternIds: string[][] = [];
  for (const goldPattern of scenario.expectedPatterns) {
    const resolved = goldPattern.occurrences.map(
      (occurrence) => occurrenceByRange.get(`${occurrence.startBar}:${occurrence.endBar}`),
    );
    const productPatternIds = [...new Set(
      resolved.filter((occurrence): occurrence is CandidateOccurrence => occurrence !== undefined)
        .map((occurrence) => patternOf.get(occurrence.id))
        .filter((id): id is string => id !== undefined),
    )];

    if (goldPattern.merge_policy === "merge" && goldPattern.occurrences.length > 1) {
      mergeChecked += 1;
      if (productPatternIds.length === 1) mergeRespected += 1;
    }
    if (goldPattern.merge_policy === "separate") separatePatternIds.push(productPatternIds);

    const cardsForPattern = cards.filter(
      (card) => card.patternId !== null && productPatternIds.includes(card.patternId),
    );
    if (cardsForPattern.length > 0) {
      cardCountChecked += 1;
      if (cardsForPattern.length === goldPattern.expected_card_count) cardCountMatch += 1;
    }

    for (const occurrence of goldPattern.occurrences) {
      goldOccurrences += 1;
      const isReachable = reaches(cards, occurrence.startBar, occurrence.endBar);
      if (isReachable) reachableOccurrences += 1;
      if (cardsForPattern.length > 0) {
        occurrencesInDisplayedPatterns += 1;
        if (isReachable) occurrencesReachableInDisplayed += 1;
      }
      if (!isReachable) continue;

      // Absolute chords per occurrence: a transposed repeat must keep its own
      // roots rather than inheriting the representative's.
      //
      // Consecutive duplicates are collapsed on both sides first. Whether the
      // detector split a four-beat chord into two events is an event-boundary
      // question, already measured as such; charging it here would report a
      // segmentation difference as a lost occurrence.
      const product = occurrenceByRange.get(`${occurrence.startBar}:${occurrence.endBar}`);
      if (product) {
        chordRetentionChecked += 1;
        const collapse = (roots: number[]) => roots.filter(
          (root, position) => position === 0 || root !== roots[position - 1],
        );
        const goldRoots = collapse(normalizedGold
          .filter((event) => event.startBar >= occurrence.startBar && event.startBar <= occurrence.endBar)
          .map((event) => event.rootPitchClass));
        const productRoots = collapse(product.events
          .filter((event) => !event.carriedIn)
          .map((event) => ((event.chord.root % 12) + 12) % 12));
        if (goldRoots.length > 0
          && goldRoots.length === productRoots.length
          && goldRoots.every((root, position) => root === productRoots[position])) {
          chordRetentionHits += 1;
        }

        voicingRetentionChecked += 1;
        const first = product.events.find((event) => !event.carriedIn) ?? product.events[0];
        const notes = first ? voicingAt.get(`${first.source.bar}:${first.source.beat}`) : undefined;
        if (notes && notes.length > 0) voicingRetentionHits += 1;
      }
    }
  }

  // `separate` patterns must not collapse into each other.
  if (separatePatternIds.length > 1) {
    mergeChecked += 1;
    const flattened = separatePatternIds.flat();
    if (new Set(flattened).size === flattened.length) mergeRespected += 1;
  }

  const patternUi: PatternUiMetrics = {
    visiblePatternDuplicateCount: visiblePatternIds.length - visibleUnique,
    visiblePatternDuplicateRate: visiblePatternIds.length === 0
      ? 0
      : Number(((visiblePatternIds.length - visibleUnique) / visiblePatternIds.length).toFixed(6)),
    visibleSlotWasteCount: visiblePatternIds.length - visibleUnique,
    visibleUniquePatternCount: visibleUnique,
    expectedCardCountMatch: cardCountChecked === 0
      ? 1
      : Number((cardCountMatch / cardCountChecked).toFixed(6)),
    expectedCardCountChecked: cardCountChecked,
    mergePolicyRespected: mergeChecked === 0 ? 1 : Number((mergeRespected / mergeChecked).toFixed(6)),
    mergePolicyChecked: mergeChecked,
    occurrenceRecall: goldOccurrences === 0
      ? 1
      : Number((reachableOccurrences / goldOccurrences).toFixed(6)),
    occurrenceReachability: occurrencesInDisplayedPatterns === 0
      ? 1
      : Number((occurrencesReachableInDisplayed / occurrencesInDisplayedPatterns).toFixed(6)),
    perOccurrenceAbsoluteChordRetention: chordRetentionChecked === 0
      ? 1
      : Number((chordRetentionHits / chordRetentionChecked).toFixed(6)),
    perOccurrenceVoicingRetention: voicingRetentionChecked === 0
      ? 1
      : Number((voicingRetentionHits / voicingRetentionChecked).toFixed(6)),
    reachableOccurrences,
    goldOccurrences,
    // Both sides are collapsed on consecutive identical chords before comparing.
    // Merging a chord held across four bars into one event is intended, so an
    // uncollapsed denominator reads the vamp-only scenario as 1/24; an
    // uncollapsed numerator reads it as 96x. Collapsing both measures the thing
    // that matters — whether the detector found the same number of chord
    // changes — and nothing else.
    eventCountRatio: collapsedGoldCount === 0
      ? 0
      : Number((collapsedProductCount / collapsedGoldCount).toFixed(4)),
  };

  const timeline = evaluateTimeline(
    analysis.fullTimeline,
    variant.events,
    meter,
    scenario.boundaryToleranceBeats,
  );

  // Section quality. The gold's own section list is the reference, and the
  // product's `sections` field is the estimate; both are read, neither is tuned.
  const detected = analysis.sections ?? [];
  const referenceBoundaries = scenario.sections.slice(1).map((section) => section.startBar);
  const segmentationQuality = evaluateSegmentation(
    detected.map((section) => ({ ...section })),
    referenceBoundaries,
  );
  const overlapOf = (
    left: { startBar: number; endBar: number },
    right: { startBar: number; endBar: number },
  ) => {
    const intersection = Math.max(
      0,
      Math.min(left.endBar, right.endBar) - Math.max(left.startBar, right.startBar) + 1,
    );
    const union = (left.endBar - left.startBar + 1) + (right.endBar - right.startBar + 1) - intersection;
    return union === 0 ? 0 : intersection / union;
  };
  const iouValues = scenario.sections.map((goldSection) => Math.max(
    0,
    ...detected.map((detectedSection) => overlapOf(goldSection, detectedSection)),
  ));
  const segmentation: SegmentationMetrics = {
    goldSections: scenario.sections.length,
    detectedSections: detected.length,
    boundaryPrecision: segmentationQuality.boundaryPrecision,
    boundaryRecall: segmentationQuality.boundaryRecall,
    segmentIoU: iouValues.length === 0
      ? 0
      : Number((iouValues.reduce((sum, value) => sum + value, 0) / iouValues.length).toFixed(6)),
  };

  const stages: StageTrace = {
    parsedNotes: song.notes.length,
    parsedTracks: song.tracks.length,
    drumTracks: song.tracks.filter((track) => track.roleHint === "percussion").length,
    extractionProfileFired: profile !== null,
    harmonyTracks: roleCounts.harmony + roleCounts.mixed,
    bassTracks: roleCounts.bass,
    melodyTracks: roleCounts.melody,
    timelineEvents: analysis.fullTimeline.length,
    generatedOccurrences: generated.length,
    scoredOccurrences: scored.length,
    eligibleAfterQualityFloor: eligible.length,
    selectedCandidates: selected.length,
    groupedPatterns: patterns.length,
    visibleCards: cards.length,
    patternModelAvailable,
  };

  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    variant: variant.variant,
    split: scenario.split,
    fingerprint: fingerprintMidiBytes(bytes),
    byteLength: bytes.length,
    bars: scenario.bars,
    stressFeatures: scenario.stressFeatures,
    boundaryToleranceBeats: scenario.boundaryToleranceBeats,
    stages,
    timeline,
    generation,
    selection,
    patternUi,
    segmentation,
    cards,
    failures: classifyFailures({
      scenario, stages, timeline, generation, selection, patternUi, segmentation, cards,
    }),
    runtimeMs: Number((performance.now() - started).toFixed(1)),
  };
}

/**
 * Each failure is attributed to the first stage that departed from the gold,
 * not to the stage where it became visible.
 *
 * The order of the checks is the order of the pipeline, and the first one that
 * fires for a given expectation owns it. A duplicated card, for instance, is
 * charged to the selection objective when the occurrences were generated and
 * grouped correctly — fixing the projection alone would hide it, not solve it.
 */
export function classifyFailures(input: {
  scenario: GoldScenario;
  stages: StageTrace;
  timeline: TimelineMetrics;
  generation: GenerationMetrics;
  selection: SelectionMetrics;
  patternUi: PatternUiMetrics;
  segmentation: SegmentationMetrics;
  cards: CardRow[];
}): FileEvaluation["failures"] {
  const { scenario, stages, timeline, generation, selection, patternUi } = input;
  const failures: FileEvaluation["failures"] = [];

  if (stages.parsedNotes === 0) {
    failures.push({ stage: "parse", kind: "no-notes-parsed", detail: "parser produced no notes" });
    return failures;
  }
  if (stages.timelineEvents === 0) {
    failures.push({
      stage: "role-extraction-profile",
      kind: "no-harmony-evidence",
      detail: `roles: harmony=${stages.harmonyTracks} bass=${stages.bassTracks} melody=${stages.melodyTracks}`,
    });
    return failures;
  }

  // A root that matches none of the corpus's permitted readings is a different
  // defect from a root that matches an alternative the corpus itself allows.
  if (timeline.rootAccuracyAgainstAnyAcceptable < 1) {
    failures.push({
      stage: "timeline-chord-label",
      kind: "root-mismatch",
      detail: `rootAccuracy ${timeline.rootAccuracy}, againstAnyAcceptable ${timeline.rootAccuracyAgainstAnyAcceptable}`,
    });
  } else if (timeline.canonicalExact < 1 && timeline.acceptableAlternativeMatch < 1) {
    failures.push({
      stage: "timeline-chord-label",
      kind: "quality-detail-mismatch",
      detail: `canonicalExact ${timeline.canonicalExact}, alternativeMatch ${timeline.acceptableAlternativeMatch}`,
    });
  }
  if (timeline.boundaryMatchWithinTolerance < 1) {
    failures.push({
      stage: "event-boundary",
      kind: "onset-outside-tolerance",
      detail: `boundaryMatch ${timeline.boundaryMatchWithinTolerance} at tolerance ${scenario.boundaryToleranceBeats} beats`,
    });
  }
  // Onset agreement cannot see a merged pair or a split chord, so the event count
  // is checked separately. The band is deliberately loose: the detector is allowed
  // to segment differently, not to lose or invent whole chords.
  if (patternUi.eventCountRatio < 0.9 || patternUi.eventCountRatio > 1.1) {
    failures.push({
      stage: "event-boundary",
      kind: "event-count-out-of-band",
      detail: `eventCountRatio ${patternUi.eventCountRatio}`,
    });
  }

  if (generation.candidateGenerationLoss > 0) {
    failures.push({
      stage: "candidate-generation",
      kind: "must-show-block-not-generated",
      detail: generation.unmatchedMustShowBlocks
        .map((block) => `${block.id} ${block.startBar}-${block.endBar}`)
        .join(", "),
    });
  }
  if (generation.classificationAgreement < 1) {
    failures.push({
      stage: "candidate-scoring",
      kind: "block-type-disagreement",
      detail: `classificationAgreement ${generation.classificationAgreement}`,
    });
  }

  // Selection owns duplication: the occurrences existed and grouped correctly,
  // so nothing upstream chose to show the same pattern twice.
  if (patternUi.visiblePatternDuplicateCount > 0) {
    failures.push({
      stage: "selection-objective",
      kind: "duplicate-pattern-occupies-slots",
      detail: `visiblePatternDuplicateCount ${patternUi.visiblePatternDuplicateCount}`,
    });
  }
  if (selection.mustShowTop3Recall < 1) {
    failures.push({
      stage: "selection-objective",
      kind: "must-show-missing-from-top3",
      detail: `mustShowTop3Recall ${selection.mustShowTop3Recall}`,
    });
  }
  if (selection.mustShowTop10Recall < 1) {
    failures.push({
      stage: "selection-objective",
      kind: "must-show-missing-from-top10",
      detail: `mustShowTop10Recall ${selection.mustShowTop10Recall}`,
    });
  }
  if (selection.vampAheadOfProgression) {
    failures.push({
      stage: "selection-objective",
      kind: "vamp-ahead-of-progression",
      detail: `top3SingleChordCount ${selection.top3SingleChordCount}`,
    });
  }
  if (selection.twoBarFragmentsInTop3 > 0 && selection.progressionCandidateAvailability > 0) {
    failures.push({
      stage: "selection-objective",
      kind: "short-fragment-in-top3",
      detail: `twoBarFragmentsInTop3 ${selection.twoBarFragmentsInTop3}`,
    });
  }
  // The top three should be progressions once three distinct progression patterns
  // exist. Below that threshold there is nothing to demand.
  if (selection.progressionCandidateAvailability >= 3 && selection.progressionPrecisionAt3 < 1) {
    failures.push({
      stage: "selection-objective",
      kind: "top3-not-all-progressions",
      detail: `progressionPrecisionAt3 ${selection.progressionPrecisionAt3} with ${selection.progressionCandidateAvailability} progression patterns available`,
    });
  }
  if (!selection.allRankConstraintGroupsSatisfied) {
    const unmet = selection.rankConstraintGroupSatisfaction
      .filter((entry) => !entry.top3Satisfied || !entry.allVisibleSatisfied || !entry.orderSatisfied)
      .map((entry) => `${entry.id} top3 ${entry.top3Hits}/${entry.top3MinHits}`
        + ` allVisible ${entry.allVisibleHits}/${entry.allVisibleMinHits}`
        + `${entry.orderSatisfied ? "" : " order violated"}`);
    failures.push({
      stage: "selection-objective",
      kind: "rank-constraint-group-unsatisfied",
      detail: unmet.join("; "),
    });
  }

  if (patternUi.mergePolicyRespected < 1) {
    failures.push({
      stage: "pattern-grouping",
      kind: "merge-policy-violated",
      detail: `mergePolicyRespected ${patternUi.mergePolicyRespected} over ${patternUi.mergePolicyChecked} checks`,
    });
  }
  // Only charged when the labels were right to begin with. An occurrence whose
  // roots disagree with the gold because the timeline already disagreed is a
  // timeline failure being observed twice, not a grouping defect.
  const timelineAlreadyFailed = failures.some((failure) => failure.stage === "timeline-chord-label");
  if (patternUi.perOccurrenceAbsoluteChordRetention < 1 && !timelineAlreadyFailed) {
    failures.push({
      stage: "pattern-grouping",
      kind: "occurrence-lost-absolute-chords",
      detail: `perOccurrenceAbsoluteChordRetention ${patternUi.perOccurrenceAbsoluteChordRetention}`,
    });
  }

  if (!stages.patternModelAvailable && patternUi.goldOccurrences > patternUi.reachableOccurrences) {
    failures.push({
      stage: "ui-projection",
      kind: "no-pattern-model-to-reach-occurrences",
      detail: `reachable ${patternUi.reachableOccurrences}/${patternUi.goldOccurrences}; mode ships no candidatePatterns`,
    });
  } else if (patternUi.occurrenceReachability < 1) {
    failures.push({
      stage: "ui-projection",
      kind: "occurrence-unreachable-from-card",
      detail: `occurrenceReachability ${patternUi.occurrenceReachability}`,
    });
  }
  if (patternUi.expectedCardCountMatch < 1) {
    failures.push({
      stage: "ui-projection",
      kind: "card-count-mismatch",
      detail: `expectedCardCountMatch ${patternUi.expectedCardCountMatch} over ${patternUi.expectedCardCountChecked} checks`,
    });
  }
  if (patternUi.perOccurrenceVoicingRetention < 1) {
    failures.push({
      stage: "ui-projection",
      kind: "occurrence-lost-source-voicing",
      detail: `perOccurrenceVoicingRetention ${patternUi.perOccurrenceVoicingRetention}`,
    });
  }

  return failures;
}

/** Mean of a numeric field over evaluations, ignoring nulls. */
export function meanOf<K extends string>(
  rows: ReadonlyArray<Record<K, number | null>>,
  key: K,
): number {
  const values = rows.map((row) => row[key]).filter((value): value is number => value !== null);
  return values.length === 0
    ? 0
    : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

export function sumOf<K extends string>(
  rows: ReadonlyArray<Record<K, number>>,
  key: K,
): number {
  return rows.reduce((sum, row) => sum + row[key], 0);
}
