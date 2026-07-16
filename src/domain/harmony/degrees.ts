import type { ChordQuality, ChordSymbol, SavedProgressionBlock } from "../types";

export interface DegreeSymbol {
  degree: number;
  accidental: -1 | 0 | 1;
  quality: ChordQuality;
  bass?: "3rd" | "5th" | "7th";
  label: string;
}

export interface DegreeQuery {
  kind: "degree";
  terms: Array<{ degree: number; accidental?: -1 | 0 | 1; quality?: "major" | "minor" | ChordQuality }>;
}

export interface ChordQuery {
  kind: "chord";
  normalized: string;
}

export interface TextQuery {
  kind: "text";
  normalized: string;
}

const pitchClasses: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

const majorDegrees = [1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7];
const majorAccidentals: Array<-1 | 0 | 1> = [0, -1, 0, -1, 0, 0, 1, 0, -1, 0, -1, 0];
const minorDegrees = [1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7];
const minorAccidentals: Array<-1 | 0 | 1> = [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0];
const romanByDegree = ["I", "II", "III", "IV", "V", "VI", "VII"];

export function degreeOf(chord: ChordSymbol, key: string | undefined): DegreeSymbol | undefined {
  const parsedKey = parseKey(key);
  if (!parsedKey) return undefined;

  const interval = (chord.root - parsedKey.root + 12) % 12;
  const degree = (parsedKey.minor ? minorDegrees : majorDegrees)[interval];
  const accidental = (parsedKey.minor ? minorAccidentals : majorAccidentals)[interval];
  const minor = chord.quality.startsWith("min") || chord.quality === "dim" || chord.quality === "dim7";
  const numeral = `${accidental === -1 ? "♭" : accidental === 1 ? "♯" : ""}${minor ? romanByDegree[degree - 1].toLowerCase() : romanByDegree[degree - 1]}`;
  const suffix = qualitySuffix(chord.quality, minor);
  const bass = bassPosition(chord);

  return {
    degree,
    accidental,
    quality: chord.quality,
    ...(bass ? { bass } : {}),
    label: `${numeral}${suffix}${bass ? `/${bass}` : ""}`,
  };
}

export function degreeSequence(block: SavedProgressionBlock): string[] {
  return block.chords
    .map((item) => degreeOf(item.chord, block.detectedKey))
    .flatMap((degree) => degree ? [degree.label] : []);
}

export function normalizeQuery(query: string): DegreeQuery | ChordQuery | TextQuery {
  const normalized = query.trim();
  const compactNumbers = normalized.replace(/[\s,-]/g, "");
  if (/^[1-7]{2,}$/.test(compactNumbers)) {
    return { kind: "degree", terms: [...compactNumbers].map((value) => ({ degree: Number(value) })) };
  }

  const romanTerms = normalized.split(/[\s,-]+/).filter(Boolean).map(parseRomanTerm);
  if (romanTerms.length > 0 && romanTerms.every((term) => term !== undefined)) {
    return { kind: "degree", terms: romanTerms as DegreeQuery["terms"] };
  }

  if (/^[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|[0-9]|\/)+/i.test(normalized)) {
    return { kind: "chord", normalized: normalized.toLocaleLowerCase() };
  }

  return { kind: "text", normalized: normalized.toLocaleLowerCase() };
}

export function matchProgression(block: SavedProgressionBlock, query: DegreeQuery | ChordQuery | TextQuery): boolean {
  if (query.kind === "degree") {
    const degrees = block.chords.map((item) => degreeOf(item.chord, block.detectedKey));
    return hasPartialMatch(degrees, query.terms);
  }

  if (query.kind === "chord") {
    return block.chords.some((item) => item.chord.label.toLocaleLowerCase().includes(query.normalized));
  }

  if (!query.normalized) return true;
  const haystack = [block.summaryText, block.memo ?? "", block.tags.join(" "), block.sourceFileName ?? ""]
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query.normalized);
}

function hasPartialMatch(
  degrees: Array<DegreeSymbol | undefined>,
  terms: DegreeQuery["terms"],
): boolean {
  if (terms.length === 0) return true;
  for (let start = 0; start <= degrees.length - terms.length; start += 1) {
    if (terms.every((term, offset) => matchesDegree(degrees[start + offset], term))) return true;
  }
  return false;
}

function matchesDegree(
  value: DegreeSymbol | undefined,
  term: DegreeQuery["terms"][number],
): boolean {
  if (!value || value.degree !== term.degree) return false;
  if (term.accidental !== undefined && value.accidental !== term.accidental) return false;
  if (!term.quality) return true;
  if (term.quality === "major") return !value.quality.startsWith("min") && value.quality !== "dim" && value.quality !== "dim7";
  if (term.quality === "minor") return value.quality.startsWith("min") || value.quality === "dim" || value.quality === "dim7";
  return value.quality === term.quality;
}

function parseRomanTerm(value: string): DegreeQuery["terms"][number] | undefined {
  const match = /^(♭|b|♯|#)?(vii|vi|iv|v|iii|ii|i)(.*)$/i.exec(value);
  if (!match) return undefined;
  const roman = match[2].toUpperCase();
  const degree = ({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 } as Record<string, number>)[roman];
  if (!degree) return undefined;
  const accidental = match[1] === "♭" || match[1] === "b" ? -1 : match[1] === "♯" || match[1] === "#" ? 1 : 0;
  const suffix = match[3].toLowerCase();
  const quality = suffix ? suffixToQuality(suffix) : (match[2] === match[2].toLowerCase() ? "minor" : "major");
  return { degree, ...(accidental ? { accidental } : {}), ...(quality ? { quality } : {}) };
}

function suffixToQuality(suffix: string): DegreeQuery["terms"][number]["quality"] | undefined {
  const map: Record<string, ChordQuality> = {
    maj7: "maj7", maj9: "maj9", min7: "min7", min9: "min9", min11: "min11",
    "7": "dom7", "9": "dom9", "13": "dom13", sus2: "sus2", sus4: "sus4", add9: "add9",
  };
  return map[suffix];
}

function qualitySuffix(quality: ChordQuality, minor: boolean): string {
  const suffixes: Partial<Record<ChordQuality, string>> = {
    maj: "", min: "", dim: "dim", aug: "aug", maj7: "maj7", min7: "7", dom7: "7",
    min7b5: "7♭5", dim7: "dim7", maj9: "maj9", min9: "9", dom9: "9", min11: "11",
    dom13: "13", sus2: "sus2", sus4: "sus4", dom7sus4: "7sus4", add9: "add9", six: "6",
    min6: "6", sixNine: "6/9",
  };
  return suffixes[quality] ?? (minor ? "" : "");
}

function bassPosition(chord: ChordSymbol): DegreeSymbol["bass"] | undefined {
  if (chord.bass === undefined || chord.bass === chord.root) return undefined;
  const interval = (chord.bass - chord.root + 12) % 12;
  if (interval === 3 || interval === 4) return "3rd";
  if (interval === 7) return "5th";
  if (interval === 10 || interval === 11) return "7th";
  return undefined;
}

function parseKey(value: string | undefined): { root: number; minor: boolean } | undefined {
  if (!value) return undefined;
  const match = /^([A-G](?:#|b)?)(?:\s*(major|minor)|\s*(m))?$/i.exec(value.trim());
  if (!match) return undefined;
  const root = pitchClasses[match[1]];
  return root === undefined ? undefined : { root, minor: Boolean(match[2]?.toLowerCase() === "minor" || match[3]) };
}
