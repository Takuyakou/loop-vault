import type { ChordQuality } from "../../types";
import type { P524HarmonicRhythm, P524HarmonicState } from "./contracts";
import {
  identifyP524HarmonicState,
  labelP524IdentityWithStableBass,
  sameP524HarmonicIdentity,
} from "./harmonicIdentity";
import {
  estimateP524BassLane,
  estimateP524HarmonicRhythm,
  type P524BassLaneEvidence,
  type P524HarmonicRhythmEvidence,
  type P524ShadowInput,
  type P524ShadowNote,
} from "./shadowEvidence";

export interface P524FragmentEvidence {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly pitchClasses: readonly number[];
  readonly pitchClassDurationCoverage: readonly number[];
  readonly pitchClassAttackCounts: readonly number[];
  readonly bassPitchClass?: number;
  readonly assignedStateIndex: number;
}

export interface P524BoundaryDecision {
  readonly beat: number;
  readonly decision: "merge-same-state" | "split-strong-change";
  readonly pcSubsetOrSupersetSupport: boolean;
  readonly stableBass: boolean;
  readonly temporalContinuity: boolean;
  readonly repeatedSupport: boolean;
  readonly persistentNewPitchClasses: readonly number[];
  readonly persistentRemovedPitchClasses: readonly number[];
  readonly persistentBassTransition: boolean;
  readonly stableTextureChange: boolean;
  readonly metricBoundary: boolean;
  readonly supportingEvidence: readonly string[];
  readonly reason: "core-same-identity" | "persistent-strong-change" | "local-transient-partial-voicing";
}

export interface P524ConsolidationOperations {
  readonly inputNotes: number;
  readonly cells: number;
  readonly noteIntervalSearches: number;
  readonly profileSweepCells: number;
  readonly boundaryDecisions: number;
}

export interface P524ConsolidationSupported {
  readonly status: "supported" | "legacy-fallback";
  readonly harmonicRhythm: P524HarmonicRhythm;
  readonly legacyFallback: boolean;
  readonly states: readonly P524HarmonicState[];
  readonly fragments: readonly P524FragmentEvidence[];
  readonly boundaries: readonly P524BoundaryDecision[];
  readonly operations: P524ConsolidationOperations;
}

export interface P524ConsolidationUnavailable {
  readonly status: "unavailable";
  readonly harmonicRhythm: "unknown";
  readonly legacyFallback: true;
  readonly states: readonly [];
  readonly fragments: readonly [];
  readonly boundaries: readonly [];
  readonly operations: P524ConsolidationOperations;
  readonly reason:
    | "invalid-input"
    | "invalid-shadow-evidence"
    | "unsafe-global-evidence"
    | "unsupported-harmonic-identity";
}

export type P524ConsolidationResult = P524ConsolidationSupported | P524ConsolidationUnavailable;

export interface P524ConsolidationPipeline {
  readonly result: P524ConsolidationResult;
  readonly parsed?: P524ShadowInput;
  readonly bassLane?: P524BassLaneEvidence;
  readonly harmonicRhythm?: P524HarmonicRhythmEvidence;
}

export interface P524SuppliedShadowEvidence {
  readonly bassLane: P524BassLaneEvidence;
  readonly harmonicRhythm: P524HarmonicRhythmEvidence;
}

const maximumNotes = 100_000;
const maximumCells = 100_000;
const minimumPersistentActivity = 0.5;

interface ParsedInput extends P524ShadowInput {
  readonly notes: readonly P524ShadowNote[];
}

interface CellIdentity {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly root: number;
  readonly quality: ChordQuality;
  readonly pitchClasses: readonly number[];
  readonly durationCoverage: readonly number[];
  readonly attackCounts: readonly number[];
  readonly bassPitchClass?: number;
}

interface InternalState {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly root: number;
  readonly quality: ChordQuality;
  readonly pitchClasses: readonly number[];
  readonly bassPitchClasses: readonly number[];
}

export function consolidateP524PerformanceFragments(
  input: unknown,
  suppliedEvidence?: unknown,
): P524ConsolidationResult {
  return runP524ConsolidationPipeline(input, suppliedEvidence).result;
}

