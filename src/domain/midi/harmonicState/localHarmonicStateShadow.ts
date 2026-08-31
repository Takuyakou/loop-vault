export type P526LocalHarmonicRhythm = 1 | 2 | 4 | 8 | "unknown";

export interface P526LocalEvidenceCell {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly upperPitchClasses: readonly number[];
  readonly bassPitchClass?: number;
  readonly upperPersistence: number;
  readonly bassPersistence: number;
  /** Normalized metric prominence at this candidate boundary. */
  readonly normalizedBeatStrength: number;
  /** Pitch-class support for the observed upper/bass material. */
  readonly pitchClassSupport: number;
  /** Continuity across the bounded local window. */
  readonly temporalContinuity: number;
  /** Local HR support independent of a rendered chord identity. */
  readonly localRhythmSupport: number;
}

export interface P526GlobalHarmonicRhythmEvidence {
  readonly status: "supported" | "unknown";
  readonly quarterBeats: P526LocalHarmonicRhythm;
}

export interface P526LocalHarmonicStateShadowInput {
  readonly meter: readonly [4, 4];
  readonly totalBeats: number;
  readonly cells: readonly P526LocalEvidenceCell[];
  readonly globalHarmonicRhythm: P526GlobalHarmonicRhythmEvidence;
}

export type P526BoundaryEvidence =
  | "stable-upper-structure"
  | "same-pitch-material"
  | "next-bar-approach"
  | "previous-bar-departure"
  | "bar-scale-inversion"
  | "persistent-upper-change"
  | "persistent-bass-change"
  | "strong-metric-placement"
  | "pitch-class-support"
  | "temporal-continuity"
  | "local-rhythm-support";

export interface P526BoundarySignals {
  readonly normalizedBeatStrength: number;
  readonly pitchClassSupport: number;
  readonly temporalContinuity: number;
  readonly localRhythmSupport: number;
}

export interface P526LocalBoundaryDecision {
  readonly beat: number;
  readonly decision: "merge-same-state" | "split-structural-change";
  readonly evidence: readonly P526BoundaryEvidence[];
  readonly signals: P526BoundarySignals;
}

export interface P526LocalStructuralState {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly upperPitchClasses: readonly number[];
  /** Only the retained structural bass, not a merged passing/approach note. */
  readonly structuralBassPitchClasses: readonly number[];
}

export type P526CandidateScores = Readonly<Record<1 | 2 | 4 | 8, number>>;
export interface P526LocalBarEvidence {
  readonly bar: number;
  readonly quarterBeats: P526LocalHarmonicRhythm;
  readonly source: "local-override" | "global-retained" | "local-stable" | "unknown";
  readonly confidence: number;
  readonly candidateScores: P526CandidateScores;
  readonly candidateGap: number;
  readonly arbitration: "local-strong" | "global-retained" | "hysteresis-retained" | "local-stable" | "unknown";
  readonly hysteresisReason?: "weak-isolated-candidate" | "insufficient-margin" | "single-bar-global-8";
}

export interface P526LocalShadowOperations {
  readonly inputCells: number;
  readonly bars: number;
  readonly candidateEvaluations: number;
  readonly barIndexCellVisits: number;
  readonly barIndexAssignments: number;
  readonly barLookups: number;
  readonly candidateCellVisits: number;
  readonly boundaryDecisions: number;
  readonly contextLookups: number;
  readonly stateAssignments: number;
}

export interface P526LocalHarmonicStateShadowSupported {
  readonly status: "supported";
  readonly bars: readonly P526LocalBarEvidence[];
  readonly states: readonly P526LocalStructuralState[];
  readonly boundaries: readonly P526LocalBoundaryDecision[];
  readonly operations: P526LocalShadowOperations;
  readonly legacyFallback: false;
}

export interface P526LocalHarmonicStateShadowUnknown {
  readonly status: "unknown";
  readonly bars: readonly [];
  readonly states: readonly [];
  readonly boundaries: readonly [];
  readonly operations: P526LocalShadowOperations;
  readonly legacyFallback: true;
  readonly reason:
    | "invalid-input"
    | "unsupported-meter"
    | "unbounded-candidate-density"
    | "insufficient-local-evidence"
    | "ambiguous-local-evidence";
}

