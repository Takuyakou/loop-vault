import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recipeNotes, symbol, type Quality } from "../domain/chordDojo/recipes";
import { chordPitchClasses } from "../domain/chordVoicing";
import { buildPracticeChordRequirements } from "../domain/practice/chordRequirements";
import {
  BANK_VERSION,
  CONTRACT_VERSION,
  LEVEL_QUALITIES,
  LEVEL_ROOTS,
  PAIR_ID,
  POLICY,
  POLICY_VERSION,
  buildBank,
  closeVoicing,
  evaluateLevel,
  levelPass,
  practiceProgress,
  type Bank,
  type Level,
  type LevelEvidence,
  type TrialEvidence,
} from "./bank";
import { earAccepts, judgeCourseAnswer, nameRecallAccepts } from "./answerPolicy";

const itemOf = (bank: Bank, id: string) => bank.items.find((item) => item.id === id)!;

const SAME_DAY_AT = new Date(2026, 10, 17, 20, 0, 0).toISOString();
const DELAYED_AT = new Date(2026, 10, 18, 9, 0, 0).toISOString(); // next local day, 13 h later

function evidenceFor(level: Level, bank: Bank, correctIds: ReadonlySet<string>, options: {
  midi?: boolean;
  speedMs?: (id: string) => number | undefined;
  hintIds?: ReadonlySet<string>;
  sameDayAt?: string | null;
  delayAt?: string | null;
} = {}): LevelEvidence {
  const sameDayAt = options.sameDayAt === undefined ? SAME_DAY_AT : options.sameDayAt;
  const delayAt = options.delayAt === undefined ? DELAYED_AT : options.delayAt;
  const toTrial = (id: string, at: string | null): TrialEvidence => {
    const correct = correctIds.has(id);
    return {
      itemId: id,
      result: correct ? "correct" : "wrong",
      ...(correct && options.speedMs !== undefined && options.speedMs(id) !== undefined ? { speedMs: options.speedMs(id) } : {}),
      midiConfirmed: options.midi ?? true,
      hintUsed: options.hintIds?.has(id) ?? false,
      selfConfirmed: false,
      ...(at === null ? {} : { at }),
    };
  };
  return {
    mode: options.midi === false ? "self" : "midi",
    name: bank.sets[level].name.sameDay.map((id) => toTrial(id, sameDayAt)),
    delay: bank.sets[level].name.delay.map((id) => toTrial(id, delayAt)),
    ...(bank.sets[level].ear === undefined ? {} : { ear: bank.sets[level].ear!.items.map((id) => toTrial(id, sameDayAt)) }),
  };
}

/** Mark `pass` items correct, ensuring every quality block still has at least `min`. */
function level3PassingIds(bank: Bank): Set<string> {
  const byQuality = new Map<string, string[]>();
  for (const id of bank.sets[3].name.sameDay) {
    const quality = itemOf(bank, id).quality;
    byQuality.set(quality, [...(byQuality.get(quality) ?? []), id]);
  }
  const correct = new Set<string>();
  for (const ids of byQuality.values()) ids.slice(0, 4).forEach((id) => correct.add(id));
  let extra = 3;
  for (const ids of byQuality.values()) {
    if (extra === 0) break;
    correct.add(ids[4]!);
    extra -= 1;
  }
  return correct;
}

