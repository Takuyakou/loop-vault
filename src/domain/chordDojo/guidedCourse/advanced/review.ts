import { ADVANCED_LEVELS, TWELVE_KEYS, advancedLevelSpec, type AdvancedBlock, type AdvancedCourseLevel } from "./levels";
import { advancedItemById, advancedSetIds, ADVANCED_LEVEL_ORDER, LV8_GROUPS, recheckIdsFor } from "./bank";
import { delayEligibility, nextDelayAvailableAt } from "../review";
import type { AdvancedAttempt, AdvancedItem, AdvancedStore, AdvancedTrial } from "./types";

/**
 * P23-45 evaluation and planning. It mirrors the Lv1–3 rules:
 * - one *completed* attempt per block is evaluated, and a retry is always a new attempt id;
 * - independent evidence is a MIDI-confirmed answer without a hint;
 * - the delayed block must start on a later local day and at least 12 h after the same-day block;
 * - free practice is filtered out of every formal count.
 *
 * The advanced course adds per-part thresholds, Lv6 key coverage across attempts, Lv8 group passes,
 * and the capstone's 3-second ratio and per-chart sight rule.
 */
export interface AdvancedPartReport {
  readonly id: string;
  readonly label: string;
  readonly required: number;
  readonly evaluated: number;
  readonly correct: number;
  readonly independentCorrect: number;
  readonly pass: number;
  readonly ok: boolean;
}

export interface AdvancedSpeedReport {
  readonly correct: number;
  readonly withinLimit: number;
  readonly ratio: number;
  readonly requiredRatio: number;
  readonly ok: boolean;
}

export interface AdvancedBlockReport {
  readonly block: AdvancedBlock;
  readonly setId: string;
  readonly attemptId?: string;
  readonly required: number;
  readonly evaluated: number;
  readonly correct: number;
  readonly independentCorrect: number;
  readonly hintAssisted: number;
  readonly selfConfirmed: number;
  readonly parts: readonly AdvancedPartReport[];
  readonly missingItemIds: readonly string[];
  readonly ok: boolean;
  readonly speed?: AdvancedSpeedReport;
}

export interface AdvancedDates {
  readonly sameDayCompletedAt?: string;
  readonly delayedStartedAt?: string;
  readonly elapsedMs?: number;
  readonly sameLocalDate: boolean;
  readonly eligible: boolean;
  readonly reason?: string;
}

export interface AdvancedGroupEvaluation {
  readonly group: string;
  readonly label: string;
  readonly sameDay: AdvancedBlockReport;
  readonly delay: AdvancedBlockReport;
  readonly dates: AdvancedDates;
  readonly passed: boolean;
}

export interface AdvancedEvaluation {
  readonly level: AdvancedCourseLevel;
  readonly mode: "midi" | "self";
  readonly complete: boolean;
  readonly passed: boolean;
  readonly sameDayPassed: boolean;
  readonly delayPassed: boolean;
  readonly sameDay: AdvancedBlockReport;
  readonly delay: AdvancedBlockReport;
  readonly groups?: readonly AdvancedGroupEvaluation[];
  readonly missingKeys: readonly number[];
  readonly dates: AdvancedDates;
  readonly reasons: readonly string[];
}

export type AdvancedPlan =
  | { readonly kind: "question"; readonly level: AdvancedCourseLevel; readonly block: AdvancedBlock; readonly setId: string; readonly group?: string; readonly attempt: AdvancedAttempt; readonly item: AdvancedItem; readonly index: number; readonly total: number }
  | { readonly kind: "block-result"; readonly level: AdvancedCourseLevel; readonly block: AdvancedBlock; readonly setId: string; readonly group?: string; readonly attemptId: string; readonly evaluation: AdvancedEvaluation; readonly report: AdvancedBlockReport }
  | { readonly kind: "start"; readonly level: AdvancedCourseLevel; readonly block: AdvancedBlock; readonly setId: string; readonly group?: string; readonly itemIds: readonly string[] }
  | { readonly kind: "recheck"; readonly level: AdvancedCourseLevel; readonly itemIds: readonly string[]; readonly keys: readonly number[] }
  | { readonly kind: "delay-wait"; readonly level: AdvancedCourseLevel; readonly group?: string; readonly availableAt: string; readonly reason: string; readonly sameDayCompletedAt?: string }
  | { readonly kind: "finished"; readonly evaluation: AdvancedEvaluation };

