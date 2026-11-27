import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COURSE_BANK, COURSE_CONTRACT_VERSION, COURSE_LEVELS, COURSE_PAIR_ID, COURSE_POLICY, COURSE_POLICY_VERSION, COURSE_BANK_VERSION, courseItemById, courseLevelSets, coursePolicy } from "./bank";

const FROZEN = "docs/contracts/p23-39";

describe("P23-40 uses the P23-39 v3 frozen fixtures without reinterpretation", () => {
  it("matches the frozen bank and policy byte-for-byte (parsed)", () => {
    expect(COURSE_BANK).toEqual(JSON.parse(readFileSync(`${FROZEN}/bank-lv1-3-v3.json`, "utf8")));
    expect(COURSE_POLICY).toEqual(JSON.parse(readFileSync(`${FROZEN}/policy-lv1-3-v3.json`, "utf8")));
    expect(COURSE_BANK.version).toBe(COURSE_BANK_VERSION);
    expect(COURSE_BANK.policyVersion).toBe(COURSE_POLICY_VERSION);
    expect(COURSE_BANK.pairId).toBe(COURSE_PAIR_ID);
    expect(COURSE_CONTRACT_VERSION).toBe("p23-39.contracts.v3");
    expect(COURSE_BANK_VERSION).toBe("p23-39.bank.lv1-3.v3");
    expect(COURSE_POLICY_VERSION).toBe("p23-39.policy.lv1-3.v3");
  });

  it("keeps every same-day/delayed/ear set materialised and disjoint where the freeze says so", () => {
    for (const level of COURSE_LEVELS) {
      const sets = courseLevelSets(level);
      expect(sets.name.sameDay.length).toBe(coursePolicy(level).questions);
      expect(sets.name.delay.length).toBe(coursePolicy(level).delay.questions);
      expect(sets.name.sameDay.filter((id) => sets.name.delay.includes(id))).toEqual([]);
      for (const id of [...sets.name.sameDay, ...sets.name.delay, ...(sets.ear?.items ?? [])]) {
        expect(courseItemById(id), id).toBeDefined();
      }
    }
    // Lv2 ear covers all four qualities; Lv3 delay covers all six.
    const earQuality = new Set(courseLevelSets(2).ear!.items.map((id) => courseItemById(id)!.quality));
    expect(earQuality).toEqual(new Set(["maj7", "min7", "dom7", "min7b5"]));
    const delayQuality = new Set(courseLevelSets(3).name.delay.map((id) => courseItemById(id)!.quality));
    expect(delayQuality).toEqual(new Set(["maj", "min", "maj7", "min7", "dom7", "min7b5"]));
  });
});
