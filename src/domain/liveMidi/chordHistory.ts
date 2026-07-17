import { noteNameFromPitchClass } from "../chords";
import { LIVE_CHORD_HISTORY_LIMIT, LIVE_CHORD_TIMING } from "./constants";
import { detectionKey } from "./chordStabilizer";
import type { LiveChordDetection, LiveChordHistoryState } from "./types";

export function createLiveChordHistoryState(): LiveChordHistoryState {
  return { entries: [] };
}

export function updateLiveChordHistory(
  state: LiveChordHistoryState,
  displayed: LiveChordDetection,
  timestampMs: number,
  id: string,
): LiveChordHistoryState {
  if (displayed.kind !== "chord" || !displayed.chord) {
    return { entries: state.entries };
  }
  const key = detectionKey(displayed);
  if (state.candidateKey !== key) {
    return { ...state, candidateKey: key, candidateSinceMs: timestampMs, committedCandidateKey: undefined };
  }
  if (state.committedCandidateKey === key || timestampMs - (state.candidateSinceMs ?? timestampMs) < LIVE_CHORD_TIMING.historyCommitMs) {
    return state;
  }
  const last = state.entries[state.entries.length - 1];
  if (last?.label === displayed.label) {
    return { ...state, committedCandidateKey: key };
  }
  const entry = {
    id,
    chord: displayed.chord,
    label: displayed.label,
    ...(displayed.bass === undefined ? {} : { bass: noteNameFromPitchClass(displayed.bass) }),
    notes: [...displayed.notes],
    startedAtMs: state.candidateSinceMs ?? timestampMs,
    committedAtMs: timestampMs,
  };
  return {
    ...state,
    entries: [...state.entries, entry].slice(-LIVE_CHORD_HISTORY_LIMIT),
    committedCandidateKey: key,
  };
}

export function liveChordHistoryDeadline(
  state: LiveChordHistoryState,
): number | undefined {
  if (
    !state.candidateKey
    || state.candidateSinceMs === undefined
    || state.committedCandidateKey === state.candidateKey
  ) {
    return undefined;
  }
  return state.candidateSinceMs + LIVE_CHORD_TIMING.historyCommitMs;
}