export type AdvancedPracticePlan =
  | { readonly kind: "question"; readonly level: AdvancedCourseLevel; readonly block: AdvancedBlock; readonly setId: string; readonly group?: string; readonly attempt: AdvancedAttempt; readonly item: AdvancedItem; readonly index: number; readonly total: number }
  | { readonly kind: "practice-result"; readonly level: AdvancedCourseLevel; readonly attemptId: string; readonly correct: number; readonly total: number }
  | { readonly kind: "start"; readonly level: AdvancedCourseLevel; readonly block: AdvancedBlock; readonly setId: string; readonly group?: string; readonly itemIds: readonly string[] };

function isIndependent(trial: AdvancedTrial): boolean {
  return trial.result === "correct" && trial.midiConfirmed && !trial.hintUsed;
}

function timeOf(trial: AdvancedTrial): number {
  const ms = Date.parse(trial.sealedAt);
  return Number.isFinite(ms) ? ms : 0;
}

/** Latest non-invalid trial per item for one attempt. */
function answeredTrials(store: AdvancedStore, attempt: AdvancedAttempt): Map<string, AdvancedTrial> {
  const latest = new Map<string, AdvancedTrial>();
  for (const trial of store.trials) {
    if (trial.attemptId !== attempt.attemptId || trial.result === "invalid") continue;
    const previous = latest.get(trial.itemId);
    if (previous === undefined || timeOf(trial) >= timeOf(previous)) latest.set(trial.itemId, trial);
  }
  return latest;
}

function attemptComplete(store: AdvancedStore, attempt: AdvancedAttempt): boolean {
  const answered = answeredTrials(store, attempt);
  return attempt.itemIds.every((id) => answered.has(id));
}

/**
 * P23-47-fix-2: the wrong / incomplete items of one attempt, in the attempt's original order.
 * Invalid and no-input trials and hint-assisted correct answers never enter the list.
 */
export function wrongAdvancedItemIdsFor(store: AdvancedStore, attemptId: string): readonly string[] {
  const attempt = store.attempts.find((entry) => entry.attemptId === attemptId);
  if (attempt === undefined) return [];
  const latest = answeredTrials(store, attempt);
  return attempt.itemIds.filter((id) => {
    const trial = latest.get(id);
    if (trial === undefined || trial.result === "invalid" || trial.result === "no-input") return false;
    return trial.result === "wrong" || trial.result === "incomplete";
  });
}

/** P23-55: a correct chord-name answer slower than this (no hint) is "迷った" — practised again, never scored. */
export const ADVANCED_HESITATION_MS = 2500;

/**
 * P23-55: wrong items plus correct single chord-name answers slower than {@link ADVANCED_HESITATION_MS}
 * without a hint, in the attempt's order. Progressions, ear and sight questions are timed differently, so
 * only their wrong answers count.
 */
export function weakAdvancedItemIdsFor(store: AdvancedStore, attemptId: string): { readonly ids: readonly string[]; readonly wrong: number; readonly slow: number } {
  const attempt = store.attempts.find((entry) => entry.attemptId === attemptId);
  if (attempt === undefined) return { ids: [], wrong: 0, slow: 0 };
  const latest = answeredTrials(store, attempt);
  let wrong = 0;
  let slow = 0;
  const ids = attempt.itemIds.filter((id) => {
    const trial = latest.get(id);
    if (trial === undefined || trial.result === "invalid" || trial.result === "no-input") return false;
    if (trial.result === "wrong" || trial.result === "incomplete") { wrong += 1; return true; }
    const item = advancedItemById(id);
    const timed = item !== undefined && item.prompt === "name" && item.chords.length === 1;
    if (trial.result === "correct" && !trial.hintUsed && timed && (trial.speedMs ?? 0) > ADVANCED_HESITATION_MS) { slow += 1; return true; }
    return false;
  });
  return { ids, wrong, slow };
}

/** P23-55: the latest completed official attempt of one set (Lv8: of one group), for the weak-practice button on the map. */
export function latestAdvancedAttemptId(store: AdvancedStore, level: AdvancedCourseLevel, block: AdvancedBlock, group?: string): string | undefined {
  return latestAttempt(store, level, block, level === 8 ? group : block)?.attemptId;
}

/** P23-47: the round boundary of one level (undefined when the level was never restarted). */
export function advancedRoundStartedAt(store: AdvancedStore, level: AdvancedCourseLevel): string | undefined {
  return store.rounds?.[String(level)]?.startedAt;
}

