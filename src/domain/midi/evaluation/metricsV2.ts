import {
  chordIdentityKey, isNoChordLabel, normalizeChordLabel, normalizeChordSymbol,
  type ChordTriad, type NormalizedChordIdentity,
} from "../../chordIdentity";
import { makeChordSymbol, normalizePc } from "../../chords";
import type { ChordQuality, ChordTimelineItem } from "../../types";
import type { ExpectedChordSegment, MidiEvaluationCase } from "./types";

/**
 * Evaluation Contract v2.
 *
 * v1 compares display strings, so `Gbadd9` and `F#add9` score as a miss and a
 * quality family collapses `dom13sus` into "major". v2 compares
 * `NormalizedChordIdentity` instead and reports each layer of the chord
 * separately, so an analyzer change can be attributed to root, triad, seventh,
 * extension or bass rather than to notation.
 */

export const detectorQualities: readonly ChordQuality[] = [
  "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
  "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4",
  "add9", "six", "min6", "sixNine",
];

/**
 * Whether the expected chord is even reachable by the detector.
 *
 * Never used to drop segments from a metric: the counts are reported alongside
 * the numerator and denominator so an unreachable expectation is visible rather
 * than silently forgiven.
 */
export type Representability =
  | "representable"
  | "parser-unsupported"
  | "detector-vocabulary-unsupported"
  | "no-chord";

const triadIntervals: Record<ChordTriad, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  power: [0, 7],
  unknown: [0],
};

const seventhIntervals = { minor7: 10, major7: 11, diminished7: 9 } as const;
const extensionIntervals: Readonly<Record<number, number>> = { 6: 9, 9: 2, 11: 5, 13: 9 };
const alterationIntervals: Readonly<Record<string, number>> = {
  b9: 1, "#9": 3, "#11": 6, b13: 8,
};

/** Pitch classes the identity spells, for set-equivalence comparison. */
export function pitchClassesOf(identity: NormalizedChordIdentity): number[] {
  if (identity.noChord) return [];
  const classes = new Set<number>();
  const add = (interval: number) => classes.add(normalizePc(identity.rootPitchClass + interval));
  triadIntervals[identity.triad].forEach(add);
  if (identity.seventh) add(seventhIntervals[identity.seventh]);
  identity.extensions.forEach((extension) => {
    const interval = extensionIntervals[extension];
    if (interval !== undefined) add(interval);
  });
  identity.alterations.forEach((alteration) => {
    const interval = alterationIntervals[alteration];
    if (interval !== undefined) add(interval);
  });
  if (identity.bassPitchClass !== undefined) classes.add(identity.bassPitchClass);
  return [...classes].sort((left, right) => left - right);
}

const representableKeys = (() => {
  const keys = new Set<string>();
  for (const quality of detectorQualities) {
    for (let root = 0; root < 12; root += 1) {
      keys.add(chordIdentityKey(normalizeChordSymbol(makeChordSymbol(root, quality))));
      for (let bass = 0; bass < 12; bass += 1) {
        keys.add(chordIdentityKey(normalizeChordSymbol(makeChordSymbol(root, quality, [], bass))));
      }
    }
  }
  return keys;
})();

/**
 * The detector only ever emits one of its 21 qualities with an empty tension
 * array, so an expectation is representable exactly when some quality (with an
 * optional slash bass) produces the same identity.
 */
export function classifyRepresentability(label: string): {
  representability: Representability;
  identity: NormalizedChordIdentity | null;
} {
  if (isNoChordLabel(label)) return { representability: "no-chord", identity: null };
  const identity = normalizeChordLabel(label);
  if (!identity) return { representability: "parser-unsupported", identity: null };
  return {
    representability: representableKeys.has(chordIdentityKey(identity))
      ? "representable"
      : "detector-vocabulary-unsupported",
    identity,
  };
}

export interface HierarchyTotals {
  root: number;
  triad: number;
  quality: number;
  seventh: number;
  extension: number;
  bassSlash: number;
  canonicalExact: number;
  pitchSetEquivalent: number;
  top3Canonical: number;
  top5Canonical: number;
  top3Root: number;
  top3Quality: number;
  matched: number;
}

