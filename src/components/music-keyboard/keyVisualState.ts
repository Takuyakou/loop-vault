import type { KeyboardDisplayState, PianoKeyVisualState } from "./types";

export interface PianoKeyStateInput {
  guideNotes: ReadonlySet<number>;
  heldNotes: ReadonlySet<number>;
  sustainedNotes: ReadonlySet<number>;
  allowedPitchClasses: ReadonlySet<number>;
}

export function pianoKeyVisualState(
  note: number,
  input: PianoKeyStateInput,
): PianoKeyVisualState {
  const held = input.heldNotes.has(note);
  const guide = input.guideNotes.has(note);
  const sustained = input.sustainedNotes.has(note);
  const allowed = input.allowedPitchClasses.has(positiveModulo(note, 12));

  if (held && !allowed) return "held-foreign";
  if (held && guide) return "guide-and-held";
  if (held) return "held-correct";
  if (guide && sustained) return "guide-and-sustained";
  if (guide) return "guide";
  if (sustained) return "sustained";
  return "idle";
}

export function createKeyboardDisplayState(
  heldNotes: readonly number[],
  sustainedNotes: readonly number[],
  guideNotes: readonly number[],
  allowedPitchClasses: readonly number[],
): KeyboardDisplayState {
  const allowed = new Set(allowedPitchClasses.map(positivePitchClass));
  const uniqueHeld = uniqueSorted(heldNotes);
  return {
    heldNotes: uniqueHeld,
    sustainedNotes: uniqueSorted(sustainedNotes),
    guideNotes: uniqueSorted(guideNotes),
    foreignHeldNotes: uniqueHeld.filter((note) => !allowed.has(positivePitchClass(note))),
  };
}

function uniqueSorted(notes: readonly number[]): number[] {
  return [...new Set(notes)].sort((left, right) => left - right);
}

function positivePitchClass(note: number): number {
  return ((note % 12) + 12) % 12;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
