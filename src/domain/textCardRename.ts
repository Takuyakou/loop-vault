/**
 * P25-04 C7: the chord name after a card's notes changed by a key or by MIDI. Keep the name while the notes
 * still spell it; otherwise read the notes the way 「鍵盤で入れる」 does; say so when nothing can be read.
 */
import type { ChordSymbol } from "./types";
import { detectLiveChord, type LiveNoteState } from "./liveMidi";
import { parseExtendedTextChordLabel } from "./extendedTextProgression";
import { normalizedChordKey } from "./voicing/normalizeVoicing";
import { chordMatchSets, notesMatchChord } from "./voicingShapes";

export type CardRename =
  | { readonly kind: "keep" }
  | { readonly kind: "rename"; readonly label: string; readonly chord: ChordSymbol }
  | { readonly kind: "unread" };

const pc = (note: number): number => ((note % 12) + 12) % 12;

/** The same note state 「鍵盤で入れる」 reads (the keys held, nothing sustained). */
export function liveNoteStateOf(notes: readonly number[]): LiveNoteState {
  return {
    held: new Map(notes.map((note) => [`0:${note}`, { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 }])),
    sustained: new Set(),
    pedalByChannel: new Map(),
  };
}

/** C7: `before` are the notes the card played before the change, `after` the notes it plays now. */
export function renameForNotes(chord: ChordSymbol, before: readonly number[], after: readonly number[]): CardRename {
  const sets = chordMatchSets(chord);
  // 1: the written tones (K `tones()`) and the bass, plus the colours already sounding before the change.
  const written = new Set([...sets.tones, pc(chord.bass ?? chord.root)]);
  const allowed = new Set([...written, ...before.map(pc).filter((value) => !written.has(value))]);
  if (notesMatchChord({ ...sets, allowed }, after)) return { kind: "keep" };
  // 2: read the notes as 「鍵盤で入れる」 does.
  const detection = detectLiveChord(liveNoteStateOf(after));
  if (detection.kind === "chord") {
    const parsed = parseExtendedTextChordLabel(detection.label);
    if (parsed) {
      return normalizedChordKey(parsed) === normalizedChordKey(chord)
        ? { kind: "keep" }
        : { kind: "rename", label: detection.label, chord: parsed };
    }
  }
  // 3: nothing can be read; the notes and the name stay.
  return { kind: "unread" };
}
