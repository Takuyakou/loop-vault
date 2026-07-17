import { heldNotes, sustainedNotes } from "./noteState";
import type { LiveNoteState } from "./types";

export function detectLiveBass(state: LiveNoteState): number | undefined {
  const held = heldNotes(state);
  if (held.length > 0) return held[0];
  const sustained = sustainedNotes(state);
  return sustained[0];
}