describe("P23-39 §3 the Lv1–3 bank and policy (v3)", () => {
  it("has the frozen counts, cells and per-level coverage", () => {
    const bank = buildBank(2338);
    expect(bank.version).toBe(BANK_VERSION);
    expect(bank.policyVersion).toBe(POLICY_VERSION);
    expect(bank.contractVersion).toBe(CONTRACT_VERSION);
    expect(bank.pairId).toBe(PAIR_ID);
    expect(bank.counts.total).toBe(162);
    const level = (value: Level) => bank.items.filter((item) => item.level === value);
    expect(level(1)).toHaveLength(48);
    expect(level(2)).toHaveLength(54);
    expect(level(3)).toHaveLength(60);
    expect(level(1).filter((item) => item.prompt === "name")).toHaveLength(36);
    expect(level(1).filter((item) => item.prompt === "ear")).toHaveLength(12);
    expect(level(2).filter((item) => item.prompt === "name")).toHaveLength(30);
    expect(level(2).filter((item) => item.prompt === "ear")).toHaveLength(24);
    expect(level(3).filter((item) => item.prompt === "name")).toHaveLength(60);
    expect(level(3).filter((item) => item.prompt === "ear")).toHaveLength(0);

    // Lv1: 12 cells x 3 placements; Lv2: 24 cells + 6 second placements; Lv3: 30 cells x 2 placements.
    expect(new Set(level(1).filter((item) => item.prompt === "name").map((item) => item.cell)).size).toBe(12);
    expect(new Set(level(2).filter((item) => item.prompt === "name").map((item) => item.cell)).size).toBe(24);
    expect(new Set(level(3).filter((item) => item.prompt === "name").map((item) => item.cell)).size).toBe(30);
    // Lv2 has six roots (the v1 bank had five).
    expect(new Set(level(2).filter((item) => item.prompt === "name").map((item) => item.root)).size).toBe(6);
    expect(LEVEL_ROOTS[1]).toEqual([0, 7, 5, 9, 2, 4]);
    expect(LEVEL_ROOTS[2]).toHaveLength(6);
    // Lv3 covers all twelve roots at least twice.
    for (let root = 0; root < 12; root += 1) {
      expect(level(3).filter((item) => item.prompt === "name" && item.root === root).length).toBeGreaterThanOrEqual(2);
    }
    for (const item of bank.items) {
      expect(item.referenceNotes.length, item.id).toBeGreaterThanOrEqual(3);
      expect(Math.min(...item.referenceNotes)).toBeGreaterThanOrEqual(36);
      expect(Math.max(...item.referenceNotes)).toBeLessThanOrEqual(84);
      expect(recipeNotes(item.root, item.quality as Quality, "basic"), item.id).not.toBeUndefined();
    }
  });

  it("keeps the stored required/allowed tones identical to the product's normal leniency", () => {
    for (const item of buildBank(2338).items) {
      const requirements = buildPracticeChordRequirements(symbol(item.root, item.quality as Quality), "normal");
      const triad = (item.level === 1 || item.level === 3) && (item.quality === "maj" || item.quality === "min");
      const expectedRequired = triad
        ? [...chordPitchClasses(symbol(item.root, item.quality as Quality))].sort((left, right) => left - right)
        : requirements.requiredPitchClasses;
      expect(item.requiredPitchClasses, item.id).toEqual(expectedRequired);
      expect(item.allowedPitchClasses, item.id).toEqual(requirements.allowedPitchClasses);
      expect(item.bass, item.id).toBe(item.prompt === "ear" ? "root" : "free");
      expect(item.judge).toBe("core");
      expect(item.source).toBe("synthetic-public");
    }
  });

  it("materialises the frozen same-day, delayed and ear sets (no prose-only sets)", () => {
    const bank = buildBank(2338);
    for (const level of [1, 2, 3] as const) {
      const pair = bank.sets[level].name;
      expect(pair.sameDay, `Lv${level} same-day`).toHaveLength(POLICY.levels[level].questions);
      expect(pair.delay, `Lv${level} delay`).toHaveLength(POLICY.levels[level].delay.questions);
      expect(pair.required).toEqual({ sameDay: POLICY.levels[level].questions, delay: POLICY.levels[level].delay.questions });
      // Every id exists, is a name item of this level, and no item is repeated inside a set.
      for (const id of [...pair.sameDay, ...pair.delay]) {
        const item = itemOf(bank, id);
        expect(item.level).toBe(level);
        expect(item.prompt).toBe("name");
      }
      expect(new Set(pair.sameDay).size).toBe(pair.sameDay.length);
      expect(new Set(pair.delay).size).toBe(pair.delay.length);
      // Different problem = different item; a same item is never re-used between the two days.
      expect(pair.delay.filter((id) => pair.sameDay.includes(id))).toEqual([]);
      // Same-day coverage: every level root, and the quality block counts the policy needs.
      expect(new Set(pair.sameDay.map((id) => itemOf(bank, id).root)).size).toBe(LEVEL_ROOTS[level].length);
      for (const quality of LEVEL_QUALITIES[level]) {
        const count = pair.sameDay.filter((id) => itemOf(bank, id).quality === quality).length;
        if (level === 1) expect(count).toBe(10);
        else expect(count).toBe(POLICY.levels[level].perQuality!.of);
      }
      // The delayed set never repeats a same-day (cell, placement) pair.
      for (const id of pair.delay) {
        const delayed = itemOf(bank, id);
        const sameDayWithSameCell = pair.sameDay.map((sameDayId) => itemOf(bank, sameDayId)).filter((item) => item.cell === delayed.cell);
        expect(sameDayWithSameCell.map((item) => item.placement), delayed.id).not.toContain(delayed.placement);
      }
    }

    // Lv1 cannot use different cells (all 12 cells are in the same-day set): it must be shared cells.
    expect(bank.sets[1].name.differentiation.cells).toBe("shared");
    expect(bank.sets[1].name.differentiation.sharedCells).toBe(10);
    // Lv2 has four spare cells and six second placements.
    expect(bank.sets[2].name.differentiation).toMatchObject({ cells: "distinct-where-available", distinctCells: 4, sharedCells: 6 });
    // Lv3 uses all 30 cells on the same day.
    expect(bank.sets[3].name.differentiation).toMatchObject({ cells: "shared", sharedCells: 12, distinctCells: 0 });

    // Ear: Lv1/Lv2 have a real 10-item same-day set with the approved prompt conditions.
    expect(bank.sets[1].ear!.items).toHaveLength(POLICY.levels[1].ear!.questions);
    expect(bank.sets[2].ear!.items).toHaveLength(POLICY.levels[2].ear!.questions);
    for (const id of bank.sets[1].ear!.items) {
      const item = itemOf(bank, id);
      expect(item.ear).toMatchObject({ kind: "two-choice", choices: ["maj", "min"], choiceDisplayed: true, playbacks: 1, rootPresented: true, bass: "root" });
    }
    for (const id of bank.sets[2].ear!.items) {
      const item = itemOf(bank, id);
      expect(item.ear).toMatchObject({ kind: "identify", choiceDisplayed: false, playbacks: 1, rootPresented: true, bass: "root" });
      expect(item.ear!.choices).toEqual([...LEVEL_QUALITIES[2]]);
    }
    expect(bank.sets[3].ear).toBeUndefined();
    // The ear set also covers the level's roots (Lv1 = all six, Lv2 = all six).
    for (const level of [1, 2] as const) {
      expect(new Set(bank.sets[level].ear!.items.map((id) => itemOf(bank, id).root)).size).toBe(LEVEL_ROOTS[level].length);
    }
    // Evaluation-set coverage (not just the whole bank): every target quality appears in the set.
    const qualityCounts = (ids: readonly string[]) => {
      const counts: Record<string, number> = {};
      for (const id of ids) counts[itemOf(bank, id).quality] = (counts[itemOf(bank, id).quality] ?? 0) + 1;
      return counts;
    };
    // Lv1 ear balances major/minor (the v2 set was 6/4).
    expect(qualityCounts(bank.sets[1].ear!.items)).toEqual({ maj: 5, min: 5 });
    // Lv2 ear includes all four seventh qualities (the v2 set was 6 maj7 / 4 min7).
    expect(qualityCounts(bank.sets[2].ear!.items)).toEqual({ maj7: 3, min7: 3, dom7: 2, min7b5: 2 });
    // Lv3 delayed confirmation includes all six qualities, two each (the v2 set was 5/5/2 and nothing else).
    expect(qualityCounts(bank.sets[3].name.delay)).toEqual({ maj: 2, min: 2, maj7: 2, min7: 2, dom7: 2, min7b5: 2 });
  });

  it("keeps the same item set for every seed and only changes every presentation order", () => {
    const first = buildBank(2338);
    const second = buildBank(2338);
    const other = buildBank(9);
    expect(second.order).toEqual(first.order);
    expect(other.order).not.toEqual(first.order);
    expect(other.items).toEqual(first.items);
    expect(other.sets[1].name.sameDay.slice().sort()).toEqual(first.sets[1].name.sameDay.slice().sort());
    expect(other.sets[2].name.delay.slice().sort()).toEqual(first.sets[2].name.delay.slice().sort());
    expect(other.sets[1].name.sameDay).not.toEqual(first.sets[1].name.sameDay);
    expect(new Set(first.order)).toEqual(new Set(first.items.map((item) => item.id)));
  });

  it("freezes the pass rules without rounding or retro-fitted windows", () => {
    expect(POLICY.levels[1]).toMatchObject({ questions: 20, pass: 18, delay: { questions: 10, pass: 8 }, ear: { questions: 10, pass: 8 } });
    expect(POLICY.levels[2].perQuality).toEqual({ min: 4, of: 5 });
    expect(POLICY.levels[2].roots).toBe(6);
    expect(POLICY.levels[2].ear).toEqual({ questions: 10, pass: 8 });
    expect(POLICY.levels[3].perQuality).toEqual({ min: 4, of: 5 });
    expect(POLICY.levels[3].questions).toBe(30);
    expect(POLICY.levels[3].pass).toBe(27);
    expect(POLICY.levels[3].speed).toEqual({ limitMs: 3000, ofCorrect: 0.8 });
    for (const level of [2, 3] as const) {
      const policy = POLICY.levels[level];
      expect(Number.isInteger(policy.perQuality.min)).toBe(true);
      expect(policy.perQuality.min / policy.perQuality.of).toBe(0.8);
    }
    expect(POLICY.levels[3].pass / POLICY.levels[3].questions).toBe(0.9);
    // The superseded 24/22 set is recorded, not used; v1's inconsistencies are recorded too.
    expect(POLICY.superseded.lv3.questions).toBe(24);
    expect(POLICY.levels[3].questions).not.toBe(24);
    expect(POLICY.superseded.v1).toMatchObject({ lv2Roots: 5 });
    // The v1 bass condition is gone from the frozen answer policy.
    expect(POLICY.answerPolicy.nameRecall).not.toContain("source voicing's bass");
    expect(POLICY.answerPolicy.nameRecall).toContain("unspecified bass is free");
  });

  it("freezes the reference voicing fixture and accepts every valid placement", () => {
    const bank = buildBank(2338);
    const maj7 = bank.items.find((item) => item.level === 2 && item.prompt === "name" && item.quality === "maj7" && item.root === 0 && item.placement === "root")!;
    // Fixed literal fixture (C E G B), independent of the generator.
    expect(closeVoicing(0, "maj7", 0)).toEqual([48, 52, 55, 59]);
    expect(closeVoicing(0, "maj7", 1)).toEqual([52, 55, 59, 60]);
    expect(closeVoicing(0, "maj7", 2)).toEqual([55, 59, 60, 64]);
    expect(closeVoicing(0, "maj7", 3)).toEqual([59, 60, 64, 67]);
    for (const notes of [[48, 52, 55, 59], [52, 55, 59, 60], [55, 59, 60, 64], [59, 60, 64, 67]]) {
      expect(judgeCourseAnswer(maj7, "name", notes).ok, JSON.stringify(notes)).toBe(true);
    }
    // Every name item accepts its own model and a different valid inversion.
    for (const item of bank.items.filter((entry) => entry.prompt === "name")) {
      expect(nameRecallAccepts(item, item.referenceNotes), item.id).toBe(true);
      const inversion = closeVoicing(item.root, item.quality, 1);
      expect(nameRecallAccepts(item, inversion), item.id).toBe(true);
    }
    // Every ear item accepts its root-position model (harmony + root bass) and rejects an inversion of the bass.
    for (const item of bank.items.filter((entry) => entry.prompt === "ear")) {
      expect(earAccepts(item, item.referenceNotes), item.id).toBe(true);
      expect(earAccepts(item, closeVoicing(item.root, item.quality, 1)), item.id).toBe(false);
    }
  });

  it("freezes the JSON copies without drift", () => {
    const bank = buildBank(2338);
    expect(JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8"))).toEqual(bank);
    expect(JSON.parse(readFileSync("docs/p23-39-contracts/policy-lv1-3-v3.json", "utf8"))).toEqual(POLICY);
  });

  it("never passes an incomplete sheet: missing quality, denominators, duplicates and coverage all fail", () => {
    const bank = buildBank(2338);
    // The review's counterexample: 27 correct with no per-quality data must not pass.
    expect(levelPass(3, { mode: "midi", name: [], delay: [] })).toBe(false);
    const empty = evaluateLevel(3, { mode: "midi", name: [], delay: [] }, bank);
    expect(empty.passed).toBe(false);
    expect(empty.complete).toBe(false);

    const correct = level3PassingIds(bank);
    const delayCorrect = new Set(bank.sets[3].name.delay.slice(0, 10));
    const speed = (id: string) => (correct.has(id) ? ([...correct].indexOf(id) < 22 ? 2000 : 3500) : undefined);
    const passing: LevelEvidence = evidenceFor(3, bank, new Set([...correct, ...delayCorrect]), { speedMs: speed });
    expect(evaluateLevel(3, passing, bank).passed).toBe(true);

    // Drop one quality block: even with 27 correct, the official evaluator refuses.
    const missingQualityEvidence: LevelEvidence = { ...passing, name: passing.name.filter((trial) => itemOf(bank, trial.itemId).quality !== "min7b5") };
    expect(evaluateLevel(3, missingQualityEvidence, bank).passed).toBe(false);
    expect(missingQualityEvidence.name).toHaveLength(25);

    // 27 correct but one quality at 3/5 fails.
    const lowQuality = new Set([...correct]);
    const min7b5Ids = bank.sets[3].name.sameDay.filter((id) => itemOf(bank, id).quality === "min7b5");
    for (const id of min7b5Ids.slice(3)) lowQuality.delete(id);
    for (const id of bank.sets[3].name.sameDay.filter((id) => itemOf(bank, id).quality === "maj7").slice(4)) lowQuality.add(id);
    const lowQualityEvidence = evidenceFor(3, bank, new Set([...lowQuality, ...delayCorrect]), { speedMs: () => 2000 });
    const lowEvaluation = evaluateLevel(3, lowQualityEvidence, bank);
    expect(lowEvaluation.passed).toBe(false);
    expect(lowEvaluation.blocks.name.qualityBlocks.min7b5!.independentCorrect).toBe(3);

    // Duplicate item instead of a required one: no silent 27/30.
    const duplicated: LevelEvidence = {
      ...passing,
      name: [...passing.name.slice(1), { ...passing.name[0]!, itemId: passing.name[1]!.itemId }],
    };
    const duplicateEvaluation = evaluateLevel(3, duplicated, bank);
    expect(duplicateEvaluation.passed).toBe(false);
    expect(duplicateEvaluation.blocks.name.duplicateItemIds.length).toBeGreaterThan(0);

    // Self-confirmation is a different track and never a formal pass.
    expect(levelPass(3, { ...passing, mode: "self" }, bank)).toBe(false);
    // A hint-assisted correct answer does not count as independent.
    const hinted = new Set([...correct].slice(0, 1));
    expect(levelPass(3, evidenceFor(3, bank, new Set([...correct, ...delayCorrect]), { hintIds: hinted, speedMs: () => 2000 }), bank)).toBe(false);
    // Missing speed counts as not within the 3 s condition.
    expect(levelPass(3, evidenceFor(3, bank, new Set([...correct, ...delayCorrect]), { speedMs: () => undefined }), bank)).toBe(false);
    // Invalid trials are excluded and re-triable, never counted.
    const withInvalid: LevelEvidence = { ...passing, name: [...passing.name, { itemId: passing.name[0]!.itemId, result: "invalid" as const }] };
    expect(evaluateLevel(3, withInvalid, bank).passed).toBe(true);
  });

  it("requires the delayed block to start next day and >= 12 h after the same-day completion (injected clock)", () => {
    const bank = buildBank(2338);
    const correct = level3PassingIds(bank);
    const delayCorrect = new Set(bank.sets[3].name.delay.slice(0, 10));
    const ids = new Set([...correct, ...delayCorrect]);
    const at = (ms: number) => new Date(ms).toISOString();
    const base = new Date(2026, 10, 17, 20, 0, 0).getTime();
    const evaluate = (sameDayAt: string | null, delayAt: string | null) =>
      evaluateLevel(3, evidenceFor(3, bank, ids, { speedMs: () => 2000, sameDayAt, delayAt }), bank);

    const eligible = evaluate(at(base), at(base + 13 * 3_600_000));
    expect(eligible.passed).toBe(true);
    expect(eligible.dates.eligible).toBe(true);
    expect(eligible.dates.sameLocalDate).toBe(false);

    // 13 h later but still the same local calendar day: not "next day".
    const sameDay = evaluate(
      at(new Date(2026, 10, 17, 0, 30, 0).getTime()),
      at(new Date(2026, 10, 17, 13, 30, 0).getTime()),
    );
    expect(sameDay.complete).toBe(true);
    expect(sameDay.passed).toBe(false);
    expect(sameDay.dates.reason).toBe("同じ日です");

    // Next day but only 10 h after the same-day completion.
    const shortNight = evaluate(at(base), at(base + 10 * 3_600_000));
    expect(shortNight.passed).toBe(false);
    expect(shortNight.dates.reason).toBe("12 時間未満です");

    // A delayed time before the same-day completion is never eligible.
    const backwards = evaluate(at(base), at(base - 3_600_000));
    expect(backwards.passed).toBe(false);
    expect(backwards.dates.reason).toBe("遅延評価が同日評価より前です");

    // Missing timestamps can never be treated as "later".
    const missingDelay = evaluate(at(base), null);
    expect(missingDelay.complete).toBe(true);
    expect(missingDelay.passed).toBe(false);
    expect(missingDelay.dates.eligible).toBe(false);
    expect(missingDelay.dates.reason).toBe("時刻がありません");
    const missingSameDay = evaluate(null, at(base + 13 * 3_600_000));
    expect(missingSameDay.passed).toBe(false);
    expect(missingSameDay.dates.eligible).toBe(false);
  });

  it("passes Lv1/Lv2 only with every block and keeps partial scoring separate", () => {
    const bank = buildBank(2338);
    const lv1SameDay = bank.sets[1].name.sameDay;
    const lv1Delay = new Set(bank.sets[1].name.delay.slice(0, 8));
    const lv1Ear = new Set(bank.sets[1].ear!.items.slice(0, 8));
    expect(levelPass(1, evidenceFor(1, bank, new Set([...lv1SameDay, ...lv1Delay, ...lv1Ear])), bank)).toBe(true);
    expect(levelPass(1, evidenceFor(1, bank, new Set([...lv1SameDay, ...lv1Delay])), bank)).toBe(false);
    expect(levelPass(1, evidenceFor(1, bank, new Set([...lv1SameDay, ...lv1Ear])), bank)).toBe(false);
    expect(levelPass(1, evidenceFor(1, bank, new Set([...lv1SameDay.slice(3), ...lv1Delay, ...lv1Ear])), bank)).toBe(false);

    const lv2Same = bank.sets[2].name.sameDay;
    const byQuality = new Map<string, string[]>();
    for (const id of lv2Same) {
      const quality = itemOf(bank, id).quality;
      byQuality.set(quality, [...(byQuality.get(quality) ?? []), id]);
    }
    const lv2Correct = new Set<string>();
    for (const ids of byQuality.values()) ids.slice(0, 4).forEach((id) => lv2Correct.add(id));
    lv2Correct.add([...byQuality.values()][0]![4]!);
    lv2Correct.add([...byQuality.values()][1]![4]!);
    const lv2Delay = new Set(bank.sets[2].name.delay.slice(0, 8));
    const lv2Ear = new Set(bank.sets[2].ear!.items.slice(0, 8));
    expect(levelPass(2, evidenceFor(2, bank, new Set([...lv2Correct, ...lv2Delay, ...lv2Ear])), bank)).toBe(true);
    expect(levelPass(2, evidenceFor(2, bank, new Set([...lv2Correct, ...lv2Delay])), bank)).toBe(false);

    const partial = practiceProgress(3, { mode: "self", name: bank.sets[3].name.sameDay.slice(0, 10).map((itemId) => ({ itemId, result: "correct" as const, selfConfirmed: true })), delay: [] }, bank);
    expect(partial.formal).toBe(false);
    expect(partial.name).toEqual({ evaluated: 10, correct: 10, required: 30, passAt: 27 });
    expect(partial.note).toBe("practice only; never a promotion");
  });
});