export type P526LocalHarmonicStateShadowResult =
  | P526LocalHarmonicStateShadowSupported
  | P526LocalHarmonicStateShadowUnknown;

const beatsPerBar = 4;
const maximumCandidateCellsPerBar = 4;
const maximumBars = 4_096;
const minimumPersistentEvidence = 0.5;
const localOverrideThreshold = 0.8;
const localOverrideMargin = 0.15;

/**
 * P5.26 Track A shadow estimator. It receives bounded structural evidence only;
 * it is deliberately disconnected from production chord selection and never
 * consumes a final chord identity or user metadata.
 */
export function estimateP526LocalHarmonicStateShadow(input: unknown): P526LocalHarmonicStateShadowResult {
  try {
    if (hasUnsupportedMeter(input)) return unknownResult("unsupported-meter");
    const parsed = parseInput(input);
    if (parsed === undefined) return unknownResult("invalid-input");
    if (hasUnboundedDensity(parsed)) return unknownResult("unbounded-candidate-density", parsed.cells.length, parsed.totalBeats / beatsPerBar);
    if (parsed.cells.some((cell) => cell.upperPitchClasses.length === 0 || cell.upperPersistence < minimumPersistentEvidence)) {
      return unknownResult("insufficient-local-evidence", parsed.cells.length, parsed.totalBeats / beatsPerBar);
    }
    if (parsed.globalHarmonicRhythm.status === "unknown" && averageEvidence(parsed.cells) < minimumPersistentEvidence) {
      return unknownResult("ambiguous-local-evidence", parsed.cells.length, parsed.totalBeats / beatsPerBar);
    }
    return estimateInternal(parsed);
  } catch {
    return unknownResult("invalid-input");
  }
}

