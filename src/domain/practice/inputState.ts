import { heldNotes, sustainedNotes, type LiveNoteState } from "../liveMidi";
import type { PracticeInputSnapshot } from "./types";

export function practiceInputFromLiveState(
  state: LiveNoteState,
  timestampMs: number,
): PracticeInputSnapshot {
  const latestAttack = [...state.held.values()].reduce(
    (latest, note) => Math.max(latest, note.lastEventMs),
    0,
  );
  return {
    heldMidiNotes: heldNotes(state),
    sustainedMidiNotes: sustainedNotes(state),
    attackRevision: latestAttack,
    timestampMs,
  };
}