function inCurrentRound(store: AdvancedStore, level: AdvancedCourseLevel, attempt: AdvancedAttempt): boolean {
  const boundary = advancedRoundStartedAt(store, level);
  return boundary === undefined || Date.parse(attempt.startedAt) >= Date.parse(boundary);
}

/** The latest completed official attempt of one set. */
function latestAttempt(store: AdvancedStore, level: AdvancedCourseLevel, block: AdvancedBlock, setId?: string): AdvancedAttempt | undefined {
  const completed = store.attempts
    .filter((attempt) => !attempt.practice && attempt.level === level && attempt.block === block && (setId === undefined || attempt.setId === setId) && inCurrentRound(store, level, attempt) && attemptComplete(store, attempt))
    .map((attempt) => {
      const trials = answeredTrials(store, attempt);
      return { attempt, last: Math.max(...[...trials.values()].map(timeOf)) };
    })
    .sort((left, right) => left.last - right.last);
  return completed[completed.length - 1]?.attempt;
}

function modeFromReports(store: AdvancedStore, attempts: readonly (AdvancedAttempt | undefined)[]): "midi" | "self" {
  const ids = new Set(attempts.filter((attempt): attempt is AdvancedAttempt => attempt !== undefined).map((attempt) => attempt.attemptId));
  return store.trials.some((trial) => ids.has(trial.attemptId) && trial.midiConfirmed) ? "midi" : "self";
}

/**
 * A block report over one or more completed attempts. Lv8 passes the three group attempts; their item
 * ids are disjoint, so merging their answered trials can never fake a group's completeness.
 */
function blockReport(
  store: AdvancedStore,
  level: AdvancedCourseLevel,
  block: AdvancedBlock,
  expectedIds: readonly string[],
  attempts: readonly AdvancedAttempt[],
): AdvancedBlockReport {
  const spec = advancedLevelSpec(level);
  const partsSpec = block === "sameDay" ? spec.sameDay.parts : spec.delay.parts;
  const answered = new Map<string, AdvancedTrial>();
  for (const attempt of attempts) {
    for (const [id, trial] of answeredTrials(store, attempt)) answered.set(id, trial);
  }
  const items = expectedIds.map((id) => advancedItemById(id)).filter((item): item is AdvancedItem => item !== undefined);
  const present = items.filter((item) => answered.has(item.id));
  const parts: AdvancedPartReport[] = [];
  for (const part of partsSpec) {
    const partItems = items.filter((item) => item.part === part.id);
    if (partItems.length === 0) continue;
    const partTrials = partItems.map((item) => answered.get(item.id)).filter((trial): trial is AdvancedTrial => trial !== undefined);
    const answeredInPart = partItems.filter((item) => answered.has(item.id)).length;
    parts.push({
      id: part.id,
      label: part.label,
      required: partItems.length,
      evaluated: answeredInPart,
      correct: partTrials.filter((trial) => trial.result === "correct").length,
      independentCorrect: partTrials.filter(isIndependent).length,
      pass: part.pass,
      ok: answeredInPart === partItems.length && partTrials.filter(isIndependent).length >= part.pass,
    });
  }
  const missingItemIds = expectedIds.filter((id) => !answered.has(id));
  const complete = attempts.length > 0 && missingItemIds.length === 0;
  const ok = complete && parts.length > 0 && parts.every((part) => part.ok);

  let speed: AdvancedSpeedReport | undefined;
  if (level === "capstone" && block === "sameDay") {
    const namePart = items.filter((item) => item.part === "name");
    const independentCorrect = namePart
      .map((item) => answered.get(item.id))
      .filter((trial): trial is AdvancedTrial => trial !== undefined && isIndependent(trial));
    const withinLimit = independentCorrect.filter((trial) => trial.speedMs !== undefined && trial.speedMs <= 3000).length;
    const ratio = independentCorrect.length === 0 ? 0 : withinLimit / independentCorrect.length;
    speed = { correct: independentCorrect.length, withinLimit, ratio, requiredRatio: 0.8, ok: independentCorrect.length > 0 && ratio >= 0.8 };
  }

  return {
    block,
    setId: attempts[0]?.setId ?? (block === "sameDay" ? "sameDay" : "delay"),
    ...(attempts.length === 1 ? { attemptId: attempts[0]!.attemptId } : {}),
    required: expectedIds.length,
    evaluated: present.length,
    correct: present.filter((item) => answered.get(item.id)!.result === "correct").length,
    independentCorrect: present.filter((item) => isIndependent(answered.get(item.id)!)).length,
    hintAssisted: present.filter((item) => answered.get(item.id)!.hintUsed).length,
    selfConfirmed: present.filter((item) => answered.get(item.id)!.selfConfirmed).length,
    parts,
    missingItemIds,
    ok,
    ...(speed === undefined ? {} : { speed }),
  };
}

