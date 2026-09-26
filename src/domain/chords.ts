import type { ChordQuality, ChordSymbol, Tension } from "./types";

const noteNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const sharpNoteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const flatNoteNames = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
type NoteName = (typeof noteNames)[number];

const letterPitchClasses: Readonly<Record<string, number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/**
 * A note token is an uppercase letter plus any run of sharps or flats: C, C#, Db,
 * Bbb, E#. Roots stay uppercase-only so stray input like `b9` is still rejected.
 */
const noteTokenPattern = "[A-G](?:#|b)*";

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
  add13: "add13",
  minMaj7: "mMaj7",
  power: "5",
  dom11: "11",
  six: "6",
  min6: "m6",
  sixNine: "6/9",
};

const labelQualities: Array<[RegExp, ChordQuality]> = [
  [/^maj9$/i, "maj9"],
  [/^(mMaj7|minMaj7)$/i, "minMaj7"],
  [/^11$/, "dom11"],
  [/^5$/, "power"],
  [/^add13$/i, "add13"],
  [/^M9$/, "maj9"],
  [/^maj7$/i, "maj7"],
  [/^(M7|△7|Δ7)$/, "maj7"],
  [/^(m7b5|ø)$/i, "min7b5"],
  [/^(min11|m11)$/i, "min11"],
  [/^(min9|m9)$/i, "min9"],
  [/^(min7|m7)$/i, "min7"],
  [/^(min6|m6)$/i, "min6"],
  [/^(min|m)$/i, "min"],
  [/^(dim7|o7)$/i, "dim7"],
  [/^(dim|o)$/i, "dim"],
  [/^(aug|\+)$/i, "aug"],
  [/^(dom13|13)$/i, "dom13"],
  [/^(dom9|9)$/i, "dom9"],
  [/^(dom7|7)$/i, "dom7"],
  [/^(7sus4|7sus)$/i, "dom7sus4"],
  [/^(sus2)$/i, "sus2"],
  [/^(sus4|sus)$/i, "sus4"],
  [/^(add9)$/i, "add9"],
  [/^(6\/9)$/i, "sixNine"],
  [/^(6)$/i, "six"],
  [/^$/, "maj"],
];

/** Canonical display order for tensions that stay outside the quality token. */
const tensionOrder: readonly Tension[] = ["9", "b9", "#9", "11", "#11", "13", "b13", "#5"];

/** Longest-first so "b13" is consumed before "13" and "#11" before "11". */
const tensionTokens: readonly Tension[] = ["b13", "#11", "b9", "#9", "#5", "13", "11", "9"];

/**
 * Tensions that a richer quality already spells out. Folding at parse time keeps
 * `Dbm7(11)` and `Dbm11` on one identity instead of two spellings of the same chord.
 */
const tensionFolds: ReadonlyArray<readonly [ChordQuality, readonly Tension[], ChordQuality]> = [
  // Richest first: 13 already implies 9, so C7(9,13) is C13 rather than C9(13).
  ["dom7", ["9", "13"], "dom13"],
  ["dom7", ["13"], "dom13"],
  ["dom7", ["9"], "dom9"],
  ["maj7", ["9"], "maj9"],
  ["min7", ["9", "11"], "min11"],
  ["min7", ["11"], "min11"],
  ["min7", ["9"], "min9"],
  ["six", ["9"], "sixNine"],
];

/** Natural extensions that replace the `7` in suspended dominant notation (13sus4). */
const suspendedExtensions: readonly Tension[] = ["13", "9"];

/**
 * Quality spellings outside `ChordQuality` that still map onto an existing
 * identity plus tensions. Keeps the detector vocabulary unchanged while letting
 * the parser read corpus and user labels such as `Amaj13`.
 */
const qualityAliases: ReadonlyArray<readonly [RegExp, ChordQuality, readonly Tension[]]> = [
  [/^(maj13|△13)$/i, "maj9", ["13"]],
  [/^M13$/, "maj9", ["13"]],
  [/^(min13|m13)$/i, "min9", ["13"]],
];

