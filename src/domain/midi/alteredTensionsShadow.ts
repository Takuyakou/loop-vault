import {
  canonicalChordAlternative,
  selectQuickChordAlternatives,
} from "../chordAlternatives";
import { makeChordSymbol, normalizePc } from "../chords";
import type { ChordSymbol, Tension } from "../types";
import { canonicalChord, type ChordCandidateScore } from "./candidates";
import { addObservedFlatNineDominantCandidate } from "./observedFlatNineCandidate";

export const alteredTensionsShadowVersion = "p526-altered-tensions-shadow-v1" as const;
export const alteredTensionsShadowLimits = {
  candidates: 252,
  evidence: 4_096,
  generatedPerAlteration: 2,
} as const;

export type AlteredTensionEvidenceSource = "bass" | "harmony" | "melody" | "unknown";
export type AlteredTensionKind = Extract<Tension, "b9" | "b13">;

export interface AlteredTensionNoteEvidence {
  readonly pitchClass: number;
  readonly source: AlteredTensionEvidenceSource;
  readonly onsetBeat: number;
  readonly durationBeats: number;
  readonly weight: number;
}

export interface AlteredTensionsShadowInput {
  readonly segmentStartBeat: number;
  readonly segmentEndBeat: number;
  readonly rankedCandidates: readonly ChordCandidateScore[];
  readonly noteEvidence: readonly AlteredTensionNoteEvidence[];
}

export interface AlteredTensionScoreComponents {
  readonly sourceCoreScore: number;
  readonly coreCoverage: number;
  readonly alteredSupport: number;
  readonly onsetStrength: number;
  readonly persistence: number;
  readonly sourceSupport: number;
  readonly shadowScore: number;
}

export interface AlteredTensionAggregateEvidence {
  readonly observations: number;
  readonly alteredWeight: number;
  readonly coreWeight: number;
  readonly segmentBeats: number;
  readonly onsetBeatWeights: Readonly<{
    barStart: number;
    midBarStrong: number;
    otherBeat: number;
    offBeat: number;
  }>;
  readonly sourceWeights: Readonly<Record<AlteredTensionEvidenceSource, number>>;
}

export interface AlteredTensionCandidateDiagnostic {
  readonly alteration: AlteredTensionKind;
  readonly generation: "existing-observed-b9" | "shadow-compositional-b13";
  readonly chord: ChordSymbol;
  readonly candidateRank: number;
  readonly sourceCoreRank: number;
  readonly rankDelta: number;
  readonly scoreComponents: AlteredTensionScoreComponents;
  readonly evidence: AlteredTensionAggregateEvidence;
}

export interface AlteredTensionsShadowDiagnostics {
  readonly version: typeof alteredTensionsShadowVersion;
  readonly status: "available" | "unknown";
  readonly reason:
    | "evaluated"
    | "no-altered-evidence"
    | "invalid-input"
    | "ambiguous-dominant-root"
    | "no-supported-dominant-core";
  readonly candidates: readonly AlteredTensionCandidateDiagnostic[];
  readonly rankOneDelta: Readonly<{ changed: 0; improved: 0; regressed: 0 }>;
  readonly operations: Readonly<{
    candidateVisits: number;
    evidenceVisits: number;
    dominantRootEvaluations: number;
  }>;
}

interface PitchClassAggregate {
  observations: number;
  weight: number;
  durationWeight: number;
  onsetStrengthWeight: number;
  onsetBeatWeights: { barStart: number; midBarStrong: number; otherBeat: number; offBeat: number };
  sourceWeights: Record<AlteredTensionEvidenceSource, number>;
}

interface RankedCore { chord: ChordSymbol; score: number; rank: number }

const zeroRankDelta: AlteredTensionsShadowDiagnostics["rankOneDelta"] = {
  changed: 0,
  improved: 0,
  regressed: 0,
};
const sourceFactor: Readonly<Record<AlteredTensionEvidenceSource, number>> = {
  bass: 0.65,
  harmony: 1,
  melody: 0.45,
  unknown: 0.5,
};
const supportedSources = new Set<AlteredTensionEvidenceSource>([
  "bass", "harmony", "melody", "unknown",
]);
const supportedQualities = new Set([
  "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
  "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4",
  "add9", "six", "min6", "sixNine",
]);
const supportedTensions = new Set([
  "9", "b9", "#9", "11", "#11", "13", "b13",
]);
const candidateScoreFields = [
  "templateScore",
  "coreCoverageScore",
  "extensionCoverageScore",
  "bassCompatibilityScore",
  "slashCompatibilityScore",
  "keyCompatibilityScore",
  "foreignNotePenalty",
  "missingCoreTonePenalty",
  "ambiguityPenalty",
  "totalScore",
] as const;
const maximumFiniteMagnitude = 1_000_000;
const maximumSegmentBeats = 64;

