import type { ChordSymbol } from "../types";
import type { EarMode } from "./keys";
import { earChordPitchClasses } from "./chordTones";

export type EarLevel = 1 | 2 | 3 | 4 | 5;
export interface EarKey {
  tonic: number;
  mode: EarMode;
}

const pitchClass = (value: number) => ((value % 12) + 12) % 12;

// Triads that belong to the key: major I IV V ii iii vi; minor i iv v and ♭III ♭VI ♭VII (and the major V).
const MAJOR_KEY_MAJOR = [0, 5, 7];
const MAJOR_KEY_MINOR = [2, 4, 9];
const MINOR_KEY_MAJOR = [3, 8, 10, 7];
const MINOR_KEY_MINOR = [0, 5, 7];

/**
 * The level of one chord (PLAN §2). Decided from the chord symbol, never from its label.
 *  5  an altered or ♭9 / ♯9 / ♭13 / ♯11 chord, 7alt, mMaj7
 *  4  9th / 11th / 13th / add9 / 6/9 chords, and a bass that is not a note of the chord (G/F)
 *  3  sixths and sevenths
 *  2  sus, dim, aug, an inversion (C/E), a triad outside the key (or in a key that is not known)
 *  1  a major or minor triad in root position that belongs to the key
 */
export function earChordLevel(symbol: ChordSymbol, key?: EarKey): EarLevel {
  const tensions = symbol.tensions;
  if (symbol.altered || symbol.quality === "minMaj7"
    || tensions.some((tension) => tension === "b9" || tension === "#9" || tension === "b13" || tension === "#11")) {
    return 5;
  }
  const outsideBass = symbol.bass !== undefined && symbol.bass !== symbol.root
    && !earChordPitchClasses(symbol).includes(symbol.bass);
  if (outsideBass
    || ["add9", "add13", "maj9", "min9", "dom9", "dom11", "min11", "dom13", "sixNine"].includes(symbol.quality)
    || tensions.some((tension) => tension === "9" || tension === "11" || tension === "13")) {
    return 4;
  }
  if (["six", "min6", "maj7", "min7", "dom7", "min7b5", "dim7", "dom7sus4"].includes(symbol.quality)
    || tensions.includes("#5")) {
    return 3;
  }
  const inversion = symbol.bass !== undefined && symbol.bass !== symbol.root;
  if (["sus2", "sus4", "dim", "aug", "power"].includes(symbol.quality) || inversion) return 2;
  if (!key) return 2;
  const relative = pitchClass(symbol.root - key.tonic);
  const inKey = key.mode === "major"
    ? (symbol.quality === "maj" ? MAJOR_KEY_MAJOR : MAJOR_KEY_MINOR).includes(relative)
    : (symbol.quality === "maj" ? MINOR_KEY_MAJOR : MINOR_KEY_MINOR).includes(relative);
  return symbol.quality === "maj" || symbol.quality === "min" ? (inKey ? 1 : 2) : 2;
}

/** The level of a progression: its hardest chord. */
export function earLevelOf(chords: readonly ChordSymbol[], key?: EarKey): EarLevel {
  return chords.reduce<EarLevel>((level, chord) => Math.max(level, earChordLevel(chord, key)) as EarLevel, 1);
}
