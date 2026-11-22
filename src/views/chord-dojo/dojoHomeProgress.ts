import { figuresOf } from "../../domain/earPractice/earStats";
import type { EarChordRecord } from "../../domain/earPractice/earRecords";
import { DRILL_SETS, drillSetRevision } from "../../domain/chordDojo/voicingDrill";
import { DRILL_STAGE_LABELS } from "./voicingDrillLabels";
import { drillEntryFor, type DrillStageKey, type VoicingDrillRecords } from "../../domain/chordDojo/voicingDrillRecords";

/**
 * P20: the numbers the home shows, read from the existing records only. No practice record is written here.
 */
export interface LapFile {
  readonly laps: Partial<Record<string, Record<string, { count: number }>>>;
}

/** How many of the current progressions have at least one completed lap in any key. */
export function completionOf(ids: readonly string[], file: LapFile | undefined): { readonly done: number; readonly total: number } {
  const done = ids.filter((id) => Object.values(file?.laps[id] ?? {}).some((lap) => lap.count > 0)).length;
  return { done, total: ids.length };
}

export interface DrillHomeBest {
  readonly setId: string;
  readonly key: number;
  readonly stage: DrillStageKey;
  readonly bestMs: number;
  readonly at: string;
}

/**
 * The best of the newest drill practice in the current content revision. A different set's best is never compared:
 * the sets have different card counts. Old content revisions are ignored.
 */
export function newestDrillBest(file: VoicingDrillRecords | undefined): DrillHomeBest | undefined {
  if (!file) return undefined;
  let newest: { setId: string; key: number; stage: DrillStageKey; at: string } | undefined;
  for (const set of DRILL_SETS) {
    const revision = drillSetRevision(set.id);
    for (let key = 0; key < 12; key += 1) {
      for (const stage of ["see", "recall"] as const) {
        const entry = drillEntryFor(file, set.id, revision, key, stage);
        const last = entry?.last ?? entry?.best;
        if (!last) continue;
        if (!newest || Date.parse(last.at) > Date.parse(newest.at)) newest = { setId: set.id, key, stage, at: last.at };
      }
    }
  }
  if (!newest) return undefined;
  const best = drillEntryFor(file, newest.setId, drillSetRevision(newest.setId), newest.key, newest.stage)?.best;
  return best ? { ...newest, bestMs: best.totalMs } : undefined;
}

/**
 * The home's ear "score": the first-try rate of the measured chords of one question, 0-100 (the same figures the ear
 * records screen uses). The newest question is 「前回」; the highest is 「ベスト」. Questions with no measured chord are
 * not a score.
 */
export function earHomeScore(records: readonly EarChordRecord[]): { readonly last?: number; readonly best?: number; readonly lastAt?: string } {
  const plays = new Map<string, EarChordRecord[]>();
  for (const record of records) plays.set(record.play, [...(plays.get(record.play) ?? []), record]);
  let last: { at: string; score: number } | undefined;
  let best: number | undefined;
  for (const own of plays.values()) {
    const figures = figuresOf(own);
    if (figures.measured === 0 || figures.firstTryRate === undefined) continue;
    const score = Math.round(figures.firstTryRate * 100);
    const at = own.reduce((latest, record) => record.at > latest ? record.at : latest, own[0]!.at);
    if (!last || at > last.at) last = { at, score };
    if (best === undefined || score > best) best = score;
  }
  return { ...(last ? { last: last.score, lastAt: last.at } : {}), ...(best !== undefined ? { best } : {}) };
}

/** The four stages with how many sets each has (5・5・3・7). */
export const drillStageCounts = [1, 2, 3, 4].map((stage) => ({
  stage: stage as 1 | 2 | 3 | 4,
  label: DRILL_STAGE_LABELS[stage as 1 | 2 | 3 | 4],
  count: DRILL_SETS.filter((set) => set.stage === stage).length,
}));
