import { describe, expect, it } from "vitest";
import { delayEligibility as contractDelayEligibility, evaluateLevel as contractEvaluate, type LevelEvidence, type TrialEvidence } from "../../../courseDesign/bank";
import { courseItemById, delayIds, sameDayEarIds, sameDayIds, sameDayNameIds, type CourseLevel } from "./bank";
import { coursePlan, clearActiveAttempt, currentCourseLevel, delayEligibility, evaluateCourseLevel, latestCompleteAttempt, levelRoundStartedAt, nextDelayAvailableAt, restartCourseLevel, startCourseAttempt, trialsInCurrentRound, weakItemIdsFor, wrongItemIdsFor } from "./review";
import { CourseRepository, MemoryCourseStorage, createCourseStore, createCourseTrial } from "./store";
import type { ActiveAttempt, CourseStore, CourseTrial } from "./types";

const SAME_DAY_AT = new Date(2026, 10, 17, 20, 0, 0).toISOString();
const DELAYED_AT = new Date(2026, 10, 18, 9, 0, 0).toISOString();
const NOW_DELAYED = new Date(2026, 10, 18, 9, 0, 0);

function qualityFirst(level: CourseLevel, perQuality: number, extra: number): Set<string> {
  const byQuality = new Map<string, string[]>();
  for (const id of sameDayNameIds(level)) {
    const quality = courseItemById(id)!.quality;
    byQuality.set(quality, [...(byQuality.get(quality) ?? []), id]);
  }
  const correct = new Set<string>();
  for (const ids of byQuality.values()) ids.slice(0, perQuality).forEach((id) => correct.add(id));
  let remaining = extra;
  for (const ids of byQuality.values()) {
    if (remaining === 0) break;
    correct.add(ids[perQuality]!);
    remaining -= 1;
  }
  return correct;
}

function passingCorrect(level: CourseLevel): Set<string> {
  const correct = level === 1
    ? new Set(sameDayNameIds(1))
    : level === 2
      ? qualityFirst(2, 4, 2)
      : qualityFirst(3, 4, 3);
  for (const id of sameDayEarIds(level).slice(0, 8)) correct.add(id);
  for (const id of delayIds(level).slice(0, 10)) correct.add(id);
  return correct;
}

function attemptFor(level: CourseLevel, block: "sameDay" | "delay", attemptId: string, at: string, mode: "midi" | "self" = "midi"): ActiveAttempt {
  return { level, block, attemptId, startedAt: at, mode };
}

function trialsFor(level: CourseLevel, block: "sameDay" | "delay", attempt: ActiveAttempt, ids: readonly string[], correct: ReadonlySet<string>, at: string, mode: "midi" | "self" = "midi"): CourseTrial[] {
  return ids.map((id) => {
    const item = courseItemById(id)!;
    const ok = correct.has(id);
    return createCourseTrial({
      attempt,
      itemId: id,
      quality: item.quality,
      root: item.root,
      result: ok ? "correct" : "wrong",
      sealedNotes: item.referenceNotes,
      ...(ok ? { speedMs: 2000 } : {}),
      midiConfirmed: mode === "midi",
      selfConfirmed: mode === "self",
      startedAt: at,
      sealedAt: at,
    });
  });
}

function storeWith(trials: readonly CourseTrial[], active?: ActiveAttempt): CourseStore {
  return { ...createCourseStore(), trials, ...(active === undefined ? {} : { active }) };
}

function storeFor(level: CourseLevel, correct: ReadonlySet<string>, sameDayAt = SAME_DAY_AT, delayedAt = DELAYED_AT, mode: "midi" | "self" = "midi"): CourseStore {
  const sameDay = attemptFor(level, "sameDay", `${level}-d-1`, sameDayAt, mode);
  const delay = attemptFor(level, "delay", `${level}-l-1`, delayedAt, mode);
  return storeWith([
    ...trialsFor(level, "sameDay", sameDay, sameDayIds(level), correct, sameDayAt, mode),
    ...trialsFor(level, "delay", delay, delayIds(level), correct, delayedAt, mode),
  ]);
}