/** Tensions a quality already spells, so they are never printed twice. */
const impliedTensions: Partial<Record<ChordQuality, readonly Tension[]>> = {
  maj9: ["9"],
  min9: ["9"],
  dom9: ["9"],
  min11: ["11"],
  dom13: ["13"],
  sixNine: ["9"],
  add9: ["9"],
};

export type AccidentalPreference = "sharp" | "flat";

export interface ChordFormatOptions {
  /** Key such as "Db major" or "F minor". Chooses the accidental that key would use. */
  keyContext?: string;
  /** Explicit override; takes precedence over `keyContext`. */
  accidentalPreference?: AccidentalPreference;
}

const flatKeyTonics = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]);
const sharpKeyTonics = new Set(["G", "D", "A", "E", "B", "F#", "C#"]);

export function normalizePc(value: number): number {
  return ((Math.trunc(value) % 12) + 12) % 12;
}

export function noteNameFromPitchClass(value: number): NoteName {
  return noteNames[normalizePc(value)];
}

/**
 * Pitch class for a note token, computed from the letter plus its accidentals so
 * double accidentals (Bbb) and theoretical spellings (Cb, E#) resolve correctly.
 */
export function pitchClassFromNoteToken(token: string): number | undefined {
  const letter = token.charAt(0).toUpperCase();
  const base = letterPitchClasses[letter];
  if (base === undefined) return undefined;
  let offset = 0;
  for (const character of token.slice(1)) {
    if (character === "#") offset += 1;
    else if (character === "b") offset -= 1;
    else return undefined;
  }
  return normalizePc(base + offset);
}

export function accidentalPreferenceForKey(keyContext?: string): AccidentalPreference | undefined {
  const tonic = keyContext?.trim().split(/\s+/)[0];
  if (!tonic) return undefined;
  if (flatKeyTonics.has(tonic)) return "flat";
  if (sharpKeyTonics.has(tonic)) return "sharp";
  return undefined;
}

function accidentalPreferenceFor(options?: ChordFormatOptions): AccidentalPreference | undefined {
  if (options?.accidentalPreference) return options.accidentalPreference;
  return accidentalPreferenceForKey(options?.keyContext);
}

function spell(pitchClass: number, preference?: AccidentalPreference): string {
  const index = normalizePc(pitchClass);
  if (preference === "sharp") return sharpNoteNames[index];
  if (preference === "flat") return flatNoteNames[index];
  return noteNames[index];
}

function orderTensions(tensions: readonly Tension[]): Tension[] {
  return [...new Set(tensions)].sort(
    (left, right) => tensionOrder.indexOf(left) - tensionOrder.indexOf(right),
  );
}

/**
 * Renders the quality and any tensions the quality does not already imply.
 *
 * Tensions are never concatenated bare onto the quality token: leftovers go in
 * parentheses, and suspended dominants promote their highest natural extension
 * into the quality itself so `dom7sus4` + `13` reads `13sus4`, never `sus413`.
 */
function qualityDisplay(quality: ChordQuality, tensions: readonly Tension[], omissions: readonly ("3" | "5")[] = []): string {
  const ordered = orderTensions(tensions);
  if (ordered.length === 0 && omissions.length === 0) return qualityLabels[quality];

  if (quality === "dom7sus4") {
    const promoted = suspendedExtensions.find((tension) => ordered.includes(tension));
    const remaining = [...ordered.filter((tension) => tension !== promoted), ...omissions.map(omission => `omit${omission}`)];
    const base = promoted ? `${promoted}sus4` : qualityLabels[quality];
    return `${base}${parenthesize(remaining)}`;
  }

  return `${qualityLabels[quality]}${parenthesize([...ordered, ...omissions.map(omission => `omit${omission}`)])}`;
}

function parenthesize(tensions: readonly string[]): string {
  return tensions.length ? `(${tensions.join(",")})` : "";
}

