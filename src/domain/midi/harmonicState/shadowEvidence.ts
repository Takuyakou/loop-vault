import type { P524BassState, P524HarmonicRhythm } from "./contracts";

export interface P524ShadowNote {
  readonly id: string;
  readonly pitch: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly velocity: number;
  readonly rolePrior?: "bass" | "upper" | "unknown";
}

export interface P524ShadowInput {
  readonly notes: readonly P524ShadowNote[];
  readonly meter: readonly [number, number];
  readonly totalBeats: number;
}

export interface P524BassCandidateEvidence {
  readonly noteId: string;
  readonly pitchClass: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly register: number;
  readonly duration: number;
  readonly strongBeat: number;
  readonly continuity: number;
  readonly repetitionOrStepwise: number;
  readonly textureSeparation: number;
  readonly rolePrior: number;
  readonly combinedScore: number;
  readonly qualifies: boolean;
}

export interface P524OperationEvidence {
  readonly inputNotes: number;
  readonly candidateScores: number;
  readonly onsetGroups: number;
  readonly runObservations: number;
  readonly profileEventUpdates: number;
  readonly profileSweepCells: number;
  readonly boundaryComparisons: number;
  readonly stateAssignments: number;
}

export interface P524BassLaneEvidence {
  readonly status: "supported" | "unavailable";
  readonly states: readonly P524BassState[];
  readonly candidates: readonly P524BassCandidateEvidence[];
  readonly operations: P524OperationEvidence;
  readonly reason?: "invalid-input" | "no-safe-low-register-evidence" | "insufficient-persistent-context";
}

export interface P524HarmonicRhythmEvidence {
  readonly status: "supported" | "unknown";
  readonly quarterBeats: P524HarmonicRhythm;
  readonly legacyFallback: boolean;
  readonly candidateSupport: Readonly<Record<1 | 2 | 4 | 8, number>>;
  readonly observedStableDurations: readonly number[];
  readonly structuralBoundaries: readonly number[];
  readonly operations: P524OperationEvidence;
  readonly reason?:
    | "invalid-input"
    | "invalid-bass-lane"
    | "unsupported-meter"
    | "mixed-global-periodicity"
    | "unsupported-global-periodicity"
    | "insufficient-global-evidence";
}

const bassRegisterCeilingExclusive = 49;
const upperRegisterFloor = 48;
const deepBassRegisterMaximum = 45;
const minimumBassDurationBeats = 0.25;
const stableRepeatedAttackMaximumGap = 1.25;
const minimumPersistentUpperActivity = 0.5;
const minimumUpperSetDistance = 0.2;
const maximumShadowNotes = 100_000;
const maximumShadowBeats = 100_000;

interface BassObservation {
  readonly pitchClass: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly evidence: P524BassCandidateEvidence;
}

interface StableRun {
  readonly pitchClass: number;
  readonly startBeat: number;
  readonly endBeat: number;
  readonly count: number;
  readonly explicitBassPriorCount: number;
}

interface UpperBoundaryEvidence {
  readonly boundaries: readonly number[];
  readonly beatSets: readonly ReadonlySet<number>[];
  readonly profileEventUpdates: number;
  readonly profileSweepCells: number;
  readonly boundaryComparisons: number;
}

const emptyOperations = (): P524OperationEvidence => ({
  inputNotes: 0,
  candidateScores: 0,
  onsetGroups: 0,
  runObservations: 0,
  profileEventUpdates: 0,
  profileSweepCells: 0,
  boundaryComparisons: 0,
  stateAssignments: 0,
});

export function estimateP524BassLane(input: unknown): P524BassLaneEvidence {
  try {
    const parsed = parseShadowInput(input);
    if (parsed === undefined) return unavailableBassLane("invalid-input");
    return estimateBassLaneInternal(parsed);
  } catch {
    return unavailableBassLane("invalid-input");
  }
}