function contractEvidence(store: CourseStore, level: CourseLevel): LevelEvidence {
  const toEvidence = (trial: CourseTrial): TrialEvidence => ({
    itemId: trial.itemId,
    result: trial.result,
    ...(trial.speedMs === undefined ? {} : { speedMs: trial.speedMs }),
    hintUsed: trial.hintUsed,
    selfConfirmed: trial.selfConfirmed,
    midiConfirmed: trial.midiConfirmed,
    at: trial.sealedAt,
  });
  const sameDay = latestCompleteAttempt(store, level, "sameDay")!.trials;
  const delay = latestCompleteAttempt(store, level, "delay")!.trials;
  return {
    mode: sameDay.some((trial) => trial.midiConfirmed) ? "midi" : "self",
    name: sameDay.filter((trial) => courseItemById(trial.itemId)!.prompt === "name").map(toEvidence),
    delay: delay.map(toEvidence),
    ...(sameDayEarIds(level).length === 0 ? {} : { ear: sameDay.filter((trial) => courseItemById(trial.itemId)!.prompt === "ear").map(toEvidence) }),
  };
}

describe("P23-40 delayed confirmation and official pass", () => {
  it("freezes the next-day + >= 12 h rule with injected clocks", () => {
    const base = new Date(2026, 10, 17, 20, 0, 0).getTime();
    const cases = [
      { same: new Date(base).toISOString(), delayed: new Date(base + 13 * 3_600_000).toISOString(), eligible: true },
      { same: new Date(2026, 10, 17, 0, 30).toISOString(), delayed: new Date(2026, 10, 17, 13, 30).toISOString(), eligible: false },
      { same: new Date(base).toISOString(), delayed: new Date(base + 10 * 3_600_000).toISOString(), eligible: false },
      { same: new Date(base).toISOString(), delayed: new Date(base - 3_600_000).toISOString(), eligible: false },
      { same: undefined, delayed: new Date(base + 13 * 3_600_000).toISOString(), eligible: false },
      { same: new Date(base).toISOString(), delayed: undefined, eligible: false },
    ];
    for (const entry of cases) {
      const product = delayEligibility(entry.same, entry.delayed);
      const contract = contractDelayEligibility(entry.same, entry.delayed);
      expect(product.eligible, JSON.stringify(entry)).toBe(entry.eligible);
      expect(product.eligible).toBe(contract.eligible);
      expect(product.reason).toBe(contract.reason);
    }
    expect(nextDelayAvailableAt(SAME_DAY_AT)).toBe(new Date(2026, 10, 18, 8, 0, 0).toISOString());
  });

  it("agrees with the contract evaluator on a complete Lv1/Lv2/Lv3 pass", () => {
    for (const level of [1, 2, 3] as const) {
      const store = storeFor(level, passingCorrect(level));
      const product = evaluateCourseLevel(level, store.trials);
      const contract = contractEvaluate(level, contractEvidence(store, level));
      expect(product.passed, `Lv${level}`).toBe(true);
      expect(product.passed).toBe(contract.passed);
      expect(product.complete).toBe(contract.complete);
      expect(product.dates.eligible).toBe(contract.dates.eligible);
      expect(product.blocks.name.independentCorrect).toBe(contract.blocks.name.independentCorrect);
      expect(product.blocks.delay.independentCorrect).toBe(contract.blocks.delay.independentCorrect);
      expect(product.blocks.ear?.independentCorrect).toBe(contract.blocks.ear?.independentCorrect);
    }
  });

  it("never passes with the same day, less than 12 h, or a missing timestamp", () => {
    for (const [sameDayAt, delayedAt, reason] of [
      [new Date(2026, 10, 17, 0, 30).toISOString(), new Date(2026, 10, 17, 13, 30).toISOString(), "同じ日です"],
      [SAME_DAY_AT, new Date(new Date(SAME_DAY_AT).getTime() + 10 * 3_600_000).toISOString(), "12 時間未満です"],
    ] as const) {
      const store = storeFor(3, passingCorrect(3), sameDayAt, delayedAt);
      const product = evaluateCourseLevel(3, store.trials);
      const contract = contractEvaluate(3, contractEvidence(store, 3));
      expect(product.complete, reason).toBe(true);
      expect(product.passed, reason).toBe(false);
      expect(product.dates.reason).toBe(reason);
      expect(product.dates.eligible).toBe(contract.dates.eligible);
      expect(product.passed).toBe(contract.passed);
    }
    // A missing `at` cannot be saved by the product store, so a corrupted evidence set is rejected at
    // the store boundary; the contract side keeps its own missing-time counterexample (bank.test.ts).
  });

  it("never passes a self-confirmation-only attempt", () => {
    const store = storeFor(1, passingCorrect(1), SAME_DAY_AT, DELAYED_AT, "self");
    const product = evaluateCourseLevel(1, store.trials);
    expect(product.mode).toBe("self");
    expect(product.passed).toBe(false);
    expect(product.reasons.join(" ")).toContain("自己確認");
  });

  it("evaluates one completed attempt and never mixes a retry", () => {
    const level: CourseLevel = 1;
    const failed = new Set(sameDayNameIds(1).slice(0, 15));
    for (const id of sameDayEarIds(1).slice(0, 8)) failed.add(id);
    const attemptA = attemptFor(level, "sameDay", "lv1-d-a", SAME_DAY_AT);
    const attemptB = attemptFor(level, "sameDay", "lv1-d-b", new Date(2026, 10, 17, 21, 0, 0).toISOString());
    const trials = [
      ...trialsFor(level, "sameDay", attemptA, sameDayIds(level), failed, SAME_DAY_AT),
      // B is only partly answered: an evaluation must not count these five plus A's fifteen as 20/20.
      ...trialsFor(level, "sameDay", attemptB, sameDayIds(level).slice(0, 5), new Set(sameDayIds(level).slice(0, 5)), attemptB.startedAt),
    ];
    const store = storeWith(trials, attemptB);
    const evaluation = evaluateCourseLevel(level, trials);
    expect(evaluation.blocks.name.evaluated).toBe(20);
    expect(evaluation.sameDayPassed).toBe(false);
    const plan = coursePlan(store, new Date(attemptB.startedAt));
    expect(plan.kind).toBe("question");
    if (plan.kind === "question") expect(plan.index).toBe(6);
    // Completing B replaces the evaluation with B (not a mixture).
    const completedB = storeWith([
      ...trials,
      ...trialsFor(level, "sameDay", attemptB, sameDayIds(level).slice(5), new Set(sameDayIds(level).slice(5)), attemptB.startedAt),
    ], attemptB);
    const after = evaluateCourseLevel(level, completedB.trials);
    expect(after.blocks.name.independentCorrect).toBe(20);
    expect(after.sameDayPassed).toBe(true);
  });

  it("walks same-day -> delayed wait -> delayed attempt -> next level", () => {
    const level: CourseLevel = 1;
    const correct = passingCorrect(level);
    const empty = createCourseStore();
    expect(coursePlan(empty, new Date(SAME_DAY_AT)).kind).toBe("start-attempt");

    const sameDayAttempt = attemptFor(level, "sameDay", "lv1-d-plan", SAME_DAY_AT);
    const sameDayTrials = trialsFor(level, "sameDay", sameDayAttempt, sameDayIds(level), correct, SAME_DAY_AT);
    let store = storeWith(sameDayTrials, sameDayAttempt);
    expect(coursePlan(store, new Date(SAME_DAY_AT)).kind).toBe("block-result");
    store = clearActiveAttempt(store);
    const wait = coursePlan(store, new Date(SAME_DAY_AT));
    expect(wait.kind).toBe("delay-wait");
    if (wait.kind === "delay-wait") expect(wait.availableAt).toBe(nextDelayAvailableAt(SAME_DAY_AT));

    const eligible = coursePlan(store, NOW_DELAYED);
    expect(eligible.kind).toBe("start-attempt");
    if (eligible.kind === "start-attempt") expect(eligible.block).toBe("delay");
    expect(contractDelayEligibility(SAME_DAY_AT, NOW_DELAYED.toISOString()).eligible).toBe(true);

    const delayAttempt = attemptFor(level, "delay", "lv1-l-plan", DELAYED_AT);
    store = storeWith([
      ...sameDayTrials,
      ...trialsFor(level, "delay", delayAttempt, delayIds(level), correct, DELAYED_AT),
    ], delayAttempt);
    store = clearActiveAttempt(store);
    expect(evaluateCourseLevel(level, store.trials).passed).toBe(true);
    expect(currentCourseLevel(store)).toBe(2);
    const next = coursePlan(store, NOW_DELAYED);
    expect(next.kind).toBe("start-attempt");
    if (next.kind === "start-attempt") expect(next.level).toBe(2);
  });

  it("starts a new attempt with a fresh id and keeps the old trials", () => {
    const store = startCourseAttempt(createCourseStore(), 1, "sameDay", new Date(SAME_DAY_AT), { attemptId: "fixed-a", mode: "midi" });
    expect(store.active).toMatchObject({ level: 1, block: "sameDay", attemptId: "fixed-a", mode: "midi" });
    const next = startCourseAttempt(store, 1, "sameDay", new Date(SAME_DAY_AT), { attemptId: "fixed-b" });
    expect(next.active?.attemptId).toBe("fixed-b");
    expect(next.trials).toEqual([]);
  });
});

