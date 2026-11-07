import type { ChordSymbol } from "../types";
import { MAJOR_SCALE, parseDegreeToken } from "./degrees";
import { earKeyName, type EarMode } from "./keys";
import type { EarQuestion } from "./question";

/** What a chord card says under the name: the degree (`Ⅵ7(♭9)`) and the function (`D→Ⅱ`, `SD`, `D(裏)` …, empty when none fits). */
export interface EarChordInfo {
  degree: string;
  /** Empty: nothing is shown. */
  fn: string;
}

const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"] as const;
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const ACCIDENTAL = { [-1]: "♭", 0: "", 1: "♯" } as const;

type Family = "dom" | "maj" | "min" | "hdim" | "dim" | "dim7" | "sus" | "aug" | "?";

/** The part of a chord that decides its function. */
interface FunctionChord {
  /** Semitones above the key's tonic. */
  pc: number;
  family: Family;
  /** A plain major triad (written with nothing after the degree). */
  plainMajor: boolean;
  /** A dominant seventh family chord that has its 3rd and 7th (`7sus4` and triads do not). */
  tritone: boolean;
  bassPc?: number;
  /** The degree of the root as written (`♭Ⅱ`), used when another chord's function points at it. */
  rootText: string;
  degree: string;
}

function familyOfSuffix(q: string): Family {
  if (q === "7" || q === "9" || q === "13" || q === "7sus4" || q.startsWith("7(") || q === "7alt") return "dom";
  if (["", "6", "maj7", "maj9", "add9", "6/9", "maj7(#11)"].includes(q)) return "maj";
  if (["m", "m6", "m7", "m9", "m11", "mMaj7"].includes(q)) return "min";
  if (q === "m7b5") return "hdim";
  if (q === "dim" || q === "dim7") return q;
  if (q === "sus2" || q === "sus4") return "sus";
  if (q === "aug") return "aug";
  return "?";
}