export function estimateP524HarmonicRhythm(
  input: unknown,
  suppliedBassLane?: unknown,
): P524HarmonicRhythmEvidence {
  try {
    if (isRecord(input) && isDenseMeter(input.meter)
      && (input.meter[0] !== 4 || input.meter[1] !== 4)) {
      return unknownHarmonicRhythm("unsupported-meter");
    }
    const parsed = parseShadowInput(input);
    if (parsed === undefined) return unknownHarmonicRhythm("invalid-input");
    const derivedBassLane = estimateBassLaneInternal(parsed);
    if (suppliedBassLane !== undefined
      && (!validBassLaneEvidence(suppliedBassLane, parsed.totalBeats)
        || !deepEqualData(suppliedBassLane, derivedBassLane))) {
      return unknownHarmonicRhythm("invalid-bass-lane", operationsForInput(parsed));
    }
    return estimateHarmonicRhythmInternal(parsed, derivedBassLane);
  } catch {
    return unknownHarmonicRhythm("invalid-input");
  }
}

function estimateBassLaneInternal(input: P524ShadowInput): P524BassLaneEvidence {
  const sorted = [...input.notes].sort(compareNotes);
  const registerCandidates = sorted.filter((note) => note.pitch < bassRegisterCeilingExclusive);
  if (registerCandidates.length === 0) {
    return unavailableBassLane("no-safe-low-register-evidence", input.notes.length);
  }

  const nearestUpperByNoteId = indexNearestUpperPitch(sorted);
  const rootedStepwiseByNoteId = indexRootedStepwiseContinuity(registerCandidates);
  const evidence = registerCandidates.map((note, index) => scoreBassCandidate(
    note,
    index > 0 ? registerCandidates[index - 1] : undefined,
    nearestUpperByNoteId.get(note.id),
    rootedStepwiseByNoteId.get(note.id) ?? false,
  ));
  const strongestByOnset = new Map<number, P524BassCandidateEvidence>();
  for (const candidate of evidence) {
    if (!candidate.qualifies) continue;
    const prior = strongestByOnset.get(candidate.startBeat);
    if (prior === undefined || compareCandidateStrength(candidate, prior) < 0) {
      strongestByOnset.set(candidate.startBeat, candidate);
    }
  }
  const observations: BassObservation[] = [...strongestByOnset.values()]
    .sort((left, right) => left.startBeat - right.startBeat || left.noteId.localeCompare(right.noteId))
    .map((candidate) => ({
      pitchClass: candidate.pitchClass,
      startBeat: candidate.startBeat,
      durationBeats: candidate.durationBeats,
      evidence: candidate,
    }));
  if (!hasPersistentBassAnchor(observations, input.totalBeats)) {
    return {
      ...unavailableBassLane("insufficient-persistent-context", input.notes.length),
      candidates: evidence,
      operations: {
        ...operationsForInput(input),
        candidateScores: evidence.length,
        onsetGroups: strongestByOnset.size,
        runObservations: observations.length,
      },
    };
  }

  const upperEvidence = detectPersistentUpperBoundaries(input);
  const stableRuns = findStableRuns(observations, new Set(upperEvidence.boundaries));
  const states = stableRuns.length > 0
    ? statesFromStableRuns(stableRuns, observations, input.totalBeats)
    : [stateFromGlobalAnchor(observations, input.totalBeats)];

  return {
    status: "supported",
    states,
    candidates: evidence,
    operations: {
      inputNotes: input.notes.length,
      candidateScores: evidence.length,
      onsetGroups: strongestByOnset.size,
      runObservations: observations.length,
      profileEventUpdates: upperEvidence.profileEventUpdates,
      profileSweepCells: upperEvidence.profileSweepCells,
      boundaryComparisons: upperEvidence.boundaryComparisons,
      stateAssignments: observations.length,
    },
  };
}