function datesFor(sameDayAttempt: AdvancedAttempt | undefined, delayAttempt: AdvancedAttempt | undefined, store: AdvancedStore): AdvancedDates {
  const sameDayTrials = sameDayAttempt === undefined ? [] : [...answeredTrials(store, sameDayAttempt).values()];
  const sameDayCompletedAt = sameDayTrials.length === 0 ? undefined : new Date(Math.max(...sameDayTrials.map(timeOf))).toISOString();
  const delayedStartedAt = delayAttempt?.startedAt;
  const eligibility = delayEligibility(sameDayCompletedAt, delayedStartedAt);
  return {
    ...(sameDayCompletedAt === undefined ? {} : { sameDayCompletedAt }),
    ...(delayedStartedAt === undefined ? {} : { delayedStartedAt }),
    ...(eligibility.elapsedMs === undefined ? {} : { elapsedMs: eligibility.elapsedMs }),
    sameLocalDate: eligibility.sameLocalDate ?? false,
    eligible: delayAttempt !== undefined && sameDayAttempt !== undefined && eligibility.eligible,
    ...(eligibility.reason === undefined ? {} : { reason: eligibility.reason }),
  };
}

function earliestIso(values: readonly (string | undefined)[]): string | undefined {
  const times = values.filter((value): value is string => value !== undefined).map((value) => Date.parse(value)).filter(Number.isFinite);
  return times.length === 0 ? undefined : new Date(Math.min(...times)).toISOString();
}

/** Correct Lv6 keys across every official attempt of the current round (rechecks included). */function lv6CorrectKeys(store: AdvancedStore): Set<number> {
  const keys = new Set<number>();
  const official = new Set(store.attempts
    .filter((attempt) => attempt.level === 6 && !attempt.practice && inCurrentRound(store, 6, attempt))
    .map((attempt) => attempt.attemptId));
  for (const trial of store.trials) {
    if (!official.has(trial.attemptId) || trial.result !== "correct" || trial.hintUsed) continue;
    const item = advancedItemById(trial.itemId);
    if (item?.keyRoot !== undefined) keys.add(item.keyRoot);
  }
  return keys;
}

function lv8Ids(block: AdvancedBlock): readonly string[] {
  return LV8_GROUPS.flatMap((group) => advancedSetIds(8, block, group.id));
}

