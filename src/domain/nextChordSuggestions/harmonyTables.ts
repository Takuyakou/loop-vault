/**
 * P25 V23 Stage 1: the harmony tables of the next-chord proposal (v3 §3.1–§3.5, with the v4 changes).
 *
 * The rows are the accepted 1-gram table (major / minor), the 15 accepted 3-gram patterns, the loop-closing
 * candidates, the quality conversion for triad / seventh / rich charts, and the reason sentences. The table
 * data is kept verbatim from the proposal so the unit tests can check every row.
 */
import { formatChordSymbol, makeChordSymbol } from "../chords";
import type { ChordQuality, ChordSymbol, Tension } from "../types";
import { keyContextFor, type EstimatedKey, type KeyMode, type QualityFamily } from "./estimateKey";

/** The row's chord family (5 families; aug is independent). */
export type BaseQuality = "maj" | "min7b5" | "min6" | "min7" | "maj7" | "dom7" | "dom7sus4" | "dom9" | "dim7" | "aug";
export type CandidateCategory = "定番" | "展開" | "なめらか";
/** The palette's five slots: the four table categories plus Stage 2's 好み. */
export type SuggestionCategory = CandidateCategory | "好み";

export interface TransitionRow {
  readonly prevDeg: number;
  readonly prevFamily: QualityFamily;
  readonly nextDeg: number;
  readonly baseQuality: BaseQuality;
  /** Semitones above the next root for the slash bass; null = root position. */
  readonly bassRelative: number | null;
  readonly category: CandidateCategory;
  readonly points: number;
}

export interface ThreeGramPattern {
  readonly mode: KeyMode;
  readonly name: string;
  readonly aDeg: number;
  readonly aFamilies: readonly QualityFamily[];
  readonly bDeg: number;
  readonly bFamilies: readonly QualityFamily[];
  readonly nextDeg: number;
  readonly nextFamilies: readonly QualityFamily[];
  readonly bassRelative: number | null;
}