function estimateHarmonicRhythmInternal(
  input: P524ShadowInput,
  bassLane: P524BassLaneEvidence,
): P524HarmonicRhythmEvidence {
  if (!Number.isInteger(input.totalBeats)) {
    return unknownHarmonicRhythm("unsupported-global-periodicity", operationsForInput(input));
  }
  const upperEvidence = detectPersistentUpperBoundaries(input);
  const boundaries = new Set(upperEvidence.boundaries);
  if (bassLane.status === "supported") {
    bassLane.states.slice(1).forEach((state) => boundaries.add(state.startBeat));
  }
  const structuralBoundaries = [...boundaries].sort((left, right) => left - right);
  const operations: P524OperationEvidence = {
    inputNotes: input.notes.length,
    candidateScores: bassLane.operations.candidateScores,
    onsetGroups: bassLane.operations.onsetGroups,
    runObservations: bassLane.operations.runObservations,
    profileEventUpdates: bassLane.operations.profileEventUpdates + upperEvidence.profileEventUpdates,
    profileSweepCells: bassLane.operations.profileSweepCells + upperEvidence.profileSweepCells,
    boundaryComparisons: bassLane.operations.boundaryComparisons + upperEvidence.boundaryComparisons,
    stateAssignments: bassLane.operations.stateAssignments + bassLane.states.length,
  };
  const candidateSupport: Record<1 | 2 | 4 | 8, number> = { 1: 0, 2: 0, 4: 0, 8: 0 };

  if (!hasSufficientGlobalCoverage(upperEvidence.beatSets)) {
    return unknownHarmonicRhythm("insufficient-global-evidence", operations, candidateSupport, [], structuralBoundaries);
  }

  if (structuralBoundaries.length === 0) {
    const metricSupport = metricAlignmentSupport(input, upperEvidence.beatSets);
    if (metricSupport <= 0) {
      return unknownHarmonicRhythm("insufficient-global-evidence", operations, candidateSupport, [], []);
    }
    candidateSupport[4] = metricSupport;
    return {
      status: "supported",
      quarterBeats: 4,
      legacyFallback: false,
      candidateSupport,
      observedStableDurations: [],
      structuralBoundaries: [],
      operations,
    };
  }

  const durations = segmentDurations(structuralBoundaries, input.totalBeats);
  durations.forEach((duration) => {
    if (isSupportedPeriod(duration)) candidateSupport[duration] += 1;
  });
  const uniqueDurations = uniqueSorted(durations);
  if (uniqueDurations.length !== 1) {
    return unknownHarmonicRhythm(
      "mixed-global-periodicity",
      operations,
      candidateSupport,
      durations,
      structuralBoundaries,
    );
  }
  const period = uniqueDurations[0];
  if (!isSupportedPeriod(period)) {
    return unknownHarmonicRhythm(
      "unsupported-global-periodicity",
      operations,
      candidateSupport,
      durations,
      structuralBoundaries,
    );
  }
  return {
    status: "supported",
    quarterBeats: period,
    legacyFallback: false,
    candidateSupport,
    observedStableDurations: durations,
    structuralBoundaries,
    operations,
  };
}

function scoreBassCandidate(
  note: P524ShadowNote,
  previousLowNote: P524ShadowNote | undefined,
  nearestUpper: number | undefined,
  rootedStepwiseContinuity: boolean,
): P524BassCandidateEvidence {
  const pitchClass = normalizePitchClass(note.pitch);
  const register = clamp01((bassRegisterCeilingExclusive - note.pitch) / 24);
  const duration = clamp01(note.durationBeats / 2);
  const position = positiveModulo(note.startBeat, 4);
  const strongBeat = position === 0 ? 1 : Number.isInteger(position) ? 0.6 : 0.1;
  const interval = previousLowNote === undefined ? undefined : Math.abs(note.pitch - previousLowNote.pitch);
  const continuity = previousLowNote === undefined
    ? 0.5
    : clamp01(1 - Math.max(0, note.startBeat - (previousLowNote.startBeat + previousLowNote.durationBeats)) / 4);
  const repetitionOrStepwise = interval === undefined ? 0.5 : interval === 0 ? 1 : interval <= 2 ? 0.8 : 0.25;
  const textureGap = nearestUpper === undefined ? 0 : nearestUpper - note.pitch;
  const textureSeparation = clamp01(textureGap / 12);
  const rolePrior = note.rolePrior === "bass" ? 1 : note.rolePrior === "upper" ? 0 : 0.5;
  const combinedScore = register * 0.25
    + duration * 0.15
    + strongBeat * 0.1
    + continuity * 0.15
    + repetitionOrStepwise * 0.15
    + textureSeparation * 0.15
    + rolePrior * 0.05;
  const independentBassEvidence = note.pitch <= deepBassRegisterMaximum
    || textureGap >= 5
    || note.rolePrior === "bass"
    || rootedStepwiseContinuity;
  const qualifies = note.durationBeats >= minimumBassDurationBeats
    && note.rolePrior !== "upper"
    && independentBassEvidence;
  return {
    noteId: note.id,
    pitchClass,
    startBeat: note.startBeat,
    durationBeats: note.durationBeats,
    register,
    duration,
    strongBeat,
    continuity,
    repetitionOrStepwise,
    textureSeparation,
    rolePrior,
    combinedScore,
    qualifies,
  };
}