export function evaluateAdvancedLevel(store: AdvancedStore, level: AdvancedCourseLevel): AdvancedEvaluation {
  const spec = advancedLevelSpec(level);
  const sameDayAttempt = latestAttempt(store, level, "sameDay", level === 8 ? undefined : "sameDay");
  const delayAttempt = latestAttempt(store, level, "delay", level === 8 ? undefined : "delay");
  const sameDay = blockReport(store, level, "sameDay", level === 8 ? lv8Ids("sameDay") : advancedSetIds(level, "sameDay"), sameDayAttempt === undefined ? [] : [sameDayAttempt]);
  const delay = blockReport(store, level, "delay", level === 8 ? lv8Ids("delay") : advancedSetIds(level, "delay"), delayAttempt === undefined ? [] : [delayAttempt]);
  const dates = datesFor(sameDayAttempt, delayAttempt, store);
  const mode = modeFromReports(store, [sameDayAttempt, delayAttempt]);
  const reasons: string[] = [];

  let groups: AdvancedGroupEvaluation[] | undefined;
  if (level === 8) {
    groups = spec.groups!.map((group) => {
      const attempt = latestAttempt(store, 8, "sameDay", group.id);
      const delayForGroup = latestAttempt(store, 8, "delay", group.id);
      const same = blockReport(store, 8, "sameDay", advancedSetIds(8, "sameDay", group.id), attempt === undefined ? [] : [attempt]);
      const later = blockReport(store, 8, "delay", advancedSetIds(8, "delay", group.id), delayForGroup === undefined ? [] : [delayForGroup]);
      const groupDates = datesFor(attempt, delayForGroup, store);
      return {
        group: group.id,
        label: group.label,
        sameDay: same,
        delay: later,
        dates: groupDates,
        passed: same.ok && later.ok && groupDates.eligible,
      };
    });
  }

  const missingKeys = level === 6 ? TWELVE_KEYS.filter((key) => !lv6CorrectKeys(store).has(key)) : [];

  let sameDayPassed = sameDay.ok;
  let delayPassed = delay.ok && dates.eligible;
  if (level === 8) {
    sameDayPassed = groups!.every((group) => group.sameDay.ok);
    delayPassed = groups!.every((group) => group.delay.ok && group.dates.eligible);
  }
  if (level === "capstone" && sameDay.speed !== undefined && !sameDay.speed.ok) sameDayPassed = false;

  const complete = level === 8
    ? groups!.every((group) => group.sameDay.attemptId !== undefined && group.delay.attemptId !== undefined)
    : sameDayAttempt !== undefined && delayAttempt !== undefined;
  let passed = mode === "midi" && sameDayPassed && delayPassed;
  if (level === 6 && missingKeys.length > 0) passed = false;

  if (!complete) reasons.push("同日の確認と別日の確認がそろっていません");
  if (!sameDayPassed) reasons.push("同日の合格条件に届いていません");
  if (!delayPassed) reasons.push("別日の合格条件に届いていません");
  if (level === 6 && missingKeys.length > 0) reasons.push(`未確認のキー: ${missingKeys.join("・")}`);
  if (level === "capstone" && sameDay.speed !== undefined && !sameDay.speed.ok) {
    reasons.push(`速度: 3秒以内 ${sameDay.speed.withinLimit}/${sameDay.speed.correct} が 80% 未満`);
  }
  if (level === 8) {
    for (const group of groups!) {
      if (!group.sameDay.ok) reasons.push(`${group.label}: 同日の合格条件に届いていません`);
      if (!group.delay.ok) reasons.push(`${group.label}: 別日の合格条件に届いていません`);
    }
  }
  if (mode === "self") reasons.push("自己確認は正式合格ではありません（別の進捗区分）");

  const overallDates: AdvancedDates = level === 8 && groups !== undefined
    ? {
      ...dates,
      eligible: groups.every((group) => group.dates.eligible),
      ...(earliestIso(groups.map((group) => group.dates.sameDayCompletedAt)) === undefined ? {} : { sameDayCompletedAt: earliestIso(groups.map((group) => group.dates.sameDayCompletedAt)) }),
    }
    : dates;

  return {
    level,
    mode,
    complete,
    passed,
    sameDayPassed,
    delayPassed,
    sameDay,
    delay,
    ...(groups === undefined ? {} : { groups }),
    missingKeys,
    dates: overallDates,
    reasons,
  };
}

/** First advanced level without a formal pass (undefined when the whole course is passed). */
export function firstUnpassedAdvancedLevel(store: AdvancedStore): AdvancedCourseLevel | undefined {
  for (const level of ADVANCED_LEVEL_ORDER) {
    if (!evaluateAdvancedLevel(store, level).passed) return level;
  }
  return undefined;
}

export interface AdvancedHomeSummary {
  readonly level: AdvancedCourseLevel | undefined;
  readonly levelText: string;
  readonly ability: string;
  readonly label: string;
  readonly remaining: number;
  readonly status: "start" | "resume" | "done";
  readonly previouslyPassed: boolean;
}

/**
 * The home card summary: the next advanced level, whether an official attempt is waiting, and how many
 * questions remain. It never counts practice attempts.
 */
export function advancedHomeSummary(store: AdvancedStore): AdvancedHomeSummary {
  const level = firstUnpassedAdvancedLevel(store);
  if (level === undefined) {
    return { level: undefined, levelText: "総合確認", ability: "覚えた響きを取り出す", label: "総合確認 修了", remaining: 0, status: "done", previouslyPassed: true };
  }
  const spec = advancedLevelSpec(level);
  const previouslyPassed = (store.achievements ?? []).includes(level);
  const active = store.attempts.find((attempt) => attempt.attemptId === store.active && attempt.level === level && !attempt.practice && inCurrentRound(store, level, attempt));
  if (active !== undefined) {
    const answered = new Set<string>();
    for (const trial of store.trials) {
      if (trial.attemptId === active.attemptId && trial.result !== "invalid") answered.add(trial.itemId);
    }
    return {
      level,
      levelText: spec.label,
      ability: spec.ability,
      label: `${spec.label} ${spec.ability}`,
      remaining: active.itemIds.filter((id) => !answered.has(id)).length,
      status: "resume",
      previouslyPassed,
    };
  }
  const nextIds = level === 8 ? advancedSetIds(8, "sameDay", LV8_GROUPS[0]!.id) : advancedSetIds(level, "sameDay");
  return {
    level,
    levelText: spec.label,
    ability: spec.ability,
    label: `${spec.label} ${spec.ability}`,
    remaining: nextIds.length,
    status: "start",
    previouslyPassed,
  };
}

