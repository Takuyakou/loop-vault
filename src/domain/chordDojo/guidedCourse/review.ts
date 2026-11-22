import {
  COURSE_BANK,
  COURSE_LEVELS,
  MIN_DELAY_MS,
  courseItemById,
  coursePolicy,
  delayIds,
  sameDayEarIds,
  sameDayIds,
  sameDayNameIds,
  type CourseItem,
  type CourseLevel,
} from "./bank";
import type { ActiveAttempt, CourseBlock, CourseStore, CourseTrial } from "./types";

/**
 * P23-40 evaluation, scheduling and delayed-date rules. The product-side mirror of
 * `src/courseDesign/bank.ts` from the v3 freeze. `review.test.ts` checks the same injected-clock
 * counterexamples and compares the official decision with the contract evaluator.
 *
 * A same-day or delayed block is evaluated from **one completed attempt**. Retries create a new
 * `attemptId`, so an incomplete retry can never be mixed with an earlier attempt to fake a pass.
 */
export interface CourseDelayEligibility {
  readonly eligible: boolean;
  readonly reason?: string;
  readonly elapsedMs?: number;
  readonly sameLocalDate?: boolean;
}

export interface CourseDelayDates {
  readonly sameDayCompletedAt?: string;
  readonly delayedStartedAt?: string;
  readonly delayedCompletedAt?: string;
  readonly elapsedMs?: number;
  readonly sameLocalDate: boolean;
  readonly eligible: boolean;
  readonly reason?: string;
}

export interface CourseQualityBlock {
  readonly evaluated: number;
  readonly correct: number;
  readonly independentCorrect: number;
  readonly required: number;
  readonly minimum: number;
}

export interface CourseBlockReport {
  readonly required: number;
  readonly evaluated: number;
  readonly correct: number;
  readonly independentCorrect: number;
  readonly hintAssisted: number;
  readonly selfConfirmed: number;
  readonly missingItemIds: readonly string[];
  readonly missingRoots: readonly number[];
  readonly qualityBlocks: Readonly<Record<string, CourseQualityBlock>>;
}

export interface CourseSpeedReport {
  readonly correct: number;
  readonly withinLimit: number;
  readonly ratio: number;
  readonly requiredRatio: number;
  readonly ok: boolean;
}

export interface CourseLevelEvaluation {
  readonly level: CourseLevel;
  readonly mode: "midi" | "self";
  readonly complete: boolean;
  readonly passed: boolean;
  readonly sameDayPassed: boolean;
  readonly delayPassed: boolean;
  readonly blocks: { readonly name: CourseBlockReport; readonly delay: CourseBlockReport; readonly ear?: CourseBlockReport };
  readonly speed?: CourseSpeedReport;
  readonly dates: CourseDelayDates;
  readonly reasons: readonly string[];
}

export interface CourseAttemptResult {
  readonly attemptId: string;
  readonly completed: boolean;
  readonly evaluation: CourseLevelEvaluation;
}

export type CoursePlan =
  | { readonly kind: "question"; readonly level: CourseLevel; readonly block: CourseBlock; readonly attempt: ActiveAttempt; readonly item: CourseItem; readonly index: number; readonly total: number }
  | { readonly kind: "block-result"; readonly level: CourseLevel; readonly block: CourseBlock; readonly attemptId: string; readonly evaluation: CourseLevelEvaluation }
  | { readonly kind: "start-attempt"; readonly level: CourseLevel; readonly block: CourseBlock }
  | { readonly kind: "delay-wait"; readonly level: CourseLevel; readonly availableAt: string; readonly reason: string; readonly sameDayCompletedAt?: string }
  | { readonly kind: "finished" };