/** Internal single-pass result reused by the public reconciliation wrapper. */
export function runP524ConsolidationPipeline(
  input: unknown,
  suppliedEvidence?: unknown,
): P524ConsolidationPipeline {
  try {
    const parsed = parseInput(input);
    if (parsed === undefined) return { result: unavailable("invalid-input") };
    const bassLane = estimateP524BassLane(parsed);
    const harmonicRhythm = estimateP524HarmonicRhythm(parsed, bassLane);
    if (suppliedEvidence !== undefined
      && (!isSuppliedEvidence(suppliedEvidence)
        || !deepEqualData(suppliedEvidence.bassLane, bassLane)
        || !deepEqualData(suppliedEvidence.harmonicRhythm, harmonicRhythm))) {
      return { result: unavailable("invalid-shadow-evidence", parsed.notes.length), parsed, bassLane, harmonicRhythm };
    }
    if (bassLane.status !== "supported") return { result: unavailable("unsafe-global-evidence", parsed.notes.length), parsed, bassLane, harmonicRhythm };
    const cellBoundaries = buildCellBoundaries(parsed, harmonicRhythm);
    if (cellBoundaries === undefined) return { result: unavailable("unsafe-global-evidence", parsed.notes.length), parsed, bassLane, harmonicRhythm };
    const profiles = buildPersistentPitchClassProfiles(parsed.notes, cellBoundaries);
    const cells: CellIdentity[] = [];
    for (let index = 0; index < profiles.pitchClassesByCell.length; index += 1) {
      const startBeat = cellBoundaries[index];
      const endBeat = cellBoundaries[index + 1];
      const bassPitchClass = bassPitchClassAt(bassLane, (startBeat + endBeat) / 2);
      const pitchClasses = uniqueSorted([
        ...profiles.pitchClassesByCell[index],
        ...(bassPitchClass === undefined ? [] : [bassPitchClass]),
      ]);
      const identity = identifyP524HarmonicState(pitchClasses, bassPitchClass);
      if (identity === undefined) return { result: unavailable("unsupported-harmonic-identity", parsed.notes.length), parsed, bassLane, harmonicRhythm };
      cells.push({
        startBeat,
        endBeat,
        root: identity.root,
        quality: identity.quality,
        pitchClasses,
        durationCoverage: profiles.durationCoverageByCell[index],
        attackCounts: profiles.attackCountsByCell[index],
        ...(bassPitchClass === undefined ? {} : { bassPitchClass }),
      });
    }

    const states: InternalState[] = [];
    const fragments: P524FragmentEvidence[] = [];
    const decisions: P524BoundaryDecision[] = [];
    cells.forEach((cell, index) => {
      const previousCell = cells[index - 1];
      const sameIdentity = previousCell !== undefined && sameP524HarmonicIdentity(previousCell, cell);
      fragments.push({
        startBeat: cell.startBeat,
        endBeat: cell.endBeat,
        pitchClasses: cell.pitchClasses,
        pitchClassDurationCoverage: cell.durationCoverage,
        pitchClassAttackCounts: cell.attackCounts,
        ...(cell.bassPitchClass === undefined ? {} : { bassPitchClass: cell.bassPitchClass }),
        assignedStateIndex: sameIdentity ? states.length - 1 : states.length,
      });
      if (previousCell === undefined) {
        states.push(toInternalState(cell));
        return;
      }
      const persistentNewPitchClasses = difference(cell.pitchClasses, previousCell.pitchClasses);
      const persistentRemovedPitchClasses = difference(previousCell.pitchClasses, cell.pitchClasses);
      const persistentBassTransition = previousCell.bassPitchClass !== undefined
        && cell.bassPitchClass !== undefined
        && previousCell.bassPitchClass !== cell.bassPitchClass;
      const stableTextureChange = persistentNewPitchClasses.length > 0
        || persistentRemovedPitchClasses.length > 0;
      decisions.push({
        beat: cell.startBeat,
        decision: sameIdentity ? "merge-same-state" : "split-strong-change",
        pcSubsetOrSupersetSupport: isStrictSubset(previousCell.pitchClasses, cell.pitchClasses)
          || isStrictSubset(cell.pitchClasses, previousCell.pitchClasses),
        stableBass: !persistentBassTransition,
        temporalContinuity: previousCell.endBeat === cell.startBeat,
        repeatedSupport: sameIdentity,
        persistentNewPitchClasses,
        persistentRemovedPitchClasses,
        persistentBassTransition,
        stableTextureChange,
        metricBoundary: Number.isInteger(cell.startBeat) && cell.startBeat % 2 === 0,
        supportingEvidence: sameIdentity
          ? ["same-harmonic-identity", "temporal-continuity"]
          : ["persistent-pitch-class-change", "metric-boundary"],
        reason: sameIdentity ? "core-same-identity" : "persistent-strong-change",
      });
      if (sameIdentity) {
        const prior = states[states.length - 1];
        if (prior === undefined) throw new Error("missing prior state");
        states[states.length - 1] = {
          ...prior,
          endBeat: cell.endBeat,
          bassPitchClasses: uniqueSorted([
            ...prior.bassPitchClasses,
            ...(cell.bassPitchClass === undefined ? [] : [cell.bassPitchClass]),
          ]),
        };
      } else {
        if (!stableTextureChange && !persistentBassTransition) throw new Error("identity change lacks strong evidence");
        states.push(toInternalState(cell));
      }
    });
    const result: P524ConsolidationSupported = {
      status: harmonicRhythm.status === "supported" ? "supported" : "legacy-fallback",
      harmonicRhythm: harmonicRhythm.quarterBeats,
      legacyFallback: harmonicRhythm.legacyFallback,
      states: states.map(toPublicState),
      fragments,
      boundaries: decisions,
      operations: {
        inputNotes: parsed.notes.length,
        cells: cells.length,
        noteIntervalSearches: profiles.noteIntervalSearches,
        profileSweepCells: profiles.profileSweepCells,
        boundaryDecisions: decisions.length,
      },
    };
    return { result, parsed, bassLane, harmonicRhythm };
  } catch {
    return { result: unavailable("invalid-input") };
  }
}

