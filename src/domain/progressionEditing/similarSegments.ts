import type { ChordQuality, ChordSymbol } from "../types";
import type {
  EditableChordSlot,
  SimilarSegmentCandidate,
  SimilarSegmentReasonCode,
  SimilarityContext,
  SimilarityContextBuildOptions,
  SimilarityRoleProfile,
  SimilaritySegmentContext,
} from "./types";

export const SIMILAR_SEGMENT_THRESHOLD = 0.86;
export const LEGACY_SIMILARITY_VOICE_ID = "legacy:all-non-percussion";

export const SIMILAR_SEGMENT_REASON_CODES = Object.freeze({
  weightedPcp: "weighted-pcp-match",
  bassProfile: "bass-profile-match",
  originalRoot: "original-root-match",
  chordFamily: "chord-family-match",
  duration: "duration-match",
  metricPosition: "metric-position-match",
  keyContext: "key-context-match",
  previousChord: "previous-chord-match",
  nextChord: "next-chord-match",
  enabledVoices: "enabled-voices-match",
  roleProfiles: "role-profiles-match",
  chordSymbolFallback: "chord-symbol-fallback",
} as const satisfies Record<string, SimilarSegmentReasonCode>);

const componentWeights = Object.freeze({
  weightedPcp: 0.2,
  bassProfile: 0.14,
  originalRoot: 0.13,
  chordFamily: 0.13,
  duration: 0.08,
  metricPosition: 0.06,
  keyContext: 0.05,
  previousChord: 0.06,
  nextChord: 0.06,
  enabledVoices: 0.04,
  roleProfiles: 0.05,
});