/**
 * Evaluation-only altered-tension shadow. b9 delegates generation to the
 * existing observed-flat-nine rule. b13 is composed from a ranked plain dom7
 * core plus observed b13 evidence. Product ranking and templates are untouched.
 */
export function diagnoseAlteredTensionsShadow(
  input: unknown,
): AlteredTensionsShadowDiagnostics {
  if (!isValidInput(input)) return invalidDiagnostics();

  const candidates = [...input.rankedCandidates]
    .sort((left, right) => right.totalScore - left.totalScore
      || canonicalChord(left.chord).localeCompare(canonicalChord(right.chord)));
  const aggregates = emptyAggregates();
  for (const evidence of input.noteEvidence) {
    accumulateEvidence(aggregates[normalizePc(evidence.pitchClass)]!, evidence);
  }
  const histogram = aggregates.map((entry) => entry.weight);
  const cores = rankedDominantCores(candidates);
  const operations = {
    candidateVisits: candidates.length,
    evidenceVisits: input.noteEvidence.length,
    dominantRootEvaluations: cores.length,
  };
  if (cores.length === 0) {
    return diagnostics("unknown", "no-supported-dominant-core", [], operations);
  }

  const eligibleRoots = cores.filter((core) =>
    hasAlteredEvidence(histogram, core.chord.root, "b9")
    || hasAlteredEvidence(histogram, core.chord.root, "b13"));
  if (eligibleRoots.length > 1
    && Math.abs(eligibleRoots[0]!.score - eligibleRoots[1]!.score) <= 1e-9) {
    return diagnostics("unknown", "ambiguous-dominant-root", [], operations);
  }

  const current = candidates[0]!.chord;
  const baselineAlternatives = selectQuickChordAlternatives(
    current,
    candidates.slice(1).map((candidate) => ({
      chord: candidate.chord,
      confidence: clamp(candidate.totalScore),
    })),
  );
  const withB9 = addObservedFlatNineDominantCandidate(
    current,
    baselineAlternatives,
    candidates.map((candidate) => ({ chord: candidate.chord, rawScore: candidate.totalScore })),
    histogram,
  );

  const result: AlteredTensionCandidateDiagnostic[] = [];
  withB9.forEach((alternative, index) => {
    if (!alternative.chord.tensions.includes("b9")) return;
    const core = cores.find((entry) => normalizePc(entry.chord.root)
      === normalizePc(alternative.chord.root));
    if (!core) return;
    result.push(candidateDiagnostic(
      "b9",
      "existing-observed-b9",
      alternative.chord,
      index + 1,
      core,
      aggregates,
      input,
    ));
  });

  const existingKeys = new Set([
    canonicalChordAlternative(current),
    ...withB9.map((entry) => canonicalChordAlternative(entry.chord)),
  ]);
  let b13Rank = withB9.length + 1;
  let generatedB13 = 0;
  for (const core of cores) {
    if (generatedB13 >= alteredTensionsShadowLimits.generatedPerAlteration) break;
    if (!hasAlteredEvidence(histogram, core.chord.root, "b13")) continue;
    const chord = makeChordSymbol(core.chord.root, "dom7", ["b13"], core.chord.bass);
    const key = canonicalChordAlternative(chord);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    result.push(candidateDiagnostic(
      "b13",
      "shadow-compositional-b13",
      chord,
      b13Rank,
      core,
      aggregates,
      input,
    ));
    b13Rank += 1;
    generatedB13 += 1;
  }

  result.sort((left, right) => left.alteration.localeCompare(right.alteration)
    || left.candidateRank - right.candidateRank
    || canonicalChordAlternative(left.chord).localeCompare(canonicalChordAlternative(right.chord)));
  return diagnostics(
    "available",
    result.length === 0 ? "no-altered-evidence" : "evaluated",
    result,
    operations,
  );
}

