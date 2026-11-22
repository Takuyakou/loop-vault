import { DRILL_KEY_NAMES } from "./voicingDrill";
import type { DrillRecordCard, DrillStageKey, VoicingDrillRecords } from "./voicingDrillRecords";

/**
 * P19 ボイシングドリル: reading the record for the screens (spec §2, §4). The record is grouped by set → the revision of
 * the set's content → key → ①/②; only the current revision is compared with, the older ones are shown apart.
 */
export interface DrillLapValue {
  readonly totalMs: number;
  readonly cardMs: readonly number[];
  readonly at: string;
}
export interface DrillEntryValue {
  readonly laps: number;
  readonly best?: DrillLapValue;
  readonly last?: DrillLapValue & { readonly marks: readonly number[] };
}
export interface DrillBest {
  readonly totalMs: number;
  readonly key: number;
  readonly stage: DrillStageKey;
}
export interface DrillSlowCard {
  readonly index: number;
  readonly label: string;
  readonly form: "A" | "B" | null;
  readonly ms: number;
  readonly marked: boolean;
}

const STAGES: readonly DrillStageKey[] = ["see", "recall"];

export const drillEntryFor = (
  file: VoicingDrillRecords,
  setId: string,
  revision: string,
  key: number,
  stage: DrillStageKey,
): DrillEntryValue | undefined => file.sets[setId]?.[revision]?.keys[String(key)]?.[stage] as DrillEntryValue | undefined;

/** The current content revision of a set, and the ones before it (an old record still says what it timed). */
export function drillRevisionList(file: VoicingDrillRecords, setId: string): readonly string[] {
  return Object.keys(file.sets[setId] ?? {});
}

/** The fastest lap of a set in the current revision; `stages` limits it to ① or ②. */
export function drillBestOfSet(
  file: VoicingDrillRecords,
  setId: string,
  revision: string,
  stages: readonly DrillStageKey[] = STAGES,
): DrillBest | undefined {
  let best: DrillBest | undefined;
  for (const key of Array.from({ length: 12 }, (_, index) => index)) {
    for (const stage of stages) {
      const lap = drillEntryFor(file, setId, revision, key, stage)?.best;
      if (lap && (!best || lap.totalMs < best.totalMs)) best = { totalMs: lap.totalMs, key, stage };
    }
  }
  return best;
}

/** The fastest lap of one key in the current revision (both stages unless one is given). */
export function drillBestOfKey(
  file: VoicingDrillRecords,
  setId: string,
  revision: string,
  key: number,
  stage?: DrillStageKey,
): DrillBest | undefined {
  let best: DrillBest | undefined;
  for (const entryStage of stage ? [stage] : STAGES) {
    const lap = drillEntryFor(file, setId, revision, key, entryStage)?.best;
    if (lap && (!best || lap.totalMs < best.totalMs)) best = { totalMs: lap.totalMs, key, stage: entryStage };
  }
  return best;
}

/** The best of each of the twelve keys for one stage (`undefined` where it was never played through). */
export function drillKeyBests(
  file: VoicingDrillRecords,
  setId: string,
  revision: string,
  stage: DrillStageKey,
): readonly (number | undefined)[] {
  return Array.from({ length: 12 }, (_, key) => drillEntryFor(file, setId, revision, key, stage)?.best?.totalMs);
}

/** The last lap recorded for a stage: the newest one, and the key it was played in. */
export function drillNewestLast(
  file: VoicingDrillRecords,
  setId: string,
  revision: string,
  stage: DrillStageKey,
): { readonly key: number; readonly last: NonNullable<DrillEntryValue["last"]> } | undefined {
  let newest: { key: number; last: NonNullable<DrillEntryValue["last"]> } | undefined;
  for (const key of Array.from({ length: 12 }, (_, index) => index)) {
    const last = drillEntryFor(file, setId, revision, key, stage)?.last;
    if (last && (!newest || Date.parse(last.at) > Date.parse(newest.last.at))) newest = { key, last };
  }
  return newest;
}

/** Every previous content revision that still has a best (shown as 「中身が変わる前の記録」). */
export function drillPriorRevisions(
  file: VoicingDrillRecords,
  setId: string,
  revision: string,
): readonly { readonly revision: string; readonly best: DrillBest }[] {
  return drillRevisionList(file, setId)
    .filter((candidate) => candidate !== revision)
    .flatMap((candidate) => {
      const best = drillBestOfSet(file, setId, candidate);
      return best ? [{ revision: candidate, best }] : [];
    });
}

/** The cards of one lap, the slowest first (「遅い順」). */
export function drillSlowCards(
  cards: readonly Pick<DrillRecordCard, "label" | "form">[],
  cardMs: readonly number[],
  marks: readonly number[],
  limit = Number.POSITIVE_INFINITY,
): readonly DrillSlowCard[] {
  return cards
    .map((card, index) => ({
      index,
      label: card.label,
      form: card.form,
      ms: cardMs[index] ?? 0,
      marked: marks.includes(index),
    }))
    .sort((a, b) => b.ms - a.ms || a.index - b.index)
    .slice(0, limit);
}

/** The total the self best had reached when the card at `index` was done (for 「+1.2 秒」). */
export const drillPaceTotal = (best: DrillLapValue | undefined, index: number): number | undefined =>
  best ? best.cardMs.slice(0, index + 1).reduce((sum, ms) => sum + ms, 0) : undefined;

/** One decimal place, as the record is shown: 「12.4」. */
export const formatDrillSeconds = (ms: number) => (ms / 1000).toFixed(1);
/** 「12.4 秒」 */
export const formatDrillLap = (ms: number) => `${formatDrillSeconds(ms)} 秒`;
/** 「F♯」 */
export const drillKeyName = (key: number) => DRILL_KEY_NAMES[key] ?? String(key);