export function formatChordSymbol(symbol: ChordSymbol, options?: ChordFormatOptions): string {
  const preference = accidentalPreferenceFor(options);
  const root = spell(symbol.root, preference);
  const quality = qualityDisplay(symbol.quality, symbol.tensions, symbol.omissions);
  const bass =
    symbol.bass === undefined || normalizePc(symbol.bass) === normalizePc(symbol.root)
      ? ""
      : `/${spell(symbol.bass, preference)}`;

  return `${root}${quality}${bass}`;
}

export function labelFromSymbol(symbol: ChordSymbol): string {
  return formatChordSymbol(symbol);
}

function extractParenthesizedFactors(text: string): { rest: string; tensions: Tension[]; omissions: ("3" | "5")[]; valid: boolean } {
  const match = /\(([^()]*)\)/.exec(text);
  if (!match) return { rest: text, tensions: [], omissions: [], valid: true };
  const tensions: Tension[] = [];
  const omissions: ("3" | "5")[] = [];
  for (const token of match[1].split(/[,\s]+/)) {
    const normalized = token.trim();
    if (!normalized) continue;
    if (/^(?:omit|no)(?:3|5)$/i.test(normalized)) {
      omissions.push(normalized.endsWith("3") ? "3" : "5");
    } else {
      const tension = tensionTokens.find(candidate => candidate === normalized);
      if (!tension) return { rest: text, tensions: [], omissions: [], valid: false };
      tensions.push(tension);
    }
  }
  if (new Set(omissions).size !== omissions.length) return { rest: text, tensions: [], omissions: [], valid: false };
  return {
    rest: `${text.slice(0, match.index)}${text.slice(match.index + match[0].length)}`,
    tensions, omissions, valid: true,
  };
}

function extractTrailingTensions(text: string): { rest: string; tensions: Tension[] } {
  const tensions: Tension[] = [];
  let rest = text;
  for (const tension of tensionTokens) {
    if (rest.includes(tension)) {
      tensions.push(tension);
      rest = rest.replace(tension, "");
    }
  }
  return { rest, tensions };
}

function foldTensions(quality: ChordQuality, tensions: readonly Tension[]): {
  quality: ChordQuality;
  tensions: Tension[];
} {
  const remaining = [...tensions];
  const fold = tensionFolds.find(
    ([from, required]) => from === quality && required.every((tension) => remaining.includes(tension)),
  );
  if (!fold) return { quality, tensions: remaining };
  return {
    quality: fold[2],
    tensions: remaining.filter((tension) => !fold[1].includes(tension)),
  };
}

/** Legacy product/MIDI label vocabulary. Kept stable for detector baselines. */
export function parseChordLabel(label: string): ChordSymbol | null {
  return parseChordLabelWithPolicy(label, false);
}

/** Phase 8.8 text-only semantics; both text dialects share this core. */
export function parseTextChordLabel(label: string): ChordSymbol | null {
  return parseChordLabelWithPolicy(label, true);
}

