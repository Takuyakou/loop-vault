import {
  getCanonicalKey,
  keyCatalogForMode,
  normalizePracticePitchClass,
} from "../../../domain/practiceTransposition";
import type {
  DegreeValue,
  FretboardPosition,
  ScaleMode,
} from "./types";

const MAJOR_RELATIVE_INTERVALS = Object.freeze([0, 2, 4, 5, 7, 9, 11]);

const SHARP_NOTE_NAMES = Object.freeze([
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
]);
const FLAT_NOTE_NAMES = Object.freeze([
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
]);

export function canonicalKeyName(key: string, scale: ScaleMode): string | undefined {
  const normalized = key.trim().replace(/♯/g, "#").replace(/♭/g, "b");
  return keyCatalogForMode(scale).find((candidate) => (
    candidate.canonicalName.toLowerCase() === normalized.toLowerCase()
  ))?.canonicalName;
}

export function keyPitchClass(key: string, scale: ScaleMode): number | undefined {
  const canonical = canonicalKeyName(key, scale);
  if (!canonical) return undefined;
  return keyCatalogForMode(scale).find(
    (candidate) => candidate.canonicalName === canonical,
  )?.tonicPitchClass;
}

export function degreeToPitchClass(
  tonicPitchClass: number,
  value: DegreeValue,
): number {
  return normalizePracticePitchClass(
    tonicPitchClass + degreeSemitoneOffset(value),
  );
}

export function degreeSemitoneOffset(
  value: DegreeValue,
): number {
  return MAJOR_RELATIVE_INTERVALS[value.degree - 1]
    + value.accidental
    + (12 * value.octave);
}

export function formatDegree(value: DegreeValue): string {
  const accidental = value.accidental === -1
    ? "♭"
    : value.accidental === 1 ? "♯" : "";
  const learningDegree = value.octave >= 0
    ? String(value.degree + (7 * value.octave))
    : `${value.degree}${"↓".repeat(-value.octave)}`;
  return `${accidental}${learningDegree}`;
}

export function midiNoteName(
  midiNote: number,
  key: string,
  scale: ScaleMode,
): string {
  assertMidiNote(midiNote);
  const pitchClass = normalizePracticePitchClass(midiNote);
  const tonic = keyPitchClass(key, scale);
  if (tonic === undefined) throw new Error(`Unsupported ${scale} key: ${key}`);
  const preference = getCanonicalKey(tonic, scale).accidentalPreference;
  const name = preference === "flat"
    ? FLAT_NOTE_NAMES[pitchClass]
    : SHARP_NOTE_NAMES[pitchClass];
  return `${name}${Math.floor(midiNote / 12) - 1}`;
}

export function fretboardPositions(
  midiNote: number,
  tuning: readonly number[],
  fretRange: { readonly min: number; readonly max: number },
): readonly FretboardPosition[] {
  assertMidiNote(midiNote);
  if (tuning.length !== 4 && tuning.length !== 5) {
    throw new RangeError("Bass tuning must contain four or five strings.");
  }
  if (
    !Number.isInteger(fretRange.min)
    || !Number.isInteger(fretRange.max)
    || fretRange.min < 0
    || fretRange.max > 36
    || fretRange.max < fretRange.min
  ) {
    throw new RangeError("Fret range must be ordered integers between 0 and 36.");
  }
  return Object.freeze(tuning.flatMap((openNote, stringIndex) => {
    assertMidiNote(openNote);
    const fret = midiNote - openNote;
    return fret >= fretRange.min && fret <= fretRange.max
      ? [Object.freeze({ stringIndex, fret, midiNote })]
      : [];
  }));
}

export function isPlayableMidiNote(
  midiNote: number,
  tuning: readonly number[],
  fretRange: { readonly min: number; readonly max: number },
): boolean {
  return fretboardPositions(midiNote, tuning, fretRange).length > 0;
}

export function playableMidiNotesForPitchClass(
  pitchClass: number,
  tuning: readonly number[],
  fretRange: { readonly min: number; readonly max: number },
  pitchSpan: { readonly minMidi: number; readonly maxMidi: number },
): readonly number[] {
  const normalizedPitchClass = normalizePracticePitchClass(pitchClass);
  const notes: number[] = [];
  for (let midiNote = pitchSpan.minMidi; midiNote <= pitchSpan.maxMidi; midiNote += 1) {
    if (
      normalizePracticePitchClass(midiNote) === normalizedPitchClass
      && isPlayableMidiNote(midiNote, tuning, fretRange)
    ) {
      notes.push(midiNote);
    }
  }
  return Object.freeze(notes);
}

function assertMidiNote(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new RangeError("MIDI note must be an integer between 0 and 127.");
  }
}
