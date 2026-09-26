import { chordPitchClasses } from "./chordVoicing";
import type { ChordSymbol } from "./types";

export const TEXT_CHORD_TONES_POLICY_ID = "text-chord-tones-v1";

/**
 * Context-free confirmation audition for text-authored harmony.
 * Bass occupies MIDI 43..54; distinct chord pitch classes occupy MIDI 60..71.
 * There is no five-upper-note cap: all accepted defining tones remain audible.
 */
export function voiceTextChordForAudition(chord: ChordSymbol): readonly number[] {
  const bassPc = chord.bass ?? chord.root;
  const bassNote = 43 + (((bassPc - 43) % 12) + 12) % 12;
  const upper = chordPitchClasses(chord)
    .filter(pc => pc !== ((bassPc % 12) + 12) % 12)
    .map(pc => 60 + pc)
    .sort((left, right) => left - right);
  return [bassNote, ...upper];
}