function hasPersistentBassAnchor(
  observations: readonly BassObservation[],
  totalBeats: number,
): boolean {
  if (observations.length === 0) return false;
  const support = new Map<number, { count: number; duration: number }>();
  for (const observation of observations) {
    const prior = support.get(observation.pitchClass) ?? { count: 0, duration: 0 };
    support.set(observation.pitchClass, {
      count: prior.count + 1,
      duration: prior.duration + observation.durationBeats,
    });
  }
  const firstBeat = observations[0].startBeat;
  let lastEnd = 0;
  let supportedDuration = 0;
  for (const observation of observations) {
    lastEnd = Math.max(lastEnd, observation.startBeat + observation.durationBeats);
    supportedDuration += observation.durationBeats;
  }
  const temporalCoverage = (lastEnd - firstBeat) / totalBeats;
  const durationCoverage = supportedDuration / totalBeats;
  return temporalCoverage >= 0.5
    && durationCoverage >= 0.25
    && [...support.values()].some((entry) => entry.count >= 2 || entry.duration >= 2);
}

function findStableRuns(
  observations: readonly BassObservation[],
  upperBoundaries: ReadonlySet<number>,
): StableRun[] {
  const runs: StableRun[] = [];
  let index = 0;
  while (index < observations.length) {
    const first = observations[index];
    let endIndex = index;
    let spanEnd = first.startBeat + first.durationBeats;
    let explicitBassPriorCount = first.evidence.rolePrior === 1 ? 1 : 0;
    while (endIndex + 1 < observations.length
      && observations[endIndex + 1].pitchClass === first.pitchClass
      && observations[endIndex + 1].startBeat - observations[endIndex].startBeat <= stableRepeatedAttackMaximumGap) {
      endIndex += 1;
      spanEnd = Math.max(spanEnd, observations[endIndex].startBeat + observations[endIndex].durationBeats);
      if (observations[endIndex].evidence.rolePrior === 1) explicitBassPriorCount += 1;
    }
    const count = endIndex - index + 1;
    const persistent = count >= 2 || spanEnd - first.startBeat >= 2 || explicitBassPriorCount >= 1;
    const previousStableRun = runs[runs.length - 1];
    const compatibleBassContext = previousStableRun !== undefined
      && pitchClassDistance(previousStableRun.pitchClass, first.pitchClass) > 2
      && (count >= 3 || spanEnd - first.startBeat >= 3);
    const contextSupported = runs.length === 0
      || explicitBassPriorCount >= 2
      || upperBoundaries.has(first.startBeat)
      || compatibleBassContext;
    if (persistent && contextSupported) {
      runs.push({
        pitchClass: first.pitchClass,
        startBeat: first.startBeat,
        endBeat: spanEnd,
        count,
        explicitBassPriorCount,
      });
    }
    index = endIndex + 1;
  }
  if (runs.length <= 1 || new Set(runs.map((run) => run.pitchClass)).size === 1) return runs.slice(0, 1);
  return runs;
}

function statesFromStableRuns(
  runs: readonly StableRun[],
  observations: readonly BassObservation[],
  totalBeats: number,
): readonly P524BassState[] {
  const transientByRun = runs.map(() => new Set<number>());
  let runIndex = 0;
  for (const observation of observations) {
    while (runIndex + 1 < runs.length && observation.startBeat >= runs[runIndex + 1].startBeat) runIndex += 1;
    if (observation.pitchClass !== runs[runIndex].pitchClass) transientByRun[runIndex].add(observation.pitchClass);
  }
  return runs.map((run, index) => {
    const startBeat = index === 0 ? 0 : run.startBeat;
    const endBeat = runs[index + 1]?.startBeat ?? totalBeats;
    const transientPitchClasses = uniqueSorted([...transientByRun[index]]);
    return {
      startBeat,
      endBeat,
      pitchClass: run.pitchClass,
      ...(transientPitchClasses.length > 0 ? { transientPitchClasses } : {}),
    };
  });
}

