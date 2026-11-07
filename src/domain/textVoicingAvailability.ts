import type { ChordSymbol, ChordVoicingMemory } from "./types";
import { voiceTextChordForAudition } from "./textChordTones";
import { resolveVoicingForUse } from "./voicing/resolveVoicing";
import { validateTextChordNotes } from "./textChordValidation";

/** The same validated default and explicit override precedence used for save/playback. */
export function textPreviewNotes(chord: ChordSymbol, memory?: ChordVoicingMemory): readonly number[] {
  let generated: readonly number[] = [];
  try { generated = voiceTextChordForAudition(chord); } catch { /* No replacement for failed generated harmony. */ }
  return resolveVoicingForUse(chord, memory, validateTextChordNotes(chord, generated) ? [...generated] : []).midiNotes;
}

export function textVoicingAvailability(events: readonly {
  readonly chord: ChordSymbol; readonly memory?: ChordVoicingMemory;
}[]): { readonly total: number; readonly registered: number; readonly unavailable: readonly string[] } {
  const unavailable = events.filter(event => textPreviewNotes(event.chord, event.memory).length < 2)
    .map(event => event.chord.label);
  return { total: events.length, registered: events.length - unavailable.length, unavailable };
}
