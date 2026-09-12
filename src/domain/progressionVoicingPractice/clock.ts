import type { ProgressionVoicingPracticeSnapshot } from "./types";

export type ProgressionPracticeClockStatus = "ready" | "count-in" | "running" | "paused" | "stopped";

export interface ProgressionPracticeClockSchedule {
  readonly countInBeats: number;
  readonly progressionStartBeat: number;
  readonly loopBeats: number;
  readonly eventStarts: readonly number[];
}

export interface ProgressionPracticeClockState {
  readonly status: ProgressionPracticeClockStatus;
  readonly bpm: number;
  readonly countInBars: 0 | 1 | 2;
  /** Absolute Tone Transport beat since the latest Start/Restart. */
  readonly transportBeat: number;
}

export type ProgressionPracticeClockAction =
  | { readonly type: "START" }
  | { readonly type: "SYNC_TRANSPORT"; readonly absoluteBeat: number }
  | { readonly type: "PAUSE" }
  | { readonly type: "RESUME" }
  | { readonly type: "RESTART" }
  | { readonly type: "SET_BPM"; readonly bpm: number }
  | { readonly type: "STOP" };

export interface ProgressionPracticeClockProjection {
  readonly status: ProgressionPracticeClockStatus;
  readonly inCountIn: boolean;
  readonly countInBeat?: number;
  readonly currentEventIndex: number;
  readonly nextEventIndex: number;
  readonly beatInChord: number;
  readonly beatsInChord: number;
  readonly beatInBar: number;
  readonly chordProgress: number;
  readonly progressionProgress: number;
  readonly progressionBeat: number;
  readonly loopCount: number;
}

const MAX_LOOP_BOUNDARY_SNAP_BEATS = 1e-9;
const LOOP_BOUNDARY_ULP_MULTIPLIER = 8;

export function buildProgressionPracticeClockSchedule(
  snapshot: ProgressionVoicingPracticeSnapshot,
  countInBars: 0 | 1 | 2,
): ProgressionPracticeClockSchedule {
  const countInBeats = countInBars * snapshot.meter.numerator;
  return Object.freeze({
    countInBeats,
    progressionStartBeat: countInBeats,
    loopBeats: snapshot.lengthBeats,
    eventStarts: Object.freeze(snapshot.events.map((event) => event.startBeat)),
  });
}

export function createProgressionPracticeClockState(
  snapshot: ProgressionVoicingPracticeSnapshot,
  options: { readonly bpm?: number; readonly countInBars?: 0 | 1 | 2 } = {},
): ProgressionPracticeClockState {
  const bpm = options.bpm ?? snapshot.bpm;
  assertBpm(bpm);
  return Object.freeze({ status: "ready", bpm, countInBars: options.countInBars ?? 1, transportBeat: 0 });
}

export function reduceProgressionPracticeClock(
  snapshot: ProgressionVoicingPracticeSnapshot,
  state: ProgressionPracticeClockState,
  action: ProgressionPracticeClockAction,
): ProgressionPracticeClockState {
  const schedule = buildProgressionPracticeClockSchedule(snapshot, state.countInBars);
  switch (action.type) {
    case "START":
      if (state.status === "paused" || state.status === "running" || state.status === "count-in") return state;
      return freezeState(state, schedule.countInBeats > 0 ? "count-in" : "running", 0);
    case "SYNC_TRANSPORT": {
      if (state.status !== "running" && state.status !== "count-in") return state;
      if (!Number.isFinite(action.absoluteBeat) || action.absoluteBeat < state.transportBeat) return state;
      const absoluteBeat = Math.max(0, action.absoluteBeat);
      if (absoluteBeat === state.transportBeat) return state;
      return freezeState(
        state,
        absoluteBeat < schedule.progressionStartBeat ? "count-in" : "running",
        absoluteBeat,
      );
    }
    case "PAUSE":
      return state.status === "running" || state.status === "count-in"
        ? freezeState(state, "paused", state.transportBeat)
        : state;
    case "RESUME":
      if (state.status !== "paused") return state;
      return freezeState(
        state,
        state.transportBeat < schedule.progressionStartBeat ? "count-in" : "running",
        state.transportBeat,
      );
    case "RESTART":
      return freezeState(state, schedule.countInBeats > 0 ? "count-in" : "running", 0);
    case "SET_BPM":
      assertBpm(action.bpm);
      if (action.bpm === state.bpm) return state;
      return Object.freeze({ ...state, bpm: action.bpm });
    case "STOP":
      return state.status === "stopped" ? state : freezeState(state, "stopped", state.transportBeat);
  }
}