function candidateDiagnostic(
  alteration: AlteredTensionKind,
  generation: AlteredTensionCandidateDiagnostic["generation"],
  chord: ChordSymbol,
  candidateRank: number,
  core: RankedCore,
  aggregates: readonly PitchClassAggregate[],
  input: AlteredTensionsShadowInput,
): AlteredTensionCandidateDiagnostic {
  const altered = aggregates[normalizePc(core.chord.root + (alteration === "b9" ? 1 : 8))]!;
  const totalWeight = Math.max(1e-9, aggregates.reduce((sum, entry) => sum + entry.weight, 0));
  const coreWeight = [0, 4, 7, 10]
    .map((value) => normalizePc(core.chord.root + value))
    .reduce((sum, pitchClass) => sum + aggregates[pitchClass]!.weight, 0);
  const alteredSupport = altered.weight / totalWeight;
  const onsetStrength = altered.weight > 0 ? altered.onsetStrengthWeight / altered.weight : 0;
  const segmentBeats = input.segmentEndBeat - input.segmentStartBeat;
  const persistence = clamp(altered.durationWeight / Math.max(1e-9, altered.weight * segmentBeats));
  const sourceSupport = altered.weight > 0
    ? (Object.entries(altered.sourceWeights) as Array<[AlteredTensionEvidenceSource, number]>)
      .reduce((sum, [source, weight]) => sum + weight * sourceFactor[source], 0) / altered.weight
    : 0;
  const coreCoverage = coreWeight / totalWeight;
  const shadowScore = core.score
    + alteredSupport * 0.045
    + onsetStrength * 0.02
    + persistence * 0.02
    + sourceSupport * 0.015;

  return {
    alteration,
    generation,
    chord: makeChordSymbol(
      chord.root,
      chord.quality,
      [...chord.tensions],
      chord.bass,
    ),
    candidateRank,
    sourceCoreRank: core.rank,
    rankDelta: candidateRank - core.rank,
    scoreComponents: {
      sourceCoreScore: round(core.score),
      coreCoverage: round(coreCoverage),
      alteredSupport: round(alteredSupport),
      onsetStrength: round(onsetStrength),
      persistence: round(persistence),
      sourceSupport: round(sourceSupport),
      shadowScore: round(shadowScore),
    },
    evidence: {
      observations: altered.observations,
      alteredWeight: round(altered.weight),
      coreWeight: round(coreWeight),
      segmentBeats: round(segmentBeats),
      onsetBeatWeights: {
        barStart: round(altered.onsetBeatWeights.barStart),
        midBarStrong: round(altered.onsetBeatWeights.midBarStrong),
        otherBeat: round(altered.onsetBeatWeights.otherBeat),
        offBeat: round(altered.onsetBeatWeights.offBeat),
      },
      sourceWeights: {
        bass: round(altered.sourceWeights.bass),
        harmony: round(altered.sourceWeights.harmony),
        melody: round(altered.sourceWeights.melody),
        unknown: round(altered.sourceWeights.unknown),
      },
    },
  };
}

function rankedDominantCores(candidates: readonly ChordCandidateScore[]): RankedCore[] {
  const roots = new Set<number>();
  const result: RankedCore[] = [];
  candidates.forEach((candidate, index) => {
    if (candidate.chord.quality !== "dom7" || candidate.chord.tensions.length > 0) return;
    const root = normalizePc(candidate.chord.root);
    if (roots.has(root)) return;
    roots.add(root);
    result.push({ chord: candidate.chord, score: candidate.totalScore, rank: index + 1 });
  });
  return result;
}

function hasAlteredEvidence(
  histogram: readonly number[],
  root: number,
  alteration: AlteredTensionKind,
): boolean {
  const alteredInterval = alteration === "b9" ? 1 : 8;
  return [0, 4, 7, 10, alteredInterval].every((interval) =>
    (histogram[normalizePc(root + interval)] ?? 0) > 0);
}

function accumulateEvidence(
  aggregate: PitchClassAggregate,
  evidence: AlteredTensionNoteEvidence,
): void {
  aggregate.observations += 1;
  aggregate.weight += evidence.weight;
  aggregate.durationWeight += evidence.weight * evidence.durationBeats;
  const bucket = beatBucket(evidence.onsetBeat);
  aggregate.onsetBeatWeights[bucket] += evidence.weight;
  aggregate.onsetStrengthWeight += evidence.weight * beatStrength(bucket);
  aggregate.sourceWeights[evidence.source] += evidence.weight;
}

function beatBucket(onsetBeat: number): keyof PitchClassAggregate["onsetBeatWeights"] {
  const phase = ((onsetBeat % 4) + 4) % 4;
  if (Math.abs(phase) <= 1e-9) return "barStart";
  if (Math.abs(phase - 2) <= 1e-9) return "midBarStrong";
  if (Math.abs(phase - Math.round(phase)) <= 1e-9) return "otherBeat";
  return "offBeat";
}