function estimateInternal(input: P526LocalHarmonicStateShadowInput): P526LocalHarmonicStateShadowResult {
  const boundaries: P526LocalBoundaryDecision[] = [];
  let contextLookups = 0;
  const cellByStartBeat = new Map<number, P526LocalEvidenceCell>();
  const cellByEndBeat = new Map<number, P526LocalEvidenceCell>();
  input.cells.forEach((cell) => { cellByStartBeat.set(cell.startBeat, cell); cellByEndBeat.set(cell.endBeat, cell); });
  for (let index = 1; index < input.cells.length; index += 1) {
    const left = input.cells[index - 1]!;
    const right = input.cells[index]!;
    const previousCandidate = cellByEndBeat.get(Math.floor(right.startBeat / beatsPerBar) * beatsPerBar);
    const previousBarCell = previousCandidate === left ? undefined : previousCandidate;
    const nextBarCell = cellByStartBeat.get((Math.floor(right.startBeat / beatsPerBar) + 1) * beatsPerBar);
    if (previousBarCell !== undefined) contextLookups += 1;
    if (nextBarCell !== undefined) contextLookups += 1;
    boundaries.push(decideBoundary(left, right, previousBarCell, nextBarCell));
  }

  const states: P526LocalStructuralState[] = [];
  input.cells.forEach((cell, index) => {
    const priorDecision = index === 0 ? undefined : boundaries[index - 1];
    const previous = states[states.length - 1];
    if (previous !== undefined && priorDecision?.decision === "merge-same-state") {
      const left = input.cells[index - 1]!;
      states[states.length - 1] = {
        ...previous,
        endBeat: cell.endBeat,
        upperPitchClasses: uniqueSorted([...previous.upperPitchClasses, ...cell.upperPitchClasses]),
        structuralBassPitchClasses: retainedBassAfterMerge(previous.structuralBassPitchClasses, left, cell, priorDecision),
      };
    } else {
      states.push({
        startBeat: cell.startBeat,
        endBeat: cell.endBeat,
        upperPitchClasses: cell.upperPitchClasses,
        structuralBassPitchClasses: cell.bassPitchClass === undefined || cell.bassPersistence < minimumPersistentEvidence ? [] : [cell.bassPitchClass],
      });
    }
  });

  const barCount = input.totalBeats / beatsPerBar;
  const splitBeatsByBar = Array.from({ length: barCount }, () => [] as number[]);
  const structuralSplitBeats = new Set<number>();
  const barEdgeSplit = new Uint8Array(barCount);
  for (const boundary of boundaries) {
    if (boundary.decision !== "split-structural-change") continue;
    structuralSplitBeats.add(boundary.beat);
    if (boundary.beat % beatsPerBar === 0) {
      const rightBar = boundary.beat / beatsPerBar;
      if (rightBar > 0) barEdgeSplit[rightBar - 1] = 1;
      if (rightBar < barCount) barEdgeSplit[rightBar] = 1;
    } else splitBeatsByBar[Math.floor(boundary.beat / beatsPerBar)]?.push(boundary.beat % beatsPerBar);
  }
  const locallyPairedEight = new Uint8Array(barCount);
  for (let startBar = 1; startBar + 2 < barCount; startBar += 1) {
    const pairStart = startBar * beatsPerBar;
    const middle = pairStart + beatsPerBar;
    const pairEnd = pairStart + beatsPerBar * 2;
    if (structuralSplitBeats.has(pairStart) && structuralSplitBeats.has(pairEnd)
      && !structuralSplitBeats.has(middle) && splitBeatsByBar[startBar]?.length === 0
      && splitBeatsByBar[startBar + 1]?.length === 0) {
      locallyPairedEight[startBar] = 1;
      locallyPairedEight[startBar + 1] = 1;
      startBar += 1;
    }
  }

  const cellsByBar = new Map<number, P526LocalEvidenceCell[]>();
  let barIndexCellVisits = 0;
  let barIndexAssignments = 0;
  for (const cell of input.cells) {
    barIndexCellVisits += 1;
    const firstBar = Math.floor(cell.startBeat / beatsPerBar);
    const finalBar = Math.min(barCount - 1, Math.ceil(cell.endBeat / beatsPerBar) - 1);
    for (let barIndex = firstBar; barIndex <= finalBar; barIndex += 1) {
      const indexed = cellsByBar.get(barIndex);
      if (indexed === undefined) cellsByBar.set(barIndex, [cell]);
      else indexed.push(cell);
      barIndexAssignments += 1;
    }
  }

  const bars: P526LocalBarEvidence[] = [];
  let barLookups = 0;
  let candidateCellVisits = 0;
  for (let index = 0; index < barCount; index += 1) {
    const barCells = cellsByBar.get(index) ?? [];
    barLookups += 1;
    candidateCellVisits += barCells.length;
    bars.push(deriveBarEvidence(index + 1, splitBeatsByBar[index]!, barEdgeSplit[index] === 1,
      locallyPairedEight[index] === 1, input.globalHarmonicRhythm, barCount, barCells, bars[index - 1]));
  }
  const operations: P526LocalShadowOperations = {
    inputCells: input.cells.length, bars: barCount, candidateEvaluations: barCount * maximumCandidateCellsPerBar,
    barIndexCellVisits, barIndexAssignments, barLookups, candidateCellVisits,
    boundaryDecisions: boundaries.length, contextLookups, stateAssignments: input.cells.length,
  };
  if (bars.some((bar) => bar.quarterBeats === "unknown")) {
    return { status: "unknown", bars: [], states: [], boundaries: [], operations,
      legacyFallback: true, reason: "ambiguous-local-evidence" };
  }
  return { status: "supported", bars, states, boundaries, operations, legacyFallback: false };
}

