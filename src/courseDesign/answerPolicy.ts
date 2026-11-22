import { NAMES } from "../domain/chordDojo/recipes";
import type { BankItem } from "./bank";

/**
 * P23-39 §3 (v2): the answer policies, executable. The three modes are deliberately separate:
 *
 * - `name` — a chord-name recall item. The required tones are the product's `normal` leniency
 *   (root + 3rd required, 5th optional, the 7th required for seventh chords, b5 required for m7b5). An
 *   *unspecified* bass is free: any inversion is a valid answer, and the source voicing's exact layout is
 *   never required. This is the approved design; v1's "required quality tones with the source voicing's
 *   bass" contradicted it and is removed.
 * - `saved-voicing` — a saved progression's authored notes. The exact MIDI notes (same octaves, same
 *   doubling) are the answer. This is a different task and is never mixed into a name-recall item.
 * - `ear` — the item's harmony plus its specified bass (the root). The voicing above the bass is free;
 *   the ear task never requires the authored layout.
 *
 * The policy is a *wrapper*: the product's `judgeChord(..., 'core')` forces the root bass, so P23-40 must
 * use this acceptance for course name-recall items instead of calling that judge unchanged. The delta is
 * asserted in `judgingCorrespondence.test.ts`.
 */
export type AnswerMode = "name" | "saved-voicing" | "ear";

export interface AnswerJudgement {
  readonly ok: boolean;
  readonly reason: string;
  readonly missingPitchClasses: readonly number[];
  readonly foreignPitchClasses: readonly number[];
  readonly bass: "free" | "checked";
}

function pitchClass(note: number): number {
  return ((Math.trunc(note) % 12) + 12) % 12;
}

function unique(values: readonly number[]): number[] {
  return [...new Set(values.map(pitchClass))].sort((left, right) => left - right);
}

function sorted(values: readonly number[]): number[] {
  return [...values].sort((left, right) => left - right);
}

function names(values: readonly number[]): string {
  return values.map((value) => NAMES[pitchClass(value)]!).join("・");
}

/**
 * Judge one attempted answer. `notes` are the sealed MIDI notes (pressed keys) from `inputContract`.
 */
export function judgeCourseAnswer(item: BankItem, mode: AnswerMode, notes: readonly number[]): AnswerJudgement {
  if (notes.length === 0) {
    return { ok: false, reason: "構成の音を弾いてください", missingPitchClasses: [], foreignPitchClasses: [], bass: "free" };
  }
  if (mode === "saved-voicing") return judgeSavedVoicing(item, notes);
  const pitchClasses = unique(notes);
  const missingPitchClasses = item.requiredPitchClasses.filter((pitchClassValue) => !pitchClasses.includes(pitchClassValue));
  const foreignPitchClasses = pitchClasses.filter((pitchClassValue) => !item.allowedPitchClasses.includes(pitchClassValue));
  if (foreignPitchClasses.length > 0) {
    return { ok: false, reason: `余分な音 ${names(foreignPitchClasses)} があります`, missingPitchClasses, foreignPitchClasses, bass: "free" };
  }
  if (missingPitchClasses.length > 0) {
    return { ok: false, reason: `${names(missingPitchClasses)} がありません`, missingPitchClasses, foreignPitchClasses, bass: "free" };
  }
  if (mode === "ear" || item.bass === "root") {
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

/** The saved-voicing policy: the authored notes are the gold. */
export function judgeSavedVoicing(item: BankItem, notes: readonly number[]): AnswerJudgement {
  const expected = sorted(item.referenceNotes);
  const actual = sorted(notes);
  return expected.length > 0 && expected.join(",") === actual.join(",")
    ? { ok: true, reason: "合いました", missingPitchClasses: [], foreignPitchClasses: [], bass: "free" }
    : { ok: false, reason: "保存された配置（音と音域）と違います", missingPitchClasses: [], foreignPitchClasses: [], bass: "free" };
}

/** Name recall: required tones, no bass requirement (the item's bass is `free`). */
export function nameRecallAccepts(item: BankItem, notes: readonly number[]): boolean {
  return judgeCourseAnswer(item, "name", notes).ok;
}

/** Ear: required tones plus the specified root bass; the upper voicing is free. */
export function earAccepts(item: BankItem, notes: readonly number[]): boolean {
  return judgeCourseAnswer(item, "ear", notes).ok;
}

/** Lv1 ear: the displayed major/minor choice must be right; Lv2 identifies the quality by playing. */
export function earChoiceCorrect(item: BankItem, choice: string | undefined): boolean {
  if (item.ear === undefined) return false;
  if (item.ear.kind === "identify") return choice === undefined || choice === item.quality;
  return choice === item.quality;
}
