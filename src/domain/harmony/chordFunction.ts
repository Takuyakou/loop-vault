import type { ChordSymbol } from "../types";
import { functionAt, functionKind, type FunctionChord } from "../earPractice/degreeFunction";

export type FunctionKind = "T" | "SD" | "SDm" | "D" | "";

/** The key. Undefined when the caller does not know it. */
export interface FunctionKey {
  /** Absolute tonic pitch class (C=0 … B=11). */
  readonly tonicPc: number;
  readonly mode: "major" | "minor";
}

/** One chord, with every pitch class absolute; this module makes them relative to the key. */
export interface FunctionChordInput {
  readonly rootPc: number;
  readonly quality: string;
  readonly tensions?: readonly string[];
  readonly bassPc?: number;
  readonly key?: FunctionKey;
}

export interface FunctionResult {
  readonly kind: FunctionKind;
  /** A secondary dominant (D→…) or a tritone substitute (D(裏)); drawn dotted. */
  readonly borrowedDominant: boolean;
}

type Family = FunctionChord["family"];
const mod12 = (value: number) => ((value % 12) + 12) % 12;

/** ChordSymbol quality → the family degreeFunction knows. One table only. */
const QUALITY_FAMILY: Record<ChordSymbol["quality"], Family> = {
  maj: "maj", min: "min", dim: "dim", aug: "aug",
  maj7: "maj", min7: "min", dom7: "dom", min7b5: "hdim", dim7: "dim7",
  maj9: "maj", min9: "min", dom9: "dom", min11: "min", dom13: "dom",
  sus2: "sus", sus4: "sus", dom7sus4: "dom", add9: "maj", add13: "maj",
  six: "maj", min6: "min", sixNine: "maj", minMaj7: "min", power: "?",
  dom11: "dom",
};
const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"] as const;
const NOTE_PC = [0, 2, 4, 5, 7, 9, 11] as const;

const relative = (rootPc: number, tonicPc: number) => mod12(rootPc - tonicPc);
const keyOf = (chord: FunctionChordInput, key: FunctionKey | undefined) => chord.key ?? key;

const KEY_PITCH: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * P23-29: a key written the way `degreeOf` reads it (`C major`, `Eb major`, `F# minor`, `Am`) → the key this
 * module works with. Undefined when the text is not a key (then no role is drawn).
 */
export function functionKeyOf(key: string | undefined): FunctionKey | undefined {
  const match = /^([A-G])(#|b)?(?:\s*(major|minor)|\s*(m))?$/i.exec(key?.trim() ?? "");
  if (!match) return undefined;
  const tonicPc = (KEY_PITCH[match[1]!.toUpperCase()]! + (match[2] === "#" ? 1 : match[2] === "b" ? 11 : 0)) % 12;
  return { tonicPc, mode: match[3]?.toLowerCase() === "minor" || match[4] ? "minor" : "major" };
}

function toRelative(chord: FunctionChordInput, key: FunctionKey): FunctionChord | undefined {
  const family = QUALITY_FAMILY[chord.quality as ChordSymbol["quality"]];
  if (!family || family === "?") return undefined;
  const pc = relative(chord.rootPc, key.tonicPc);
  const bassPc = chord.bassPc === undefined ? undefined : relative(chord.bassPc, key.tonicPc);
  // The root text is only used by degreeFunction for the `D→Ⅵ` label; the kind is unaffected.
  const degree = (NOTE_PC.indexOf(pc as (typeof NOTE_PC)[number]) + 1) || 1;
  const rootText = ROMAN[degree - 1] ?? "?";
  return { pc, family, plainMajor: chord.quality === "maj" && !(chord.tensions?.length), tritone: family === "dom" && chord.quality !== "dom7sus4",
    ...(bassPc === undefined ? {} : { bassPc }), rootText, degree: rootText };
}

/** Decide one progression. The array has the same length as `chords`. */
export function progressionFunctions(chords: readonly FunctionChordInput[], key: FunctionKey | undefined): FunctionResult[] {
  if (!key && chords.every((chord) => !chord.key)) return chords.map(() => ({ kind: "", borrowedDominant: false }));
  return chords.map((chord, index) => {
    const ownKey = keyOf(chord, key);
    if (!ownKey) return { kind: "", borrowedDominant: false };
    const relativeChords: Array<FunctionChord | undefined> = [];
    for (const each of chords) {
      const eachKey = keyOf(each, key);
      if (!eachKey || eachKey.tonicPc !== ownKey.tonicPc || eachKey.mode !== ownKey.mode) relativeChords.push(undefined);
      else relativeChords.push(toRelative(each, ownKey));
    }
    const current = relativeChords[index];
    if (!current) return { kind: "", borrowedDominant: false };
    const nextInput = chords[index + 1];
    const nextKey = nextInput ? keyOf(nextInput, key) : undefined;
    // The next chord is "none" when the key changes (or at the end); the last chord is never read against the first.
    const nextInKey = nextKey && nextKey.tonicPc === ownKey.tonicPc && nextKey.mode === ownKey.mode ? relativeChords[index + 1] : undefined;
    const fn = functionAt(nextInKey ? [current, nextInKey] : [current], 0, ownKey.mode);
    return { kind: functionKind(fn), borrowedDominant: fn.startsWith("D→") || fn.includes("裏") };
  });
}