function decideBoundary(left: P526LocalEvidenceCell, right: P526LocalEvidenceCell,
  previousBarCell: P526LocalEvidenceCell | undefined, nextBarCell: P526LocalEvidenceCell | undefined): P526LocalBoundaryDecision {
  const signals = boundarySignals(left, right);
  const metricStrong = signals.normalizedBeatStrength >= 0.75;
  const pcStrong = signals.pitchClassSupport >= 0.75;
  const continuityStrong = signals.temporalContinuity >= 0.75;
  const localStrong = signals.localRhythmSupport >= 0.75;
  const stableUpper = arraysEqual(left.upperPitchClasses, right.upperPitchClasses);
  const persistentBassChange = left.bassPitchClass !== undefined && right.bassPitchClass !== undefined
    && left.bassPitchClass !== right.bassPitchClass && left.bassPersistence >= minimumPersistentEvidence
    && right.bassPersistence >= minimumPersistentEvidence;
  const allSignalsStrong = metricStrong && pcStrong && continuityStrong && localStrong;
  const largePersistentBassChange = persistentBassChange
    && pitchClassDistance(left.bassPitchClass!, right.bassPitchClass!) >= 4;
  const persistentArrivalOnUpperTone = persistentBassChange
    && !left.upperPitchClasses.includes(left.bassPitchClass!)
    && right.upperPitchClasses.includes(right.bassPitchClass!);
  if (stableUpper) {
    if (persistentBassChange && (largePersistentBassChange || persistentArrivalOnUpperTone || !allSignalsStrong)) {
      return split(right.startBeat, signals, ["stable-upper-structure", "persistent-bass-change", ...(metricStrong ? ["strong-metric-placement" as const] : []), ...(pcStrong ? ["pitch-class-support" as const] : []), ...(continuityStrong ? ["temporal-continuity" as const] : []), ...(localStrong ? ["local-rhythm-support" as const] : [])]);
    }
    const independentSameState = (pcStrong ? 1 : 0) + (continuityStrong ? 1 : 0) + (localStrong ? 1 : 0);
    if (independentSameState >= 2) return merge(right.startBeat, signals, ["stable-upper-structure", ...(persistentBassChange ? ["persistent-bass-change" as const] : []), ...(pcStrong ? ["pitch-class-support" as const] : []), ...(continuityStrong ? ["temporal-continuity" as const] : []), ...(localStrong ? ["local-rhythm-support" as const] : [])]);
    return split(right.startBeat, signals, ["stable-upper-structure", "persistent-upper-change"]);
  }
  const samePitchMaterial = setEqual([...left.upperPitchClasses, ...(left.bassPitchClass === undefined ? [] : [left.bassPitchClass])],
    [...right.upperPitchClasses, ...(right.bassPitchClass === undefined ? [] : [right.bassPitchClass])]);
  const atBarBoundary = right.startBeat % beatsPerBar === 0;
  if (samePitchMaterial && atBarBoundary && left.endBeat - left.startBeat >= 2 && right.endBeat - right.startBeat >= 2 && pcStrong && continuityStrong) {
    return merge(right.startBeat, signals, ["same-pitch-material", "bar-scale-inversion", "pitch-class-support", "temporal-continuity"]);
  }
  const nextApproach = samePitchMaterial && nextBarCell !== undefined && right.bassPitchClass !== undefined
    && nextBarCell.bassPitchClass !== undefined && pitchClassDistance(right.bassPitchClass, nextBarCell.bassPitchClass) <= 2
    && !arraysEqual(right.upperPitchClasses, nextBarCell.upperPitchClasses) && pcStrong && continuityStrong;
  if (nextApproach) return merge(right.startBeat, signals, ["same-pitch-material", "next-bar-approach", "pitch-class-support", "temporal-continuity"]);
  const previousDeparture = samePitchMaterial && previousBarCell !== undefined && previousBarCell.bassPitchClass !== undefined
    && left.bassPitchClass !== undefined && pitchClassDistance(previousBarCell.bassPitchClass, left.bassPitchClass) <= 2
    && !arraysEqual(previousBarCell.upperPitchClasses, left.upperPitchClasses) && pcStrong && continuityStrong;
  if (previousDeparture) return merge(right.startBeat, signals, ["same-pitch-material", "previous-bar-departure", "pitch-class-support", "temporal-continuity"]);
  return split(right.startBeat, signals, ["persistent-upper-change", ...(persistentBassChange ? ["persistent-bass-change" as const] : []), ...(metricStrong ? ["strong-metric-placement" as const] : []), ...(pcStrong ? ["pitch-class-support" as const] : []), ...(continuityStrong ? ["temporal-continuity" as const] : []), ...(localStrong ? ["local-rhythm-support" as const] : [])]);
}