const qualityIntervals: Record<ChordQuality, readonly number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  min7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  maj9: [0, 2, 4, 7, 11],
  min9: [0, 2, 3, 7, 10],
  dom9: [0, 2, 4, 7, 10],
  min11: [0, 2, 3, 5, 7, 10],
  dom13: [0, 2, 4, 7, 9, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dom7sus4: [0, 5, 7, 10],
  add9: [0, 2, 4, 7],
  six: [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  sixNine: [0, 2, 4, 7, 9],
};

const tensionIntervals = {
  "9": 2,
  b9: 1,
  "#9": 3,
  "11": 5,
  "#11": 6,
  "13": 9,
  b13: 8,
} as const;

export function buildSimilarityContext(
  timeline: readonly EditableChordSlot[],
  options: SimilarityContextBuildOptions = {},
): SimilarityContext {
  const ordered = [...timeline].sort(compareSlotPosition);
  const voiceContext = options.voiceContext ?? {
    enabledVoiceIds: [LEGACY_SIMILARITY_VOICE_ID],
    roleProfiles: {
      [LEGACY_SIMILARITY_VOICE_ID]: {
        role: "mixed",
        confidence: 1,
        rootWeight: 1,
        qualityWeight: 1,
      },
    },
  };
  const enabledVoiceIds = [...voiceContext.enabledVoiceIds].sort(asciiCompare);
  const roleProfiles = Object.fromEntries(
    Object.entries(voiceContext.roleProfiles).sort(([left], [right]) => asciiCompare(left, right)),
  );

  return {
    segments: Object.fromEntries(ordered.map((slot, index) => [slot.id, {
      weightedPcp: chordPitchProfile(slot.originalChord),
      bassProfile: chordBassProfile(slot.originalChord),
      originalRoot: normalizePitchClass(slot.originalChord.root),
      family: slot.originalChord.quality,
      durationBeats: slot.position.durationBeats,
      metricPosition: slot.position.beat,
      ...(options.key !== undefined ? { key: options.key } : {}),
      ...(ordered[index - 1]?.originalChord
        ? { previousChord: ordered[index - 1]!.originalChord }
        : {}),
      ...(ordered[index + 1]?.originalChord
        ? { nextChord: ordered[index + 1]!.originalChord }
        : {}),
      enabledVoiceIds,
      roleProfiles,
    }])),
  };
}

interface ResolvedFeatures {
  weightedPcp: number[];
  bassProfile: number[];
  originalRoot: number;
  family: string;
  durationBeats: number;
  metricPosition: number;
  key?: string;
  previousChord?: ChordSymbol;
  nextChord?: ChordSymbol;
  enabledVoiceIds?: readonly string[];
  roleProfiles?: Readonly<Record<string, SimilarityRoleProfile>>;
  usedChordSymbolFallback: boolean;
}

interface ScoreComponent {
  score: number;
  weight: number;
  reason: SimilarSegmentReasonCode;
}

export function findSimilarSegments(
  timeline: readonly EditableChordSlot[],
  editedSegment: EditableChordSlot,
  context: SimilarityContext,
): SimilarSegmentCandidate[] {
  const ordered = [...timeline].sort(compareSlotPosition);
  const editedIndex = ordered.findIndex((slot) => slot.id === editedSegment.id);
  const source = resolveFeatures(
    editedSegment,
    context.segments?.[editedSegment.id],
    editedIndex,
    ordered,
  );

  return ordered
    .filter((slot) => slot.id !== editedSegment.id)
    .map((slot) => scoreCandidate(slot, editedSegment, source, context, ordered))
    .filter((candidate): candidate is SimilarSegmentCandidate => candidate !== null)
    .sort((left, right) => {
      const similarityOrder = right.similarity - left.similarity;
      if (similarityOrder !== 0) {
        return similarityOrder;
      }
      const leftSlot = ordered.find((slot) => slot.id === left.segmentId)!;
      const rightSlot = ordered.find((slot) => slot.id === right.segmentId)!;
      return compareSlotPosition(leftSlot, rightSlot);
    });
}

function scoreCandidate(
  slot: EditableChordSlot,
  editedSegment: EditableChordSlot,
  source: ResolvedFeatures,
  context: SimilarityContext,
  ordered: readonly EditableChordSlot[],
): SimilarSegmentCandidate | null {
  if (chordsEqual(slot.currentChord, editedSegment.currentChord)) {
    return null;
  }
  if (!sameCorrectionIdentity(editedSegment.originalChord, slot.originalChord)) {
    return null;
  }

  const index = ordered.findIndex((candidate) => candidate.id === slot.id);
  const candidate = resolveFeatures(slot, context.segments?.[slot.id], index, ordered);
  if (
    source.originalRoot !== candidate.originalRoot
    || source.family !== candidate.family
    || dominantPitchClass(source.bassProfile) !== dominantPitchClass(candidate.bassProfile)
  ) {
    return null;
  }

  const components: ScoreComponent[] = [
    component(
      cosineSimilarity(source.weightedPcp, candidate.weightedPcp),
      componentWeights.weightedPcp,
      SIMILAR_SEGMENT_REASON_CODES.weightedPcp,
    ),
    component(
      cosineSimilarity(source.bassProfile, candidate.bassProfile),
      componentWeights.bassProfile,
      SIMILAR_SEGMENT_REASON_CODES.bassProfile,
    ),
    component(
      Number(source.originalRoot === candidate.originalRoot),
      componentWeights.originalRoot,
      SIMILAR_SEGMENT_REASON_CODES.originalRoot,
    ),
    component(
      Number(source.family === candidate.family),
      componentWeights.chordFamily,
      SIMILAR_SEGMENT_REASON_CODES.chordFamily,
    ),
    component(
      numericSimilarity(source.durationBeats, candidate.durationBeats),
      componentWeights.duration,
      SIMILAR_SEGMENT_REASON_CODES.duration,
    ),
    component(
      numericSimilarity(source.metricPosition, candidate.metricPosition),
      componentWeights.metricPosition,
      SIMILAR_SEGMENT_REASON_CODES.metricPosition,
    ),
  ];

  addOptionalComponent(
    components,
    source.key,
    candidate.key,
    (left, right) => Number(left.trim().toLowerCase() === right.trim().toLowerCase()),
    componentWeights.keyContext,
    SIMILAR_SEGMENT_REASON_CODES.keyContext,
  );
  addOptionalComponent(
    components,
    source.previousChord,
    candidate.previousChord,
    (left, right) => Number(chordsEqual(left, right)),
    componentWeights.previousChord,
    SIMILAR_SEGMENT_REASON_CODES.previousChord,
  );
  addOptionalComponent(
    components,
    source.nextChord,
    candidate.nextChord,
    (left, right) => Number(chordsEqual(left, right)),
    componentWeights.nextChord,
    SIMILAR_SEGMENT_REASON_CODES.nextChord,
  );
  addOptionalComponent(
    components,
    source.enabledVoiceIds,
    candidate.enabledVoiceIds,
    setSimilarity,
    componentWeights.enabledVoices,
    SIMILAR_SEGMENT_REASON_CODES.enabledVoices,
  );
  addOptionalComponent(
    components,
    source.roleProfiles,
    candidate.roleProfiles,
    roleProfileSimilarity,
    componentWeights.roleProfiles,
    SIMILAR_SEGMENT_REASON_CODES.roleProfiles,
  );

  const availableWeight = components.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedScore = components.reduce(
    (sum, entry) => sum + entry.score * entry.weight,
    0,
  );
  const similarity = roundSimilarity(weightedScore / availableWeight);
  if (similarity < SIMILAR_SEGMENT_THRESHOLD) {
    return null;
  }

  const reasons = components
    .filter((entry) => entry.score >= 0.9)
    .map((entry) => entry.reason);
  if (source.usedChordSymbolFallback || candidate.usedChordSymbolFallback) {
    reasons.push(SIMILAR_SEGMENT_REASON_CODES.chordSymbolFallback);
  }

  return { segmentId: slot.id, similarity, reasons };
}

function resolveFeatures(
  slot: EditableChordSlot,
  supplied: SimilaritySegmentContext | undefined,
  index: number,
  ordered: readonly EditableChordSlot[],
): ResolvedFeatures {
  const suppliedPcp = usableProfile(supplied?.weightedPcp);
  const suppliedBass = usableProfile(supplied?.bassProfile);
  const previous = index > 0 ? ordered[index - 1]?.originalChord : undefined;
  const next = index >= 0 ? ordered[index + 1]?.originalChord : undefined;

  return {
    weightedPcp: suppliedPcp ?? chordPitchProfile(slot.originalChord),
    bassProfile: suppliedBass ?? chordBassProfile(slot.originalChord),
    originalRoot: normalizePitchClass(supplied?.originalRoot ?? slot.originalChord.root),
    family: supplied?.family ?? slot.originalChord.quality,
    durationBeats: supplied?.durationBeats ?? slot.position.durationBeats,
    metricPosition: supplied?.metricPosition ?? slot.position.beat,
    ...(supplied?.key !== undefined ? { key: supplied.key } : {}),
    ...(supplied?.previousChord !== undefined
      ? { previousChord: supplied.previousChord }
      : previous !== undefined ? { previousChord: previous } : {}),
    ...(supplied?.nextChord !== undefined
      ? { nextChord: supplied.nextChord }
      : next !== undefined ? { nextChord: next } : {}),
    ...(supplied?.enabledVoiceIds !== undefined
      ? { enabledVoiceIds: supplied.enabledVoiceIds }
      : {}),
    ...(supplied?.roleProfiles !== undefined ? { roleProfiles: supplied.roleProfiles } : {}),
    usedChordSymbolFallback: !suppliedPcp
      || !suppliedBass
      || supplied?.originalRoot === undefined
      || supplied.family === undefined,
  };
}

function sameCorrectionIdentity(left: ChordSymbol, right: ChordSymbol): boolean {
  return normalizePitchClass(left.root) === normalizePitchClass(right.root)
    && left.quality === right.quality
    && effectiveBass(left) === effectiveBass(right);
}

function chordsEqual(left: ChordSymbol, right: ChordSymbol): boolean {
  return sameCorrectionIdentity(left, right)
    && [...left.tensions].sort().join(",") === [...right.tensions].sort().join(",");
}

function chordPitchProfile(chord: ChordSymbol): number[] {
  const profile = zeros();
  for (const interval of qualityIntervals[chord.quality]) {
    profile[normalizePitchClass(chord.root + interval)] += 1;
  }
  for (const tension of chord.tensions) {
    profile[normalizePitchClass(chord.root + tensionIntervals[tension])] += 0.75;
  }
  profile[normalizePitchClass(chord.root)] += 0.25;
  profile[effectiveBass(chord)] += 0.5;
  return profile;
}

function chordBassProfile(chord: ChordSymbol): number[] {
  const profile = zeros();
  profile[effectiveBass(chord)] = 1;
  return profile;
}

function usableProfile(values: readonly number[] | undefined): number[] | undefined {
  if (!values || values.length < 12) {
    return undefined;
  }
  const profile = values.slice(0, 12).map((value) => (
    Number.isFinite(value) ? Math.max(0, value) : 0
  ));
  return profile.some((value) => value > 0) ? profile : undefined;
}

function component(
  score: number,
  weight: number,
  reason: SimilarSegmentReasonCode,
): ScoreComponent {
  return { score: clamp01(score), weight, reason };
}

function addOptionalComponent<T>(
  components: ScoreComponent[],
  left: T | undefined,
  right: T | undefined,
  compare: (left: T, right: T) => number,
  weight: number,
  reason: SimilarSegmentReasonCode,
): void {
  if (left === undefined && right === undefined) {
    return;
  }
  const score = left === undefined || right === undefined ? 0 : compare(left, right);
  components.push(component(score, weight, reason));
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < 12; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function numericSimilarity(left: number, right: number): number {
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return 0;
  }
  return clamp01(1 - Math.abs(left - right) / Math.max(1, Math.abs(left), Math.abs(right)));
}

function setSimilarity(left: readonly string[], right: readonly string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const value of union) {
    if (leftSet.has(value) && rightSet.has(value)) {
      intersection += 1;
    }
  }
  return intersection / union.size;
}

