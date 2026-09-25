import {
  degreeForChord,
  formatKeySignature,
  getCanonicalKey,
  normalizePracticePitchClass,
  parseKeySignature,
  selectGlobalOctaveOffset,
  transposeChordSymbol,
  type KeySignature,
} from "../practiceTransposition";
import type {
  DetachedPracticeVoicing,
  ProgressionPracticeChord,
  ProgressionVoicingPracticeSnapshot,
} from "./types";
import type { ChordSymbol } from "../types";

export type ProgressionVoicingPracticeTranspositionResult =
  | {
      readonly ok: true;
      readonly snapshot: ProgressionVoicingPracticeSnapshot;
      readonly sourceKey: KeySignature;
      readonly targetKey: KeySignature;
    }
  | {
      readonly ok: false;
      readonly reason: "source-key-unavailable" | "midi-range-unavailable";
    };

const romanDegrees = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"] as const;

/**
 * Builds a detached, session-only Voicing Loop snapshot in the requested key.
 * The saved Vault snapshot is never mutated and every target is derived directly
 * from the original key so repeated key changes cannot accumulate pitch drift.
 */
export function transposeProgressionVoicingPracticeSnapshot(
  source: ProgressionVoicingPracticeSnapshot,
  targetTonicPitchClass: number,
): ProgressionVoicingPracticeTranspositionResult {
  const sourceKey = source.key ? parseKeySignature(source.key) : undefined;
  if (!sourceKey) return { ok: false, reason: "source-key-unavailable" };
  const targetKey = getCanonicalKey(targetTonicPitchClass, sourceKey.mode);
  const semitoneShift = normalizePracticePitchClass(
    targetKey.tonicPitchClass - sourceKey.tonicPitchClass,
  );
  if (semitoneShift === 0) return { ok: true, snapshot: source, sourceKey, targetKey };

  const sourceNotes = source.events.flatMap(({ voicing }) => {
    if (!voicing) return [];
    const notes = [...voicing.midiNotes];
    if (voicing.bassNote !== undefined && !notes.includes(voicing.bassNote)) notes.push(voicing.bassNote);
    return notes;
  });
  const shiftedNotes = sourceNotes.map((note) => note + semitoneShift);
  const globalOctaveOffset = selectGlobalOctaveOffset(sourceNotes, shiftedNotes);
  if (globalOctaveOffset === undefined) {
    return { ok: false, reason: "midi-range-unavailable" };
  }

  const events = Object.freeze(source.events.map((event) => {
    const chord = transposeChordSymbol(mutableChord(event.chord), sourceKey, targetKey);
    return Object.freeze({
      ...event,
      chord: Object.freeze({ ...chord, tensions: Object.freeze([...chord.tensions]) }),
      ...(event.voicing ? {
        voicing: transposeDetachedVoicing(event.voicing, semitoneShift + globalOctaveOffset),
      } : {}),
    });
  }));
  const snapshot = Object.freeze({
    ...source,
    fingerprint: `${source.fingerprint}:transpose:${targetKey.tonicPitchClass}:${globalOctaveOffset}`,
    key: formatKeySignature(targetKey, "en"),
    events,
  });
  return { ok: true, snapshot, sourceKey, targetKey };
}

export function progressionPracticeDegreeLabel(
  chord: ProgressionPracticeChord | undefined,
  key: KeySignature | undefined,
): string | undefined {
  if (!chord || !key) return undefined;
  const degree = degreeForChord(mutableChord(chord), key);
  if (!degree) return undefined;
  const accidental = degree.accidental < 0 ? "♭" : degree.accidental > 0 ? "♯" : "";
  return `${accidental}${romanDegrees[degree.degree]}`;
}

function mutableChord(chord: ProgressionPracticeChord): ChordSymbol {
  const { omissions, ...rest } = chord;
  return {
    ...rest,
    tensions: [...chord.tensions],
    ...(omissions?.length ? { omissions: [...omissions] } : {}),
  };
}

function transposeDetachedVoicing(
  voicing: DetachedPracticeVoicing,
  shift: number,
): DetachedPracticeVoicing {
  return Object.freeze({
    ...voicing,
    midiNotes: Object.freeze(voicing.midiNotes.map((note) => note + shift)),
    ...(voicing.bassNote === undefined ? {} : { bassNote: voicing.bassNote + shift }),
  });
}