describe("P23-47-fix-2 wrong answers only", () => {
  it("lists confirmed wrong and incomplete items in set order and excludes invalid, no-input and hint-assisted answers", () => {
    const attempt = attemptFor(1, "sameDay", "wrong-set", SAME_DAY_AT);
    const ids = sameDayIds(1);
    const trial = (itemId: string, result: "correct" | "wrong" | "incomplete" | "invalid" | "no-input", hintUsed = false) => createCourseTrial({
      attempt,
      itemId,
      quality: courseItemById(itemId)!.quality,
      root: courseItemById(itemId)!.root,
      result,
      sealedNotes: result === "invalid" || result === "no-input" ? [] : courseItemById(itemId)!.referenceNotes,
      hintUsed,
      selfConfirmed: false,
      midiConfirmed: true,
      startedAt: SAME_DAY_AT,
      sealedAt: SAME_DAY_AT,
    });
    const trials = [
      trial(ids[0]!, "correct"),
      trial(ids[1]!, "wrong"),
      trial(ids[2]!, "incomplete"),
      trial(ids[3]!, "correct", true),
      trial(ids[4]!, "invalid"),
      trial(ids[5]!, "no-input"),
    ];
    const store: CourseStore = { ...createCourseStore(), trials };
    expect(wrongItemIdsFor(store, 1, "sameDay", "wrong-set")).toEqual([ids[1], ids[2]]);
    expect(wrongItemIdsFor(store, 1, "sameDay", "another-attempt")).toEqual([]);
  });
});