function merge(beat: number, signals: P526BoundarySignals, evidence: readonly P526BoundaryEvidence[]): P526LocalBoundaryDecision { return { beat, decision: "merge-same-state", evidence, signals }; }
function split(beat: number, signals: P526BoundarySignals, evidence: readonly P526BoundaryEvidence[]): P526LocalBoundaryDecision { return { beat, decision: "split-structural-change", evidence, signals }; }
function boundarySignals(left: P526LocalEvidenceCell, right: P526LocalEvidenceCell): P526BoundarySignals {
  return { normalizedBeatStrength: mean(left.normalizedBeatStrength, right.normalizedBeatStrength), pitchClassSupport: mean(left.pitchClassSupport, right.pitchClassSupport), temporalContinuity: mean(left.temporalContinuity, right.temporalContinuity), localRhythmSupport: mean(left.localRhythmSupport, right.localRhythmSupport) };
}

function retainedBassAfterMerge(previous: readonly number[], left: P526LocalEvidenceCell,
  right: P526LocalEvidenceCell, decision: P526LocalBoundaryDecision): number[] {
  const rightBass = right.bassPitchClass;
  if (rightBass === undefined || right.bassPersistence < minimumPersistentEvidence) return [...previous];
  if (left.bassPersistence < minimumPersistentEvidence) {
    const withoutWeakLeft = left.bassPitchClass === undefined
      ? [...previous]
      : previous.filter((pitchClass) => pitchClass !== left.bassPitchClass);
    return uniqueSorted([...withoutWeakLeft, rightBass]);
  }
  if (decision.evidence.includes("bar-scale-inversion")
    || decision.evidence.includes("persistent-bass-change")) {
    return uniqueSorted([...previous, rightBass]);
  }
  return [...previous];
}

function deriveBarEvidence(bar: number, splitBeats: readonly number[], hasBarEdgeSplit: boolean, locallyPairedEight: boolean,
  global: P526GlobalHarmonicRhythmEvidence, barCount: number, cells: readonly P526LocalEvidenceCell[], previous: P526LocalBarEvidence | undefined): P526LocalBarEvidence {
  const support = averageEvidence(cells);
  const localPeriod = exactLocalPeriod(splitBeats);
  const candidateScores: P526CandidateScores = {
    1: support * patternSimilarity(splitBeats, [1, 2, 3]),
    2: support * patternSimilarity(splitBeats, [2]),
    4: splitBeats.length === 0 && !locallyPairedEight ? support * (hasBarEdgeSplit ? 0.9 : 0.85) : 0,
    8: locallyPairedEight ? support : (splitBeats.length === 0 ? support * (hasBarEdgeSplit ? 0.6 : 0.8) : 0),
  };
  const ranked = ([1, 2, 4, 8] as const).map((period) => [period, candidateScores[period]] as const)
    .sort((left, right) => right[1] - left[1] || left[0] - right[0]);
  const [chosen, topScore] = ranked[0]!;
  const gap = topScore - ranked[1]![1];
  const base = { bar, candidateScores, candidateGap: gap };
  const localPatternUnknown = localPeriod === "unknown";
  const strongLocal = !localPatternUnknown && topScore >= localOverrideThreshold && gap >= localOverrideMargin;
  const globalPeriod = global.status === "supported" ? global.quarterBeats : "unknown";
  if (localPatternUnknown) return { ...base, quarterBeats: "unknown", source: "unknown", confidence: topScore, arbitration: "unknown", hysteresisReason: "insufficient-margin" };
  if (globalPeriod === 8 && barCount === 1) return { ...base, quarterBeats: 8, source: "global-retained", confidence: 1, arbitration: "global-retained", hysteresisReason: "single-bar-global-8" };
  if (globalPeriod !== "unknown") {
    if (chosen !== globalPeriod && strongLocal) return { ...base, quarterBeats: chosen, source: "local-override", confidence: topScore, arbitration: "local-strong" };
    if (chosen !== globalPeriod && !strongLocal) return { ...base, quarterBeats: globalPeriod, source: "global-retained", confidence: 1, arbitration: "hysteresis-retained", hysteresisReason: gap < localOverrideMargin ? "insufficient-margin" : "weak-isolated-candidate" };
    return { ...base, quarterBeats: globalPeriod, source: "global-retained", confidence: 1, arbitration: "global-retained" };
  }
  if (previous !== undefined && chosen !== previous.quarterBeats && !strongLocal) return { ...base, quarterBeats: previous.quarterBeats, source: "local-stable", confidence: previous.confidence, arbitration: "hysteresis-retained", hysteresisReason: gap < localOverrideMargin ? "insufficient-margin" : "weak-isolated-candidate" };
  if (chosen === 4 && splitBeats.length === 0 && topScore >= minimumPersistentEvidence) return { ...base, quarterBeats: 4, source: "local-stable", confidence: topScore, arbitration: "local-stable" };
  if (!strongLocal) return { ...base, quarterBeats: "unknown", source: "unknown", confidence: topScore, arbitration: "unknown", hysteresisReason: gap < localOverrideMargin ? "insufficient-margin" : "weak-isolated-candidate" };
  return { ...base, quarterBeats: chosen, source: "local-override", confidence: topScore, arbitration: "local-strong" };
}

