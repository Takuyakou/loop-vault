import { chordPitchClasses } from "./chordVoicing";
import type { ChordSymbol } from "./types";
import { validateTextChordNotes } from "./textChordValidation";

export const TEXT_CHORD_TONES_POLICY_ID = "text-chord-tones-v1";

/**
 * Context-free confirmation audition for text-authored harmony.
 * Bass occupies MIDI 43..54; distinct chord pitch classes occupy MIDI 60..71.
 * There is no five-upper-note cap: all accepted defining tones remain audible.
 */
export function voiceTextChordForAudition(chord: ChordSymbol): readonly number[] {
  const bassPc = chord.bass ?? chord.root;
  const bassNote = 43 + (((bassPc - 43) % 12) + 12) % 12;
  // This audition chooses two colors, without defining alt as those colors.
  const pitchClasses = chord.altered
    ? [0, 4, 10, 3, 8].map(interval => (chord.root + interval) % 12)
    : chordPitchClasses(chord);
  const upper = pitchClasses
    .filter(pc => pc !== ((bassPc % 12) + 12) % 12)
    .map(pc => 60 + pc)
    .sort((left, right) => left - right);
  const notes = [bassNote, ...upper];
  return validateTextChordNotes(chord, notes) ? notes : [];
}