export interface WeightedMetrics {
  denominator: number;
  rootAccuracy: number;
  triadAccuracy: number;
  qualityAccuracy: number;
  seventhAccuracy: number;
  extensionAccuracy: number;
  bassSlashAccuracy: number;
  canonicalExactAccuracy: number;
  pitchSetEquivalentAccuracy: number;
  top3CanonicalAccuracy: number;
  top5CanonicalAccuracy: number;
  top3RootAccuracy: number;
  top3QualityAccuracy: number;
  unmatchedRate: number;
}

export interface RepresentabilityCounts {
  representable: number;
  parserUnsupported: number;
  detectorVocabularyUnsupported: number;
  noChord: number;
  total: number;
}

export interface CaseMetricsV2 {
  id: string;
  split: "tune" | "holdout";
  eventWeighted: WeightedMetrics;
  durationWeighted: WeightedMetrics;
  representabilityEvents: RepresentabilityCounts;
  representabilityBeats: RepresentabilityCounts;
}

const emptyTotals = (): HierarchyTotals => ({
  root: 0, triad: 0, quality: 0, seventh: 0, extension: 0, bassSlash: 0,
  canonicalExact: 0, pitchSetEquivalent: 0, top3Canonical: 0, top5Canonical: 0,
  top3Root: 0, top3Quality: 0, matched: 0,
});

const emptyRepresentability = (): RepresentabilityCounts => ({
  representable: 0, parserUnsupported: 0, detectorVocabularyUnsupported: 0, noChord: 0, total: 0,
});

function ratio(value: number, total: number): number {
  return total <= 0 ? 0 : Number((value / total).toFixed(6));
}

function toWeighted(totals: HierarchyTotals, denominator: number): WeightedMetrics {
  return {
    denominator,
    rootAccuracy: ratio(totals.root, denominator),
    triadAccuracy: ratio(totals.triad, denominator),
    qualityAccuracy: ratio(totals.quality, denominator),
    seventhAccuracy: ratio(totals.seventh, denominator),
    extensionAccuracy: ratio(totals.extension, denominator),
    bassSlashAccuracy: ratio(totals.bassSlash, denominator),
    canonicalExactAccuracy: ratio(totals.canonicalExact, denominator),
    pitchSetEquivalentAccuracy: ratio(totals.pitchSetEquivalent, denominator),
    top3CanonicalAccuracy: ratio(totals.top3Canonical, denominator),
    top5CanonicalAccuracy: ratio(totals.top5Canonical, denominator),
    top3RootAccuracy: ratio(totals.top3Root, denominator),
    top3QualityAccuracy: ratio(totals.top3Quality, denominator),
    unmatchedRate: ratio(denominator - totals.matched, denominator),
  };
}

const CORPUS_BEATS_PER_BAR = 4;

function predictedRanges(predicted: readonly ChordTimelineItem[]) {
  return predicted.map((item) => {
    const startBeat = (item.bar - 1) * CORPUS_BEATS_PER_BAR + item.beat - 1;
    return { startBeat, endBeat: startBeat + item.durationBeats, item };
  });
}

function bestOverlap(
  target: ExpectedChordSegment,
  ranges: ReturnType<typeof predictedRanges>,
) {
  const best = ranges
    .map((entry) => ({
      entry,
      overlap: Math.max(0, Math.min(target.endBeat, entry.endBeat) - Math.max(target.startBeat, entry.startBeat)),
    }))
    .sort((left, right) => right.overlap - left.overlap || left.entry.startBeat - right.entry.startBeat)[0];
  return best?.overlap ? best.entry : undefined;
}

