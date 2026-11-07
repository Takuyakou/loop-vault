import { median } from "./earClock";
import { EAR_KINDS, EAR_MOVE_NAMES, type EarChordRecord } from "./earRecords";
import type { EarLevel } from "./levels";

/** Under this many chords a figure is shown faint with 「まだ少ない」. */
export const FEW_CHORDS = 10;
/** A kind or a move needs this many chords before it can be called a weak point. */
export const MIN_WEAK_CHORDS = 8;
/** The level guide (Stage 03 §4.5). */
export const LEVEL_GUIDE = { chords: 40, progressions: 5, rate: 0.8, seconds: 4, window: 40 } as const;
export const BENCHMARK_GAP_DAYS = 7;
/** What every 腕試し is played with (the question and its key are fixed by the bank). */
export const BENCHMARK_CONDITIONS = { bpm: 90, showFirstName: true, autoPlay: true, questions: 4 } as const;

const JST_MS = 9 * 3600_000;
const WEEK_MS = 7 * 24 * 3600_000;

/** The Monday (`YYYY-MM-DD`, Japan time) of the calendar week an instant falls in. */
export function weekStartOf(at: string | number | Date): string {
  const shifted = new Date(new Date(at).getTime() + JST_MS);
  const back = (shifted.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - back)).toISOString().slice(0, 10);
}
export const addWeeks = (weekStart: string, weeks: number): string =>
  new Date(Date.parse(`${weekStart}T00:00:00Z`) + weeks * WEEK_MS).toISOString().slice(0, 10);

/** A chord that counts toward the figures: not shown from the start, not judged by the player, judged in the main way. */
export const isMeasured = (record: EarChordRecord): boolean => !record.given && !record.manual && record.judge !== "sounded" && !record.degreeShown;
const isFirstTry = (record: EarChordRecord) => record.wrongs === 0 && record.hint === 0;

export interface EarFigures {
  /** Every chord of the group. */
  chords: number;
  /** The chords that count. */
  measured: number;
  firstTry: number;
  noHint: number;
  /** First try with no listening again either. */
  cleanFirstTry: number;
  firstTryRate?: number;
  noHintRate?: number;
  cleanRate?: number;
  /** Median seconds of the chords that count and had no hint. */
  medianSec?: number;
  replayAvg?: number;
  /** Fewer than {@link FEW_CHORDS}: shown faint. */
  few: boolean;
}

const rate = (part: number, whole: number) => (whole ? part / whole : undefined);

export function figuresOf(records: readonly EarChordRecord[]): EarFigures {
  const measured = records.filter(isMeasured);
  const seconds = measured.filter((r) => r.hint === 0 && r.seconds !== undefined).map((r) => r.seconds!);
  const firstTry = measured.filter(isFirstTry).length;
  const noHint = measured.filter((r) => r.hint === 0).length;
  const cleanFirstTry = measured.filter((r) => isFirstTry(r) && r.replays === 0).length;
  const n = measured.length;
  return {
    chords: records.length,
    measured: n,
    firstTry,
    noHint,
    cleanFirstTry,
    firstTryRate: rate(firstTry, n),
    noHintRate: rate(noHint, n),
    cleanRate: rate(cleanFirstTry, n),
    ...(seconds.length ? { medianSec: median(seconds) } : {}),
    ...(n ? { replayAvg: measured.reduce((sum, r) => sum + r.replays, 0) / n } : {}),
    few: n < FEW_CHORDS,
  };
}

/** The chords judged by the sounded notes: a separate small figure, never mixed in. */
export function soundedFiguresOf(records: readonly EarChordRecord[]): { chords: number; firstTry: number; firstTryRate?: number } {
  const sounded = records.filter((r) => !r.given && !r.manual && r.judge === "sounded");
  const firstTry = sounded.filter(isFirstTry).length;
  return { chords: sounded.length, firstTry, firstTryRate: rate(firstTry, sounded.length) };
}