/**
 * P23-47: start a new round for one level. Old attempts and trials stay as history, but the level's
 * evaluation, key evidence and group progress now read only the new round. Other levels keep their
 * attempts, rounds and active/free pointers. A level passed before is kept in `achievements`.
 */
export function restartAdvancedLevel(store: AdvancedStore, level: AdvancedCourseLevel, now: Date): AdvancedStore {
  const wasPassed = evaluateAdvancedLevel(store, level).passed;
  const achievements = wasPassed && !(store.achievements ?? []).includes(level)
    ? [...(store.achievements ?? []), level]
    : store.achievements;
  const activeAttempt = store.attempts.find((attempt) => attempt.attemptId === store.active);
  const freeAttempt = store.attempts.find((attempt) => attempt.attemptId === store.free);
  return {
    schema: store.schema,
    version: store.version,
    bankVersion: store.bankVersion,
    attempts: store.attempts,
    trials: store.trials,
    rounds: { ...(store.rounds ?? {}), [String(level)]: { startedAt: now.toISOString() } },
    ...(achievements === undefined ? {} : { achievements }),
    ...(store.active !== undefined && activeAttempt?.level !== level ? { active: store.active } : {}),
    ...(store.free !== undefined && freeAttempt?.level !== level ? { free: store.free } : {}),
  };
}

function delayWait(level: AdvancedCourseLevel, dates: AdvancedDates, now: Date, group?: string, reason?: string): AdvancedPlan {
  const availableAt = dates.sameDayCompletedAt === undefined ? now.toISOString() : (nextDelayAvailableAt(dates.sameDayCompletedAt) ?? now.toISOString());
  return {
    kind: "delay-wait",
    level,
    ...(group === undefined ? {} : { group }),
    availableAt,
    reason: reason ?? dates.reason ?? "翌日以降に確認します",
    ...(dates.sameDayCompletedAt === undefined ? {} : { sameDayCompletedAt: dates.sameDayCompletedAt }),
  };
}

function questionPlan(level: AdvancedCourseLevel, active: AdvancedAttempt, nextId: string): AdvancedPlan | undefined {
  const item = advancedItemById(nextId);
  if (item === undefined) return undefined;
  return {
    kind: "question",
    level,
    block: active.block,
    setId: active.setId,
    ...(active.group === undefined ? {} : { group: active.group }),
    attempt: active,
    item,
    index: active.itemIds.indexOf(nextId) + 1,
    total: active.itemIds.length,
  };
}