function stateFromGlobalAnchor(
  observations: readonly BassObservation[],
  totalBeats: number,
): P524BassState {
  const support = new Map<number, { count: number; duration: number; firstBeat: number; score: number }>();
  for (const observation of observations) {
    const current = support.get(observation.pitchClass) ?? {
      count: 0,
      duration: 0,
      firstBeat: observation.startBeat,
      score: 0,
    };
    support.set(observation.pitchClass, {
      count: current.count + 1,
      duration: current.duration + observation.durationBeats,
      firstBeat: Math.min(current.firstBeat, observation.startBeat),
      score: current.score + observation.evidence.combinedScore,
    });
  }
  const anchor = [...support.entries()].sort((left, right) => (
    right[1].count - left[1].count
    || right[1].duration - left[1].duration
    || right[1].score - left[1].score
    || left[1].firstBeat - right[1].firstBeat
    || left[0] - right[0]
  ))[0]?.[0];
  if (anchor === undefined) throw new Error("validated Bass Lane anchor is missing");
  const transientPitchClasses = uniqueSorted(observations
    .map((entry) => entry.pitchClass)
    .filter((pitchClass) => pitchClass !== anchor));
  return {
    startBeat: 0,
    endBeat: totalBeats,
    pitchClass: anchor,
    ...(transientPitchClasses.length > 0 ? { transientPitchClasses } : {}),
  };
}

function detectPersistentUpperBoundaries(input: P524ShadowInput): UpperBoundaryEvidence {
  if (!Number.isInteger(input.totalBeats)) {
    return {
      boundaries: [],
      beatSets: [],
      profileEventUpdates: 0,
      profileSweepCells: 0,
      boundaryComparisons: 0,
    };
  }
  const beatCount = input.totalBeats;
  const directActivity = Array.from({ length: 12 }, () => new Float64Array(beatCount));
  const rangeDifference = Array.from({ length: 12 }, () => new Float64Array(beatCount + 1));
  let profileEventUpdates = 0;
  for (const note of input.notes) {
    const isUpperEvidence = note.rolePrior !== "bass"
      && (note.pitch >= upperRegisterFloor || note.rolePrior === "upper");
    if (!isUpperEvidence) continue;
    const pitchClass = normalizePitchClass(note.pitch);
    const noteEnd = note.startBeat + note.durationBeats;
    const firstBeat = Math.floor(note.startBeat);
    const lastBeat = Math.min(beatCount - 1, Math.ceil(noteEnd) - 1);
    if (firstBeat === lastBeat) {
      directActivity[pitchClass][firstBeat] += note.durationBeats * note.velocity;
      profileEventUpdates += 1;
      continue;
    }
    const firstOverlap = firstBeat + 1 - note.startBeat;
    directActivity[pitchClass][firstBeat] += firstOverlap * note.velocity;
    profileEventUpdates += 1;
    const lastOverlap = noteEnd - lastBeat;
    directActivity[pitchClass][lastBeat] += lastOverlap * note.velocity;
    profileEventUpdates += 1;
    const fullStart = firstBeat + 1;
    const fullEndExclusive = lastBeat;
    if (fullStart < fullEndExclusive) {
      rangeDifference[pitchClass][fullStart] += note.velocity;
      rangeDifference[pitchClass][fullEndExclusive] -= note.velocity;
      profileEventUpdates += 2;
    }
  }

  const beatSets = Array.from({ length: beatCount }, () => new Set<number>());
  let profileSweepCells = 0;
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    let runningActivity = 0;
    for (let beat = 0; beat < beatCount; beat += 1) {
      runningActivity += rangeDifference[pitchClass][beat];
      profileSweepCells += 1;
      if (directActivity[pitchClass][beat] + runningActivity >= minimumPersistentUpperActivity) {
        beatSets[beat].add(pitchClass);
      }
    }
  }

  const boundaries = new Set<number>();
  let boundaryComparisons = 0;
  for (let boundary = 1; boundary < beatSets.length; boundary += 1) {
    if (beatSets[boundary - 1].size < 2 || beatSets[boundary].size < 2) continue;
    boundaryComparisons += 1;
    if (pitchClassSetDistance(beatSets[boundary - 1], beatSets[boundary]) >= minimumUpperSetDistance) {
      boundaries.add(boundary);
    }
  }
  for (let boundary = 2; boundary <= beatSets.length - 2; boundary += 1) {
    boundaryComparisons += 1;
    const leftStable = pitchClassSetsEqual(beatSets[boundary - 2], beatSets[boundary - 1]);
    boundaryComparisons += 1;
    const rightStable = pitchClassSetsEqual(beatSets[boundary], beatSets[boundary + 1]);
    if (!leftStable || !rightStable
      || beatSets[boundary - 1].size === 0 || beatSets[boundary].size === 0) continue;
    boundaryComparisons += 1;
    if (pitchClassSetDistance(beatSets[boundary - 1], beatSets[boundary]) >= minimumUpperSetDistance) {
      boundaries.add(boundary);
    }
  }
  return {
    boundaries: [...boundaries].sort((left, right) => left - right),
    beatSets,
    profileEventUpdates,
    profileSweepCells,
    boundaryComparisons,
  };
}

