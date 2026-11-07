import type { ChordQuality, ChordSymbol, Tension } from "../types";

/** Semitones above the root, written compound (9th = 14, 11th = 17, 13th = 21). */
const BASE: Record<ChordQuality, readonly number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], min7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  maj9: [0, 4, 7, 11, 14], min9: [0, 3, 7, 10, 14], dom9: [0, 4, 7, 10, 14], min11: [0, 3, 7, 10, 17],
  dom13: [0, 4, 7, 10, 21], sus2: [0, 2, 7], sus4: [0, 5, 7], dom7sus4: [0, 5, 7, 10],
  add9: [0, 4, 7, 14], add13: [0, 4, 7, 21], six: [0, 4, 7, 9], min6: [0, 3, 7, 9], sixNine: [0, 4, 7, 9, 14],
  minMaj7: [0, 3, 7, 11], power: [0, 7], dom11: [0, 4, 7, 10, 17],
};

const TENSION: Record<Tension, number> = {
  "9": 14, b9: 13, "#9": 15, "11": 17, "#11": 18, "13": 21, b13: 20, "#5": 8,
};

const DOMINANT: ReadonlySet<ChordQuality> = new Set(["dom7", "dom9", "dom11", "dom13", "dom7sus4"]);

/**
 * What this practice sounds for a chord, from the chord symbol (not from `voiceChordForPreview`, which
 * does not know 7alt and puts a perfect 5th into 7(♯11) and 7(♭13)):
 *  - the perfect 5th is left out of 7(♯5), 7(♭13), 7(♯11) and 7alt (a 5th would blur the colour tone);
 *  - 7alt sounds the 3rd, the ♭7th and two altered tones (♭9 and ♭13).
 * Sorted from the root up, without repeats.
 */
export function earChordIntervals(symbol: ChordSymbol): number[] {
  const set = new Set<number>(BASE[symbol.quality]);
  if (symbol.altered) {
    set.delete(7);
    set.add(13);
    set.add(20);
  }
  for (const tension of symbol.tensions) {
    set.add(TENSION[tension]);
    if (tension === "#5" || tension === "b13") set.delete(7);
    if (tension === "#11" && DOMINANT.has(symbol.quality)) set.delete(7);
  }
  if (symbol.omissions?.includes("3")) { set.delete(3); set.delete(4); }
  if (symbol.omissions?.includes("5")) { set.delete(6); set.delete(7); set.delete(8); }
  return [...set].sort((a, b) => a - b);
}

/** The pitch classes of the chord tones (root included). */
export function earChordPitchClasses(symbol: ChordSymbol): number[] {
  return [...new Set(earChordIntervals(symbol).map((interval) => (symbol.root + interval) % 12))];
}
