import { formatChordSymbol, makeChordSymbol, parseChordLabel } from "../chords";
import type { ChordQuality, ChordSymbol } from "../types";
import { parseKeySignature } from "./chordSuggestions";

export interface FastLabelSuggestion {
  input: string;
  chord: ChordSymbol;
}

const majorIntervals = [0, 2, 4, 5, 7, 9, 11] as const;
const minorIntervals = [0, 2, 3, 5, 7, 8, 10] as const;
const majorQualities: readonly ChordQuality[] = [
  "maj", "min", "min", "maj", "dom7", "min", "dim",
];
const minorQualities: readonly ChordQuality[] = [
  "min", "dim", "maj", "min", "dom7", "maj", "maj",
];
const romanDegrees = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;

export function parseFastChordEntry(
  value: string,
  keySignature?: string,
  previousChord?: ChordSymbol,
): ChordSymbol | null {
  const absolute = parseChordLabel(value);
  if (absolute) return absolute;
  const key = parseKeySignature(keySignature);
  if (!key) return null;
  const match = /^([b#♭♯]?)([ivIV]+|[1-7])([A-Za-z0-9/+△ø]*)$/.exec(value.trim());
  if (!match) return null;
  const degree = degreeIndex(match[2]);
  if (degree === undefined) return null;
  const accidental = match[1] === "b" || match[1] === "♭"
    ? -1
    : match[1] === "#" || match[1] === "♯"
      ? 1
      : 0;
  const intervals = key.minor ? minorIntervals : majorIntervals;
  const root = key.root + intervals[degree] + accidental;
  const suffix = match[3];
  const quality = qualityFromDegree(
    suffix,
    /^[iv]+$/.test(match[2]),
    /^[ivIV]+$/.test(match[2]),
    previousChord?.quality,
    (key.minor ? minorQualities : majorQualities)[degree],
  );
  return quality ? makeChordSymbol(root, quality) : null;
}

export function fastLabelSuggestions(
  keySignature?: string,
  previousChord?: ChordSymbol,
): FastLabelSuggestion[] {
  const key = parseKeySignature(keySignature);
  if (!key) return [];
  const intervals = key.minor ? minorIntervals : majorIntervals;
  const diatonic = key.minor ? minorQualities : majorQualities;
  const suggestions: FastLabelSuggestion[] = [];
  const seen = new Set<string>();
  const add = (degree: number, quality: ChordQuality) => {
    const chord = makeChordSymbol(key.root + intervals[degree], quality);
    const input = `${romanForQuality(degree, quality)}${qualitySuffix(quality)}`;
    const identity = `${input}:${chord.root}:${chord.quality}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    suggestions.push({
      input,
      chord: { ...chord, label: formatChordSymbol(chord, { keyContext: keySignature }) },
    });
  };

  if (previousChord) {
    for (let degree = 0; degree < 7; degree += 1) add(degree, previousChord.quality);
  }
  for (let degree = 0; degree < 7; degree += 1) add(degree, diatonic[degree]);
  return suggestions;
}

function degreeIndex(token: string): number | undefined {
  if (/^[1-7]$/.test(token)) return Number(token) - 1;
  const index = romanDegrees.indexOf(token.toUpperCase() as (typeof romanDegrees)[number]);
  return index < 0 ? undefined : index;
}

function qualityFromDegree(
  suffix: string,
  lowerRoman: boolean,
  roman: boolean,
  previousQuality: ChordQuality | undefined,
  diatonicQuality: ChordQuality,
): ChordQuality | undefined {
  if (!suffix) {
    if (lowerRoman) return "min";
    if (roman) return "maj";
    return previousQuality ?? diatonicQuality;
  }
  const normalized = suffix.replace("△", "maj").toLowerCase();
  const aliases: Record<string, ChordQuality> = {
    m: "min",
    min: "min",
    m7: "min7",
    min7: "min7",
    m9: "min9",
    min9: "min9",
    m11: "min11",
    min11: "min11",
    maj7: "maj7",
    maj9: "maj9",
    "7": lowerRoman ? "min7" : "dom7",
    "9": lowerRoman ? "min9" : "dom9",
    "13": "dom13",
    dim: "dim",
    o: "dim",
    dim7: "dim7",
    o7: "dim7",
    m7b5: "min7b5",
    ø: "min7b5",
    sus2: "sus2",
    sus4: "sus4",
    add9: "add9",
    "6": lowerRoman ? "min6" : "six",
    "6/9": "sixNine",
  };
  return aliases[normalized];
}

function romanForQuality(degree: number, quality: ChordQuality): string {
  const numeral = romanDegrees[degree];
  return quality.startsWith("min") || quality === "dim" || quality === "dim7"
    ? numeral.toLowerCase()
    : numeral;
}

function qualitySuffix(quality: ChordQuality): string {
  const suffixes: Record<ChordQuality, string> = {
    maj: "",
    min: "",
    dim: "dim",
    aug: "aug",
    maj7: "maj7",
    min7: "7",
    dom7: "7",
    min7b5: "m7b5",
    dim7: "dim7",
    maj9: "maj9",
    min9: "9",
    dom9: "9",
    min11: "11",
    dom13: "13",
    sus2: "sus2",
    sus4: "sus4",
    dom7sus4: "7sus4",
    add9: "add9",
    six: "6",
    min6: "6",
    sixNine: "6/9",
  };
  return suffixes[quality];
}