function indexRootedStepwiseContinuity(
  notes: readonly P524ShadowNote[],
): ReadonlyMap<string, boolean> {
  const result = new Map<string, boolean>();
  let previous: P524ShadowNote | undefined;
  let previousRooted = false;
  for (const note of notes) {
    const followsRootedStep: boolean = previous !== undefined
      && previousRooted
      && note.startBeat > previous.startBeat
      && note.startBeat - previous.startBeat <= stableRepeatedAttackMaximumGap
      && Math.abs(note.pitch - previous.pitch) <= 2;
    const rooted: boolean = note.pitch <= deepBassRegisterMaximum || followsRootedStep;
    result.set(note.id, rooted);
    previous = note;
    previousRooted = rooted;
  }
  return result;
}

function indexNearestUpperPitch(
  notes: readonly P524ShadowNote[],
): ReadonlyMap<string, number | undefined> {
  const result = new Map<string, number | undefined>();
  let groupStart = 0;
  while (groupStart < notes.length) {
    let groupEnd = groupStart + 1;
    while (groupEnd < notes.length && notes[groupEnd].startBeat === notes[groupStart].startBeat) groupEnd += 1;
    let nextHigher: number | undefined;
    for (let index = groupEnd - 1; index >= groupStart; index -= 1) {
      const note = notes[index];
      result.set(note.id, nextHigher);
      nextHigher = note.pitch;
    }
    groupStart = groupEnd;
  }
  return result;
}

function hasSufficientGlobalCoverage(
  beatSets: readonly ReadonlySet<number>[],
): boolean {
  if (beatSets.length === 0 || beatSets[0].size === 0 || beatSets[beatSets.length - 1]?.size === 0) return false;
  const coveredBeats = beatSets.filter((entry) => entry.size > 0).length;
  return coveredBeats / beatSets.length >= 0.75;
}

function metricAlignmentSupport(
  input: P524ShadowInput,
  beatSets: readonly ReadonlySet<number>[],
): number {
  if (input.totalBeats < 4 || !hasSufficientGlobalCoverage(beatSets)) return 0;
  const aligned = input.notes.filter((note) => Math.abs(note.startBeat - Math.round(note.startBeat)) <= 0.05).length;
  const alignedRatio = aligned / input.notes.length;
  const occupiedOnsetBeats = new Set(input.notes.map((note) => Math.floor(note.startBeat))).size;
  const onsetCoverage = occupiedOnsetBeats / input.totalBeats;
  return alignedRatio >= 0.75 && onsetCoverage >= 0.25 ? alignedRatio : 0;
}
function segmentDurations(boundaries: readonly number[], totalBeats: number): number[] {
  const points = [0, ...boundaries, totalBeats];
  return points.slice(1).map((point, index) => point - points[index]);
}