function patternSimilarity(observed: readonly number[], expected: readonly number[]): number {
  if (observed.length === 0 && expected.length === 0) return 1;
  const observedSet = new Set(observed);
  const expectedSet = new Set(expected);
  let symmetricDifference = 0;
  for (const beat of observedSet) if (!expectedSet.has(beat)) symmetricDifference += 1;
  for (const beat of expectedSet) if (!observedSet.has(beat)) symmetricDifference += 1;
  return Math.max(0, 1 - symmetricDifference / Math.max(observedSet.size, expectedSet.size));
}

function exactLocalPeriod(splitBeats: readonly number[]): P526LocalHarmonicRhythm {
  if (arraysEqual(splitBeats, [1, 2, 3])) return 1;
  if (arraysEqual(splitBeats, [2])) return 2;
  if (splitBeats.length === 0) return 4;
  return "unknown";
}

function parseInput(value: unknown): P526LocalHarmonicStateShadowInput | undefined {
  if (!isRecord(value) || !isDenseArray(value.meter) || value.meter.length !== 2 || value.meter[0] !== 4 || value.meter[1] !== 4
    || !Number.isInteger(value.totalBeats) || (value.totalBeats as number) <= 0 || (value.totalBeats as number) % beatsPerBar !== 0
    || (value.totalBeats as number) / beatsPerBar > maximumBars || !isDenseArray(value.cells) || value.cells.length === 0 || !isRecord(value.globalHarmonicRhythm)) return undefined;
  const totalBeats = value.totalBeats as number;
  const global = value.globalHarmonicRhythm;
  if ((global.status !== "supported" && global.status !== "unknown") || ![1, 2, 4, 8, "unknown"].includes(global.quarterBeats as P526LocalHarmonicRhythm) || (global.status === "supported" && global.quarterBeats === "unknown")) return undefined;
  const cells: P526LocalEvidenceCell[] = [];
  for (const raw of value.cells) {
    if (!isRecord(raw) || !finite(raw.startBeat) || !finite(raw.endBeat) || raw.startBeat < 0 || raw.endBeat <= raw.startBeat || raw.endBeat > totalBeats
      || !isDenseArray(raw.upperPitchClasses) || !finiteUnit(raw.upperPersistence) || !finiteUnit(raw.bassPersistence)
      || !finiteUnit(raw.normalizedBeatStrength) || !finiteUnit(raw.pitchClassSupport) || !finiteUnit(raw.temporalContinuity) || !finiteUnit(raw.localRhythmSupport)
      || (raw.bassPitchClass !== undefined && !validPitchClass(raw.bassPitchClass))) return undefined;
    const upperPitchClasses = raw.upperPitchClasses;
    if (upperPitchClasses.some((pitchClass) => !validPitchClass(pitchClass)) || new Set(upperPitchClasses).size !== upperPitchClasses.length || !arraysEqual(upperPitchClasses, uniqueSorted(upperPitchClasses as number[]))) return undefined;
    cells.push({ startBeat: raw.startBeat, endBeat: raw.endBeat, upperPitchClasses: [...upperPitchClasses] as number[], ...(raw.bassPitchClass === undefined ? {} : { bassPitchClass: raw.bassPitchClass as number }), upperPersistence: raw.upperPersistence, bassPersistence: raw.bassPersistence, normalizedBeatStrength: raw.normalizedBeatStrength, pitchClassSupport: raw.pitchClassSupport, temporalContinuity: raw.temporalContinuity, localRhythmSupport: raw.localRhythmSupport });
  }
  cells.sort(compareCells);
  if (cells[0]?.startBeat !== 0 || cells[cells.length - 1]?.endBeat !== totalBeats || cells.some((cell, index) => index > 0 && cells[index - 1]?.endBeat !== cell.startBeat)) return undefined;
  return { meter: [4, 4], totalBeats, cells, globalHarmonicRhythm: { status: global.status, quarterBeats: global.quarterBeats as P526LocalHarmonicRhythm } };
}