describe("P23-55 wrong and hesitated answers for practice", () => {
  it("adds correct name answers slower than 2.5 s without a hint, keeps set order, and never an ear answer", () => {
    const attempt = attemptFor(1, "sameDay", "weak-set", SAME_DAY_AT);
    const ids = sameDayIds(1);
    const ear = sameDayEarIds(1)[0]!;
    const trial = (itemId: string, result: "correct" | "wrong", speedMs: number, hintUsed = false) => createCourseTrial({
      attempt,
      itemId,
      quality: courseItemById(itemId)!.quality,
      root: courseItemById(itemId)!.root,
      result,
      sealedNotes: courseItemById(itemId)!.referenceNotes,
      speedMs,
      hintUsed,
      selfConfirmed: false,
      midiConfirmed: true,
      startedAt: SAME_DAY_AT,
      sealedAt: SAME_DAY_AT,
    });
    const trials = [
      trial(ids[0]!, "correct", 1200),
      trial(ids[1]!, "correct", 3100),
      trial(ids[2]!, "wrong", 900),
      trial(ids[3]!, "correct", 2500),
      trial(ids[4]!, "correct", 4000, true),
      trial(ear, "correct", 6000),
    ];
    const store: CourseStore = { ...createCourseStore(), trials };
    expect(weakItemIdsFor(store, 1, "sameDay", "weak-set")).toEqual({ ids: [ids[1], ids[2]], wrong: 1, slow: 1 });
    expect(weakItemIdsFor(store, 1, "sameDay", "another-attempt")).toEqual({ ids: [], wrong: 0, slow: 0 });
  });
});