export function projectProgressionPracticeClock(
  snapshot: ProgressionVoicingPracticeSnapshot,
  state: ProgressionPracticeClockState,
): ProgressionPracticeClockProjection {
  const schedule = buildProgressionPracticeClockSchedule(snapshot, state.countInBars);
  const beforeProgression = state.transportBeat < schedule.progressionStartBeat;
  const inCountIn = (state.status === "count-in" || state.status === "paused") && beforeProgression;
  const elapsed = Math.max(0, state.transportBeat - schedule.progressionStartBeat);
  const { loopCount, progressionBeat } = splitLoopPosition(elapsed, schedule.loopBeats);
  const currentEventIndex = findCurrentEventIndex(snapshot, progressionBeat);
  const current = snapshot.events[currentEventIndex]!;
  const beatWithinChord = Math.max(0, progressionBeat - current.startBeat);
  const beatsInChord = Math.max(1, Math.ceil(current.durationBeats));
  return Object.freeze({
    status: state.status,
    inCountIn,
    ...(inCountIn ? { countInBeat: Math.floor(state.transportBeat % snapshot.meter.numerator) + 1 } : {}),
    currentEventIndex,
    nextEventIndex: (currentEventIndex + 1) % snapshot.events.length,
    beatInChord: Math.min(beatsInChord, Math.floor(beatWithinChord) + 1),
    beatsInChord,
    beatInBar: Math.floor(progressionBeat % snapshot.meter.numerator) + 1,
    chordProgress: clampUnit(beatWithinChord / current.durationBeats),
    progressionProgress: clampUnit(progressionBeat / schedule.loopBeats),
    progressionBeat,
    loopCount,
  });
}

/** Count-in is an initial offset only; loop occurrences are one progression apart. */
export function progressionEventTransportBeat(
  schedule: ProgressionPracticeClockSchedule,
  eventIndex: number,
  loopIndex: number,
): number {
  if (!Number.isInteger(eventIndex) || eventIndex < 0 || eventIndex >= schedule.eventStarts.length) {
    throw new RangeError("Voicing Loop event index is out of range.");
  }
  if (!Number.isInteger(loopIndex) || loopIndex < 0) {
    throw new RangeError("Voicing Loop index must be a non-negative integer.");
  }
  return schedule.progressionStartBeat + schedule.eventStarts[eventIndex]! + loopIndex * schedule.loopBeats;
}

function findCurrentEventIndex(snapshot: ProgressionVoicingPracticeSnapshot, progressionBeat: number): number {
  for (let index = snapshot.events.length - 1; index >= 0; index -= 1) {
    if (progressionBeat >= snapshot.events[index]!.startBeat) return index;
  }
  return 0;
}
function freezeState(
  state: ProgressionPracticeClockState,
  status: ProgressionPracticeClockStatus,
  transportBeat: number,
): ProgressionPracticeClockState {
  return Object.freeze({ ...state, status, transportBeat });
}
function assertBpm(bpm: number): void {
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 240) {
    throw new RangeError("Voicing Loop BPM must be between 30 and 240.");
  }
}
function splitLoopPosition(
  elapsed: number,
  loopBeats: number,
): { readonly loopCount: number; readonly progressionBeat: number } {
  const quotient = elapsed / loopBeats;
  const nearestLoop = Math.round(quotient);
  const nearestBoundary = nearestLoop * loopBeats;
  const floatingNoise = Number.EPSILON
    * Math.max(1, Math.abs(elapsed), Math.abs(nearestBoundary), Math.abs(loopBeats))
    * LOOP_BOUNDARY_ULP_MULTIPLIER;
  const snapTolerance = Math.min(MAX_LOOP_BOUNDARY_SNAP_BEATS, floatingNoise);
  if (Math.abs(elapsed - nearestBoundary) <= snapTolerance) {
    return { loopCount: nearestLoop, progressionBeat: 0 };
  }
  const loopCount = Math.floor(quotient);
  const progressionBeat = elapsed - loopCount * loopBeats;
  return { loopCount, progressionBeat };
}
function clampUnit(value: number): number { return Math.min(1, Math.max(0, value)); }