export function localDateKey(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return undefined;
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The frozen delayed rule: the delayed block must start on a later local calendar day and at least 12 h
 * after the same-day block. Missing timestamps, the same day, <12 h and backwards times are ineligible.
 */
export function delayEligibility(sameDayCompletedAt: string | undefined, delayedStartedAt: string | undefined): CourseDelayEligibility {
  if (!sameDayCompletedAt || !delayedStartedAt) return { eligible: false, reason: "時刻がありません", sameLocalDate: false };
  const sameDay = Date.parse(sameDayCompletedAt);
  const delayed = Date.parse(delayedStartedAt);
  if (!Number.isFinite(sameDay) || !Number.isFinite(delayed)) return { eligible: false, reason: "時刻を読めません", sameLocalDate: false };
  if (delayed <= sameDay) return { eligible: false, reason: "遅延評価が同日評価より前です", elapsedMs: delayed - sameDay, sameLocalDate: false };
  const sameLocalDate = localDateKey(sameDayCompletedAt) === localDateKey(delayedStartedAt);
  const elapsedMs = delayed - sameDay;
  if (sameLocalDate) return { eligible: false, reason: "同じ日です", elapsedMs, sameLocalDate };
  if (elapsedMs < MIN_DELAY_MS) return { eligible: false, reason: "12 時間未満です", elapsedMs, sameLocalDate };
  return { eligible: true, elapsedMs, sameLocalDate };
}

/** The earliest instant that satisfies both "next local day" and ">= 12 h". */
export function nextDelayAvailableAt(sameDayCompletedAt: string): string | undefined {
  const ms = Date.parse(sameDayCompletedAt);
  if (!Number.isFinite(ms)) return undefined;
  const completed = new Date(ms);
  const nextMidnight = new Date(completed.getFullYear(), completed.getMonth(), completed.getDate() + 1, 0, 0, 0, 0).getTime();
  return new Date(Math.max(nextMidnight, ms + MIN_DELAY_MS)).toISOString();
}

function timeOf(trial: CourseTrial): number | undefined {
  const ms = Date.parse(trial.sealedAt);
  return Number.isFinite(ms) ? ms : undefined;
}

function minTime(trials: readonly CourseTrial[]): number | undefined {
  const values = trials.map(timeOf).filter((value): value is number => value !== undefined);
  return values.length === 0 ? undefined : Math.min(...values);
}

function maxTime(trials: readonly CourseTrial[]): number | undefined {
  const values = trials.map(timeOf).filter((value): value is number => value !== undefined);
  return values.length === 0 ? undefined : Math.max(...values);
}

function iso(ms: number | undefined): string | undefined {
  return ms === undefined ? undefined : new Date(ms).toISOString();
}

export function expectedIdsFor(level: CourseLevel, block: CourseBlock): readonly string[] {
  return block === "sameDay" ? sameDayIds(level) : delayIds(level);
}

/** P23-47: the round boundary of one level (undefined when the level was never restarted). */
export function levelRoundStartedAt(store: CourseStore, level: CourseLevel): string | undefined {
  return store.rounds?.[String(level)]?.startedAt;
}

/** Trials of one level that belong to its current round. */
export function trialsInCurrentRound(store: CourseStore, level: CourseLevel): readonly CourseTrial[] {
  const boundary = levelRoundStartedAt(store, level);
  if (boundary === undefined) return store.trials.filter((trial) => trial.level === level);
  const boundaryMs = Date.parse(boundary);
  return store.trials.filter((trial) => trial.level === level && Date.parse(trial.sealedAt) >= boundaryMs);
}

/**
 * P23-47-fix-2: the items to practise from a finished result, in the attempt's original order. Only
 * confirmed wrong / incomplete answers count; invalid, no-input and hint-assisted correct answers do
 * not. The attempt id keeps earlier attempts and other rounds out.
 */
export function wrongItemIdsFor(store: CourseStore, level: CourseLevel, block: CourseBlock, attemptId: string): readonly string[] {
  const expected = block === "sameDay" ? sameDayIds(level) : delayIds(level);
  const latest = new Map<string, CourseTrial>();
  for (const trial of store.trials) {
    if (trial.attemptId !== attemptId) continue;
    if (trial.result === "invalid" || trial.result === "no-input") continue;
    latest.set(trial.itemId, trial);
  }
  return expected.filter((id) => {
    const trial = latest.get(id);
    return trial !== undefined && (trial.result === "wrong" || trial.result === "incomplete");
  });
}

/**
 * P23-55: the answer took longer than this to play, so it counts as "迷った" (hesitated) for practice.
 * Only name questions are timed this way: an ear question's time includes listening.
 */
export const HESITATION_MS = 2500;

/**
 * P23-55: the items to practise after a result — wrong ones and correct name answers that took longer
 * than {@link HESITATION_MS} without a hint — in the attempt's original order. Practice only: nothing here
 * changes the evaluation or the pass.
 */
export function weakItemIdsFor(store: CourseStore, level: CourseLevel, block: CourseBlock, attemptId: string): { readonly ids: readonly string[]; readonly wrong: number; readonly slow: number } {
  const expected = block === "sameDay" ? sameDayIds(level) : delayIds(level);
  const names = new Set(block === "sameDay" ? sameDayNameIds(level) : delayIds(level));
  const latest = new Map<string, CourseTrial>();
  for (const trial of store.trials) {
    if (trial.attemptId !== attemptId) continue;
    if (trial.result === "invalid" || trial.result === "no-input") continue;
    latest.set(trial.itemId, trial);
  }
  let wrong = 0;
  let slow = 0;
  const ids = expected.filter((id) => {
    const trial = latest.get(id);
    if (trial === undefined) return false;
    if (trial.result === "wrong" || trial.result === "incomplete") { wrong += 1; return true; }
    if (trial.result === "correct" && !trial.hintUsed && names.has(id) && (trial.speedMs ?? 0) > HESITATION_MS) { slow += 1; return true; }
    return false;
  });
  return { ids, wrong, slow };
}

/**
 * Start a new round for one level. Other levels keep their trials, rounds and active attempt; the
 * restarted level's old attempts stay in the file as history but no longer count toward its pass.
 */
export function restartCourseLevel(store: CourseStore, level: CourseLevel, now: Date): CourseStore {
  const boundary = now.toISOString();
  return {
    schema: store.schema,
    version: store.version,
    bankVersion: store.bankVersion,
    policyVersion: store.policyVersion,
    pairId: store.pairId,
    trials: store.trials,
    rounds: { ...(store.rounds ?? {}), [String(level)]: { startedAt: boundary } },
    ...(store.active?.level === level ? {} : store.active === undefined ? {} : { active: store.active }),
  };
}

/** Valid trials of one attempt, latest per item (a malformed duplicate cannot double count). */
function attemptTrials(store: CourseStore, attemptId: string): readonly CourseTrial[] {
  const latest = new Map<string, CourseTrial>();
  for (const trial of store.trials) {
    if (trial.attemptId !== attemptId || trial.result === "invalid") continue;
    const previous = latest.get(trial.itemId);
    if (previous === undefined || (timeOf(trial) ?? 0) >= (timeOf(previous) ?? 0)) latest.set(trial.itemId, trial);
  }
  return [...latest.values()];
}

export function attemptIsComplete(store: CourseStore, attempt: ActiveAttempt): boolean {
  const expected = expectedIdsFor(attempt.level, attempt.block);
  const seen = new Set(attemptTrials(store, attempt.attemptId).map((trial) => trial.itemId));
  return expected.every((id) => seen.has(id));
}

/**
 * The latest *completed* attempt of one block. Retries always create a new attempt id, so this is the
 * attempt the official evaluation must use; an in-progress retry is never mixed into it.
 */
export function latestCompleteAttempt(store: CourseStore, level: CourseLevel, block: CourseBlock): { attemptId: string; trials: readonly CourseTrial[] } | undefined {
  const expected = expectedIdsFor(level, block);
  const boundary = levelRoundStartedAt(store, level);
  const boundaryMs = boundary === undefined ? undefined : Date.parse(boundary);
  const groups = new Map<string, CourseTrial[]>();
  for (const trial of store.trials) {
    if (trial.level !== level || trial.block !== block || trial.result === "invalid") continue;
    if (boundaryMs !== undefined && Date.parse(trial.sealedAt) < boundaryMs) continue;
    groups.set(trial.attemptId, [...(groups.get(trial.attemptId) ?? []), trial]);
  }
  const complete = [...groups.entries()].filter(([, trials]) => {
    const seen = new Set(trials.map((trial) => trial.itemId));
    return expected.every((id) => seen.has(id));
  });
  if (complete.length === 0) return undefined;
  complete.sort((left, right) => (maxTime(left[1]) ?? 0) - (maxTime(right[1]) ?? 0));
  const [attemptId, trials] = complete[complete.length - 1]!;
  return { attemptId, trials };
}

function isIndependent(trial: CourseTrial): boolean {
  return trial.midiConfirmed && !trial.hintUsed;
}

function blockReport(expectedIds: readonly string[], trials: readonly CourseTrial[], options: { readonly perQuality?: { readonly min: number; readonly of: number }; readonly roots?: readonly number[] } = {}): CourseBlockReport {
  const byItem = new Map(trials.map((trial) => [trial.itemId, trial]));
  const expected = expectedIds.map((id) => courseItemById(id)).filter((item): item is CourseItem => item !== undefined);
  const present = expected.filter((item) => byItem.has(item.id));
  const qualityBlocks: Record<string, CourseQualityBlock> = {};
  if (options.perQuality !== undefined) {
    for (const quality of new Set(expected.map((item) => item.quality))) {
      const block = present.filter((item) => item.quality === quality);
      qualityBlocks[quality] = {
        evaluated: block.length,
        correct: block.filter((item) => byItem.get(item.id)!.result === "correct").length,
        independentCorrect: block.filter((item) => {
          const trial = byItem.get(item.id)!;
          return trial.result === "correct" && isIndependent(trial);
        }).length,
        required: options.perQuality.of,
        minimum: options.perQuality.min,
      };
    }
  }
  const coveredRoots = new Set(present.map((item) => item.root));
  return {
    required: expected.length,
    evaluated: present.length,
    correct: present.filter((item) => byItem.get(item.id)!.result === "correct").length,
    independentCorrect: present.filter((item) => {
      const trial = byItem.get(item.id)!;
      return trial.result === "correct" && isIndependent(trial);
    }).length,
    hintAssisted: present.filter((item) => byItem.get(item.id)!.hintUsed).length,
    selfConfirmed: present.filter((item) => byItem.get(item.id)!.selfConfirmed).length,
    missingItemIds: expected.filter((item) => !byItem.has(item.id)).map((item) => item.id),
    missingRoots: (options.roots ?? []).filter((root) => !coveredRoots.has(root)),
    qualityBlocks,
  };
}

function attemptMode(trials: readonly CourseTrial[]): "midi" | "self" {
  return trials.some((trial) => trial.midiConfirmed) ? "midi" : "self";
}

/**
 * The official evaluation. Both the same-day attempt and the delayed attempt must be complete; the
 * delayed block must also satisfy the next-day + 12 h rule. A self-confirmation-only attempt is shown
 * separately and can never be a formal pass.
 */
export function evaluateCourseLevel(level: CourseLevel, trials: readonly CourseTrial[]): CourseLevelEvaluation {
  const store: CourseStore = {
    schema: "loopvault-guided-course",
    version: 1,
    bankVersion: COURSE_BANK.version,
    policyVersion: COURSE_BANK.policyVersion,
    pairId: COURSE_BANK.pairId,
    trials,
  };
  return evaluateStoreLevel(store, level);
}

export interface CourseQualitySummary {
  readonly quality: string;
  readonly label: string;
  readonly correct: number;
  readonly total: number;
}

const QUALITY_BAR_ORDER = ["maj", "min", "maj7", "dom7", "min7", "min7b5"] as const;

const QUALITY_BAR_LABEL: Readonly<Record<string, string>> = {
  maj: "メジャー",
  min: "マイナー",
  maj7: "maj7",
  dom7: "7",
  min7: "m7",
  min7b5: "m7♭5",
};

/**
 * P23-52 (mock ⑧): per-quality breakdown for a completed basic attempt's name items (same-day or delay),
 * in canonical musical quality order. Used by the result screen's bars (Lv1 and delay also get bars, unlike `qualityBlocks`).
 */
export function attemptQualityBreakdown(
  store: CourseStore,
  level: CourseLevel,
  block: CourseBlock,
  attemptId: string,
): readonly CourseQualitySummary[] {
  const ids = block === "sameDay" ? sameDayNameIds(level) : delayIds(level);
  const byItem = new Map(attemptTrials(store, attemptId).map((trial) => [trial.itemId, trial]));
  const groups = new Map<string, { correct: number; total: number }>();
  for (const id of ids) {
    const item = courseItemById(id);
    if (item === undefined) continue;
    const entry = groups.get(item.quality) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (byItem.get(id)?.result === "correct") entry.correct += 1;
    groups.set(item.quality, entry);
  }
  const rank = (quality: string): number => {
    const idx = QUALITY_BAR_ORDER.indexOf(quality as (typeof QUALITY_BAR_ORDER)[number]);
    return idx === -1 ? QUALITY_BAR_ORDER.length : idx;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([quality, counts]) => ({
      quality,
      label: QUALITY_BAR_LABEL[quality] ?? quality,
      correct: counts.correct,
      total: counts.total,
    }));
}

export function evaluateStoreLevel(store: CourseStore, level: CourseLevel): CourseLevelEvaluation {
  const policy = coursePolicy(level);
  const sameDay = latestCompleteAttempt(store, level, "sameDay");
  const delay = latestCompleteAttempt(store, level, "delay");
  const sameDayTrials = sameDay?.trials ?? [];
  const delayTrials = delay?.trials ?? [];
  const name = blockReport(sameDayNameIds(level), sameDayTrials, {
    ...(policy.perQuality === undefined ? {} : { perQuality: policy.perQuality }),
    roots: [...new Set(sameDayNameIds(level).map((id) => courseItemById(id)!.root))],
  });
  const ear = policy.ear === undefined ? undefined : blockReport(sameDayEarIds(level), sameDayTrials);
  const delayReport = blockReport(delayIds(level), delayTrials);
  const reasons: string[] = [];

  const namePassed = name.independentCorrect >= policy.pass
    && name.missingRoots.length === 0
    && Object.values(name.qualityBlocks).every((block) => block.evaluated === block.required && block.independentCorrect >= block.minimum);
  const earPassed = ear === undefined || (ear.evaluated === policy.ear!.questions && ear.independentCorrect >= policy.ear!.pass);
  const sameDayPassed = sameDay !== undefined && namePassed && earPassed;
  const delayPassed = delay !== undefined && delayReport.independentCorrect >= policy.delay.pass;
  const complete = sameDay !== undefined && delay !== undefined;

  let speed: CourseSpeedReport | undefined;
  if (policy.speed !== undefined) {
    const independentCorrect = sameDayTrials.filter((trial) => trial.result === "correct" && isIndependent(trial));
    const withinLimit = independentCorrect.filter((trial) => trial.speedMs !== undefined && trial.speedMs <= policy.speed!.limitMs).length;
    const ratio = independentCorrect.length === 0 ? 0 : withinLimit / independentCorrect.length;
    speed = {
      correct: independentCorrect.length,
      withinLimit,
      ratio,
      requiredRatio: policy.speed.ofCorrect,
      ok: independentCorrect.length > 0 && ratio >= policy.speed.ofCorrect,
    };
    if (!speed.ok) reasons.push(`速度: 3 秒以内 ${withinLimit}/${independentCorrect.length} が ${Math.round(policy.speed.ofCorrect * 100)}% 未満`);
  }

  const sameDayCompletedAt = iso(maxTime(sameDayTrials));
  const delayedStartedAt = iso(minTime(delayTrials));
  const delayedCompletedAt = iso(maxTime(delayTrials));
  const eligibility = delayEligibility(sameDayCompletedAt, delayedStartedAt);
  const dates: CourseDelayDates = {
    ...(sameDayCompletedAt === undefined ? {} : { sameDayCompletedAt }),
    ...(delayedStartedAt === undefined ? {} : { delayedStartedAt }),
    ...(delayedCompletedAt === undefined ? {} : { delayedCompletedAt }),
    ...(eligibility.elapsedMs === undefined ? {} : { elapsedMs: eligibility.elapsedMs }),
    sameLocalDate: eligibility.sameLocalDate ?? false,
    eligible: delay !== undefined && sameDay !== undefined && eligibility.eligible,
    ...(eligibility.reason === undefined ? {} : { reason: eligibility.reason }),
  };

  if (sameDay === undefined) reasons.push("同日の評価が完了していません");
  if (delay === undefined) reasons.push("遅延確認が完了していません");
  if (!namePassed) reasons.push(`記名: 独立正答 ${name.independentCorrect}/${name.required} が合格条件に届きません`);
  if (ear !== undefined && !earPassed) reasons.push(`耳: 独立正答 ${ear.independentCorrect}/${ear.required} が合格条件に届きません`);
  if (delay !== undefined && !delayPassed) reasons.push(`遅延: 独立正答 ${delayReport.independentCorrect}/${delayReport.required} が合格条件に届きません`);
  if (delay !== undefined && sameDay !== undefined && !eligibility.eligible) reasons.push(`遅延: ${eligibility.reason}`);
  const mode = attemptMode(sameDayTrials);
  if (mode === "self") reasons.push("自己確認は正式合格ではありません（別の進捗区分）");

  const passed = mode === "midi" && sameDayPassed && delayPassed && dates.eligible && (speed === undefined || speed.ok);
  return {
    level,
    mode,
    complete,
    passed,
    sameDayPassed,
    delayPassed,
    blocks: { name, delay: delayReport, ...(ear === undefined ? {} : { ear }) },
    ...(speed === undefined ? {} : { speed }),
    dates,
    reasons,
  };
}

/** The first level without a formal pass (4 = all Lv1–3 passed). */
export function currentCourseLevel(store: CourseStore): CourseLevel | 4 {
  for (const level of COURSE_LEVELS) if (!evaluateStoreLevel(store, level).passed) return level;
  return 4;
}

/** Start a fresh attempt; retries always get a new id so attempts are never mixed. */
export function startCourseAttempt(store: CourseStore, level: CourseLevel, block: CourseBlock, now: Date, options: { readonly attemptId?: string; readonly mode?: "midi" | "self" } = {}): CourseStore {
  const attemptId = options.attemptId ?? `${level}-${block === "sameDay" ? "d" : "l"}-${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  return {
    ...store,
    active: {
      level,
      block,
      attemptId,
      startedAt: now.toISOString(),
      mode: options.mode ?? "midi",
    },
  };
}

export function appendCourseTrial(store: CourseStore, trial: CourseTrial): CourseStore {
  const existing = store.trials.find((entry) => entry.trialId === trial.trialId);
  if (existing !== undefined) {
    if (JSON.stringify(existing) === JSON.stringify(trial)) return store;
    throw new Error("同じ試行 id の内容が違います");
  }
  return { ...store, trials: [...store.trials, trial] };
}

/** Drop the active pointer (after a block result or before moving to the next block). */
export function clearActiveAttempt(store: CourseStore): CourseStore {
  if (store.active === undefined) return store;
  const { active: _active, ...rest } = store;
  return rest;
}

/**
 * The single next action of the course. `start-attempt` is an action (the caller persists the new
 * attempt); everything else is a pure view of the saved trials and the injected clock. `options.level`
 * (P23-52) asks for one level's next action instead of the first unfinished level's; an active attempt
 * always comes first.
 */
export function coursePlan(store: CourseStore, now: Date, options: { readonly level?: CourseLevel } = {}): CoursePlan {
  // A just-finished attempt is always shown as its result, even when the level has just passed (the
  // delayed pass must be visible before the course moves to the next level).
  if (store.active !== undefined) {
    const active = store.active;
    const expected = expectedIdsFor(active.level, active.block);
    const answered = new Set(attemptTrials(store, active.attemptId).map((trial) => trial.itemId));
    const nextId = expected.find((id) => !answered.has(id));
    if (nextId !== undefined) {
      const item = courseItemById(nextId)!;
      const index = expected.indexOf(nextId) + 1;
      return { kind: "question", level: active.level, block: active.block, attempt: active, item, index, total: expected.length };
    }
    return { kind: "block-result", level: active.level, block: active.block, attemptId: active.attemptId, evaluation: evaluateStoreLevel(store, active.level) };
  }

  // P23-52: the course map chooses the level (rule 1: the next level may start while a delayed check waits).
  const level = options.level ?? currentCourseLevel(store);
  if (level === 4) return { kind: "finished" };

  const sameDay = latestCompleteAttempt(store, level, "sameDay");
  if (sameDay === undefined) return { kind: "start-attempt", level, block: "sameDay" };
  const evaluation = evaluateStoreLevel(store, level);
  if (!evaluation.sameDayPassed) {
    return { kind: "block-result", level, block: "sameDay", attemptId: sameDay.attemptId, evaluation };
  }
  const delay = latestCompleteAttempt(store, level, "delay");
  if (delay !== undefined) {
    return { kind: "block-result", level, block: "delay", attemptId: delay.attemptId, evaluation };
  }
  const sameDayCompletedAt = evaluation.dates.sameDayCompletedAt;
  const eligibility = delayEligibility(sameDayCompletedAt, now.toISOString());
  if (!eligibility.eligible) {
    const availableAt = sameDayCompletedAt === undefined ? undefined : nextDelayAvailableAt(sameDayCompletedAt);
    return {
      kind: "delay-wait",
      level,
      availableAt: availableAt ?? now.toISOString(),
      reason: eligibility.reason ?? "翌日以降に確認します",
      ...(sameDayCompletedAt === undefined ? {} : { sameDayCompletedAt }),
    };
  }
  return { kind: "start-attempt", level, block: "delay" };
}

/** The number of questions still unanswered in the active attempt (for the home card). */
export function remainingInActiveAttempt(store: CourseStore): number {
  if (store.active === undefined) return 0;
  const expected = expectedIdsFor(store.active.level, store.active.block);
  const answered = new Set(attemptTrials(store, store.active.attemptId).map((trial) => trial.itemId));
  return expected.filter((id) => !answered.has(id)).length;
}

/** A compact home summary: level, today's block and remaining questions. */
export function courseSummary(store: CourseStore, now: Date): { level: CourseLevel; block: CourseBlock; remaining: number; label: string } {
  const plan = coursePlan(store, now);
  if (plan.kind === "finished") return { level: 3, block: "delay", remaining: 0, label: "基礎コース Lv1〜3 修了" };
  if (plan.kind === "question") return { level: plan.level, block: plan.block, remaining: plan.total - plan.index + 1, label: `Lv${plan.level} ${plan.block === "sameDay" ? "同日" : "遅延確認"}` };
  if (plan.kind === "block-result") return { level: plan.level, block: plan.block, remaining: 0, label: `Lv${plan.level} ${plan.block === "sameDay" ? "同日の結果" : "遅延の結果"}` };
  if (plan.kind === "delay-wait") return { level: plan.level, block: "delay", remaining: 0, label: `Lv${plan.level} 遅延確認待ち` };
  return { level: plan.level, block: plan.block, remaining: expectedIdsFor(plan.level, plan.block).length, label: `Lv${plan.level} ${plan.block === "sameDay" ? "同日" : "遅延確認"}を始める` };
}