/** The single next official action for one level. */
export function advancedPlan(store: AdvancedStore, level: AdvancedCourseLevel, now: Date): AdvancedPlan {
  const active = store.attempts.find((attempt) => attempt.attemptId === store.active && attempt.level === level && !attempt.practice && inCurrentRound(store, level, attempt));
  if (active !== undefined) {
    const answered = answeredTrials(store, active);
    const nextId = active.itemIds.find((id) => !answered.has(id));
    if (nextId !== undefined) {
      const plan = questionPlan(level, active, nextId);
      if (plan !== undefined) return plan;
    }
    const evaluation = evaluateAdvancedLevel(store, level);
    const report = active.group !== undefined
      ? ((active.block === "sameDay" ? evaluation.groups?.find((group) => group.group === active.group)?.sameDay : evaluation.groups?.find((group) => group.group === active.group)?.delay)
        ?? (active.block === "sameDay" ? evaluation.sameDay : evaluation.delay))
      : (active.block === "sameDay" ? evaluation.sameDay : evaluation.delay);
    return {
      kind: "block-result",
      level,
      block: active.block,
      setId: active.setId,
      ...(active.group === undefined ? {} : { group: active.group }),
      attemptId: active.attemptId,
      evaluation,
      report,
    };
  }

  const evaluation = evaluateAdvancedLevel(store, level);

  if (level === 8) {
    let waiting: AdvancedPlan | undefined;
    for (const group of LV8_GROUPS) {
      const sameAttempt = latestAttempt(store, 8, "sameDay", group.id);
      const delayAttempt = latestAttempt(store, 8, "delay", group.id);
      const same = blockReport(store, 8, "sameDay", advancedSetIds(8, "sameDay", group.id), sameAttempt === undefined ? [] : [sameAttempt]);
      const later = blockReport(store, 8, "delay", advancedSetIds(8, "delay", group.id), delayAttempt === undefined ? [] : [delayAttempt]);
      const dates = datesFor(sameAttempt, delayAttempt, store);
      if (sameAttempt === undefined || !same.ok) {
        return { kind: "start", level: 8, block: "sameDay", setId: group.id, group: group.id, itemIds: advancedSetIds(8, "sameDay", group.id) };
      }
      if (delayAttempt === undefined || !later.ok) {
        const eligibility = delayEligibility(dates.sameDayCompletedAt, now.toISOString());
        if (eligibility.eligible) {
          return { kind: "start", level: 8, block: "delay", setId: group.id, group: group.id, itemIds: advancedSetIds(8, "delay", group.id) };
        }
        waiting ??= delayWait(8, dates, now, group.id, eligibility.reason);
        continue;
      }
    }
    return waiting ?? { kind: "finished", evaluation };
  }

  const sameDayAttempt = latestAttempt(store, level, "sameDay", "sameDay");
  if (sameDayAttempt === undefined || !evaluation.sameDay.ok) {
    return { kind: "start", level, block: "sameDay", setId: "sameDay", itemIds: advancedSetIds(level, "sameDay") };
  }
  const delayAttempt = latestAttempt(store, level, "delay", "delay");
  if (delayAttempt === undefined || !evaluation.delay.ok) {
    const eligibility = delayEligibility(evaluation.dates.sameDayCompletedAt, now.toISOString());
    if (eligibility.eligible) {
      return { kind: "start", level, block: "delay", setId: "delay", itemIds: advancedSetIds(level, "delay") };
    }
    return delayWait(level, evaluation.dates, now, undefined, eligibility.reason);
  }
  if (level === 6 && evaluation.missingKeys.length > 0) {
    return { kind: "recheck", level: 6, itemIds: recheckIdsFor(evaluation.missingKeys), keys: evaluation.missingKeys };
  }
  return { kind: "finished", evaluation };
}

/** Free practice: the same cards, always a practice attempt, never part of a formal count. */
export function advancedPracticePlan(store: AdvancedStore, level: AdvancedCourseLevel, group: string | undefined): AdvancedPracticePlan {
  const active = store.attempts.find((attempt) => attempt.attemptId === store.free && attempt.level === level && attempt.practice);
  if (active !== undefined) {
    const answered = answeredTrials(store, active);
    const nextId = active.itemIds.find((id) => !answered.has(id));
    if (nextId !== undefined) {
      const item = advancedItemById(nextId);
      if (item !== undefined) {
        return {
          kind: "question",
          level,
          block: active.block,
          setId: active.setId,
          ...(active.group === undefined ? {} : { group: active.group }),
          attempt: active,
          item,
          index: active.itemIds.indexOf(nextId) + 1,
          total: active.itemIds.length,
        };
      }
    }
    const list = [...answered.values()];
    return { kind: "practice-result", level, attemptId: active.attemptId, correct: list.filter((trial) => trial.result === "correct").length, total: active.itemIds.length };
  }
  const setId = level === 8 ? (group ?? LV8_GROUPS[0]!.id) : "sameDay";
  return {
    kind: "start",
    level,
    block: "sameDay",
    setId,
    ...(level === 8 ? { group: group ?? LV8_GROUPS[0]!.id } : {}),
    itemIds: advancedSetIds(level, "sameDay", level === 8 ? (group ?? LV8_GROUPS[0]!.id) : undefined),
  };
}

/** Level order for the selector; every level stays visible even before it is reachable. */
export const ADVANCED_LEVEL_SELECTOR = ADVANCED_LEVELS.map((spec) => spec.level);

export function advancedLevelAbility(level: AdvancedCourseLevel): string {
  return advancedLevelSpec(level).ability;
}

export { ADVANCED_LEVEL_ORDER };