function validBassLaneEvidence(value: unknown, totalBeats: number): value is P524BassLaneEvidence {
  if (!isRecord(value) || (value.status !== "supported" && value.status !== "unavailable")
    || !Array.isArray(value.states) || !isDenseArray(value.states)
    || !Array.isArray(value.candidates) || !isDenseArray(value.candidates)
    || !validOperations(value.operations)) return false;
  const validReason = value.reason === "invalid-input"
    || value.reason === "no-safe-low-register-evidence"
    || value.reason === "insufficient-persistent-context";
  if ((value.status === "supported" && value.reason !== undefined)
    || (value.status === "unavailable" && !validReason)) return false;

  const candidateIds = new Set<string>();
  for (let index = 0; index < value.candidates.length; index += 1) {
    const candidate = value.candidates[index];
    if (!validBassCandidate(candidate, totalBeats) || candidateIds.has(candidate.noteId)) return false;
    candidateIds.add(candidate.noteId);
  }

  if (value.status === "unavailable") return value.states.length === 0;
  if (value.states.length === 0) return false;
  let previousEnd = 0;
  for (let index = 0; index < value.states.length; index += 1) {
    const state = value.states[index];
    if (!isRecord(state)) return false;
    const startBeat = state.startBeat;
    const endBeat = state.endBeat;
    const pitchClass = state.pitchClass;
    if (typeof startBeat !== "number" || typeof endBeat !== "number"
      || !Number.isFinite(startBeat) || !Number.isFinite(endBeat)
      || startBeat < 0 || endBeat <= startBeat || startBeat !== previousEnd
      || !validPitchClass(pitchClass)) return false;
    const transient = state.transientPitchClasses;
    if (transient !== undefined) {
      if (!Array.isArray(transient) || !isDenseArray(transient)) return false;
      const seenTransient = new Set<number>();
      for (let transientIndex = 0; transientIndex < transient.length; transientIndex += 1) {
        const entry = transient[transientIndex];
        if (!validPitchClass(entry) || entry === pitchClass || seenTransient.has(entry)) return false;
        seenTransient.add(entry);
      }
    }
    previousEnd = endBeat;
  }
  return previousEnd === totalBeats;
}

function validBassCandidate(value: unknown, totalBeats: number): value is P524BassCandidateEvidence {
  if (!isRecord(value) || typeof value.noteId !== "string" || value.noteId.length === 0
    || !validPitchClass(value.pitchClass)
    || typeof value.startBeat !== "number" || !Number.isFinite(value.startBeat) || value.startBeat < 0
    || typeof value.durationBeats !== "number" || !Number.isFinite(value.durationBeats)
    || value.durationBeats <= 0 || value.startBeat + value.durationBeats > totalBeats
    || typeof value.qualifies !== "boolean") return false;
  const unitDiagnostics = [
    value.register,
    value.duration,
    value.strongBeat,
    value.continuity,
    value.repetitionOrStepwise,
    value.textureSeparation,
    value.combinedScore,
  ];
  return unitDiagnostics.every((entry) => typeof entry === "number"
      && Number.isFinite(entry) && entry >= 0 && entry <= 1)
    && (value.rolePrior === 0 || value.rolePrior === 0.5 || value.rolePrior === 1);
}
function validOperations(value: unknown): value is P524OperationEvidence {
  if (!isRecord(value)) return false;
  const keys: readonly (keyof P524OperationEvidence)[] = [
    "inputNotes", "candidateScores", "onsetGroups", "runObservations",
    "profileEventUpdates", "profileSweepCells", "boundaryComparisons", "stateAssignments",
  ];
  return keys.every((key) => Number.isInteger(value[key]) && (value[key] as number) >= 0);
}

