import { describe, expect, it } from "vitest";
import { advancedItemById, advancedSetIds } from "./bank";
import { recheckIdsFor } from "./lv6";
import { advancedPlan, advancedHomeSummary, evaluateAdvancedLevel, firstUnpassedAdvancedLevel, latestAdvancedAttemptId, restartAdvancedLevel, weakAdvancedItemIdsFor, wrongAdvancedItemIdsFor } from "./review";
import {
  AdvancedRepository,
  MemoryAdvancedStorage,
  appendAdvancedTrial,
  clearAdvancedActive,
  createAdvancedStore,
  createAdvancedTrial,
  startAdvancedAttempt,
} from "./store";
import type { AdvancedAttempt, AdvancedCourseLevel, AdvancedStore } from "./types";

const OLD = "2026-11-17T00:00:00.000Z";
const AT = "2026-11-18T00:00:00.000Z";

interface AnswerOptions {
  readonly correct?: (index: number, itemId: string) => boolean;
  readonly speedMs?: (index: number, itemId: string) => number | undefined;
  readonly hint?: boolean;
}

let sequence = 0;

function start(store: AdvancedStore, level: AdvancedCourseLevel, block: "sameDay" | "delay", at: string, group?: string, practice = false): { store: AdvancedStore; attempt: AdvancedAttempt } {
  const ids = advancedSetIds(level, block, group);
  sequence += 1;
  const attemptId = `${String(level)}-${block}-${group ?? "all"}-${practice ? "p" : "o"}-${sequence}`;
  const next = startAdvancedAttempt(store, { level, block, setId: level === 8 ? (group ?? "six") : block, itemIds: ids, ...(group === undefined ? {} : { group }), practice }, new Date(at), { attemptId });
  return { store: next, attempt: next.attempts.find((entry) => entry.attemptId === attemptId)! };
}

function answer(store: AdvancedStore, attempt: AdvancedAttempt, at: string, options: AnswerOptions = {}): AdvancedStore {
  let next = store;
  for (const [index, id] of attempt.itemIds.entries()) {
    const item = advancedItemById(id);
    const ok = options.correct === undefined ? true : options.correct(index, id);
    next = appendAdvancedTrial(next, createAdvancedTrial({
      attempt,
      itemId: id,
      result: ok ? "correct" : "wrong",
      sealedNotes: ok ? (item?.chords[0]?.referenceNotes ?? []) : [],
      ...(options.speedMs === undefined ? {} : { speedMs: options.speedMs(index, id) }),
      hintUsed: options.hint ?? false,
      startedAt: at,
      sealedAt: at,
    }));
  }
  return clearAdvancedActive(next);
}

function block(store: AdvancedStore, level: AdvancedCourseLevel, which: "sameDay" | "delay", at: string, options: AnswerOptions = {}, group?: string): AdvancedStore {
  const { store: started, attempt } = start(store, level, which, at, group);
  return answer(started, attempt, at, options);
}

function lv4(): AdvancedStore {
  let store = createAdvancedStore();
  store = block(store, 4, "sameDay", OLD, { correct: (index) => index < 18 });
  store = block(store, 4, "delay", AT, { correct: (index) => index < 8 });
  return store;
}

function lv8All(groups = ["six", "nine", "thirteen"]): AdvancedStore {
  let store = createAdvancedStore();
  for (const group of groups) {
    // P23-56: 12 names, 4 recolours, 6 ear — miss one ear (5/6); later 6 names and 2 of 3 recolours.
    store = block(store, 8, "sameDay", OLD, { correct: (index) => index !== 21 }, group);
    store = block(store, 8, "delay", AT, { correct: (index) => index < 8 }, group);
  }
  return store;
}

function capstone(speedLimit = 1200): AdvancedStore {
  let store = createAdvancedStore();
  store = block(store, "capstone", "sameDay", OLD, {
    correct: (index, id) => {
      const part = advancedItemById(id)?.part;
      if (part === "name") return index < 22;
      if (part === "progression") return index < 24 + 4;
      return true;
    },
    speedMs: (index, id) => (advancedItemById(id)?.part === "name" && index < 22 ? speedLimit : undefined),
  });
  store = block(store, "capstone", "delay", AT, { correct: (index) => index < 11 || index >= 12 });
  return store;
}