/** The chords whose degree and function were on the card before the answer: a small figure of their own. */
export function degreeFiguresOf(records: readonly EarChordRecord[]): { chords: number; firstTry: number; firstTryRate?: number } {
  const shown = records.filter((r) => !r.given && !r.manual && r.degreeShown);
  const firstTry = shown.filter(isFirstTry).length;
  return { chords: shown.length, firstTry, firstTryRate: rate(firstTry, shown.length) };
}

export const forLevel = (records: readonly EarChordRecord[], level: EarLevel | "all"): EarChordRecord[] =>
  level === "all" ? [...records] : records.filter((r) => r.level === level);

const byTime = (a: EarChordRecord, b: EarChordRecord) => a.at.localeCompare(b.at) || a.index - b.index;

export interface EarWeek {
  weekStart: string;
  figures: EarFigures;
}

/** The weeks from `weeks - 1` weeks ago to this one (oldest first), each with its figures. */
export function weeklySeries(records: readonly EarChordRecord[], now: Date, level: EarLevel | "all" = "all", weeks = 12): EarWeek[] {
  const thisWeek = weekStartOf(now);
  const wanted = forLevel(records, level);
  return Array.from({ length: weeks }, (_, offset) => {
    const weekStart = addWeeks(thisWeek, offset - (weeks - 1));
    return { weekStart, figures: figuresOf(wanted.filter((r) => weekStartOf(r.at) === weekStart)) };
  });
}

/** This week (this week's Monday until now) next to last week (the Monday to Sunday before). */
export function thisAndLastWeek(records: readonly EarChordRecord[], now: Date, level: EarLevel | "all" = "all") {
  const [last, current] = weeklySeries(records, now, level, 2);
  return { thisWeek: current!, lastWeek: last! };
}

export interface EarWeakSpot {
  name: string;
  /** The kind group, or the move in semitones. */
  key: string | number;
  measured: number;
  firstTryRate: number;
}

function lowest<T extends { measured: number; firstTryRate: number }>(spots: T[], order: (spot: T) => number): T[] {
  return spots
    .filter((spot) => spot.measured >= MIN_WEAK_CHORDS)
    .sort((a, b) => a.firstTryRate - b.firstTryRate || b.measured - a.measured || order(a) - order(b))
    .slice(0, 3);
}

/** The three kinds of chord with the lowest first-try rate among those with {@link MIN_WEAK_CHORDS} chords or more. */
export function weakKinds(records: readonly EarChordRecord[], level: EarLevel | "all" = "all"): EarWeakSpot[] {
  const measured = forLevel(records, level).filter(isMeasured);
  const spots = EAR_KINDS.flatMap((kind) => {
    const own = measured.filter((r) => r.kind === kind);
    return own.length ? [{ name: kind as string, key: kind as string | number, measured: own.length, firstTryRate: own.filter(isFirstTry).length / own.length }] : [];
  });
  return lowest(spots, (spot) => EAR_KINDS.indexOf(spot.key as (typeof EAR_KINDS)[number]));
}

/** The same for the step of the root from the chord before (bank questions, where the progression is the point). */
export function weakMoves(records: readonly EarChordRecord[], level: EarLevel | "all" = "all"): EarWeakSpot[] {
  const measured = forLevel(records, level).filter((r) => isMeasured(r) && r.source === "bank" && r.move !== undefined);
  const spots = EAR_MOVE_NAMES.flatMap((name, move) => {
    const own = measured.filter((r) => r.move === move);
    return own.length ? [{ name, key: move as string | number, measured: own.length, firstTryRate: own.filter(isFirstTry).length / own.length }] : [];
  });
  return lowest(spots, (spot) => spot.key as number);
}

export type EarGuideState =
  /** Enough chords and progressions, and the figures are there. */
  | "stable"
  /** Enough chords and progressions, the figures are not there yet (nothing is said). */
  | "enough"
  /** Not enough yet, and the figures so far are there. */
  | "on-track"
  | "none";

export interface EarLevelGuide {
  level: EarLevel;
  /** Chords that count at this level. */
  chords: number;
  progressions: number;
  /** Over the last {@link LEVEL_GUIDE.window} chords. */
  firstTryRate?: number;
  medianSec?: number;
  state: EarGuideState;
  needChords: number;
  needProgressions: number;
}

