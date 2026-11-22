import { describe, expect, it } from "vitest";
import { buildBank } from "./bank";
import { earAccepts, earChoiceCorrect, judgeCourseAnswer, nameRecallAccepts } from "./answerPolicy";

/**
 * P23-39 §3 P2 (v2): the answer policies. The fixtures are handwritten literal MIDI notes, not values
 * recomputed from the generator, so the bass-free name recall is checked against the approved design and
 * stays separated from the saved-voicing exact match.
 */
const bank = buildBank(2338);
const cmaj7 = bank.items.find((item) => item.level === 2 && item.prompt === "name" && item.quality === "maj7" && item.root === 0 && item.placement === "root")!;
const cmaj7Ear = bank.items.find((item) => item.level === 2 && item.prompt === "ear" && item.quality === "maj7" && item.root === 0)!;
const lv1MajEar = bank.items.find((item) => item.level === 1 && item.prompt === "ear" && item.quality === "maj" && item.root === 0)!;

describe("P23-39 §3 the name-recall answer policy", () => {
  it("accepts every inversion of a Cmaj7 when no bass is specified (fixed fixture)", () => {
    const inversions = [
      [48, 52, 55, 59], // root position C E G B
      [52, 55, 59, 60], // first inversion E G B C
      [55, 59, 60, 64], // second inversion G B C E
      [59, 60, 64, 67], // third inversion B C E G
    ];
    for (const notes of inversions) {
      const judgement = judgeCourseAnswer(cmaj7, "name", notes);
      expect(judgement.ok, `${JSON.stringify(notes)}: ${judgement.reason}`).toBe(true);
      expect(judgement.bass).toBe("free");
    }
  });

  it("keeps the product's normal omission contract: the 5th may be omitted, the 7th may not", () => {
    // C E B without the 5th is accepted; C E without the 7th is not.
    expect(nameRecallAccepts(cmaj7, [48, 52, 59])).toBe(true);
    expect(nameRecallAccepts(cmaj7, [48, 52])).toBe(false);
    const missingSeventh = judgeCourseAnswer(cmaj7, "name", [48, 52, 55]);
    expect(missingSeventh.ok).toBe(false);
    expect(missingSeventh.missingPitchClasses).toEqual([11]);
    expect(missingSeventh.reason).toContain("B");
  });

  it("rejects a foreign tone regardless of inversion", () => {
    const foreign = judgeCourseAnswer(cmaj7, "name", [48, 52, 55, 59, 61]);
    expect(foreign.ok).toBe(false);
    expect(foreign.foreignPitchClasses).toEqual([1]);
    expect(foreign.reason).toContain("余分な音");
  });

  it("is distinct from the saved-voicing policy (same notes and octaves only)", () => {
    expect(judgeCourseAnswer(cmaj7, "saved-voicing", [48, 52, 55, 59]).ok).toBe(true);
    const inversion = judgeCourseAnswer(cmaj7, "saved-voicing", [52, 55, 59, 60]);
    expect(inversion.ok).toBe(false);
    expect(inversion.reason).toContain("保存された配置");
    // The name policy accepts what the saved-voicing policy rejects: the two tasks are never mixed.
    expect(judgeCourseAnswer(cmaj7, "name", [52, 55, 59, 60]).ok).toBe(true);
  });

  it("names the ear policy's specified bass and rejects an inversion there", () => {
    expect(earAccepts(cmaj7Ear, [48, 52, 55, 59])).toBe(true);
    const inverted = judgeCourseAnswer(cmaj7Ear, "ear", [52, 55, 59, 60]);
    expect(inverted.ok).toBe(false);
    expect(inverted.bass).toBe("checked");
    expect(inverted.reason).toContain("一番下の音");
  });

  it("freezes the ear prompt conditions: Lv1 is a displayed two-choice, Lv2 identifies", () => {
    expect(lv1MajEar.ear).toMatchObject({ kind: "two-choice", choices: ["maj", "min"], choiceDisplayed: true, playbacks: 1, rootPresented: true, bass: "root" });
    expect(earChoiceCorrect(lv1MajEar, "maj")).toBe(true);
    expect(earChoiceCorrect(lv1MajEar, "min")).toBe(false);
    expect(earChoiceCorrect(lv1MajEar, undefined)).toBe(false);

    expect(cmaj7Ear.ear).toMatchObject({ kind: "identify", choiceDisplayed: false, playbacks: 1, rootPresented: true, bass: "root" });
    expect(earChoiceCorrect(cmaj7Ear, undefined)).toBe(true);
    expect(earChoiceCorrect(cmaj7Ear, "maj7")).toBe(true);
    expect(earChoiceCorrect(cmaj7Ear, "min7")).toBe(false);
  });
});
