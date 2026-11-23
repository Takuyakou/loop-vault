import { NAMES } from "../recipes";
import type { CourseItem } from "./bank";

/**
 * P23-40 product answer policies. They mirror the P23-39 v3 contract:
 * - `name`: the quality's required tones; an unspecified bass is free (any inversion).
 * - `saved-voicing`: the authored notes exactly (octaves and doubling included).
 * - `ear`: the required tones plus the item's specified root bass.
 *
 * `answer.test.ts` checks the product judge against `src/courseDesign/answerPolicy.ts` on the frozen
 * items, so the product cannot drift from the contract.
 */
export type CourseAnswerMode = "name" | "saved-voicing" | "ear";

export interface CourseAnswerJudgement {
  readonly ok: boolean;
  readonly reason: string;
  readonly missingPitchClasses: readonly number[];
  readonly foreignPitchClasses: readonly number[];
  readonly bass: "free" | "checked";
}

function pitchClass(note: number): number {
  return ((Math.trunc(note) % 12) + 12) % 12;
}

function uniquePitchClasses(values: readonly number[]): number[] {
  return [...new Set(values.map(pitchClass))].sort((left, right) => left - right);
}

function sorted(values: readonly number[]): number[] {
  return [...values].sort((left, right) => left - right);
}

function names(values: readonly number[]): string {
  return values.map((value) => NAMES[pitchClass(value)]!).join("・");
}

/** The required tones of an item, re-derived from the product's normal leniency. */
export function requiredPitchClassesOf(item: CourseItem): readonly number[] {
  // P23-47-fix-2: the frozen item is authoritative. Lv1/Lv3 triads now store root+3rd+5th; seventh
  // chords keep the normal leniency (the fifth is optional).
  return item.requiredPitchClasses;
}

export function judgeCourseAnswer(item: CourseItem, mode: CourseAnswerMode, notes: readonly number[]): CourseAnswerJudgement {
  if (notes.length === 0) return { ok: false, reason: "構成の音を弾いてください", missingPitchClasses: [], foreignPitchClasses: [], bass: "free" };
  if (mode === "saved-voicing") return judgeSavedVoicing(item, notes);
  const pitchClasses = uniquePitchClasses(notes);
  const missingPitchClasses = item.requiredPitchClasses.filter((value) => !pitchClasses.includes(value));
  const foreignPitchClasses = pitchClasses.filter((value) => !item.allowedPitchClasses.includes(value));
  if (foreignPitchClasses.length > 0) {
    return { ok: false, reason: `余分な音 ${names(foreignPitchClasses)} があります`, missingPitchClasses, foreignPitchClasses, bass: "free" };
  }
  if (missingPitchClasses.length > 0) {
    return { ok: false, reason: `${names(missingPitchClasses)} がありません`, missingPitchClasses, foreignPitchClasses, bass: "free" };
  }
  // P24-02 I-4: an ear question asks for the harmony, so any inversion is accepted (the frozen
  // `bass: "root"` stays in the bank: it is also how an item says it is an ear question).
  if (mode !== "ear" && item.bass === "root") {
    const lowest = Math.min(...notes);
    if (pitchClass(lowest) !== item.root) {
      return {
        ok: false,
        reason: `一番下の音が ${NAMES[pitchClass(lowest)]} です（${NAMES[item.root]} を指定）`,
        missingPitchClasses,
        foreignPitchClasses,
        bass: "checked",
      };
    }
    return { ok: true, reason: "合いました", missingPitchClasses, foreignPitchClasses, bass: "checked" };
  }
  return { ok: true, reason: "合いました", missingPitchClasses, foreignPitchClasses, bass: "free" };
}

export function judgeSavedVoicing(item: CourseItem, notes: readonly number[]): CourseAnswerJudgement {
  const expected = sorted(item.referenceNotes);
  const actual = sorted(notes);
  return expected.length > 0 && expected.join(",") === actual.join(",")
    ? { ok: true, reason: "合いました", missingPitchClasses: [], foreignPitchClasses: [], bass: "free" }
    : { ok: false, reason: "保存された配置（音と音域）と違います", missingPitchClasses: [], foreignPitchClasses: [], bass: "free" };
}

export function earChoiceCorrect(item: CourseItem, choice: string | undefined): boolean {
  if (item.ear === undefined) return false;
  if (item.ear.kind === "identify") return choice === undefined || choice === item.quality;
  return choice === item.quality;
}