export function levelGuide(records: readonly EarChordRecord[], level: EarLevel): EarLevelGuide {
  const measured = records.filter((r) => r.level === level && isMeasured(r)).sort(byTime);
  const recent = figuresOf(measured.slice(-LEVEL_GUIDE.window));
  const progressions = new Set(measured.map((r) => r.questionId)).size;
  const needChords = Math.max(0, LEVEL_GUIDE.chords - measured.length);
  const needProgressions = Math.max(0, LEVEL_GUIDE.progressions - progressions);
  const good = recent.firstTryRate !== undefined && recent.firstTryRate >= LEVEL_GUIDE.rate
    && recent.medianSec !== undefined && recent.medianSec <= LEVEL_GUIDE.seconds;
  const enough = needChords === 0 && needProgressions === 0;
  const state: EarGuideState = enough ? (good ? "stable" : "enough") : good && measured.length >= FEW_CHORDS ? "on-track" : "none";
  return {
    level,
    chords: measured.length,
    progressions,
    ...(recent.firstTryRate !== undefined ? { firstTryRate: recent.firstTryRate } : {}),
    ...(recent.medianSec !== undefined ? { medianSec: recent.medianSec } : {}),
    state,
    needChords,
    needProgressions,
  };
}

export interface EarBenchmarkResult {
  run: string;
  level: EarLevel;
  at: string;
  figures: EarFigures;
  /** Steps of hints taken, and times listened again, over every chord of the run. */
  hints: number;
  replays: number;
}

/** Every benchmark run (oldest first). */
export function benchmarkRuns(records: readonly EarChordRecord[]): EarBenchmarkResult[] {
  const runs = new Map<string, EarChordRecord[]>();
  for (const record of records) {
    if (record.benchmark === undefined || record.run === undefined) continue;
    runs.set(record.run, [...(runs.get(record.run) ?? []), record]);
  }
  return [...runs.entries()]
    // a benchmark left half way is not a result to compare with
    .filter(([, own]) => new Set(own.map((r) => r.questionId)).size >= BENCHMARK_CONDITIONS.questions)
    .map(([run, own]) => ({
      run,
      level: own[0]!.benchmark!,
      at: own.reduce((latest, r) => (r.at > latest ? r.at : latest), own[0]!.at),
      figures: figuresOf(own),
      hints: own.reduce((sum, r) => sum + r.hint, 0),
      replays: own.reduce((sum, r) => sum + r.replays, 0),
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** The last benchmark of a level and the one before it. */
export function lastBenchmarks(records: readonly EarChordRecord[], level: EarLevel) {
  const runs = benchmarkRuns(records).filter((run) => run.level === level);
  return { last: runs[runs.length - 1], before: runs[runs.length - 2] };
}

/** True when the last benchmark of the level was less than 7 days ago (a notice, never a stop). */
export function benchmarkTooSoon(records: readonly EarChordRecord[], level: EarLevel, now: Date): boolean {
  const last = lastBenchmarks(records, level).last;
  return last !== undefined && now.getTime() - Date.parse(last.at) < BENCHMARK_GAP_DAYS * 24 * 3600_000;
}

export interface EarRecentComparison {
  /** How many questions it was compared with. */
  plays: number;
  figures: EarFigures;
}

/** The last (up to) 10 questions of the same level and length, not counting the one just played. */
export function recentComparison(
  records: readonly EarChordRecord[],
  options: { level: EarLevel; length: number; excludePlay: string; limit?: number },
): EarRecentComparison {
  const plays = new Map<string, EarChordRecord[]>();
  for (const record of records) {
    if (record.level !== options.level || record.length !== options.length || record.play === options.excludePlay) continue;
    plays.set(record.play, [...(plays.get(record.play) ?? []), record]);
  }
  const latest = [...plays.values()]
    .sort((a, b) => b[0]!.at.localeCompare(a[0]!.at))
    .slice(0, options.limit ?? 10);
  return { plays: latest.length, figures: figuresOf(latest.flat()) };
}