describe("P23-45 advanced evaluation", () => {
  it("passes Lv4 with 18/20 same-day and 8/10 delayed independent answers", () => {
    const evaluation = evaluateAdvancedLevel(lv4(), 4);
    expect(evaluation.sameDay.independentCorrect).toBe(18);
    expect(evaluation.delay.independentCorrect).toBe(8);
    expect(evaluation.dates.eligible).toBe(true);
    expect(evaluation.passed).toBe(true);
    expect(firstUnpassedAdvancedLevel(lv4())).toBe(5);
  });

  it("does not pass Lv4 with 17/20 even when the delayed day is perfect", () => {
    let store = createAdvancedStore();
    store = block(store, 4, "sameDay", OLD, { correct: (index) => index < 17 });
    store = block(store, 4, "delay", AT, { correct: () => true });
    const evaluation = evaluateAdvancedLevel(store, 4);
    expect(evaluation.sameDay.ok).toBe(false);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.reasons.join(" ")).toContain("同日の合格条件");
  });

  it("never treats a self-confirmed attempt as a formal pass", () => {
    let store = createAdvancedStore();
    const started = start(store, 4, "sameDay", OLD);
    store = clearAdvancedActive(appendAdvancedTrial(started.store, createAdvancedTrial({
      attempt: started.attempt,
      itemId: started.attempt.itemIds[0]!,
      result: "correct",
      sealedNotes: [],
      selfConfirmed: true,
      midiConfirmed: false,
      startedAt: OLD,
      sealedAt: OLD,
    })));
    store = block(store, 4, "sameDay", OLD, { correct: () => true });
    store = block(store, 4, "delay", AT, { correct: () => true });
    expect(evaluateAdvancedLevel(store, 4).mode).toBe("midi");

    // Only self-confirmed attempts: the same counts do not reach a formal pass.
    let selfOnly = createAdvancedStore();
    selfOnly = block(selfOnly, 4, "sameDay", OLD, { correct: () => true });
    selfOnly = block(selfOnly, 4, "delay", AT, { correct: () => true });
    const selfAttempts = selfOnly.attempts.map((attempt) => ({ ...attempt, mode: "self" as const }));
    const selfTrials = selfOnly.trials.map((trial) => ({ ...trial, midiConfirmed: false, selfConfirmed: true }));
    const selfEvaluation = evaluateAdvancedLevel({ ...selfOnly, attempts: selfAttempts, trials: selfTrials }, 4);
    expect(selfEvaluation.mode).toBe("self");
    expect(selfEvaluation.passed).toBe(false);
  });

  it("applies the Lv5 part thresholds: 8/10 progressions AND 3/4 mid-card questions", () => {
    let store = createAdvancedStore();
    store = block(store, 5, "sameDay", OLD, { correct: (index) => index < 11 });
    store = block(store, 5, "delay", AT, { correct: () => true });
    const failing = evaluateAdvancedLevel(store, 5);
    expect(failing.sameDay.parts.find((part) => part.id === "mid")!.independentCorrect).toBe(1);
    expect(failing.sameDay.ok).toBe(false);

    let second = createAdvancedStore();
    second = block(second, 5, "sameDay", OLD, {
      correct: (index, id) => (advancedItemById(id)?.part === "progressions" ? index < 10 : index >= 11),
    });
    second = block(second, 5, "delay", AT, { correct: () => true });
    const passing = evaluateAdvancedLevel(second, 5);
    expect(passing.sameDay.parts.find((part) => part.id === "progressions")!.independentCorrect).toBe(10);
    expect(passing.sameDay.parts.find((part) => part.id === "mid")!.independentCorrect).toBe(3);
    expect(passing.passed).toBe(true);
  });

  it("requires correct evidence for all twelve Lv6 keys and rechecks only the missing ones", () => {
    let store = createAdvancedStore();
    store = block(store, 6, "sameDay", OLD, { correct: (index) => index < 11 });
    // The delayed keys are 1,3,5,7,9,11; failing the last one leaves key 11 without evidence.
    store = block(store, 6, "delay", AT, { correct: (index) => index < 5 });
    const missing = evaluateAdvancedLevel(store, 6);
    expect(missing.missingKeys).toEqual([11]);
    expect(missing.passed).toBe(false);

    const recheckIds = recheckIdsFor([11]);
    const recheckBase = startAdvancedAttempt(store, { level: 6, block: "sameDay", setId: "recheck", itemIds: recheckIds }, new Date(AT), { attemptId: "lv6-recheck" });
    const recheckAttempt = recheckBase.attempts.find((attempt) => attempt.attemptId === "lv6-recheck")!;
    const covered = evaluateAdvancedLevel(answer(recheckBase, recheckAttempt, AT), 6);
    expect(covered.missingKeys).toEqual([]);
    expect(covered.passed).toBe(true);
  });

  it("passes Lv7 with 8/10 and 4/5 ear progressions", () => {
    let store = createAdvancedStore();
    store = block(store, 7, "sameDay", OLD, { correct: (index) => index < 8 });
    store = block(store, 7, "delay", AT, { correct: (index) => index < 4 });
    expect(evaluateAdvancedLevel(store, 7).passed).toBe(true);
  });

  it("passes Lv8 only when all three groups pass both blocks", () => {
    expect(evaluateAdvancedLevel(lv8All(), 8).passed).toBe(true);
    const partial = lv8All(["six", "nine"]);
    const evaluation = evaluateAdvancedLevel(partial, 8);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.groups!.find((group) => group.group === "thirteen")!.sameDay.ok).toBe(false);
    expect(evaluation.groups!.find((group) => group.group === "six")!.passed).toBe(true);
  });

  it("fails a Lv8 group when its ear part misses the 5/6 threshold", () => {
    let store = createAdvancedStore();
    store = block(store, 8, "sameDay", OLD, { correct: (index) => index < 20 }, "six");
    expect(evaluateAdvancedLevel(store, 8).groups!.find((group) => group.group === "six")!.sameDay.ok).toBe(false);
  });

  it("passes the capstone parts ①②③, the delayed day and the 3-second ratio", () => {
    const evaluation = evaluateAdvancedLevel(capstone(), "capstone");
    expect(evaluation.sameDay.speed).toMatchObject({ correct: 22, ok: true });
    expect(evaluation.sameDay.parts.find((part) => part.id === "sight")!.ok).toBe(true);
    expect(evaluation.passed).toBe(true);
  });

  it("P23-53: passes the capstone with 2 of 3 sight charts and 2 of 3 delayed ear questions; 1 of 3 still fails", () => {
    const run = (sightCorrect: number, earCorrect: number) => {
      let store = createAdvancedStore();
      store = block(store, "capstone", "sameDay", OLD, {
        correct: (index, id) => {
          const part = advancedItemById(id)?.part;
          if (part === "name") return index < 22;
          if (part === "progression") return index < 24 + 4;
          return index < 29 + sightCorrect;
        },
        speedMs: (index, id) => (advancedItemById(id)?.part === "name" && index < 22 ? 1200 : undefined),
      });
      store = block(store, "capstone", "delay", AT, { correct: (index) => index < 11 || (index >= 12 && index < 12 + earCorrect) });
      return evaluateAdvancedLevel(store, "capstone");
    };
    const twoAndTwo = run(2, 2);
    expect(twoAndTwo.sameDay.parts.find((part) => part.id === "sight")!.ok).toBe(true);
    expect(twoAndTwo.passed).toBe(true);
    expect(run(1, 3).sameDayPassed).toBe(false);
    expect(run(3, 1).passed).toBe(false);
  });

  it("fails the capstone when fewer than 80% of the correct names are within three seconds", () => {
    const evaluation = evaluateAdvancedLevel(capstone(5000), "capstone");
    expect(evaluation.sameDay.speed!.ratio).toBe(0);
    expect(evaluation.sameDayPassed).toBe(false);
    expect(evaluation.passed).toBe(false);

    let store = createAdvancedStore();
    store = block(store, "capstone", "sameDay", OLD, {
      correct: (index, id) => {
        const part = advancedItemById(id)?.part;
        if (part === "name") return index < 22;
        if (part === "progression") return index < 28;
        return true;
      },
      // 17 of the 22 correct names are fast: 77%.
      speedMs: (index, id) => (advancedItemById(id)?.part === "name" && index < 17 ? 1200 : undefined),
    });
    store = block(store, "capstone", "delay", AT, { correct: () => true });
    const slow = evaluateAdvancedLevel(store, "capstone");
    expect(slow.sameDay.speed!.ratio).toBeCloseTo(17 / 22, 5);
    expect(slow.sameDay.speed!.ok).toBe(false);
    expect(slow.passed).toBe(false);
  });

  it("requires a later local day and at least 12 hours for the delayed block", () => {
    const sameDayAt = "2026-11-17T01:00:00.000Z";
    const sameDay = block(createAdvancedStore(), 4, "sameDay", sameDayAt, { correct: () => true });
    const sameDayAgain = block(sameDay, 4, "delay", "2026-11-17T08:00:00.000Z", { correct: () => true });
    expect(evaluateAdvancedLevel(sameDayAgain, 4).dates.eligible).toBe(false);

    const nextDayEarly = block(sameDay, 4, "delay", "2026-11-18T05:00:00.000Z", { correct: () => true });
    const evaluation = evaluateAdvancedLevel(nextDayEarly, 4);
    expect(evaluation.dates.elapsedMs).toBe(28 * 60 * 60 * 1000);
    expect(evaluation.dates.eligible).toBe(true);
    expect(evaluation.passed).toBe(true);
  });

  it("ignores free practice in every formal count", () => {
    let store = createAdvancedStore();
    const started = start(store, 4, "sameDay", OLD, undefined, true);
    store = answer(started.store, started.attempt, OLD);
    const evaluation = evaluateAdvancedLevel(store, 4);
    expect(evaluation.sameDay.evaluated).toBe(0);
    expect(evaluation.passed).toBe(false);
    expect(firstUnpassedAdvancedLevel(store)).toBe(4);
  });

  it("plans start, delay wait, delayed start and finish in order", () => {
    const empty = advancedPlan(createAdvancedStore(), 4, new Date(AT));
    expect(empty).toMatchObject({ kind: "start", block: "sameDay" });

    const sameDay = block(createAdvancedStore(), 4, "sameDay", OLD, { correct: () => true });
    const waiting = advancedPlan(sameDay, 4, new Date("2026-11-17T05:00:00.000Z"));
    expect(waiting).toMatchObject({ kind: "delay-wait" });

    const ready = advancedPlan(sameDay, 4, new Date(AT));
    expect(ready).toMatchObject({ kind: "start", block: "delay" });

    const finished = advancedPlan(lv4(), 4, new Date(AT));
    expect(finished).toMatchObject({ kind: "finished" });
  });

  it("resumes the same mid-attempt position and shows the block result when done", () => {
    const { store: started, attempt } = start(createAdvancedStore(), 4, "sameDay", OLD);
    const partial = appendAdvancedTrial(started, createAdvancedTrial({
      attempt,
      itemId: attempt.itemIds[0]!,
      result: "correct",
      sealedNotes: [],
      startedAt: OLD,
      sealedAt: OLD,
    }));
    const plan = advancedPlan(partial, 4, new Date(AT));
    expect(plan).toMatchObject({ kind: "question", index: 2, total: 20 });
    const done = answer(partial, { ...attempt, itemIds: attempt.itemIds.slice(1) }, OLD);
    const asShown = { ...done, active: attempt.attemptId };
    expect(advancedPlan(asShown, 4, new Date(AT))).toMatchObject({ kind: "block-result", block: "sameDay" });
    expect(advancedPlan(done, 4, new Date(AT))).toMatchObject({ kind: "start", block: "delay" });
  });

  it("plans the Lv6 key recheck after both blocks pass", () => {
    let store = createAdvancedStore();
    store = block(store, 6, "sameDay", OLD, { correct: (index) => index < 11 });
    store = block(store, 6, "delay", AT, { correct: (index) => index < 5 });
    const plan = advancedPlan(store, 6, new Date(AT));
    expect(plan).toMatchObject({ kind: "recheck", keys: [11] });
    if (plan.kind === "recheck") expect(plan.itemIds).toEqual(["lv6-rc-11"]);
  });

  it("moves Lv8 group by group", () => {
    let store = createAdvancedStore();
    const first = advancedPlan(store, 8, new Date(AT));
    expect(first).toMatchObject({ kind: "start", block: "sameDay", group: "six" });
    store = block(store, 8, "sameDay", OLD, { correct: () => true }, "six");
    // Another group's same-day questions can be answered while this group's delayed day is pending.
    const another = advancedPlan(store, 8, new Date("2026-11-17T03:00:00.000Z"));
    expect(another).toMatchObject({ kind: "start", block: "sameDay", group: "nine" });
    store = block(store, 8, "sameDay", OLD, { correct: () => true }, "nine");
    store = block(store, 8, "sameDay", OLD, { correct: () => true }, "thirteen");
    const waiting = advancedPlan(store, 8, new Date("2026-11-17T03:00:00.000Z"));
    expect(waiting).toMatchObject({ kind: "delay-wait", group: "six" });
    store = block(store, 8, "delay", AT, { correct: () => true }, "six");
    const next = advancedPlan(store, 8, new Date(AT));
    expect(next).toMatchObject({ kind: "start", block: "delay", group: "nine" });
    expect(advancedPlan(lv8All(), 8, new Date(AT))).toMatchObject({ kind: "finished" });
  });

  it("summarizes the home card with the next level, a resumable attempt and the remaining count", () => {
    const fresh = advancedHomeSummary(createAdvancedStore());
    expect(fresh).toMatchObject({ level: 4, levelText: "Lv4", remaining: 20, status: "start" });

    const started = start(createAdvancedStore(), 4, "sameDay", OLD);
    const partial = appendAdvancedTrial(started.store, createAdvancedTrial({
      attempt: started.attempt,
      itemId: started.attempt.itemIds[0]!,
      result: "correct",
      sealedNotes: [],
      startedAt: OLD,
      sealedAt: OLD,
    }));
    expect(advancedHomeSummary(partial)).toMatchObject({ level: 4, remaining: 19, status: "resume" });
    expect(advancedHomeSummary(lv4())).toMatchObject({ level: 5, status: "start" });
  });

  it("restarts one level without reusing old answers, keeping achievements and other levels", () => {
    const roundAt = "2026-11-18T12:00:00.000Z";
    const passed = lv4();
    expect(evaluateAdvancedLevel(passed, 4).passed).toBe(true);
    const restarted = restartAdvancedLevel(passed, 4, new Date(roundAt));
    expect(restarted.rounds?.["4"]?.startedAt).toBe(roundAt);
    expect(restarted.attempts).toHaveLength(passed.attempts.length);
    expect(restarted.trials).toHaveLength(passed.trials.length);
    expect(restarted.achievements).toContain(4);
    expect(evaluateAdvancedLevel(restarted, 4).passed).toBe(false);
    expect(firstUnpassedAdvancedLevel(restarted)).toBe(4);
    expect(advancedHomeSummary(restarted)).toMatchObject({ level: 4, status: "start", previouslyPassed: true });

    // Old correct answers never complete the new round; only the new attempt counts.
    const next = start(restarted, 4, "sameDay", "2026-11-18T13:00:00.000Z");
    const partial = appendAdvancedTrial(next.store, createAdvancedTrial({
      attempt: next.attempt,
      itemId: next.attempt.itemIds[0]!,
      result: "correct",
      sealedNotes: [],
      startedAt: "2026-11-18T13:00:00.000Z",
      sealedAt: "2026-11-18T13:00:00.000Z",
    }));
    const evaluation = evaluateAdvancedLevel(partial, 4);
    expect(evaluation.passed).toBe(false);
    // The round has no completed attempt yet; the old 20-answer attempt is not reused.
    expect(evaluation.sameDay.evaluated).toBe(0);
    expect(advancedPlan(partial, 4, new Date("2026-11-18T13:00:00.000Z"))).toMatchObject({ kind: "question", index: 2 });
  });

  it("keeps another level's active attempt when one level restarts", () => {
    let store = lv4();
    const five = start(store, 5, "sameDay", OLD);
    store = five.store;
    const restarted = restartAdvancedLevel(store, 4, new Date("2026-11-18T12:00:00.000Z"));
    expect(restarted.active).toBe(five.attempt.attemptId);
    expect(restarted.attempts.filter((attempt) => attempt.level === 5)).toHaveLength(1);
    expect(restarted.free).toBeUndefined();
  });

  it("clears Lv6 key evidence when the level starts a new round", () => {
    let store = createAdvancedStore();
    store = block(store, 6, "sameDay", OLD, { correct: () => true });
    store = block(store, 6, "delay", AT, { correct: () => true });
    expect(evaluateAdvancedLevel(store, 6).missingKeys).toEqual([]);
    const restarted = restartAdvancedLevel(store, 6, new Date("2026-11-18T12:00:00.000Z"));
    expect(evaluateAdvancedLevel(restarted, 6).missingKeys).toHaveLength(12);
  });

  it("round-trips the completed advanced evidence through the repository", async () => {
    const storage = new MemoryAdvancedStorage();
    const repository = new AdvancedRepository(storage);
    const store = lv4();
    await repository.save(store);
    const loaded = await repository.load();
    expect(loaded.kind).toBe("ok");
    if (loaded.kind !== "ok") return;
    expect(evaluateAdvancedLevel(loaded.store, 4).passed).toBe(true);
  });

  it("lists the wrong / incomplete items of one attempt for the wrong-answer practice", () => {
    const started = start(createAdvancedStore(), 4, "sameDay", OLD);
    let store = started.store;
    const ids = started.attempt.itemIds.slice(0, 6);
    const add = (itemId: string, result: "correct" | "wrong" | "incomplete" | "invalid" | "no-input", hintUsed = false) => {
      store = appendAdvancedTrial(store, createAdvancedTrial({
        attempt: started.attempt,
        itemId,
        result,
        sealedNotes: [],
        hintUsed,
        startedAt: OLD,
        sealedAt: OLD,
      }));
    };
    add(ids[0]!, "correct");
    add(ids[1]!, "wrong");
    add(ids[2]!, "incomplete");
    add(ids[3]!, "correct", true);
    add(ids[4]!, "invalid");
    add(ids[5]!, "no-input");
    expect(wrongAdvancedItemIdsFor(store, started.attempt.attemptId)).toEqual([ids[1], ids[2]]);
    expect(wrongAdvancedItemIdsFor(store, "another-attempt")).toEqual([]);
  });

  it("P23-55: adds slow correct single-chord answers (over 2.5 s, no hint) but not slow connections", () => {
    const started = start(createAdvancedStore(), 4, "sameDay", OLD);
    let store = started.store;
    const ids = started.attempt.itemIds;
    const add = (itemId: string, result: "correct" | "wrong", speedMs: number, hintUsed = false) => {
      store = appendAdvancedTrial(store, createAdvancedTrial({ attempt: started.attempt, itemId, result, sealedNotes: [], speedMs, hintUsed, startedAt: OLD, sealedAt: OLD }));
    };
    add(ids[0]!, "correct", 1000); // C/E, quick
    add(ids[1]!, "correct", 3200); // G/B, hesitated
    add(ids[2]!, "wrong", 800);
    add(ids[3]!, "correct", 5000, true); // a hint: not counted
    add(ids[5]!, "correct", 9000); // C → C/E → F: a connection is timed differently
    expect(advancedItemById(ids[5]!)!.chords.length).toBe(3);
    expect(weakAdvancedItemIdsFor(store, started.attempt.attemptId)).toEqual({ ids: [ids[1], ids[2]], wrong: 1, slow: 1 });
    expect(weakAdvancedItemIdsFor(store, "another-attempt")).toEqual({ ids: [], wrong: 0, slow: 0 });
  });

  it("P23-55: names the latest completed same-day attempt for the map's practice button", () => {
    const store = lv4();
    const id = latestAdvancedAttemptId(store, 4, "sameDay");
    expect(store.attempts.find((attempt) => attempt.attemptId === id)?.block).toBe("sameDay");
    expect(latestAdvancedAttemptId(createAdvancedStore(), 4, "sameDay")).toBeUndefined();
  });
});