function roleProfileSimilarity(
  left: Readonly<Record<string, SimilarityRoleProfile>>,
  right: Readonly<Record<string, SimilarityRoleProfile>>,
): number {
  const ids = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  if (ids.length === 0) {
    return 1;
  }
  const score = ids.reduce((sum, id) => {
    const leftProfile = left[id];
    const rightProfile = right[id];
    if (!leftProfile || !rightProfile || leftProfile.role !== rightProfile.role) {
      return sum;
    }
    const details = [
      optionalNumericSimilarity(leftProfile.confidence, rightProfile.confidence),
      optionalNumericSimilarity(leftProfile.rootWeight, rightProfile.rootWeight),
      optionalNumericSimilarity(leftProfile.qualityWeight, rightProfile.qualityWeight),
    ].filter((value): value is number => value !== undefined);
    const detailScore = details.length > 0
      ? details.reduce((total, value) => total + value, 0) / details.length
      : 1;
    return sum + 0.8 + detailScore * 0.2;
  }, 0);
  return score / ids.length;
}

function optionalNumericSimilarity(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  if (left === undefined && right === undefined) {
    return undefined;
  }
  if (left === undefined || right === undefined) {
    return 0;
  }
  return numericSimilarity(left, right);
}

function dominantPitchClass(profile: readonly number[]): number {
  let dominant = 0;
  for (let index = 1; index < 12; index += 1) {
    if ((profile[index] ?? 0) > (profile[dominant] ?? 0)) {
      dominant = index;
    }
  }
  return dominant;
}

function compareSlotPosition(left: EditableChordSlot, right: EditableChordSlot): number {
  return left.position.bar - right.position.bar
    || left.position.beat - right.position.beat
    || asciiCompare(left.id, right.id);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function effectiveBass(chord: ChordSymbol): number {
  return normalizePitchClass(chord.bass ?? chord.root);
}

function normalizePitchClass(value: number): number {
  return ((Math.trunc(value) % 12) + 12) % 12;
}

function zeros(): number[] {
  return Array.from({ length: 12 }, () => 0);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundSimilarity(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