function sameSet(left: readonly (number | string)[], right: readonly (number | string)[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function evaluateCaseV2(
  definition: MidiEvaluationCase,
  predicted: readonly ChordTimelineItem[],
): CaseMetricsV2 {
  const ranges = predictedRanges(predicted);
  const events = emptyTotals();
  const beats = emptyTotals();
  const representabilityEvents = emptyRepresentability();
  const representabilityBeats = emptyRepresentability();
  let eventCount = 0;
  let beatCount = 0;

  for (const target of definition.expected.chordTimeline) {
    const duration = target.endBeat - target.startBeat;
    eventCount += 1;
    beatCount += duration;

    const { representability, identity: expectedIdentity } = classifyRepresentability(target.primary);
    const bucket =
      representability === "representable" ? "representable"
        : representability === "parser-unsupported" ? "parserUnsupported"
          : representability === "no-chord" ? "noChord" : "detectorVocabularyUnsupported";
    representabilityEvents[bucket] += 1;
    representabilityEvents.total += 1;
    representabilityBeats[bucket] += duration;
    representabilityBeats.total += duration;

    const match = bestOverlap(target, ranges);
    if (!match || !expectedIdentity) continue;

    const predictedIdentity = normalizeChordLabel(match.item.chord.label);
    if (!predictedIdentity) continue;

    // A ground truth may name more than one legitimate reading of the same
    // pitch set (`C6` and `Am7/C`). Scoring only the primary would mark a
    // musically correct answer wrong, so each layer is credited against
    // whichever accepted reading it matches.
    const acceptedIdentities = [
      expectedIdentity,
      ...(target.acceptableAlternatives ?? [])
        .map((label) => normalizeChordLabel(label))
        .filter((identity): identity is NormalizedChordIdentity => identity !== null),
    ];
    const matchesAny = (
      predicate: (accepted: NormalizedChordIdentity) => boolean,
    ) => acceptedIdentities.some(predicate);

    const award = (key: keyof HierarchyTotals) => {
      events[key] += 1;
      beats[key] += duration;
    };

    award("matched");
    if (matchesAny((accepted) => predictedIdentity.rootPitchClass === accepted.rootPitchClass)) {
      award("root");
    }
    if (matchesAny((accepted) => predictedIdentity.triad === accepted.triad)) award("triad");
    if (matchesAny((accepted) => predictedIdentity.seventh === accepted.seventh)) award("seventh");
    if (matchesAny((accepted) => predictedIdentity.triad === accepted.triad
      && predictedIdentity.seventh === accepted.seventh)) award("quality");
    if (matchesAny((accepted) => sameSet(predictedIdentity.extensions, accepted.extensions)
      && sameSet(predictedIdentity.alterations, accepted.alterations))) award("extension");
    if (matchesAny((accepted) => predictedIdentity.bassPitchClass === accepted.bassPitchClass)) {
      award("bassSlash");
    }

    const acceptedKeys = new Set(acceptedIdentities.map((accepted) => chordIdentityKey(accepted)));
    if (acceptedKeys.has(chordIdentityKey(predictedIdentity))) award("canonicalExact");
    if (matchesAny((accepted) =>
      sameSet(pitchClassesOf(predictedIdentity), pitchClassesOf(accepted)))) {
      award("pitchSetEquivalent");
    }

    const candidates = [match.item.chord, ...match.item.alternatives.map((entry) => entry.chord)]
      .map((chord) => normalizeChordLabel(chord.label));
    const candidateKeys = candidates.map((candidate) => (candidate ? chordIdentityKey(candidate) : ""));
    if (candidateKeys.slice(0, 3).some((key) => acceptedKeys.has(key))) award("top3Canonical");
    if (candidateKeys.slice(0, 5).some((key) => acceptedKeys.has(key))) award("top5Canonical");

    // Root and quality Top-3 are tracked separately from canonical Top-3: an
    // analyzer can sharpen its single best answer while narrowing the spread of
    // roots it offers, and the product goal is that the user finds the right
    // chord inside the short list.
    const topThree = candidates.slice(0, 3);
    if (topThree.some((candidate) => candidate !== null
      && matchesAny((accepted) => candidate.rootPitchClass === accepted.rootPitchClass))) {
      award("top3Root");
    }
    if (topThree.some((candidate) => candidate !== null
      && matchesAny((accepted) => candidate.triad === accepted.triad
        && candidate.seventh === accepted.seventh))) {
      award("top3Quality");
    }
  }

  return {
    id: definition.id,
    split: definition.split,
    eventWeighted: toWeighted(events, eventCount),
    durationWeighted: toWeighted(beats, beatCount),
    representabilityEvents,
    representabilityBeats,
  };
}

function aggregateWeighted(
  values: readonly WeightedMetrics[],
): WeightedMetrics {
  const denominator = values.reduce((sum, item) => sum + item.denominator, 0);
  const weighted = (key: keyof WeightedMetrics) =>
    ratio(values.reduce((sum, item) => sum + Number(item[key]) * item.denominator, 0), denominator);
  return {
    denominator,
    rootAccuracy: weighted("rootAccuracy"),
    triadAccuracy: weighted("triadAccuracy"),
    qualityAccuracy: weighted("qualityAccuracy"),
    seventhAccuracy: weighted("seventhAccuracy"),
    extensionAccuracy: weighted("extensionAccuracy"),
    bassSlashAccuracy: weighted("bassSlashAccuracy"),
    canonicalExactAccuracy: weighted("canonicalExactAccuracy"),
    pitchSetEquivalentAccuracy: weighted("pitchSetEquivalentAccuracy"),
    top3CanonicalAccuracy: weighted("top3CanonicalAccuracy"),
    top5CanonicalAccuracy: weighted("top5CanonicalAccuracy"),
    top3RootAccuracy: weighted("top3RootAccuracy"),
    top3QualityAccuracy: weighted("top3QualityAccuracy"),
    unmatchedRate: weighted("unmatchedRate"),
  };
}

function sumRepresentability(values: readonly RepresentabilityCounts[]): RepresentabilityCounts {
  return values.reduce((total, item) => ({
    representable: total.representable + item.representable,
    parserUnsupported: total.parserUnsupported + item.parserUnsupported,
    detectorVocabularyUnsupported:
      total.detectorVocabularyUnsupported + item.detectorVocabularyUnsupported,
    noChord: total.noChord + item.noChord,
    total: total.total + item.total,
  }), emptyRepresentability());
}

export interface SubsetMetricsV2 {
  caseCount: number;
  eventWeighted: WeightedMetrics;
  durationWeighted: WeightedMetrics;
  representabilityEvents: RepresentabilityCounts;
  representabilityBeats: RepresentabilityCounts;
}

export function aggregateV2(results: readonly CaseMetricsV2[]): SubsetMetricsV2 {
  return {
    caseCount: results.length,
    eventWeighted: aggregateWeighted(results.map((item) => item.eventWeighted)),
    durationWeighted: aggregateWeighted(results.map((item) => item.durationWeighted)),
    representabilityEvents: sumRepresentability(results.map((item) => item.representabilityEvents)),
    representabilityBeats: sumRepresentability(results.map((item) => item.representabilityBeats)),
  };
}

export interface PairedComparison {
  improved: string[];
  regressed: string[];
  unchanged: string[];
}

/** Case-level paired comparison on a single metric, for regression triage. */
export function pairedComparison(
  baseline: readonly CaseMetricsV2[],
  candidate: readonly CaseMetricsV2[],
  metric: keyof WeightedMetrics = "canonicalExactAccuracy",
): PairedComparison {
  const byId = new Map(baseline.map((item) => [item.id, item]));
  const improved: string[] = [];
  const regressed: string[] = [];
  const unchanged: string[] = [];
  for (const item of candidate) {
    const previous = byId.get(item.id);
    if (!previous) continue;
    const before = Number(previous.durationWeighted[metric]);
    const after = Number(item.durationWeighted[metric]);
    if (after > before) improved.push(item.id);
    else if (after < before) regressed.push(item.id);
    else unchanged.push(item.id);
  }
  return {
    improved: improved.sort(),
    regressed: regressed.sort(),
    unchanged: unchanged.sort(),
  };
}
