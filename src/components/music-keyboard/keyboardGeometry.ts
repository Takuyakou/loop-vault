import type {
  KeyboardRange,
  PianoKeyboardGeometry,
  PianoKeyGeometry,
} from "./types";

export const WHITE_KEY_WIDTH = 24;
export const BLACK_KEY_WIDTH = 15;
export const KEYBOARD_HEIGHT = 192;
export const BLACK_KEY_HEIGHT = 120;

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const WHITE_INDEX_BY_PITCH_CLASS: Record<number, number> = {
  0: 0,
  2: 1,
  4: 2,
  5: 3,
  7: 4,
  9: 5,
  11: 6,
};
const BLACK_BOUNDARY_BY_PITCH_CLASS: Record<number, number> = {
  1: 1,
  3: 2,
  6: 4,
  8: 5,
  10: 6,
};

export function createPianoKeyboardGeometry(
  range: KeyboardRange,
): PianoKeyboardGeometry {
  const minimum = Math.min(range.minMidiNote, range.maxMidiNote);
  const maximum = Math.max(range.minMidiNote, range.maxMidiNote);
  const absoluteKeys = Array.from(
    { length: maximum - minimum + 1 },
    (_, index) => midiNoteToAbsoluteGeometry(minimum + index),
  );
  const origin = Math.min(...absoluteKeys.map((key) => key.x));
  const keys = absoluteKeys.map((key) => ({ ...key, x: key.x - origin }));
  const width = Math.max(...keys.map((key) => key.x + key.width));

  return {
    keys,
    width,
    height: KEYBOARD_HEIGHT,
    whiteKeyCount: keys.filter((key) => !key.black).length,
    blackKeyCount: keys.filter((key) => key.black).length,
  };
}

export function midiNoteToKeyboardGeometry(
  note: number,
  range: KeyboardRange,
): PianoKeyGeometry | undefined {
  return createPianoKeyboardGeometry(range).keys.find((key) => key.note === note);
}

export function isBlackPianoKey(note: number): boolean {
  return !WHITE_PITCH_CLASSES.has(positiveModulo(note, 12));
}

function midiNoteToAbsoluteGeometry(note: number): PianoKeyGeometry {
  const pitchClass = positiveModulo(note, 12);
  const octave = Math.floor(note / 12);
  if (WHITE_PITCH_CLASSES.has(pitchClass)) {
    return {
      note,
      black: false,
      x: (octave * 7 + WHITE_INDEX_BY_PITCH_CLASS[pitchClass]) * WHITE_KEY_WIDTH,
      width: WHITE_KEY_WIDTH,
      height: KEYBOARD_HEIGHT,
    };
  }

  const boundary = octave * 7 + BLACK_BOUNDARY_BY_PITCH_CLASS[pitchClass];
  return {
    note,
    black: true,
    x: boundary * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2,
    width: BLACK_KEY_WIDTH,
    height: BLACK_KEY_HEIGHT,
  };
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
