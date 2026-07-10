import type { ChordSymbol } from "../types";

export type RomanNumeralConfidence = "high" | "medium" | "low";

export interface RomanNumeralHint {
  label: string;
  detail?: string;
  confidence: RomanNumeralConfidence;
}

const noteToPitchClass: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const majorNumerals = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];
const minorNumerals = ["i", "bII", "ii", "III", "iv", "V", "VI", "bVII", "VII", "i", "bII", "ii"];

export function romanNumeralHint(
  chord: ChordSymbol,
  detectedKey: string | undefined,
): RomanNumeralHint | undefined {
  const parsedKey = parseKey(detectedKey);
  if (!parsedKey) return undefined;

  const interval = (chord.root - parsedKey.root + 12) % 12;
  const isMinorChord = chord.quality.startsWith("min");
  const base = (parsedKey.minor ? minorNumerals : majorNumerals)[interval];
  const numeral = formatNumeral(base, isMinorChord);
  const suffix = chord.quality === "dom7" ? "7" : chord.quality === "maj7" ? "maj7" : "";

  return {
    label: `${numeral}${suffix}`,
    ...(chord.bass === undefined || chord.bass === chord.root ? {} : { detail: `bass ${pitchClassName(chord.bass)}` }),
    confidence: "medium",
  };
}

function parseKey(value: string | undefined): { root: number; minor: boolean } | undefined {
  if (!value) return undefined;
  const match = /^([A-G](?:#|b)?)(?:\s*(major|minor)|\s*(m))?$/i.exec(value.trim());
  if (!match) return undefined;

  const root = noteToPitchClass[match[1]];
  if (root === undefined) return undefined;
  return { root, minor: Boolean(match[2]?.toLowerCase() === "minor" || match[3]) };
}

function pitchClassName(value: number): string {
  return ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"][(value + 120) % 12];
}

function formatNumeral(base: string, minor: boolean): string {
  const accidental = base.startsWith("b") || base.startsWith("#") ? base[0] : "";
  const numeral = accidental ? base.slice(1) : base;
  return `${accidental}${minor ? numeral.toLowerCase() : numeral.toUpperCase()}`;
}