function beatStrength(bucket: keyof PitchClassAggregate["onsetBeatWeights"]): number {
  if (bucket === "barStart") return 1;
  if (bucket === "midBarStrong") return 0.75;
  if (bucket === "otherBeat") return 0.5;
  return 0.25;
}

function emptyAggregates(): PitchClassAggregate[] {
  return Array.from({ length: 12 }, () => ({
    observations: 0,
    weight: 0,
    durationWeight: 0,
    onsetStrengthWeight: 0,
    onsetBeatWeights: { barStart: 0, midBarStrong: 0, otherBeat: 0, offBeat: 0 },
    sourceWeights: { bass: 0, harmony: 0, melody: 0, unknown: 0 },
  }));
}

function isValidInput(input: unknown): input is AlteredTensionsShadowInput {
  if (!isRecord(input)) return false;
  const { segmentStartBeat, segmentEndBeat, rankedCandidates, noteEvidence } = input;
  if (!isBoundedNumber(segmentStartBeat, 0, maximumFiniteMagnitude)
    || !isBoundedNumber(segmentEndBeat, 0, maximumFiniteMagnitude)
    || segmentEndBeat <= segmentStartBeat
    || segmentEndBeat - segmentStartBeat > maximumSegmentBeats
    || !isDenseArray(rankedCandidates)
    || rankedCandidates.length === 0
    || rankedCandidates.length > alteredTensionsShadowLimits.candidates
    || !rankedCandidates.every(isValidRankedCandidate)
    || !isDenseArray(noteEvidence)
    || noteEvidence.length > alteredTensionsShadowLimits.evidence) return false;

  return noteEvidence.every((evidence) =>
    isValidNoteEvidence(evidence, segmentStartBeat, segmentEndBeat));
}

function isValidRankedCandidate(value: unknown): value is ChordCandidateScore {
  if (!isRecord(value)
    || !isValidChord(value.chord)
    || !candidateScoreFields.every((field) =>
      isBoundedNumber(value[field], -maximumFiniteMagnitude, maximumFiniteMagnitude))
    || !isDenseArray(value.evidence)) return false;

  return value.evidence.every((entry) => {
    if (!isRecord(entry)
      || typeof entry.kind !== "string"
      || entry.kind.length === 0
      || entry.kind.length > 128
      || !isBoundedNumber(entry.value, -maximumFiniteMagnitude, maximumFiniteMagnitude)) return false;
    return entry.pitchClass === undefined
      || isIntegerInRange(entry.pitchClass, 0, 11);
  });
}

function isValidChord(value: unknown): value is ChordSymbol {
  if (!isRecord(value)
    || !isIntegerInRange(value.root, 0, 11)
    || typeof value.quality !== "string"
    || !supportedQualities.has(value.quality)
    || !isDenseArray(value.tensions)
    || !value.tensions.every((tension) =>
      typeof tension === "string" && supportedTensions.has(tension))
    || typeof value.label !== "string"
    || value.label.length === 0
    || value.label.length > 256) return false;
  return value.bass === undefined || isIntegerInRange(value.bass, 0, 11);
}

function isValidNoteEvidence(
  value: unknown,
  segmentStartBeat: number,
  segmentEndBeat: number,
): value is AlteredTensionNoteEvidence {
  if (!isRecord(value)
    || !isIntegerInRange(value.pitchClass, 0, 11)
    || typeof value.source !== "string"
    || !supportedSources.has(value.source as AlteredTensionEvidenceSource)
    || !isBoundedNumber(value.onsetBeat, segmentStartBeat, segmentEndBeat)
    || value.onsetBeat >= segmentEndBeat
    || !isBoundedNumber(value.durationBeats, Number.EPSILON, maximumSegmentBeats)
    || !isBoundedNumber(value.weight, Number.EPSILON, maximumFiniteMagnitude)) return false;
  return value.onsetBeat + value.durationBeats <= segmentEndBeat;
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum;
}

function diagnostics(
  status: AlteredTensionsShadowDiagnostics["status"],
  reason: AlteredTensionsShadowDiagnostics["reason"],
  candidates: readonly AlteredTensionCandidateDiagnostic[],
  operations: AlteredTensionsShadowDiagnostics["operations"],
): AlteredTensionsShadowDiagnostics {
  return {
    version: alteredTensionsShadowVersion,
    status,
    reason,
    candidates,
    rankOneDelta: zeroRankDelta,
    operations,
  };
}

function invalidDiagnostics(): AlteredTensionsShadowDiagnostics {
  return diagnostics("unknown", "invalid-input", [], {
    candidateVisits: 0,
    evidenceVisits: 0,
    dominantRootEvaluations: 0,
  });
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
