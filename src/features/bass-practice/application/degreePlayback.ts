import type {
  MidiPreviewNote,
  MidiPreviewSound,
} from "../../../audio/chordPreview";
import type { PlaybackRequest } from "../../../audio/playbackController";
import {
  resolveSingingReference,
  type PracticeExercise,
  type PracticeTargetEvent,
  type SingingReferenceMode,
} from "../domain";

export const DEGREE_ECHO_LISTEN_LIMIT = 2;

export function degreeTargetPlaybackRequest(
  exercise: PracticeExercise,
): PlaybackRequest {
  return noteEventRequest(exercise.targetEvents, exercise.tempo, "clean-bass");
}

export function degreeSingingReferencePlaybackRequest(
  exercise: PracticeExercise,
  mode: SingingReferenceMode,
): PlaybackRequest {
  const reference = resolveSingingReference(exercise.targetEvents, mode);
  return noteEventRequest(reference.events, exercise.tempo, "singing-reference");
}

export function degreePhraseDurationMs(exercise: PracticeExercise): number {
  const endBeat = exercise.targetEvents.reduce(
    (maximum, event) => Math.max(maximum, event.startBeat + event.durationBeats),
    0,
  );
  return endBeat * (60_000 / exercise.tempo);
}

export function targetEventsAsPreviewNotes(
  events: readonly PracticeTargetEvent[],
): readonly MidiPreviewNote[] {
  return Object.freeze(events.map((event) => Object.freeze({
    pitch: event.midiNote,
    startBeat: event.startBeat,
    durationBeats: event.durationBeats,
    velocity: event.velocity,
  })));
}

function noteEventRequest(
  events: readonly PracticeTargetEvent[],
  bpm: number,
  sound: MidiPreviewSound,
): PlaybackRequest {
  return Object.freeze({
    type: "notes" as const,
    notes: targetEventsAsPreviewNotes(events),
    bpm,
    sound,
  });
}
