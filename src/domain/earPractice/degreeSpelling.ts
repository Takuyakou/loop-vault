import type { WrittenPitch } from "../chordDojo/targetSnapshot";
import type { ChordSymbol } from "../types";

const STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL = [0, 2, 4, 5, 7, 9, 11];

/**
 * How many letters above the root each interval is written, by the semitones above the root.
 * `spellMidi` (the Dojo's) does not know these two chords, so the ear practice writes them from their degrees:
 *  - mMaj7: minor 3rd, perfect 5th, major 7th (GmMaj7 → G B♭ D F♯)
 *  - 7alt: major 3rd, minor 7th, and 1 semitone = ♭9, 3 = ♯9, 6 = ♯11, 8 = ♭13
 *    (G7alt → G B F A♭ E♭; A♭7alt → A♭ C G♭ B𝄫 F♭; B7alt → B D♯ A C G)
 */
const MMAJ7: Readonly<Record<number, number>> = { 0: 0, 3: 2, 7: 4, 11: 6 };
const ALT: Readonly<Record<number, number>> = { 0: 0, 4: 2, 7: 4, 10: 6, 1: 1, 3: 1, 6: 3, 8: 5 };

const pc = (value: number) => ((value % 12) + 12) % 12;

/** The root as written in the chord's name (`A♭7alt` → A, −1), or undefined when it cannot be read. */
function writtenRoot(label: string): { step: (typeof STEPS)[number]; alter: number } | undefined {
  const match = /^([A-G])([♭♯b#]*)/.exec(label);
  if (!match) return undefined;
  const alter = [...match[2]!].reduce((sum, mark) => sum + (mark === "♭" || mark === "b" ? -1 : 1), 0);
  return { step: match[1] as (typeof STEPS)[number], alter };
}

/**
 * The written pitch of a note of an mMaj7 or a 7alt chord, spelled from its degree. `undefined` for any other chord,
 * and for a note that is not one of the chord's degrees or is the bass of a slash chord (the Dojo's spelling keeps those).
 */
export function degreeSpelledPitch(symbol: ChordSymbol, midi: number): WrittenPitch | undefined {
  const table = symbol.altered ? ALT : symbol.quality === "minMaj7" ? MMAJ7 : undefined;
  if (!table) return undefined;
  if (symbol.bass !== undefined && symbol.bass !== symbol.root && pc(midi) === symbol.bass) return undefined;
  const root = writtenRoot(symbol.label);
  if (!root || pc(NATURAL[STEPS.indexOf(root.step)]! + root.alter) !== symbol.root) return undefined;
  const letters = table[pc(midi - symbol.root)];
  if (letters === undefined) return undefined;
  const step = STEPS[(STEPS.indexOf(root.step) + letters) % 7]!;
  let alter = pc(midi - NATURAL[STEPS.indexOf(step)]!);
  if (alter > 6) alter -= 12;
  if (Math.abs(alter) > 2) return undefined;
  return { step, alter, octave: (midi - NATURAL[STEPS.indexOf(step)]! - alter) / 12 - 1 };
}
