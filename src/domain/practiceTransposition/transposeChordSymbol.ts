import type { ChordQuality, ChordSymbol } from "../types";
import {
  canonicalizeKeySignature,
  normalizePracticePitchClass,
} from "./keyCatalog";
import type { KeySignature } from "./types";

const sharpNames = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
] as const;
const flatNames = [
  "C", "Db", "D", "Eb", "E", "F",
  "Gb", "G", "Ab", "A", "Bb", "B",
] as const;
const naturalPitchClassByLetter = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
} as const;
const letters = ["C", "D", "E", "F", "G", "A", "B"] as const;
const majorDegrees = [1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7] as const;
const majorAccidentals = [0, -1, 0, -1, 0, 0, 1, 0, -1, 0, -1, 0] as const;
const minorDegrees = [1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7] as const;
const minorAccidentals = [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0] as const;

const qualityLabels: Record<ChordQuality, string> = {
  maj: "",
  min: "m",
  dim: "dim",
  aug: "aug",
  maj7: "maj7",
  min7: "m7",
  dom7: "7",
  min7b5: "m7b5",
  dim7: "dim7",
  maj9: "maj9",
  min9: "m9",
  dom9: "9",
  min11: "m11",
  dom13: "13",
  sus2: "sus2",
  sus4: "sus4",
  dom7sus4: "7sus4",
  add9: "add9",
  six: "6",
  min6: "m6",
  sixNine: "6/9",
};

export function transposeChordSymbol(
  source: ChordSymbol,
  sourceKey: KeySignature,
  targetKey: KeySignature,
): ChordSymbol {
  const canonicalSourceKey = canonicalizeKeySignature(sourceKey);
  const canonicalTargetKey = canonicalizeKeySignature(targetKey);
  if (canonicalSourceKey.mode !== canonicalTargetKey.mode) {
    throw new Error("Practice transposition must preserve the source mode.");
  }

  const sourceRoot = normalizePracticePitchClass(source.root);
  const sourceBass = source.bass === undefined
    ? undefined
    : normalizePracticePitchClass(source.bass);
  const semitoneShift = normalizePracticePitchClass(
    canonicalTargetKey.tonicPitchClass - canonicalSourceKey.tonicPitchClass,
  );
  const root = normalizePracticePitchClass(sourceRoot + semitoneShift);
  const bass = sourceBass === undefined
    ? undefined
    : normalizePracticePitchClass(sourceBass + semitoneShift);
  const rootName = spellTransposedPitchClass(
    sourceRoot,
    root,
    canonicalSourceKey,
    canonicalTargetKey,
  );
  const bassName = bass === undefined || bass === root
    ? undefined
    : spellTransposedPitchClass(
      sourceBass ?? sourceRoot,
      bass,
      canonicalSourceKey,
      canonicalTargetKey,
    );
  const transposed: ChordSymbol = {
    root,
    quality: source.quality,
    tensions: [...source.tensions],
    ...(bass === undefined ? {} : { bass }),
    label: "",
  };

  return {
    ...transposed,
    label: formatChordLabel(transposed, rootName, bassName),
  };
}

export function spellPitchClassForKey(
  pitchClass: number,
  key: KeySignature,
): string {
  const canonicalKey = canonicalizeKeySignature(key);
  return (canonicalKey.accidentalPreference === "flat" ? flatNames : sharpNames)[
    normalizePracticePitchClass(pitchClass)
  ];
}

function spellTransposedPitchClass(
  sourcePitchClass: number,
  targetPitchClass: number,
  sourceKey: KeySignature,
  targetKey: KeySignature,
): string {
  const relation = pitchClassRelation(
    normalizePracticePitchClass(sourcePitchClass - sourceKey.tonicPitchClass),
    sourceKey.mode,
  );
  if (!relation) {
    return spellPitchClassForKey(targetPitchClass, targetKey);
  }

  const tonicLetterIndex = letters.indexOf(
    targetKey.canonicalName[0] as (typeof letters)[number],
  );
  if (tonicLetterIndex < 0) {
    return spellPitchClassForKey(targetPitchClass, targetKey);
  }
  const letter = letters[(tonicLetterIndex + relation.degree - 1) % letters.length];
  const accidentalDistance = signedAccidentalDistance(
    naturalPitchClassByLetter[letter],
    targetPitchClass,
  );
  if (Math.abs(accidentalDistance) > 2) {
    return spellPitchClassForKey(targetPitchClass, targetKey);
  }
  return `${letter}${accidentalText(accidentalDistance)}`;
}

function pitchClassRelation(
  interval: number,
  mode: KeySignature["mode"],
): { degree: number; accidental: -1 | 0 | 1 } {
  const normalized = normalizePracticePitchClass(interval);
  const degrees = mode === "major" ? majorDegrees : minorDegrees;
  const accidentals = mode === "major" ? majorAccidentals : minorAccidentals;
  return {
    degree: degrees[normalized],
    accidental: accidentals[normalized],
  };
}

function signedAccidentalDistance(
  naturalPitchClass: number,
  targetPitchClass: number,
): number {
  const upward = normalizePracticePitchClass(targetPitchClass - naturalPitchClass);
  return upward > 6 ? upward - 12 : upward;
}

function accidentalText(distance: number): string {
  if (distance === 0) return "";
  return distance > 0 ? "#".repeat(distance) : "b".repeat(-distance);
}

function formatChordLabel(
  chord: ChordSymbol,
  rootName: string,
  bassName: string | undefined,
): string {
  const quality = qualityLabels[chord.quality];
  const tensions = chord.tensions.join("");
  const bass = bassName ? `/${bassName}` : "";
  return `${rootName}${quality}${tensions}${bass}`;
}