const mod12 = (value: number) => ((value % 12) + 12) % 12;
const written = (text: string) => text.replace(/b(?=\d)/g, "♭").replace(/\(b/g, "(♭").replace(/#/g, "♯");

/** A degree token of the bank (`IIm7`, `bVII`, `I/III`), exactly as it is written. */
function fromToken(token: string): FunctionChord {
  const parsed = parseDegreeToken(token);
  const rootText = `${ACCIDENTAL[parsed.accidental]}${ROMAN[parsed.degree - 1]}`;
  const pc = mod12(MAJOR_SCALE[parsed.degree - 1]! + parsed.accidental);
  const bassText = parsed.bass ? `/${ACCIDENTAL[parsed.bass.accidental]}${ROMAN[parsed.bass.degree - 1]}` : "";
  const family = familyOfSuffix(parsed.suffix);
  return {
    pc,
    family,
    plainMajor: parsed.suffix === "",
    tritone: family === "dom" && parsed.suffix !== "7sus4",
    ...(parsed.bass ? { bassPc: mod12(MAJOR_SCALE[parsed.bass.degree - 1]! + parsed.bass.accidental) } : {}),
    rootText,
    degree: `${rootText}${written(parsed.suffix)}${bassText}`,
  };
}

const QUALITY_SUFFIX: Record<ChordSymbol["quality"], string> = {
  maj: "", min: "m", dim: "dim", aug: "aug", maj7: "maj7", min7: "m7", dom7: "7", min7b5: "m7b5", dim7: "dim7",
  maj9: "maj9", min9: "m9", dom9: "9", min11: "m11", dom13: "13", sus2: "sus2", sus4: "sus4", dom7sus4: "7sus4",
  add9: "add9", add13: "add13", six: "6", min6: "m6", sixNine: "6/9", minMaj7: "mMaj7", power: "5", dom11: "11",
};

/** The degree of a written name in a key: the letter says which number, the pitch says ♭ or ♯. Undefined when it needs more than one sign. */
function degreeOfName(name: string, tonic: number, mode: EarMode): { accidental: -1 | 0 | 1; degree: number; pc: number } | undefined {
  const match = /^([A-G])([#b♯♭]?)/.exec(name);
  if (!match) return undefined;
  const tonicLetter = LETTERS.indexOf(earKeyName(tonic, mode)[0] as (typeof LETTERS)[number]);
  const degree = ((LETTERS.indexOf(match[1] as (typeof LETTERS)[number]) - tonicLetter + 7) % 7) + 1;
  const sign = match[2] === "#" || match[2] === "♯" ? 1 : match[2] === "b" || match[2] === "♭" ? -1 : 0;
  const natural = [0, 2, 4, 5, 7, 9, 11][LETTERS.indexOf(match[1] as (typeof LETTERS)[number])]!;
  const pc = mod12(natural + sign - tonic);
  let diff = pc - MAJOR_SCALE[degree - 1]!;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  if (Math.abs(diff) > 1) return undefined;
  // The two half steps of the major scale: ♯Ⅲ is Ⅳ, ♭Ⅳ is Ⅲ, ♯Ⅶ is Ⅰ, ♭Ⅰ is Ⅶ (a name that is spelled the other way, as the Dojo sometimes does).
  if (diff === 1 && (degree === 3 || degree === 7)) return { accidental: 0, degree: (degree % 7) + 1, pc };
  if (diff === -1 && (degree === 4 || degree === 1)) return { accidental: 0, degree: degree === 1 ? 7 : 3, pc };
  return { accidental: diff as -1 | 0 | 1, degree, pc };
}

/** A chord of a standard or saved progression, from its name and the key. Undefined when its degree cannot be written. */
function fromSymbol(symbol: ChordSymbol, tonic: number, mode: EarMode): FunctionChord | undefined {
  const root = degreeOfName(symbol.label, tonic, mode);
  if (!root) return undefined;
  const slash = /\/([A-G][#b♯♭]?)$/.exec(symbol.label);
  const bass = slash ? degreeOfName(slash[1]!, tonic, mode) : undefined;
  if (slash && !bass) return undefined;
  const rest = symbol.label.replace(/^[A-G][#b♯♭]?/, "").replace(/\/[A-G][#b♯♭]?$/, "");
  const rootText = `${ACCIDENTAL[root.accidental]}${ROMAN[root.degree - 1]}`;
  const family = symbol.altered ? "dom" : familyOfSuffix(QUALITY_SUFFIX[symbol.quality]);
  return {
    pc: root.pc,
    family,
    plainMajor: symbol.quality === "maj" && !symbol.tensions.length,
    tritone: family === "dom" && symbol.quality !== "dom7sus4",
    ...(bass ? { bassPc: bass.pc } : {}),
    rootText,
    degree: `${rootText}${written(rest)}${bass ? `/${ACCIDENTAL[bass.accidental]}${ROMAN[bass.degree - 1]}` : ""}`,
  };
}

type Key = `${number}|${Family}`;
const MAJOR_TABLE: Record<string, string> = {
  "0|maj": "T", "0|sus": "T", "2|min": "SD", "4|min": "T", "5|maj": "SD", "5|sus": "SD", "7|maj": "D", "7|dom": "D", "7|sus": "D", "7|aug": "D",
  "9|min": "T", "11|hdim": "D", "11|dim": "D",
  // borrowed from the parallel minor
  "5|min": "SDm", "2|hdim": "SDm", "8|maj": "SDm", "10|maj": "SDm", "10|dom": "SDm", "1|maj": "SDm",
  "5|dom": "SD", "6|hdim": "SD",
};
const MINOR_TABLE: Record<string, string> = {
  "0|min": "T", "0|sus": "T", "3|maj": "T", "5|min": "SD", "5|maj": "SD", "5|sus": "SD", "2|hdim": "SD", "2|dim": "SD", "8|maj": "SD", "10|maj": "SD", "10|dom": "SD",
  "7|maj": "D", "7|dom": "D", "7|min": "D", "7|sus": "D", "7|aug": "D", "11|dim7": "D", "11|dim": "D", "1|maj": "SD",
  "0|maj": "T", "2|min": "SD", "5|dom": "SD", "9|hdim": "SD",
};
const TABLE: Record<EarMode, Record<string, string>> = { major: MAJOR_TABLE, minor: MINOR_TABLE };
/** The degrees whose triad is major in the key. */
const MAJOR_TRIADS: Record<EarMode, readonly number[]> = { major: [0, 5, 7], minor: [3, 8, 10] };

/** The function of chord `i` of a progression, from its own degree and kind and the chord after it ("" when none fits). */
function functionAt(chords: readonly FunctionChord[], index: number, mode: EarMode): string {
  const chord = chords[index]!;
  const table = TABLE[mode];
  const own = table[`${chord.pc}|${chord.family}` as Key] ?? "";
  // a Ⅳ or Ⅱ chord over the 5th in the bass works as the dominant
  if (chord.bassPc === 7 && (chord.pc === 5 || chord.pc === 2) && (chord.family === "maj" || chord.family === "min")) return "D";
  // the last chord is not read against the first: the question is sounded only once
  const next = chords[index + 1];
  if (!next) return own;
  // a diminished chord rising a semitone is a rootless ♭9 dominant of the next chord
  if ((chord.family === "dim" || chord.family === "dim7") && mod12(next.pc - chord.pc) === 1 && chord.pc !== 11) return `D→${next.rootText}`;
  const dominantLike = chord.family === "dom" || (chord.family === "maj" && chord.plainMajor && !MAJOR_TRIADS[mode].includes(chord.pc));
  if (chord.tritone && mod12(chord.pc - next.pc) === 1 && chord.pc !== 7) return "D(裏)";
  if (dominantLike && chord.pc !== 7 && mod12(next.pc - chord.pc) === 5) return `D→${next.rootText}`;
  return own;
}

/** Degrees and functions of a run of chords (`undefined` where a chord cannot be given a degree). */
function infosOf(chords: ReadonlyArray<FunctionChord | undefined>, mode: EarMode): Array<EarChordInfo | undefined> {
  if (chords.some((chord) => chord === undefined)) return chords.map(() => undefined);
  const known = chords as readonly FunctionChord[];
  return known.map((chord, index) => ({ degree: chord.degree, fn: functionAt(known, index, mode) }));
}

/** The degree of a degree token as the card writes it (`bVII` → `♭Ⅶ`, `IIm7b5` → `Ⅱm7♭5`, `V7(b9)` → `Ⅴ7(♭9)`). */
export const degreeText = (token: string): string => fromToken(token).degree;

/** Degrees and functions for the cards of a question. Nothing for a question whose key is not known (a saved progression without one). */
export function questionInfos(question: Pick<EarQuestion, "chords" | "mode" | "tonic" | "keyName">): Array<EarChordInfo | undefined> {
  if (question.chords.every((chord) => chord.degree !== undefined)) {
    return infosOf(question.chords.map((chord) => fromToken(chord.degree!)), question.mode);
  }
  if (question.keyName === "") return question.chords.map(() => undefined);
  return infosOf(question.chords.map((chord) => fromSymbol(chord.symbol, question.tonic, question.mode)), question.mode);
}

/** Which colour a function takes: T, SD, SDm or D (a secondary dominant and a tritone substitute are D). */
export function functionKind(fn: string): "T" | "SD" | "SDm" | "D" | "" {
  if (fn === "T" || fn === "SD" || fn === "SDm") return fn;
  return fn.startsWith("D") ? "D" : "";
}
