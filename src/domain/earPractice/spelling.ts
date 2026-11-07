import { formatChordSymbol, parseTextChordLabel } from "../chords";
import type { ChordSymbol } from "../types";
import { degreePitchClass, parseDegreeToken, type DegreeRef } from "./degrees";
import { earKeyName, type EarMode } from "./keys";

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL = [0, 2, 4, 5, 7, 9, 11];

/**
 * The written name of a degree of a key: the letter comes from the number (I is the key's own letter, II the next one …
 * VII six on), the ♯ or ♭ from the pitch. Only when that would be E♯, B♯, C♭, F♭ or a double sign is the plain name used
 * instead (E♯ → F, B♯ → C, C♭ → B, F♭ → E, F𝄪 → G). A minor key counts from its own tonic, so its ♭III, ♭VI and ♭VII are notes of the key.
 */
export function degreeName(tonic: number, mode: EarMode, value: DegreeRef): string {
  const pitchClass = degreePitchClass(tonic, value);
  const tonicLetter = LETTERS.indexOf(earKeyName(tonic, mode)[0] as (typeof LETTERS)[number]);
  const letter = (tonicLetter + value.degree - 1) % 7;
  let alter = pitchClass - NATURAL[letter]!;
  if (alter > 6) alter -= 12;
  if (alter < -6) alter += 12;
  const plain = Math.abs(alter) >= 2
    || (alter === 1 && (letter === 2 || letter === 6))
    || (alter === -1 && (letter === 0 || letter === 3));
  if (plain) return (alter > 0 ? SHARP : FLAT)[pitchClass]!;
  return `${LETTERS[letter]}${alter === 1 ? "#" : alter === -1 ? "b" : ""}`;
}

/** The chord a degree token stands for in a key: the app's `ChordSymbol`, with the label spelled for the key. */
export function chordFromDegreeToken(token: string, tonic: number, mode: EarMode): ChordSymbol {
  const parsedToken = parseDegreeToken(token);
  const root = degreeName(tonic, mode, parsedToken);
  const bass = parsedToken.bass ? degreeName(tonic, mode, parsedToken.bass) : undefined;
  const written = `${root}${parsedToken.suffix}${bass ? `/${bass}` : ""}`;
  const symbol = parseTextChordLabel(written);
  if (!symbol) throw new Error(`The app cannot read the chord ${written} (${token})`);
  if (symbol.root !== degreePitchClass(tonic, parsedToken)) throw new Error(`Wrong root for ${token}: ${written}`);
  if (parsedToken.bass && symbol.bass !== degreePitchClass(tonic, parsedToken.bass)) {
    throw new Error(`Wrong bass for ${token}: ${written}`);
  }
  // `formatChordSymbol` writes the rest of the name (quality, tensions); the root and the bass are the names decided above.
  const formatted = formatChordSymbol(symbol, { accidentalPreference: root.includes("b") || bass?.includes("b") ? "flat" : "sharp" });
  const withRoot = formatted.replace(/^[A-G][#b]?/, root);
  const label = bass ? withRoot.replace(/\/[A-G][#b]?$/, `/${bass}`) : withRoot;
  return { ...symbol, label };
}
