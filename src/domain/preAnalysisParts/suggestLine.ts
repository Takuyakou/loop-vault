import type { PreAnalysisNote } from "../midi/preAnalysis";

const EPSILON = 1e-9;
/** A melody has to be more than a stray note or two… */
const MIN_MELODY_NOTES = 4;
/**
 * …and more than the top note of the chords: at least this share of the part is above the line.
 * (On real songs a line with 1% of the notes above it was only the highest chord tone.)
 */
const MIN_MELODY_SHARE = 0.1;
/**
 * …and not more than this: a "melody" that is half of the part or more is the part itself (an
 * arpeggio with no melody has all of its notes sounding one at a time).
 */
const MAX_MELODY_SHARE = 0.5;
/**
 * …and what is left below the line has to be chords: at least this share of the notes below sound
 * together with another note below. A part of single notes (an arpeggio) is not split.
 */
const CHORD_BELOW_SHARE = 0.5;
/** At least this share of the notes above the line sound one at a time. */
const SINGLE_SHARE = 0.8;
/**
 * …and at least this share of them start by themselves: not struck together with a note below the
 * line. The top notes of a chord played over and over are "single" too; this is what tells them
 * from a melody, so a part with chords only gets no suggestion.
 */
const INDEPENDENT_SHARE = 0.3;
const TOGETHER_BEATS = 0.125;

/**
 * Where the line starts: the lowest height above which at least 80% of the notes sound one at a
 * time (and are not just the top of the chords), above which there are 10% to 50% of the part's
 * notes, and below which the notes are mostly chords. `undefined` when there is no such height — the
 * screen then says the line could not be placed automatically and lets the person place it.
 */
export function suggestMelodyFrom(notes: readonly PreAnalysisNote[]): number | undefined {
  if (notes.length < MIN_MELODY_NOTES + 1) return undefined;
  const needed = Math.max(MIN_MELODY_NOTES, Math.ceil(notes.length * MIN_MELODY_SHARE));
  const pitches = [...new Set(notes.map((note) => note.pitch))].sort((a, b) => a - b);
  // The lowest pitch itself cannot be the line: nothing would be left below it.
  for (const line of pitches.slice(1)) {
    const above = notes.filter((note) => note.pitch >= line);
    if (above.length < needed) break; // higher lines only have fewer notes
    if (above.length > notes.length * MAX_MELODY_SHARE + EPSILON) continue; // a higher line has fewer
    const below = notes.filter((note) => note.pitch < line);
    if (!below.length || 1 - singleShare(below) < CHORD_BELOW_SHARE) continue;
    if (singleShare(above) >= SINGLE_SHARE && independentShare(above, below) >= INDEPENDENT_SHARE) {
      return line;
    }
  }
  return undefined;
}

/** Share of the notes at or above the line that start together with a note below it (0 when none are above). */
export function togetherShare(notes: readonly PreAnalysisNote[], line: number): number {
  const above = notes.filter((note) => note.pitch >= line);
  const below = notes.filter((note) => note.pitch < line);
  if (!above.length) return 0;
  return 1 - independentShare(above, below);
}

/**
 * Share of the notes at or above the line that sound one at a time. A melody is mostly one note at
 * a time; the lower a line goes into the chords, the lower this falls (on real songs: 80% at the
 * suggested line, 17% through the middle of the chords).
 */
export function singleShareAbove(notes: readonly PreAnalysisNote[], line: number): number {
  const above = notes.filter((note) => note.pitch >= line);
  return above.length ? singleShare(above) : 1;
}

/**
 * The line cuts through chords: below the share a suggested line has to reach, chords still sound
 * above it. Only a warning (the line stays usable); never true for a suggested line.
 */
export function chordsAboveLine(notes: readonly PreAnalysisNote[], line: number): boolean {
  return singleShareAbove(notes, line) < SINGLE_SHARE;
}

function singleShare(notes: readonly PreAnalysisNote[]): number {
  const starts = notes.map((note) => note.startBeat).sort((a, b) => a - b);
  const ends = notes.map((note) => note.startBeat + note.durationBeats).sort((a, b) => a - b);
  let single = 0;
  for (const note of notes) {
    const at = note.startBeat + EPSILON;
    if (countAtMost(starts, at) - countAtMost(ends, at) <= 1) single += 1;
  }
  return single / notes.length;
}

function independentShare(
  above: readonly PreAnalysisNote[],
  below: readonly PreAnalysisNote[],
): number {
  const onsets = below.map((note) => note.startBeat).sort((a, b) => a - b);
  let alone = 0;
  for (const note of above) {
    const next = countAtMost(onsets, note.startBeat + TOGETHER_BEATS);
    const near = next > 0 && onsets[next - 1]! >= note.startBeat - TOGETHER_BEATS;
    if (!near) alone += 1;
  }
  return alone / above.length;
}

function countAtMost(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle]! <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}