describe("P23-47 restarting a basic level", () => {
  it("starts a new round for one level without losing history or the other levels", () => {
    const passed = storeFor(1, passingCorrect(1));
    expect(currentCourseLevel(passed)).toBe(2);
    const roundAt = new Date(2026, 10, 18, 12, 0, 0).toISOString();
    const restarted = restartCourseLevel(passed, 1, new Date(roundAt));
    expect(restarted.trials).toHaveLength(passed.trials.length);
    expect(levelRoundStartedAt(restarted, 1)).toBe(roundAt);
    expect(trialsInCurrentRound(restarted, 1)).toHaveLength(0);
    expect(currentCourseLevel(restarted)).toBe(1);
    expect(coursePlan(restarted, new Date("2026-11-18T03:00:00.000Z")).kind).toBe("start-attempt");
  });

  it("does not complete the new round from the old correct answers", () => {
    const passed = storeFor(1, passingCorrect(1));
    const roundAt = new Date(2026, 10, 18, 12, 0, 0).toISOString();
    const restarted = restartCourseLevel(passed, 1, new Date(roundAt));
    const after = new Date(2026, 10, 18, 13, 0, 0).toISOString();
    const attempt = attemptFor(1, "sameDay", "round-2", after);
    const partial: CourseStore = {
      ...restarted,
      trials: [
        ...restarted.trials,
        ...trialsFor(1, "sameDay", attempt, sameDayIds(1).slice(0, 1), new Set([sameDayIds(1)[0]!]), after),
      ],
      active: attempt,
    };
    expect(latestCompleteAttempt(partial, 1, "sameDay")).toBeUndefined();
    expect(currentCourseLevel(partial)).toBe(1);
    expect(clearActiveAttempt(partial).rounds?.["1"]?.startedAt).toBe(roundAt);
  });

  it("keeps a restarted level's round across save and reload", async () => {
    const passed = storeFor(1, passingCorrect(1));
    const roundAt = new Date(2026, 10, 18, 12, 0, 0).toISOString();
    const repository = new CourseRepository(new MemoryCourseStorage());
    const restarted = restartCourseLevel(passed, 1, new Date(roundAt));
    await repository.save(restarted);
    const loaded = await repository.load();
    expect(loaded.kind).toBe("ok");
    if (loaded.kind !== "ok") return;
    expect(currentCourseLevel(loaded.store)).toBe(1);
    expect(loaded.store.rounds?.["1"]?.startedAt).toBe(roundAt);
  });
});


describe("REL-03 saved v3.0.0 course", () => {
  it.each([1, 2] as const)("loads the prior version of Lv%i without changing its pass result", async level => {
    const recorded = storeFor(level, passingCorrect(level));
    const storage = new MemoryCourseStorage();
    storage.committed = JSON.stringify({
      ...recorded, app: "loopvault-guided-course", fileVersion: 1,
      bankVersion: "p23-39.bank.lv1-3.v3",
      policyVersion: "p23-39.policy.lv1-3.v3",
      pairId: "p23-39.bank.lv1-3.v3+p23-39.policy.lv1-3.v3",
    });
    const loaded = await new CourseRepository(storage).load();
    expect(loaded.kind).toBe("ok");
    if (loaded.kind !== "ok") throw new Error("Saved course did not load");
    expect(loaded.store.trials).toEqual(recorded.trials);
    expect(evaluateCourseLevel(level, loaded.store.trials).passed).toBe(true);
    expect(storage.operations).toEqual(["read"]);
  });
});
