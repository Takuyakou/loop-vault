import type {
  AccidentalPreference,
  KeySignature,
  PracticeKeyLanguage,
  SupportedPracticeMode,
} from "./types";

interface KeyDefinition {
  name: string;
  accidentalPreference: AccidentalPreference;
}

const majorDefinitions: readonly KeyDefinition[] = [
  { name: "C", accidentalPreference: "flat" },
  { name: "Db", accidentalPreference: "flat" },
  { name: "D", accidentalPreference: "sharp" },
  { name: "Eb", accidentalPreference: "flat" },
  { name: "E", accidentalPreference: "sharp" },
  { name: "F", accidentalPreference: "flat" },
  { name: "F#", accidentalPreference: "sharp" },
  { name: "G", accidentalPreference: "sharp" },
  { name: "Ab", accidentalPreference: "flat" },
  { name: "A", accidentalPreference: "sharp" },
  { name: "Bb", accidentalPreference: "flat" },
  { name: "B", accidentalPreference: "sharp" },
] as const;

const minorDefinitions: readonly KeyDefinition[] = [
  { name: "C", accidentalPreference: "flat" },
  { name: "C#", accidentalPreference: "sharp" },
  { name: "D", accidentalPreference: "flat" },
  { name: "Eb", accidentalPreference: "flat" },
  { name: "E", accidentalPreference: "sharp" },
  { name: "F", accidentalPreference: "flat" },
  { name: "F#", accidentalPreference: "sharp" },
  { name: "G", accidentalPreference: "flat" },
  { name: "G#", accidentalPreference: "sharp" },
  { name: "A", accidentalPreference: "sharp" },
  { name: "Bb", accidentalPreference: "flat" },
  { name: "B", accidentalPreference: "sharp" },
] as const;

export const SUPPORTED_PRACTICE_MODES = ["major", "minor"] as const;

export const MAJOR_KEY_CATALOG = createCatalog("major", majorDefinitions);
export const MINOR_KEY_CATALOG = createCatalog("minor", minorDefinitions);

const pitchClassByName: Readonly<Record<string, number>> = Object.freeze({
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  "E#": 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
});

export function isSupportedPracticeMode(
  value: string,
): value is SupportedPracticeMode {
  return value === "major" || value === "minor";
}

export function assertSupportedPracticeMode(
  value: string,
): asserts value is SupportedPracticeMode {
  if (!isSupportedPracticeMode(value)) {
    throw new Error(`Unsupported practice mode: ${value}`);
  }
}

export function getCanonicalKey(
  tonicPitchClass: number,
  mode: SupportedPracticeMode,
): KeySignature {
  assertSupportedPracticeMode(mode);
  return keyCatalogForMode(mode)[normalizePracticePitchClass(tonicPitchClass)];
}

export function keyCatalogForMode(
  mode: SupportedPracticeMode,
): readonly KeySignature[] {
  assertSupportedPracticeMode(mode);
  return mode === "major" ? MAJOR_KEY_CATALOG : MINOR_KEY_CATALOG;
}

export function formatKeySignature(
  key: KeySignature,
  language: PracticeKeyLanguage,
): string {
  return canonicalizeKeySignature(key).labels[language];
}

export function parseKeySignature(value: string): KeySignature | undefined {
  const normalized = normalizeAccidentals(value.trim());
  for (const mode of SUPPORTED_PRACTICE_MODES) {
    for (const key of keyCatalogForMode(mode)) {
      if (key.labels.en.toLowerCase() === normalized.toLowerCase()) {
        return key;
      }
      if (key.labels.ja === normalized) {
        return key;
      }
    }
  }

  const match = /^([a-gA-G])([#b]?)(?:\s*(major|minor|メジャー|マイナー)|\s*(m))?$/.exec(
    normalized,
  );
  if (!match) return undefined;
  const rootName = `${match[1].toUpperCase()}${match[2]}`;
  const tonicPitchClass = pitchClassByName[rootName];
  if (tonicPitchClass === undefined) return undefined;
  const modeText = match[3]?.toLowerCase();
  const mode: SupportedPracticeMode = (
    modeText === "minor"
    || match[3] === "マイナー"
    || Boolean(match[4])
  ) ? "minor" : "major";
  return getCanonicalKey(tonicPitchClass, mode);
}

export function normalizePracticePitchClass(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError("Pitch class must be a finite integer.");
  }
  return ((value % 12) + 12) % 12;
}

export function canonicalizeKeySignature(key: KeySignature): KeySignature {
  assertSupportedPracticeMode(key.mode);
  const canonical = getCanonicalKey(key.tonicPitchClass, key.mode);
  if (
    key.tonicPitchClass !== canonical.tonicPitchClass
    || key.canonicalName !== canonical.canonicalName
    || key.accidentalPreference !== canonical.accidentalPreference
    || key.labels.en !== canonical.labels.en
    || key.labels.ja !== canonical.labels.ja
  ) {
    throw new Error("Key signature does not match the canonical key catalog.");
  }
  return canonical;
}

function createCatalog(
  mode: SupportedPracticeMode,
  definitions: readonly KeyDefinition[],
): readonly KeySignature[] {
  return Object.freeze(definitions.map((definition, tonicPitchClass) => (
    Object.freeze({
      tonicPitchClass,
      mode,
      canonicalName: definition.name,
      accidentalPreference: definition.accidentalPreference,
      labels: Object.freeze({
        en: `${definition.name} ${mode}`,
        ja: `${definition.name}${mode === "major" ? "メジャー" : "マイナー"}`,
      }),
    })
  )));
}

function normalizeAccidentals(value: string): string {
  return value.replace(/♯/g, "#").replace(/♭/g, "b");
}