function buildCellBoundaries(input: ParsedInput, evidence: P524HarmonicRhythmEvidence): readonly number[] | undefined {
  if (evidence.status === "supported" && evidence.quarterBeats !== "unknown") {
    if (input.totalBeats / evidence.quarterBeats > maximumCells) return undefined;
    const boundaries = [0];
    for (let beat = evidence.quarterBeats; beat < input.totalBeats; beat += evidence.quarterBeats) boundaries.push(beat);
    boundaries.push(input.totalBeats);
    return boundaries;
  }
  if (evidence.status !== "unknown" || !evidence.legacyFallback) return undefined;
  const structural = uniqueSorted(evidence.structuralBoundaries.filter((beat) => beat > 0 && beat < input.totalBeats));
  if (structural.length === 0 || structural.length + 1 > maximumCells) return undefined;
  return [0, ...structural, input.totalBeats];
}

function buildPersistentPitchClassProfiles(
  notes: readonly P524ShadowNote[],
  boundaries: readonly number[],
): {
  readonly pitchClassesByCell: readonly (readonly number[])[];
  readonly durationCoverageByCell: readonly (readonly number[])[];
  readonly attackCountsByCell: readonly (readonly number[])[];
  readonly noteIntervalSearches: number;
  readonly profileSweepCells: number;
} {
  const cellCount = boundaries.length - 1;
  const durationDirect = Array.from({ length: 12 }, () => new Float64Array(cellCount));
  const durationFullDifference = Array.from({ length: 12 }, () => new Float64Array(cellCount + 1));
  const attackCountsByCell = Array.from({ length: cellCount }, () => Array.from({ length: 12 }, () => 0));
  let noteIntervalSearches = 0;
  for (const note of notes) {
    if (note.rolePrior === "bass" || (note.pitch < 48 && note.rolePrior !== "upper")) continue;
    const noteEnd = note.startBeat + note.durationBeats;
    const firstCell = findStartCell(boundaries, note.startBeat);
    const lastCell = findEndExclusiveCell(boundaries, noteEnd);
    noteIntervalSearches += 2;
    const pitchClass = normalizePitchClass(note.pitch);
    if (firstCell === lastCell) {
      durationDirect[pitchClass][firstCell] += note.durationBeats;
    } else {
      durationDirect[pitchClass][firstCell] += boundaries[firstCell + 1] - note.startBeat;
      durationDirect[pitchClass][lastCell] += noteEnd - boundaries[lastCell];
      if (firstCell + 1 < lastCell) {
        durationFullDifference[pitchClass][firstCell + 1] += 1;
        durationFullDifference[pitchClass][lastCell] -= 1;
      }
    }
    attackCountsByCell[firstCell][pitchClass] += 1;
  }
  const pitchClassesByCell = Array.from({ length: cellCount }, () => [] as number[]);
  const durationCoverageByCell = Array.from({ length: cellCount }, () => Array.from({ length: 12 }, () => 0));
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    let fullNoteCount = 0;
    for (let cell = 0; cell < cellCount; cell += 1) {
      fullNoteCount += durationFullDifference[pitchClass][cell];
      const duration = boundaries[cell + 1] - boundaries[cell];
      const activity = durationDirect[pitchClass][cell] + fullNoteCount * duration;
      durationCoverageByCell[cell][pitchClass] = Math.min(1, activity / duration);
      if (activity >= minimumPersistentActivity) pitchClassesByCell[cell].push(pitchClass);
    }
  }
  return {
    pitchClassesByCell,
    durationCoverageByCell,
    attackCountsByCell,
    noteIntervalSearches,
    profileSweepCells: cellCount * 12,
  };
}

function findStartCell(boundaries: readonly number[], beat: number): number {
  let low = 0;
  let high = boundaries.length - 2;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (beat < boundaries[middle]) high = middle - 1;
    else if (beat >= boundaries[middle + 1]) low = middle + 1;
    else return middle;
  }
  throw new Error("note start is outside consolidation cells");
}