function parseChordLabelWithPolicy(label: string, allowExtendedText: boolean): ChordSymbol | null {
  const trimmed = label.trim();
  const rootMatch = new RegExp(`^(${noteTokenPattern})`).exec(trimmed);
  if (!rootMatch) return null;
  const root = pitchClassFromNoteToken(rootMatch[1]);
  if (root === undefined) return null;

  let rest = trimmed.slice(rootMatch[1].length);

  // Only a trailing note token is a slash bass, so `C6/9` keeps its quality intact
  // while `Bb6/9/F` still resolves F as the bass.
  let bass: number | undefined;
  const bassMatch = new RegExp(`/(${noteTokenPattern})$`).exec(rest);
  if (bassMatch) {
    bass = pitchClassFromNoteToken(bassMatch[1]);
    if (bass === undefined) return null;
    rest = rest.slice(0, rest.length - bassMatch[0].length);
  }

  const parenthesized = extractParenthesizedFactors(rest);
  if (!parenthesized.valid) return null;
  rest = parenthesized.rest;
  let tensions: Tension[] = parenthesized.tensions;

  const writtenQuality = rest;
  let quality = parseQuality(rest);
  const alias = quality ? undefined : qualityAliases.find(([pattern]) => pattern.test(rest));
  if (alias) {
    quality = alias[1];
    tensions = [...tensions, ...alias[2]];
  }
  if (!quality) {
    const trailing = extractTrailingTensions(rest);
    tensions = [...tensions, ...trailing.tensions];
    quality = parseQuality(trailing.rest);
  }
  if (!quality) return null;
  if (!allowExtendedText && (parenthesized.omissions.length > 0
    || quality === "add13" || quality === "minMaj7" || quality === "power" || quality === "dom11")) return null;

  // `13sus` and `b13sus` are dominant suspended chords, not a plain sus4 triad.
  if (quality === "sus4" && tensions.length > 0) quality = "dom7sus4";

  const folded = foldTensions(quality, tensions);
  const implied = impliedTensions[folded.quality] ?? [];

  const symbol: ChordSymbol = {
    root,
    quality: folded.quality,
    tensions: orderTensions(folded.tensions.filter((tension) => !implied.includes(tension))),
    ...(parenthesized.omissions.length ? { omissions: [...parenthesized.omissions].sort() as ("3" | "5")[] } : {}),
    ...(bass !== undefined ? { bass } : {}),
    label: "",
  };

  const semantic = allowExtendedText
    ? applyTextSemanticPolicy(symbol, writtenQuality, parenthesized.tensions) : symbol;
  return { ...semantic, label: labelFromSymbol(semantic) };
}

/** Text-only semantic repair; the legacy Product/MIDI parser is untouched. */
function applyTextSemanticPolicy(
  symbol: ChordSymbol,
  writtenQuality: string,
  writtenTensions: readonly Tension[],
): ChordSymbol {
  const next: ChordSymbol = { ...symbol, tensions: [...symbol.tensions],
    ...(symbol.omissions ? { omissions: [...symbol.omissions] } : {}) };
  // A written alteration replaces an implied natural degree. Both survive only
  // when the natural degree was also written explicitly as a separate factor.
  if (next.tensions.includes("#11") && !writtenTensions.includes("11")) {
    next.tensions = next.tensions.filter(tension => tension !== "11");
    if (next.quality === "dom11") next.quality = "dom7";
  }
  if (/^11o$/i.test(writtenQuality)) next.quality = "min7b5";
  if (/^11sus2$/i.test(writtenQuality)) {
    next.quality = "dom7";
    next.omissions = [...new Set([...(next.omissions ?? []), "3" as const])];
    if (!next.tensions.includes("9")
      && ((!next.tensions.includes("#9") && !next.tensions.includes("b9")) || writtenTensions.includes("9"))) {
      next.tensions = [...next.tensions, "9"];
    }
  }
  if (/^11sus4$/i.test(writtenQuality) && next.tensions.includes("#11")) {
    next.quality = "dom7";
    next.omissions = [...new Set([...(next.omissions ?? []), "3" as const])];
  }
  if (next.quality === "dom13"
    && (next.tensions.includes("#9") || next.tensions.includes("b9"))
    && !writtenTensions.includes("9")) {
    next.quality = "dom7";
    next.tensions = [...next.tensions, "13"];
  }
  next.tensions = orderTensions(next.tensions);
  return next;
}

export function makeChordSymbol(
  root: number,
  quality: ChordQuality,
  tensions: Tension[] = [],
  bass?: number,
): ChordSymbol {
  const symbol: ChordSymbol = {
    root: normalizePc(root),
    quality,
    tensions,
    ...(bass !== undefined ? { bass: normalizePc(bass) } : {}),
    label: "",
  };
  return { ...symbol, label: labelFromSymbol(symbol) };
}

function parseQuality(value: string): ChordQuality | null {
  for (const [pattern, quality] of labelQualities) {
    if (pattern.test(value)) {
      return quality;
    }
  }

  return null;
}