function compareCells(left: P526LocalEvidenceCell, right: P526LocalEvidenceCell): number { return left.startBeat - right.startBeat || left.endBeat - right.endBeat || compareNumberArrays(left.upperPitchClasses, right.upperPitchClasses) || (left.bassPitchClass ?? -1) - (right.bassPitchClass ?? -1); }
function compareNumberArrays(left: readonly number[], right: readonly number[]): number { for (let index = 0; index < Math.min(left.length, right.length); index += 1) if (left[index] !== right[index]) return left[index]! - right[index]!; return left.length - right.length; }
function hasUnboundedDensity(input: P526LocalHarmonicStateShadowInput): boolean { const counts = new Uint8Array(input.totalBeats / beatsPerBar); for (const cell of input.cells) { const first = Math.floor(cell.startBeat / beatsPerBar); const final = Math.min(counts.length - 1, Math.floor((cell.endBeat - Number.EPSILON) / beatsPerBar)); for (let bar = first; bar <= final; bar += 1) { counts[bar]! += 1; if (counts[bar]! > maximumCandidateCellsPerBar) return true; } } return false; }
function hasUnsupportedMeter(value: unknown): boolean { return isRecord(value) && isDenseArray(value.meter) && value.meter.length === 2 && (value.meter[0] !== 4 || value.meter[1] !== 4); }
function unknownResult(reason: P526LocalHarmonicStateShadowUnknown["reason"], inputCells = 0, bars = 0): P526LocalHarmonicStateShadowUnknown {
  return { status: "unknown", bars: [], states: [], boundaries: [], operations: {
    inputCells, bars, candidateEvaluations: 0,
    barIndexCellVisits: 0, barIndexAssignments: 0, barLookups: 0, candidateCellVisits: 0,
    boundaryDecisions: 0, contextLookups: 0, stateAssignments: 0,
  }, legacyFallback: true, reason };
}
function averageEvidence(cells: readonly P526LocalEvidenceCell[]): number { if (cells.length === 0) return 0; return cells.reduce((total, cell) => total + mean(cell.normalizedBeatStrength, cell.pitchClassSupport, cell.temporalContinuity, cell.localRhythmSupport), 0) / cells.length; }
function mean(...values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) / values.length; }
function pitchClassDistance(left: number, right: number): number { const distance = Math.abs(left - right) % 12; return Math.min(distance, 12 - distance); }
function uniqueSorted(values: readonly number[]): number[] { return [...new Set(values)].sort((left, right) => left - right); }
function arraysEqual(left: readonly unknown[], right: readonly unknown[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function setEqual(left: readonly number[], right: readonly number[]): boolean { return arraysEqual(uniqueSorted(left), uniqueSorted(right)); }
function validPitchClass(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 11; }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function finiteUnit(value: unknown): value is number { return finite(value) && value >= 0 && value <= 1; }
function isDenseArray(value: unknown): value is unknown[] { if (!Array.isArray(value)) return false; for (let index = 0; index < value.length; index += 1) if (!Object.prototype.hasOwnProperty.call(value, index)) return false; return true; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
