import type { KeyboardRange } from "../../components/music-keyboard";
import type { EarQuestion } from "../../domain/earPractice";

const MIN_SPAN = 36; // three octaves
const MAX_SPAN = 60; // five octaves: the white keys stay at least 18 px wide

/**
 * The keys that are shown while a question is asked. Decided before it starts and not moved while it is asked:
 * it covers every note the progression sounds, with room to spare, and is at least three octaves. `shift` is
 * how many octaves the player moved it by hand (kept for the next question).
 */
export function earKeyboardRange(question: EarQuestion, shift = 0): KeyboardRange {
  const notes = question.chords.flatMap((chord) => chord.notes);
  const low = Math.min(...notes);
  const high = Math.max(...notes);
  let min = Math.floor(low / 12) * 12; // a C at or below the lowest note
  let max = Math.ceil(high / 12) * 12; // a C at or above the highest note
  while (max - min < MIN_SPAN) {
    if (max + 12 <= 108) max += 12;
    else min -= 12;
  }
  // (the bass is never below C2 and nothing sounds above E6, so five octaves always hold every note)
  while (max - min > MAX_SPAN && min < low - 11) min += 12;
  const span = max - min;
  min = Math.max(0, Math.min(127 - span, min + shift * 12));
  return { minMidiNote: min, maxMidiNote: Math.min(127, min + span) };
}
