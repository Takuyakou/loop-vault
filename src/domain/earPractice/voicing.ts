import type { ChordSymbol } from "../types";
import { earChordIntervals } from "./chordTones";

/** The bass sits in C2…B2 (MIDI 36…47). */
export const EAR_BASS_LOW = 36;
export const EAR_BASS_HIGH = 47;

const pitchClass = (value: number) => ((value % 12) + 12) % 12;

/**
 * The notes this practice sounds for a chord, lowest first (`chordVoicing.ts` is not used: it does not
 * know 7alt, and leaves the bass too close to the notes above it).
 *  - The bass (the written bass, otherwise the root) is the lowest note, in C2…B2.
 *  - Every other note is at least an octave above it. They are stacked upward from the bass, in the order of
 *    the chord tones (3rd, 5th, 7th, then the tensions), and the root is sounded above the bass when the bass
 *    is another note (C/E has C and G above an E).
 */
export function voiceForEar(symbol: ChordSymbol): number[] {
  const bassPc = symbol.bass ?? symbol.root;
  const bass = EAR_BASS_LOW + pitchClass(bassPc - EAR_BASS_LOW);
  const tones = earChordIntervals(symbol).filter((interval) => {
    // The bass is not sounded again above itself (an inversion keeps the root above; the root bass keeps nothing).
    return pitchClass(symbol.root + interval) !== bassPc;
  });
  const notes = [bass];
  let previous = bass + 11;
  for (const interval of tones) {
    const target = pitchClass(symbol.root + interval);
    let note = previous + 1;
    while (pitchClass(note) !== target) note += 1;
    notes.push(note);
    previous = note;
  }
  return notes;
}
