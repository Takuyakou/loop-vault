import { normalizeMidiNote } from "./noteDisplay";
import type { KeyboardOutsideNotes, KeyboardRange } from "./types";

export const DEFAULT_PRACTICE_KEYBOARD_RANGE: KeyboardRange = {
  minMidiNote: 36,
  maxMidiNote: 84,
};

const MIN_SPAN = 48;
const MAX_SPAN = 60;
const PADDING = 6;

export function computePracticeKeyboardRange(
  guideVoicings: readonly (readonly number[])[],
): KeyboardRange {
  const notes = guideVoicings
    .flatMap((voicing) => [...voicing])
    .filter((note) => Number.isFinite(note))
    .map(normalizeMidiNote);
  if (notes.length === 0) return { ...DEFAULT_PRACTICE_KEYBOARD_RANGE };

  const guideMinimum = Math.min(...notes);
  const guideMaximum = Math.max(...notes);
  let minimum = snapDownToC(guideMinimum - PADDING);
  let maximum = snapUpToC(guideMaximum + PADDING);

  if (maximum - minimum > MAX_SPAN) {
    const center = (guideMinimum + guideMaximum) / 2;
    minimum = snapDownToC(center - MAX_SPAN / 2);
    maximum = minimum + MAX_SPAN;
  }

  while (maximum - minimum < MIN_SPAN) {
    if (minimum >= 12) {
      minimum -= 12;
    } else if (maximum <= 115) {
      maximum += 12;
    } else {
      break;
    }
  }

  if (minimum < 0) {
    maximum = Math.min(127, maximum - minimum);
    minimum = 0;
  }
  if (maximum > 127) {
    minimum = Math.max(0, minimum - (maximum - 127));
    maximum = 127;
  }

  if (maximum - minimum > MAX_SPAN) {
    if (guideMaximum > 120) {
      maximum = 127;
      minimum = maximum - MAX_SPAN;
    } else {
      maximum = minimum + MAX_SPAN;
    }
  }

  return {
    minMidiNote: Math.round(minimum),
    maxMidiNote: Math.round(maximum),
  };
}

export function notesOutsideKeyboardRange(
  notes: readonly number[],
  range: KeyboardRange,
): KeyboardOutsideNotes {
  const unique = [...new Set(notes.map(normalizeMidiNote))].sort((left, right) => left - right);
  return {
    below: unique.filter((note) => note < range.minMidiNote),
    above: unique.filter((note) => note > range.maxMidiNote),
  };
}

function snapDownToC(note: number): number {
  return Math.floor(note / 12) * 12;
}

function snapUpToC(note: number): number {
  return Math.ceil(note / 12) * 12;
}
