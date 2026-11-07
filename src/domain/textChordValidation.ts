import type { ChordSymbol, Tension } from "./types";

const intervals: Record<Tension, number> = {
  "#5": 8, "9": 2, b9: 1, "#9": 3, "11": 5, "#11": 6, "13": 9, b13: 8,
};
const alteredIntervals = [1, 3, 6, 8] as const;
const pc = (note: number) => ((note % 12) + 12) % 12;

/** Validate the written harmony after generation; a successful generator is not proof. */
export function validateTextChordNotes(chord: ChordSymbol, notes: readonly number[]): boolean {
  if (notes.length < 2 || notes.some(note => !Number.isInteger(note) || note < 0 || note > 127)
    || new Set(notes).size !== notes.length) return false;
  const sorted = [...notes].sort((a, b) => a - b);
  if (chord.bass !== undefined && pc(sorted[0]!) !== chord.bass) return false;
  if (sorted.some((note, index) => note < 60 && index > 0 && note - sorted[index - 1]! === 1)) return false;
  const relative = new Set(notes.map(note => pc(note - chord.root)));
  if (chord.altered) {
    if (chord.quality !== "dom7" || chord.tensions.length || chord.omissions?.length) return false;
    const colors = alteredIntervals.filter(interval => relative.has(interval));
    return relative.has(4) && relative.has(10) && colors.length >= 1 && colors.length <= 2
      && ![2, 7, 9].some(interval => relative.has(interval))
      && [...relative].every(interval => [0, 4, 10, ...alteredIntervals].includes(interval));
  }
  if (chord.quality === "minMaj7") {
    if ((!relative.has(3) && !chord.omissions?.includes("3")) || !relative.has(11)) return false;
    const allowed = new Set([0, 3, 7, 11, ...chord.tensions.map(tension => intervals[tension]),
      ...(chord.bass === undefined ? [] : [pc(chord.bass - chord.root)])]);
    if ([...relative].some(interval => !allowed.has(interval))) return false;
  }
  if (chord.tensions.some(tension => !relative.has(intervals[tension]))) return false;
  if (chord.quality === "dom7" && chord.tensions.length) {
    // A written omission (the sus chords leave the third out) is not a missing note.
    if ((!relative.has(4) && !chord.omissions?.includes("3")) || !relative.has(10)) return false;
    const written = new Set(chord.tensions.map(tension => intervals[tension]));
    const bass = chord.bass === undefined ? undefined : pc(chord.bass - chord.root);
    const allowed = new Set([0, 4, 7, 10, ...written, ...(bass === undefined ? [] : [bass])]);
    if ([...relative].some(interval => !allowed.has(interval))) return false;
  }
  return true;
}