function parseShadowInput(value: unknown): P524ShadowInput | undefined {
  if (!isRecord(value) || !Array.isArray(value.notes) || !isDenseArray(value.notes)
    || !isDenseMeter(value.meter) || value.meter[0] !== 4 || value.meter[1] !== 4
    || value.notes.length > maximumShadowNotes
    || !Number.isFinite(value.totalBeats) || (value.totalBeats as number) <= 0
    || (value.totalBeats as number) > maximumShadowBeats) return undefined;
  const seenIds = new Set<string>();
  for (const note of value.notes) {
    if (!isRecord(note) || typeof note.id !== "string" || note.id.length === 0 || seenIds.has(note.id)
      || !Number.isInteger(note.pitch) || (note.pitch as number) < 0 || (note.pitch as number) > 127
      || !Number.isFinite(note.startBeat) || (note.startBeat as number) < 0
      || !Number.isFinite(note.durationBeats) || (note.durationBeats as number) <= 0
      || (note.startBeat as number) + (note.durationBeats as number) > (value.totalBeats as number)
      || !Number.isFinite(note.velocity) || (note.velocity as number) < 0 || (note.velocity as number) > 1
      || (note.rolePrior !== undefined && note.rolePrior !== "bass"
        && note.rolePrior !== "upper" && note.rolePrior !== "unknown")) return undefined;
    seenIds.add(note.id);
  }
  return value as unknown as P524ShadowInput;
}

function unavailableBassLane(
  reason: P524BassLaneEvidence["reason"],
  inputNotes = 0,
): P524BassLaneEvidence {
  return {
    status: "unavailable",
    states: [],
    candidates: [],
    operations: { ...emptyOperations(), inputNotes },
    reason,
  };
}

function unknownHarmonicRhythm(
  reason: NonNullable<P524HarmonicRhythmEvidence["reason"]>,
  operations = emptyOperations(),
  candidateSupport: Readonly<Record<1 | 2 | 4 | 8, number>> = { 1: 0, 2: 0, 4: 0, 8: 0 },
  observedStableDurations: readonly number[] = [],
  structuralBoundaries: readonly number[] = [],
): P524HarmonicRhythmEvidence {
  return {
    status: "unknown",
    quarterBeats: "unknown",
    legacyFallback: true,
    candidateSupport,
    observedStableDurations,
    structuralBoundaries,
    operations,
    reason,
  };
}

function operationsForInput(input: P524ShadowInput): P524OperationEvidence {
  return { ...emptyOperations(), inputNotes: input.notes.length };
}

function compareNotes(left: P524ShadowNote, right: P524ShadowNote): number {
  return left.startBeat - right.startBeat || left.pitch - right.pitch || left.id.localeCompare(right.id);
}

function compareCandidateStrength(left: P524BassCandidateEvidence, right: P524BassCandidateEvidence): number {
  return right.combinedScore - left.combinedScore
    || right.durationBeats - left.durationBeats
    || left.noteId.localeCompare(right.noteId);
}

function pitchClassSetsEqual(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  return left.size === right.size && [...left].every((pitchClass) => right.has(pitchClass));
}

function pitchClassDistance(left: number, right: number): number {
  const absolute = Math.abs(left - right);
  return Math.min(absolute, 12 - absolute);
}

function pitchClassSetDistance(left: ReadonlySet<number>, right: ReadonlySet<number>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let intersection = 0;
  left.forEach((pitchClass) => { if (right.has(pitchClass)) intersection += 1; });
  return 1 - intersection / union.size;
}

function isSupportedPeriod(value: number): value is 1 | 2 | 4 | 8 {
  return value === 1 || value === 2 || value === 4 || value === 8;
}

function validPitchClass(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 11;
}

function deepEqualData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const key = leftKeys[index];
      const leftEntry = (left as unknown as Record<string, unknown>)[key];
      const rightEntry = (right as unknown as Record<string, unknown>)[key];
      if (key !== rightKeys[index] || !deepEqualData(leftEntry, rightEntry)) return false;
    }
    return true;
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key !== rightKeys[index] || !deepEqualData(left[key], right[key])) return false;
  }
  return true;
}

function isDenseArray(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function isDenseMeter(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && Object.prototype.hasOwnProperty.call(value, 0)
    && Object.prototype.hasOwnProperty.call(value, 1)
    && Number.isInteger(value[0])
    && Number.isInteger(value[1])
    && value[0] > 0
    && value[1] > 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePitchClass(pitch: number): number {
  return positiveModulo(pitch, 12);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}
