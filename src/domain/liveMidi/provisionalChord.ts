import {
  FAST_PROVISIONAL_NOTE_SPAN_MS,
  FAST_PROVISIONAL_SCORE_MARGIN,
  LIVE_CHORD_TIMING,
} from "./constants";
import { heldNotes, parseNoteKey, soundingPitchClasses } from "./noteState";
import type { LiveChordDetection, LiveNoteState } from "./types";

export function provisionalChordReadyAt(
  state: LiveNoteState,
  candidate: LiveChordDetection,
): number | undefined {
  if (
    candidate.kind !== "chord"
    || !candidate.chord
    || candidate.scoreMargin === undefined
    || candidate.scoreMargin < FAST_PROVISIONAL_SCORE_MARGIN
  ) {
    return undefined;
  }

  const heldEntries = [...state.held.entries()];
  const heldPitchClasses = new Set(heldEntries.map(([key]) => parseNoteKey(key).note % 12));
  const sounding = soundingPitchClasses(state);
  if (
    heldPitchClasses.size < 3
    || sounding.length !== heldPitchClasses.size
    || sounding.some((pitchClass) => !heldPitchClasses.has(pitchClass))
  ) {
    return undefined;
  }

  const heldBass = heldNotes(state)[0];
  if (heldBass === undefined || candidate.bass !== heldBass) return undefined;

  const noteOnTimes = heldEntries.map(([, note]) => note.sinceMs);
  const firstNoteOnMs = Math.min(...noteOnTimes);
  const lastNoteOnMs = Math.max(...noteOnTimes);
  if (lastNoteOnMs - firstNoteOnMs > FAST_PROVISIONAL_NOTE_SPAN_MS) return undefined;

  return firstNoteOnMs + LIVE_CHORD_TIMING.gatherMs;
}
