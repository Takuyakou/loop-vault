/**
 * P25 V24-10: the band's note names are spelled from the card's chord root (the letter a third, a fifth, a
 * seventh, a ninth, an eleventh or a thirteenth above), so C major's Em7 shows F♯4 rather than Gb4. A note
 * that cannot be a degree of the chord (or would need a double accidental) falls back to the screen key's
 * direction (sharp keys sharp, flat keys flat, C major / A minor sharp).
 */
import { accidentalPreferenceForKey, pitchClassFromNoteToken } from "./chords";

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"] as const;
const NATURAL = [0, 2, 4, 5, 7, 9, 11] as const;
const STEPS = [
  { degree: 1, steps: 0 }, { degree: 3, steps: 2 }, { degree: 5, steps: 4 }, { degree: 7, steps: 6 },
  { degree: 9, steps: 1 }, { degree: 11, steps: 3 }, { degree: 13, steps: 5 },
] as const;

function accidentalText(value: number): string {
  return value === 1 ? "♯" : value === -1 ? "♭" : value === 2 ? "𝄪" : value === -2 ? "𝄫" : "";
}

/** `chordTones` are the chord's own notes (root, 3rd, 5th, 7th: not its tensions); `root` is the displayed root (E, B♭, F♯); `key` is the screen's key text (C major, A minor, …). */
export function dockNoteName(note: number, root: string, key: string, chordTones?: ReadonlySet<number>): string {
  const pc = ((note % 12) + 12) % 12;
  const octaveOf = () => Math.floor(note / 12) - 1;
  const fallback = () => `${(accidentalPreferenceForKey(key) === "flat" ? FLAT_NAMES : SHARP_NAMES)[pc]}${octaveOf()}`;
  const ascii = root.replace(/♭/g, "b").replace(/♯/g, "#");
  const rootPc = pitchClassFromNoteToken(ascii);
  const letterIndex = LETTERS.indexOf(ascii.charAt(0).toUpperCase() as (typeof LETTERS)[number]);
  if (rootPc === undefined || letterIndex < 0) return fallback();
  // The letters the chord's own notes (root, 3rd, 5th, 7th) already take. A tension may not use one of them:
  // C7's ♯9 is D♯, not E♭ (E is its third); Em7's 9th is F♯, not G♭ (G is its third).
  const usedLetters = new Set<number>();
  for (const tone of chordTones ?? []) {
    if (tone === pc) continue;
    let own: { index: number; accidental: number } | undefined;
    for (const step of STEPS.filter((entry) => entry.degree <= 7)) {
      const index = (letterIndex + step.steps) % 7;
      const accidental = ((tone - NATURAL[index]! + 6 + 12) % 12) - 6;
      if (Math.abs(accidental) <= 1 && (own === undefined || Math.abs(accidental) < Math.abs(own.accidental))) own = { index, accidental };
    }
    if (own !== undefined) usedLetters.add(own.index);
  }
  let best: { degree: number; steps: number; letterPc: number; accidental: number } | undefined;
  for (const step of STEPS) {
    if (usedLetters.has((letterIndex + step.steps) % 7) && !chordTones?.has(pc)) continue;
    const letterPc = NATURAL[(letterIndex + step.steps) % 7]!;
    const accidental = ((pc - letterPc + 6 + 12) % 12) - 6;
    if (Math.abs(accidental) > 1) continue;
    if (best === undefined || Math.abs(accidental) < Math.abs(best.accidental)
      || (Math.abs(accidental) === Math.abs(best.accidental) && step.degree < best.degree)) {
      best = { degree: step.degree, steps: step.steps, letterPc, accidental };
    }
  }
  if (best === undefined) return fallback();
  const spelledPitch = best.letterPc + best.accidental;
  const octave = (note - spelledPitch) / 12 - 1;
  if (!Number.isInteger(octave)) return fallback();
  return `${LETTERS[(letterIndex + best.steps) % 7]}${accidentalText(best.accidental)}${octave}`;
}