/** Returns the final cell with positive overlap for an end-exclusive note end. */
function findEndExclusiveCell(boundaries: readonly number[], endBeat: number): number {
  let low = 0;
  let high = boundaries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (boundaries[middle] < endBeat) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, Math.min(boundaries.length - 2, low - 1));
}

function bassPitchClassAt(evidence: P524BassLaneEvidence, beat: number): number | undefined {
  if (evidence.status !== "supported") return undefined;
  let low = 0;
  let high = evidence.states.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const state = evidence.states[middle];
    if (beat < state.startBeat) high = middle - 1;
    else if (beat >= state.endBeat) low = middle + 1;
    else return state.pitchClass;
  }
  return undefined;
}

function toInternalState(cell: CellIdentity): InternalState {
  return {
    startBeat: cell.startBeat,
    endBeat: cell.endBeat,
    root: cell.root,
    quality: cell.quality,
    pitchClasses: cell.pitchClasses,
    bassPitchClasses: cell.bassPitchClass === undefined ? [] : [cell.bassPitchClass],
  };
}

function toPublicState(state: InternalState): P524HarmonicState {
  return {
    startBeat: state.startBeat,
    endBeat: state.endBeat,
    pitchClasses: state.pitchClasses,
    label: labelP524IdentityWithStableBass(state, state.bassPitchClasses),
  };
}

function parseInput(input: unknown): ParsedInput | undefined {
  if (!isRecord(input)) return undefined;
  const notesValue = input.notes;
  const meterValue = input.meter;
  const totalBeatsValue = input.totalBeats;
  if (!isDenseArray(notesValue) || !isDenseArray(meterValue)
    || meterValue.length !== 2 || meterValue[0] !== 4 || meterValue[1] !== 4
    || !Number.isInteger(totalBeatsValue) || (totalBeatsValue as number) <= 0
    || (totalBeatsValue as number) > maximumCells || notesValue.length > maximumNotes) return undefined;
  const totalBeats = totalBeatsValue as number;
  const ids = new Set<string>();
  const notes: P524ShadowNote[] = [];
  for (const value of notesValue) {
    if (!isRecord(value)) return undefined;
    const id = value.id;
    const pitch = value.pitch;
    const startBeat = value.startBeat;
    const durationBeats = value.durationBeats;
    const velocity = value.velocity;
    const rolePrior = value.rolePrior;
    if (typeof id !== "string" || id.length === 0 || ids.has(id)
      || !Number.isInteger(pitch) || (pitch as number) < 0 || (pitch as number) > 127
      || !finiteInRange(startBeat, 0, totalBeats)
      || !finiteInRange(durationBeats, 0, totalBeats) || durationBeats <= 0
      || startBeat + durationBeats > totalBeats
      || !finiteInRange(velocity, 0, 1)
      || (rolePrior !== undefined && !["bass", "upper", "unknown"].includes(rolePrior as string))) return undefined;
    ids.add(id);
    notes.push({
      id,
      pitch: pitch as number,
      startBeat,
      durationBeats,
      velocity,
      ...(rolePrior === undefined ? {} : { rolePrior: rolePrior as P524ShadowNote["rolePrior"] }),
    });
  }
  notes.sort(compareSnapshottedNotes);
  return { notes, meter: [4, 4], totalBeats };
}

/** Canonical total order keeps all floating accumulation independent of caller order. */
function compareSnapshottedNotes(left: P524ShadowNote, right: P524ShadowNote): number {
  const leftEnd = left.startBeat + left.durationBeats;
  const rightEnd = right.startBeat + right.durationBeats;
  return compareNumber(left.startBeat, right.startBeat)
    || compareNumber(leftEnd, rightEnd)
    || compareNumber(left.pitch, right.pitch)
    || compareNumber(left.velocity, right.velocity)
    || compareString(left.rolePrior ?? "", right.rolePrior ?? "")
    || compareString(left.id, right.id)
    || compareNumber(left.durationBeats, right.durationBeats);
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isSuppliedEvidence(value: unknown): value is P524SuppliedShadowEvidence {
  return isRecord(value) && isRecord(value.bassLane) && isRecord(value.harmonicRhythm);
}

function unavailable(reason: P524ConsolidationUnavailable["reason"], inputNotes = 0): P524ConsolidationUnavailable {
  return {
    status: "unavailable",
    harmonicRhythm: "unknown",
    legacyFallback: true,
    states: [], fragments: [], boundaries: [],
    operations: { inputNotes, cells: 0, noteIntervalSearches: 0, profileSweepCells: 0, boundaryDecisions: 0 },
    reason,
  };
}

function difference(left: readonly number[], right: readonly number[]): readonly number[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function isStrictSubset(left: readonly number[], right: readonly number[]): boolean {
  const rightSet = new Set(right);
  return left.length < right.length && left.every((value) => rightSet.has(value));
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function normalizePitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

function deepEqualData(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
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
