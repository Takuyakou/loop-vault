import { describe, expect, it } from "vitest";
import { buildBank, closeVoicing as contractCloseVoicing } from "../../../courseDesign/bank";
import { judgeCourseAnswer as contractJudge } from "../../../courseDesign/answerPolicy";
import { COURSE_BANK, courseItemById } from "./bank";
import { earChoiceCorrect, judgeCourseAnswer, requiredPitchClassesOf } from "./answer";

const contractBank = buildBank(2338);
const item = (id: string) => courseItemById(id)!;
const cmaj7 = COURSE_BANK.items.find((entry) => entry.level === 2 && entry.prompt === "name" && entry.quality === "maj7" && entry.root === 0)!;
const cmaj7Ear = COURSE_BANK.items.find((entry) => entry.level === 2 && entry.prompt === "ear" && entry.quality === "maj7" && entry.root === 0)!;

describe("P23-40 name recall keeps the v3 bass-free contract", () => {
  it("accepts every inversion of Cmaj7 (fixed literal fixture)", () => {
    for (const notes of [[48, 52, 55, 59], [52, 55, 59, 60], [55, 59, 60, 64], [59, 60, 64, 67]]) {
      expect(judgeCourseAnswer(cmaj7, "name", notes).ok, JSON.stringify(notes)).toBe(true);
    }
    // The 5th may be omitted; the 7th may not.
    expect(judgeCourseAnswer(cmaj7, "name", [48, 52, 59]).ok).toBe(true);
    expect(judgeCourseAnswer(cmaj7, "name", [48, 52]).ok).toBe(false);
    expect(judgeCourseAnswer(cmaj7, "name", [48, 52, 55, 59, 61]).ok).toBe(false);
  });

  it("requires the fifth for Lv1/Lv3 major and minor triads (P23-47-fix-2)", () => {
    const am = COURSE_BANK.items.find((entry) => entry.level === 1 && entry.prompt === "name" && entry.quality === "min" && entry.root === 9)!;
    const amEar = COURSE_BANK.items.find((entry) => entry.level === 1 && entry.prompt === "ear" && entry.quality === "min" && entry.root === 9)!;
    expect(requiredPitchClassesOf(am).slice().sort((a, b) => a - b)).toEqual([0, 4, 9]);
    expect(judgeCourseAnswer(am, "name", [57, 60]).ok).toBe(false);
    expect(judgeCourseAnswer(am, "name", [57, 60, 64]).ok).toBe(true);
    // A-C-A is still only two pitch classes.
    expect(judgeCourseAnswer(am, "name", [57, 60, 69]).ok).toBe(false);
    // Any inversion is a valid name-recall answer.
    expect(judgeCourseAnswer(am, "name", [52, 57, 60]).ok).toBe(true);
    // A foreign note is still rejected.
    expect(judgeCourseAnswer(am, "name", [57, 60, 64, 66]).ok).toBe(false);
    // The ear task keeps its root-bass rule and now asks for the fifth too.
    expect(judgeCourseAnswer(amEar, "ear", [57, 60, 64]).ok).toBe(true);
    expect(judgeCourseAnswer(amEar, "ear", [57, 60]).ok).toBe(false);
    // P24-02 I-4: an ear question accepts any inversion.
    expect(judgeCourseAnswer(amEar, "ear", [52, 57, 60]).ok).toBe(true);
    // Lv2 seventh chords keep the fifth optional.
    expect(judgeCourseAnswer(cmaj7, "name", [48, 52, 59]).ok).toBe(true);
  });

  it("keeps saved-voicing exact and ear bass-checked, separate from name recall", () => {
    expect(judgeCourseAnswer(cmaj7, "saved-voicing", [48, 52, 55, 59]).ok).toBe(true);
    expect(judgeCourseAnswer(cmaj7, "saved-voicing", [52, 55, 59, 60]).ok).toBe(false);
    expect(judgeCourseAnswer(cmaj7, "name", [52, 55, 59, 60]).ok).toBe(true);
    expect(judgeCourseAnswer(cmaj7Ear, "ear", [48, 52, 55, 59]).ok).toBe(true);
    expect(judgeCourseAnswer(cmaj7Ear, "ear", [52, 55, 59, 60]).ok).toBe(true);
  });

  it("agrees with the contract judge on every frozen item and mode", () => {
    for (const item of COURSE_BANK.items) {
      const contractItem = contractBank.items.find((entry) => entry.id === item.id)!;
      expect(requiredPitchClassesOf(item), item.id).toEqual(item.requiredPitchClasses);
      for (const mode of ["name", "saved-voicing", "ear"] as const) {
        const notes = item.referenceNotes;
        expect(judgeCourseAnswer(item, mode, notes).ok, `${item.id}:${mode}`).toBe(contractJudge(contractItem, mode, notes).ok);
      }
      // A different valid inversion: name accepts (name items only), ear rejects.
      if (item.prompt === "name") {
        const inversion = contractCloseVoicing(item.root, item.quality, 1);
        expect(judgeCourseAnswer(item, "name", inversion).ok, `${item.id}:inv`).toBe(true);
      } else {
        const inversion = contractCloseVoicing(item.root, item.quality, 1);
        expect(judgeCourseAnswer(item, "ear", inversion).ok, `${item.id}:ear-inv`).toBe(true);
      }
    }
  });

  it("freezes the ear prompt conditions", () => {
    const lv1 = COURSE_BANK.items.find((entry) => entry.level === 1 && entry.prompt === "ear" && entry.quality === "maj")!;
    expect(lv1.ear).toMatchObject({ kind: "two-choice", choices: ["maj", "min"], choiceDisplayed: true, playbacks: 1, rootPresented: true, bass: "root" });
    expect(earChoiceCorrect(lv1, "maj")).toBe(true);
    expect(earChoiceCorrect(lv1, "min")).toBe(false);
    expect(earChoiceCorrect(lv1, undefined)).toBe(false);
    expect(cmaj7Ear.ear).toMatchObject({ kind: "identify", choiceDisplayed: false });
    expect(earChoiceCorrect(cmaj7Ear, undefined)).toBe(true);
    expect(earChoiceCorrect(cmaj7Ear, "maj7")).toBe(true);
    expect(earChoiceCorrect(cmaj7Ear, "min7")).toBe(false);
    expect(item(cmaj7Ear.id).bass).toBe("root");
  });
});