const ROWS: Readonly<Record<KeyMode, readonly TransitionRow[]>> = {
  major: [
  { prevDeg: 0, prevFamily: "maj", nextDeg: 5, baseQuality: "maj7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 0, prevFamily: "maj", nextDeg: 9, baseQuality: "min7", bassRelative: null, category: "定番", points: 66 },
  { prevDeg: 0, prevFamily: "maj", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "定番", points: 62 },
  { prevDeg: 0, prevFamily: "maj", nextDeg: 2, baseQuality: "min7", bassRelative: null, category: "定番", points: 58 },
  { prevDeg: 0, prevFamily: "maj", nextDeg: 7, baseQuality: "maj", bassRelative: 4, category: "なめらか", points: 66 },
  { prevDeg: 0, prevFamily: "maj", nextDeg: 0, baseQuality: "maj", bassRelative: 10, category: "なめらか", points: 58 },
  { prevDeg: 0, prevFamily: "maj", nextDeg: 4, baseQuality: "dom7", bassRelative: null, category: "展開", points: 58 },
  { prevDeg: 0, prevFamily: "maj", nextDeg: 0, baseQuality: "aug", bassRelative: null, category: "展開", points: 54 },
  { prevDeg: 0, prevFamily: "maj", nextDeg: 1, baseQuality: "dim7", bassRelative: null, category: "展開", points: 52 },
  { prevDeg: 0, prevFamily: "dom", nextDeg: 5, baseQuality: "maj7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 2, prevFamily: "min", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 2, prevFamily: "min", nextDeg: 7, baseQuality: "dom7sus4", bassRelative: null, category: "定番", points: 68 },
  { prevDeg: 2, prevFamily: "min", nextDeg: 5, baseQuality: "maj", bassRelative: 2, category: "なめらか", points: 64 },
  { prevDeg: 2, prevFamily: "min", nextDeg: 4, baseQuality: "min7", bassRelative: null, category: "定番", points: 56 },
  { prevDeg: 2, prevFamily: "min", nextDeg: 1, baseQuality: "dom7", bassRelative: null, category: "展開", points: 64 },
  { prevDeg: 2, prevFamily: "min", nextDeg: 3, baseQuality: "dim7", bassRelative: null, category: "展開", points: 52 },
  { prevDeg: 2, prevFamily: "dom", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 2, prevFamily: "dom", nextDeg: 7, baseQuality: "dom7sus4", bassRelative: null, category: "定番", points: 66 },
  { prevDeg: 2, prevFamily: "dom", nextDeg: 5, baseQuality: "min7", bassRelative: null, category: "展開", points: 56 },
  { prevDeg: 4, prevFamily: "min", nextDeg: 9, baseQuality: "min7", bassRelative: null, category: "定番", points: 72 },
  { prevDeg: 4, prevFamily: "min", nextDeg: 5, baseQuality: "maj7", bassRelative: null, category: "定番", points: 64 },
  { prevDeg: 4, prevFamily: "min", nextDeg: 9, baseQuality: "dom7", bassRelative: null, category: "展開", points: 66 },
  { prevDeg: 4, prevFamily: "min", nextDeg: 3, baseQuality: "dom7", bassRelative: null, category: "なめらか", points: 62 },
  { prevDeg: 4, prevFamily: "min", nextDeg: 2, baseQuality: "min7", bassRelative: null, category: "定番", points: 56 },
  { prevDeg: 4, prevFamily: "dom", nextDeg: 9, baseQuality: "min7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 4, prevFamily: "dom", nextDeg: 5, baseQuality: "maj7", bassRelative: null, category: "定番", points: 62 },
  { prevDeg: 5, prevFamily: "maj", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "定番", points: 72 },
  { prevDeg: 5, prevFamily: "maj", nextDeg: 4, baseQuality: "min7", bassRelative: null, category: "定番", points: 66 },
  { prevDeg: 5, prevFamily: "maj", nextDeg: 7, baseQuality: "dom7sus4", bassRelative: null, category: "定番", points: 64 },
  { prevDeg: 5, prevFamily: "maj", nextDeg: 0, baseQuality: "maj", bassRelative: 4, category: "なめらか", points: 66 },
  { prevDeg: 5, prevFamily: "maj", nextDeg: 4, baseQuality: "dom7", bassRelative: null, category: "展開", points: 66 },
  { prevDeg: 5, prevFamily: "maj", nextDeg: 5, baseQuality: "min6", bassRelative: null, category: "展開", points: 62 },
  { prevDeg: 5, prevFamily: "maj", nextDeg: 10, baseQuality: "dom9", bassRelative: null, category: "展開", points: 60 },
  { prevDeg: 5, prevFamily: "maj", nextDeg: 6, baseQuality: "min7b5", bassRelative: null, category: "展開", points: 54 },
  { prevDeg: 5, prevFamily: "min", nextDeg: 0, baseQuality: "maj7", bassRelative: null, category: "定番", points: 72 },
  { prevDeg: 5, prevFamily: "min", nextDeg: 0, baseQuality: "maj", bassRelative: 4, category: "なめらか", points: 68 },
  { prevDeg: 5, prevFamily: "min", nextDeg: 10, baseQuality: "dom7", bassRelative: null, category: "展開", points: 66 },
  { prevDeg: 5, prevFamily: "min", nextDeg: 4, baseQuality: "min7", bassRelative: null, category: "なめらか", points: 58 },
  { prevDeg: 7, prevFamily: "dom", nextDeg: 0, baseQuality: "maj7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 7, prevFamily: "dom", nextDeg: 4, baseQuality: "min7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 7, prevFamily: "dom", nextDeg: 9, baseQuality: "min7", bassRelative: null, category: "定番", points: 66 },
  { prevDeg: 7, prevFamily: "dom", nextDeg: 5, baseQuality: "maj7", bassRelative: null, category: "定番", points: 56 },
  { prevDeg: 7, prevFamily: "dom", nextDeg: 8, baseQuality: "dim7", bassRelative: null, category: "展開", points: 62 },
  { prevDeg: 7, prevFamily: "dom", nextDeg: 8, baseQuality: "maj7", bassRelative: null, category: "展開", points: 56 },
  { prevDeg: 7, prevFamily: "maj", nextDeg: 0, baseQuality: "maj7", bassRelative: null, category: "定番", points: 72 },
  { prevDeg: 7, prevFamily: "maj", nextDeg: 9, baseQuality: "min7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 7, prevFamily: "maj", nextDeg: 4, baseQuality: "min7", bassRelative: null, category: "定番", points: 68 },
  { prevDeg: 7, prevFamily: "maj", nextDeg: 8, baseQuality: "dim7", bassRelative: null, category: "展開", points: 60 },
  { prevDeg: 9, prevFamily: "min", nextDeg: 2, baseQuality: "min7", bassRelative: null, category: "定番", points: 72 },
  { prevDeg: 9, prevFamily: "min", nextDeg: 5, baseQuality: "maj7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 9, prevFamily: "min", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "定番", points: 64 },
  { prevDeg: 9, prevFamily: "min", nextDeg: 9, baseQuality: "min7", bassRelative: 10, category: "なめらか", points: 64 },
  { prevDeg: 9, prevFamily: "min", nextDeg: 2, baseQuality: "dom7", bassRelative: null, category: "展開", points: 60 },
  { prevDeg: 9, prevFamily: "min", nextDeg: 0, baseQuality: "dom7", bassRelative: null, category: "展開", points: 62 },
  { prevDeg: 9, prevFamily: "min", nextDeg: 8, baseQuality: "dim7", bassRelative: null, category: "なめらか", points: 54 },
  { prevDeg: 9, prevFamily: "dom", nextDeg: 2, baseQuality: "min7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 9, prevFamily: "dom", nextDeg: 2, baseQuality: "dom7", bassRelative: null, category: "展開", points: 62 },
  { prevDeg: 10, prevFamily: "dom", nextDeg: 0, baseQuality: "maj7", bassRelative: null, category: "定番", points: 72 },
  { prevDeg: 10, prevFamily: "dom", nextDeg: 5, baseQuality: "maj7", bassRelative: null, category: "定番", points: 64 },
  { prevDeg: 10, prevFamily: "dom", nextDeg: 4, baseQuality: "min7", bassRelative: null, category: "なめらか", points: 60 },
  { prevDeg: 11, prevFamily: "dim", nextDeg: 4, baseQuality: "dom7", bassRelative: null, category: "定番", points: 74 },
  { prevDeg: 11, prevFamily: "dim", nextDeg: 0, baseQuality: "maj7", bassRelative: null, category: "定番", points: 64 },
  { prevDeg: 11, prevFamily: "dim", nextDeg: 10, baseQuality: "min6", bassRelative: null, category: "なめらか", points: 60 },
  { prevDeg: 1, prevFamily: "dom", nextDeg: 0, baseQuality: "maj7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 3, prevFamily: "dom", nextDeg: 2, baseQuality: "min7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 6, prevFamily: "dom", nextDeg: 5, baseQuality: "maj7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 8, prevFamily: "dim", nextDeg: 9, baseQuality: "min7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 8, prevFamily: "dim", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "なめらか", points: 62 },
  { prevDeg: 1, prevFamily: "dim", nextDeg: 2, baseQuality: "min7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 3, prevFamily: "dim", nextDeg: 4, baseQuality: "min7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 6, prevFamily: "dim", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "定番", points: 72 },
  { prevDeg: 6, prevFamily: "dim", nextDeg: 11, baseQuality: "dom7", bassRelative: null, category: "展開", points: 64 },
  { prevDeg: 8, prevFamily: "maj", nextDeg: 10, baseQuality: "dom7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 8, prevFamily: "maj", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "なめらか", points: 66 },
  { prevDeg: 10, prevFamily: "maj", nextDeg: 0, baseQuality: "maj7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 10, prevFamily: "maj", nextDeg: 5, baseQuality: "maj7", bassRelative: null, category: "定番", points: 64 },
  { prevDeg: 10, prevFamily: "min", nextDeg: 9, baseQuality: "min7", bassRelative: null, category: "なめらか", points: 70 },
  { prevDeg: 10, prevFamily: "min", nextDeg: 3, baseQuality: "dom7", bassRelative: null, category: "展開", points: 62 },
  { prevDeg: 0, prevFamily: "aug", nextDeg: 5, baseQuality: "maj7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 0, prevFamily: "aug", nextDeg: 9, baseQuality: "min7", bassRelative: null, category: "定番", points: 64 },
  ],
  minor: [
  { prevDeg: 0, prevFamily: "min", nextDeg: 5, baseQuality: "min7", bassRelative: null, category: "定番", points: 72 },
  { prevDeg: 0, prevFamily: "min", nextDeg: 8, baseQuality: "maj7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 0, prevFamily: "min", nextDeg: 10, baseQuality: "maj", bassRelative: null, category: "定番", points: 66 },
  { prevDeg: 0, prevFamily: "min", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "定番", points: 64 },
  { prevDeg: 0, prevFamily: "min", nextDeg: 0, baseQuality: "min7", bassRelative: 10, category: "なめらか", points: 64 },
  { prevDeg: 0, prevFamily: "min", nextDeg: 2, baseQuality: "min7b5", bassRelative: null, category: "展開", points: 60 },
  { prevDeg: 0, prevFamily: "min", nextDeg: 11, baseQuality: "dim7", bassRelative: null, category: "なめらか", points: 56 },
  { prevDeg: 2, prevFamily: "dim", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 2, prevFamily: "dim", nextDeg: 1, baseQuality: "dom7", bassRelative: null, category: "展開", points: 64 },
  { prevDeg: 2, prevFamily: "dim", nextDeg: 8, baseQuality: "maj7", bassRelative: null, category: "なめらか", points: 58 },
  { prevDeg: 3, prevFamily: "maj", nextDeg: 8, baseQuality: "maj7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 3, prevFamily: "maj", nextDeg: 10, baseQuality: "maj", bassRelative: null, category: "定番", points: 66 },
  { prevDeg: 3, prevFamily: "maj", nextDeg: 5, baseQuality: "min7", bassRelative: null, category: "定番", points: 62 },
  { prevDeg: 3, prevFamily: "maj", nextDeg: 10, baseQuality: "maj", bassRelative: 4, category: "なめらか", points: 64 },
  { prevDeg: 3, prevFamily: "maj", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "展開", points: 60 },
  { prevDeg: 5, prevFamily: "min", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 5, prevFamily: "min", nextDeg: 10, baseQuality: "dom7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 5, prevFamily: "min", nextDeg: 0, baseQuality: "min7", bassRelative: null, category: "定番", points: 64 },
  { prevDeg: 5, prevFamily: "min", nextDeg: 3, baseQuality: "maj", bassRelative: 4, category: "なめらか", points: 62 },
  { prevDeg: 5, prevFamily: "min", nextDeg: 1, baseQuality: "dom7", bassRelative: null, category: "展開", points: 60 },
  { prevDeg: 7, prevFamily: "dom", nextDeg: 0, baseQuality: "min7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 7, prevFamily: "dom", nextDeg: 8, baseQuality: "maj7", bassRelative: null, category: "定番", points: 68 },
  { prevDeg: 7, prevFamily: "dom", nextDeg: 5, baseQuality: "min7", bassRelative: null, category: "展開", points: 54 },
  { prevDeg: 7, prevFamily: "min", nextDeg: 0, baseQuality: "min7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 7, prevFamily: "min", nextDeg: 8, baseQuality: "maj7", bassRelative: null, category: "定番", points: 68 },
  { prevDeg: 7, prevFamily: "min", nextDeg: 5, baseQuality: "min7", bassRelative: null, category: "定番", points: 62 },
  { prevDeg: 8, prevFamily: "maj", nextDeg: 10, baseQuality: "maj", bassRelative: null, category: "定番", points: 72 },
  { prevDeg: 8, prevFamily: "maj", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 8, prevFamily: "maj", nextDeg: 5, baseQuality: "min7", bassRelative: null, category: "定番", points: 64 },
  { prevDeg: 8, prevFamily: "maj", nextDeg: 2, baseQuality: "min7b5", bassRelative: null, category: "展開", points: 62 },
  { prevDeg: 8, prevFamily: "maj", nextDeg: 3, baseQuality: "maj", bassRelative: 4, category: "なめらか", points: 62 },
  { prevDeg: 10, prevFamily: "maj", nextDeg: 0, baseQuality: "min7", bassRelative: null, category: "定番", points: 72 },
  { prevDeg: 10, prevFamily: "maj", nextDeg: 3, baseQuality: "maj7", bassRelative: null, category: "定番", points: 70 },
  { prevDeg: 10, prevFamily: "maj", nextDeg: 7, baseQuality: "min7", bassRelative: null, category: "定番", points: 66 },
  { prevDeg: 10, prevFamily: "maj", nextDeg: 7, baseQuality: "dom7", bassRelative: null, category: "展開", points: 64 },
  { prevDeg: 10, prevFamily: "dom", nextDeg: 3, baseQuality: "maj7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 10, prevFamily: "dom", nextDeg: 0, baseQuality: "min7", bassRelative: null, category: "定番", points: 68 },
  { prevDeg: 1, prevFamily: "dom", nextDeg: 0, baseQuality: "min7", bassRelative: null, category: "定番", points: 75 },
  { prevDeg: 11, prevFamily: "dim", nextDeg: 0, baseQuality: "min7", bassRelative: null, category: "定番", points: 75 },
  ],
};

const GRAM_ROWS: readonly ThreeGramPattern[] = [
  { mode: "major", name: "王道進行①", aDeg: 5, aFamilies: ["maj"], bDeg: 7, bFamilies: ["dom", "maj"], nextDeg: 4, nextFamilies: ["min"], bassRelative: null },
  { mode: "major", name: "王道進行②", aDeg: 7, aFamilies: ["dom", "maj"], bDeg: 4, bFamilies: ["min"], nextDeg: 9, nextFamilies: ["min"], bassRelative: null },
  { mode: "major", name: "丸サ進行①", aDeg: 5, aFamilies: ["maj"], bDeg: 4, bFamilies: ["dom"], nextDeg: 9, nextFamilies: ["min"], bassRelative: null },
  { mode: "major", name: "丸サ進行②", aDeg: 4, aFamilies: ["dom"], bDeg: 9, bFamilies: ["min"], nextDeg: 0, nextFamilies: ["dom"], bassRelative: null },
  { mode: "major", name: "2-5-1", aDeg: 2, aFamilies: ["min"], bDeg: 7, bFamilies: ["dom"], nextDeg: 0, nextFamilies: ["maj"], bassRelative: null },
  { mode: "major", name: "逆循環①", aDeg: 0, aFamilies: ["maj"], bDeg: 9, bFamilies: ["min"], nextDeg: 2, nextFamilies: ["min"], bassRelative: null },
  { mode: "major", name: "逆循環②", aDeg: 9, aFamilies: ["min"], bDeg: 2, bFamilies: ["min"], nextDeg: 7, nextFamilies: ["dom"], bassRelative: null },
  { mode: "major", name: "4 度循環", aDeg: 4, aFamilies: ["min"], bDeg: 9, bFamilies: ["dom", "min"], nextDeg: 2, nextFamilies: ["min"], bassRelative: null },
  { mode: "major", name: "バックドア", aDeg: 5, aFamilies: ["maj"], bDeg: 10, bFamilies: ["dom"], nextDeg: 0, nextFamilies: ["maj"], bassRelative: null },
  { mode: "major", name: "明暗反転→I/3", aDeg: 5, aFamilies: ["maj"], bDeg: 5, bFamilies: ["min"], nextDeg: 0, nextFamilies: ["maj"], bassRelative: 4 },
  { mode: "major", name: "上行ディミニッシュ", aDeg: 7, aFamilies: ["dom", "maj"], bDeg: 8, bFamilies: ["dim"], nextDeg: 9, nextFamilies: ["min"], bassRelative: null },
  { mode: "major", name: "マイナー 2-5-1", aDeg: 11, aFamilies: ["dim"], bDeg: 4, bFamilies: ["dom"], nextDeg: 9, nextFamilies: ["min"], bassRelative: null },
  { mode: "minor", name: "小室進行①", aDeg: 8, aFamilies: ["maj"], bDeg: 10, bFamilies: ["maj"], nextDeg: 7, nextFamilies: ["min", "dom"], bassRelative: null },
  { mode: "minor", name: "小室進行②", aDeg: 10, aFamilies: ["maj"], bDeg: 7, bFamilies: ["min", "dom"], nextDeg: 0, nextFamilies: ["min"], bassRelative: null },
  { mode: "minor", name: "マイナー 2-5-1", aDeg: 2, aFamilies: ["dim"], bDeg: 7, bFamilies: ["dom"], nextDeg: 0, nextFamilies: ["min"], bassRelative: null },
];

export function transitionRows(mode: KeyMode): readonly TransitionRow[] {
  return ROWS[mode];
}

export function threeGramPatterns(mode: KeyMode): readonly ThreeGramPattern[] {
  return GRAM_ROWS.filter((pattern) => pattern.mode === mode);
}

/** The proposal's fallback when the table has no row: a dominant goes to its fourth / a semitone below. */
export function fallbackRows(mode: KeyMode, prevDeg: number, prevFamily: QualityFamily): readonly TransitionRow[] {
  if (prevFamily === "dom") {
    const diatonic = diatonicQuality(mode, (prevDeg + 5) % 12);
    const smooth = diatonicQuality(mode, (prevDeg + 11) % 12);
    return [
      ...(diatonic ? [{ prevDeg, prevFamily, nextDeg: (prevDeg + 5) % 12, baseQuality: diatonic, bassRelative: null, category: "定番" as const, points: 70 }] : []),
      ...(smooth ? [{ prevDeg, prevFamily, nextDeg: (prevDeg + 11) % 12, baseQuality: smooth, bassRelative: null, category: "なめらか" as const, points: 62 }] : []),
    ];
  }
  const main: readonly [number, BaseQuality][] = mode === "major"
    ? [[0, "maj7"], [5, "maj7"], [7, "dom7"], [9, "min7"]]
    : [[0, "min7"], [5, "min7"], [7, "dom7"], [8, "maj7"]];
  return main
    .filter(([deg]) => deg !== prevDeg)
    .map(([deg, baseQuality]) => ({ prevDeg, prevFamily, nextDeg: deg, baseQuality, bassRelative: null, category: "定番" as const, points: 45 }));
}

/** The one diatonic seventh chord at a degree (for the fallback), or undefined. */
function diatonicQuality(mode: KeyMode, deg: number): BaseQuality | undefined {
  const table: readonly [number, BaseQuality][] = mode === "major"
    ? [[0, "maj7"], [2, "min7"], [4, "min7"], [5, "maj7"], [7, "dom7"], [9, "min7"], [11, "min7b5"]]
    : [[0, "min7"], [2, "min7b5"], [3, "maj7"], [5, "min7"], [7, "dom7"], [8, "maj7"], [10, "dom7"]];
  return table.find(([value]) => value === deg)?.[1];
}

export interface LoopClosingCandidate {
  readonly nextDeg: number;
  readonly baseQuality: BaseQuality;
  readonly category: CandidateCategory;
  readonly points: number;
  readonly role: "loop-dominant" | "loop-tritone" | "loop-sdm";
}

/** v4 change 5: the four loop-closing candidates, injected with 50 points. */
export function loopClosingCandidates(first: ChordSymbol, key: EstimatedKey): readonly LoopClosingCandidate[] {
  const candidates: LoopClosingCandidate[] = [
    { nextDeg: (first.root + 7) % 12, baseQuality: "dom7", category: "定番", points: 50, role: "loop-dominant" },
    { nextDeg: (first.root + 7) % 12, baseQuality: "dom7sus4", category: "定番", points: 50, role: "loop-dominant" },
    { nextDeg: (first.root + 1) % 12, baseQuality: "dom7", category: "展開", points: 50, role: "loop-tritone" },
  ];
  // The subdominant minor of the key's first chord (0:maj), not necessarily C.
  if (key.mode === "major" && first.root % 12 === key.tonic && first.quality.startsWith("maj")) {
    candidates.push({ nextDeg: (first.root + 5) % 12, baseQuality: "min7", category: "展開", points: 50, role: "loop-sdm" });
  }
  return candidates;
}

export type Texture = "triad" | "seventh" | "rich";

/** v3 §3.4 (with the v4 change that a major V's rich form is 13, a minor V's is 7alt). */
export function convertQuality(
  base: BaseQuality,
  texture: Texture,
  mode: KeyMode,
  nextDeg: number,
): { readonly quality: ChordQuality; readonly tensions: readonly Tension[]; readonly altered: boolean } {
  const majorV = mode === "major" && nextDeg === 7;
  switch (base) {
    case "maj7":
      return texture === "triad" ? { quality: "maj", tensions: [], altered: false }
        : texture === "seventh" ? { quality: "maj7", tensions: [], altered: false }
          : { quality: "maj9", tensions: [], altered: false };
    case "min7":
      return texture === "triad" ? { quality: "min", tensions: [], altered: false }
        : texture === "seventh" ? { quality: "min7", tensions: [], altered: false }
          : { quality: "min9", tensions: [], altered: false };
    case "dom7":
      if (texture === "rich") return majorV ? { quality: "dom13", tensions: [], altered: false } : { quality: "dom7", tensions: [], altered: true };
      return { quality: "dom7", tensions: [], altered: false };
    case "dom7sus4":
      return texture === "triad" ? { quality: "sus4", tensions: [], altered: false }
        : texture === "seventh" ? { quality: "dom7sus4", tensions: [], altered: false }
          : { quality: "dom7sus4", tensions: ["13"], altered: false };
    case "dom9":
      return texture === "triad" ? { quality: "maj", tensions: [], altered: false }
        : { quality: "dom9", tensions: [], altered: false };
    case "min7b5":
      return { quality: "min7b5", tensions: [], altered: false };
    case "min6":
      return { quality: "min6", tensions: [], altered: false };
    case "dim7":
      return { quality: "dim7", tensions: [], altered: false };
    case "aug":
      return { quality: "aug", tensions: [], altered: false };
    default:
      return { quality: "maj", tensions: [], altered: false };
  }
}

/** The candidate chord for a converted quality (no label yet; the caller spells it in the key). */
export function candidateChord(root: number, converted: { quality: ChordQuality; tensions: readonly Tension[]; altered: boolean }, bass?: number): ChordSymbol {
  const symbol = makeChordSymbol(root, converted.quality, [...converted.tensions], bass);
  return converted.altered ? { ...symbol, altered: true } : symbol;
}

/** v3 §5.3 reasons (the gram/loop variants are chosen by the caller). */
export function reasonFor(category: SuggestionCategory, detail?: { readonly gram?: boolean; readonly loop?: boolean; readonly tasteCount?: number }): string {
  if (category === "定番") {
    if (detail?.loop) return "ループの先頭へ戻る候補";
    if (detail?.gram) return "定番の流れ（王道進行など）に合う候補";
    return "前のコードとキーから和声的につながる定番の候補";
  }
  if (category === "展開") return "転調感や彩りを足す展開の候補";
  if (category === "なめらか") return "ベースや内声の動きがなめらかな候補";
  return detail?.tasteCount !== undefined
    ? `あなたの Vault でよく続く流れ（${detail.tasteCount} 件）`
    : "今の流れに合い、あなたの Vault の響き・度数の傾向に近い候補";
}

/** The chart's texture (v3 §3.4): any rich chord makes it rich, 60% triads make it triad, else seventh. */
export function textureOfChords(chords: readonly ChordSymbol[]): Texture {
  const rich = new Set<ChordQuality>(["maj9", "min9", "min11", "dom9", "dom13", "dom11", "add9", "sixNine"]);
  if (chords.some((chord) => rich.has(chord.quality) || chord.altered || chord.tensions.length > 0)) return "rich";
  const triad = new Set<ChordQuality>(["maj", "min", "sus2", "sus4", "power"]);
  if (chords.length > 0 && chords.filter((chord) => triad.has(chord.quality)).length / chords.length >= 0.6) return "triad";
  return "seventh";
}

/** v4 change 6: the key's seven chords, in degree order, with the chart's texture. */
export function keyChordsFor(key: EstimatedKey, texture: Texture): readonly { readonly chord: ChordSymbol; readonly label: string }[] {
  const recipes: readonly [number, BaseQuality][] = key.mode === "major"
    ? [[0, "maj7"], [2, "min7"], [4, "min7"], [5, "maj7"], [7, "dom7"], [9, "min7"], [11, "min7b5"]]
    : [[0, "min7"], [2, "min7b5"], [3, "maj7"], [5, "min7"], [7, "dom7"], [8, "maj7"], [10, "dom7"]];
  return recipes.map(([deg, base]) => {
    const converted = convertQuality(base, texture, key.mode, deg);
    const chord = candidateChord((key.tonic + deg) % 12, converted);
    return { chord, label: formatChordSymbol(chord, { keyContext: keyContextFor(key) }) };
  });
}
