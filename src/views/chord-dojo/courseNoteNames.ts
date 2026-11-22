import { formatMidiNoteForDisplay } from "../../components/music-keyboard";

/**
 * P23-49: note names beside the guide-course keyboard. They use the keyboard's own octave numbers
 * (scientific: middle C is C4) and the flat sign, so the text and the key labels name the same key.
 */
export function courseNoteNames(notes: readonly number[]): string {
  return notes
    .map((note) => formatMidiNoteForDisplay(note, "scientific", "flat").replace(/([A-G])b/g, "$1♭"))
    .join(" · ");
}
