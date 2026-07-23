import type {
  KeyboardOctaveConvention,
  NoteAccidentalStyle,
} from "./types";

const SHARP_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export function formatMidiNoteForDisplay(
  midiNote: number,
  convention: KeyboardOctaveConvention = "fl-studio",
  accidentalStyle: NoteAccidentalStyle = "sharp",
): string {
  const note = normalizeMidiNote(midiNote);
  const pitchClass = positiveModulo(note, 12);
  const names = accidentalStyle === "flat" ? FLAT_NAMES : SHARP_NAMES;
  return `${names[pitchClass]}${displayOctave(note, convention)}`;
}

export function formatCLabel(
  midiNote: number,
  convention: KeyboardOctaveConvention = "fl-studio",
): string | undefined {
  const note = normalizeMidiNote(midiNote);
  return positiveModulo(note, 12) === 0
    ? formatMidiNoteForDisplay(note, convention)
    : undefined;
}

export function normalizeMidiNote(midiNote: number): number {
  return Math.max(0, Math.min(127, Math.round(midiNote)));
}

function displayOctave(
  midiNote: number,
  convention: KeyboardOctaveConvention,
): number {
  if (convention === "fl-studio") return Math.floor(midiNote / 12);
  return Math.floor(midiNote / 12);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
