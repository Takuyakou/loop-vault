import { LIVE_CHORD_TIMING } from "./constants";
import { emptyLiveChordDetection } from "./liveChordDetector";
import type { LiveChordDetection, LiveChordStabilizerState } from "./types";

export function createLiveChordStabilizerState(): LiveChordStabilizerState {
  return { displayed: emptyLiveChordDetection() };
}

export function stabilizeLiveChord(
  state: LiveChordStabilizerState,
  candidate: LiveChordDetection,
  timestampMs: number,
): LiveChordStabilizerState {
  if (detectionKey(candidate) === detectionKey(state.displayed)) {
    return { displayed: candidate.kind === "empty" ? state.displayed : candidate };
  }

  const pendingSinceMs = state.pending && detectionKey(state.pending) === detectionKey(candidate)
    ? state.pendingSinceMs ?? timestampMs
    : timestampMs;
  const delay = switchDelay(state.displayed, candidate);
  if (timestampMs - pendingSinceMs < delay) {
    return { ...state, pending: candidate, pendingSinceMs };
  }
  return { displayed: candidate };
}

export function detectionKey(value: LiveChordDetection): string {
  if (value.kind === "chord" && value.chord) {
    return `${value.chord.root}:${value.chord.quality}:${value.chord.bass ?? ""}:${pitchSet(value)}`;
  }
  return `${value.kind}:${pitchSet(value)}`;
}

function switchDelay(current: LiveChordDetection, next: LiveChordDetection): number {
  if (next.kind === "empty") return LIVE_CHORD_TIMING.fullReleaseMs;
  if (current.kind === "empty") return LIVE_CHORD_TIMING.stableMs;
  const currentPcs = new Set(current.notes.map((note) => note % 12));
  const nextPcs = new Set(next.notes.map((note) => note % 12));
  const subset = nextPcs.size < currentPcs.size && [...nextPcs].every((pc) => currentPcs.has(pc));
  if (subset) return LIVE_CHORD_TIMING.releaseGraceMs;
  const superset = currentPcs.size < nextPcs.size && [...currentPcs].every((pc) => nextPcs.has(pc));
  return superset ? LIVE_CHORD_TIMING.gatherMs : LIVE_CHORD_TIMING.stableMs;
}

function pitchSet(value: LiveChordDetection): string {
  return [...new Set(value.notes.map((note) => note % 12))].sort((a, b) => a - b).join(",");
}
