import { NOTE_NAMES, pc } from "./build";
import type { AdvancedChord, AdvancedItem, AdvancedStep } from "./types";

/**
 * P23-45 judgement for the advanced course. One rule for every question family:
 * - the chord's required pitch classes must all sound,
 * - no pitch class outside the allowed set may sound (an optional fifth/eleventh is allowed, a wrong
 *   tone is not),
 * - when the question names a lowest note (slash chords and every ear question), the lowest sounding
 *   pitch class must match.
 * Octave, doubling, inversion of the upper voices, hand split and fingering are never checked.
 */
export interface AdvancedChordJudgement {
  readonly ok: boolean;
  readonly reason: string;
  readonly missingPitchClasses: readonly number[];
  readonly foreignPitchClasses: readonly number[];
  readonly bassOk: boolean;
}

export function judgeAdvancedChord(chord: AdvancedChord, notes: readonly number[]): AdvancedChordJudgement {
  const sounding = notes.filter((note) => Number.isInteger(note) && note >= 0 && note <= 127);
  const result = (ok: boolean, reason: string, missing: readonly number[], foreign: readonly number[], bassOk: boolean): AdvancedChordJudgement =>
    ({ ok, reason, missingPitchClasses: missing, foreignPitchClasses: foreign, bassOk });
  if (sounding.length === 0) return result(false, "入力がありませんでした", [], [], true);
  const pitchClasses = new Set(sounding.map(pc));
  const missing = chord.requiredPitchClasses.filter((value) => !pitchClasses.has(value));
  if (missing.length > 0) {
    return result(false, `構成音が足りません（${missing.map((value) => NOTE_NAMES[value]).join("・")}）`, missing, [], true);
  }
  const foreign = [...pitchClasses].filter((value) => !chord.allowedPitchClasses.includes(value) && value !== chord.bassPitchClass);
  if (foreign.length > 0) {
    return result(false, `和音外の音があります（${foreign.map((value) => NOTE_NAMES[value]).join("・")}）`, missing, foreign, true);
  }
  if (chord.bassPitchClass !== undefined) {
    const lowest = Math.min(...sounding);
    if (pc(lowest) !== chord.bassPitchClass) {
      return result(false, `一番下の音を ${NOTE_NAMES[chord.bassPitchClass]} にしてください`, missing, foreign, false);
    }
  }
  return result(true, "合っています", missing, foreign, true);
}

/** The cards a question actually asks, starting at `startIndex` for Lv5 mid-card questions. */
export function expectedChords(item: AdvancedItem): readonly AdvancedChord[] {
  return item.chords.slice(item.startIndex ?? 0);
}

export interface AdvancedItemJudgement {
  readonly ok: boolean;
  readonly steps: readonly AdvancedStep[];
  readonly reason: string;
}

export function judgeSingleChord(item: AdvancedItem, notes: readonly number[]): AdvancedItemJudgement {
  const chord = expectedChords(item)[0];
  if (chord === undefined) return { ok: false, steps: [], reason: "課題がありません" };
  const judgement = judgeAdvancedChord(chord, notes);
  return { ok: judgement.ok, steps: [{ notes: [...notes], ok: judgement.ok }], reason: judgement.reason };
}

/**
 * A progression is correct only when every card is played in order. `cardNotes` carries one captured
 * chord per card; a missing card (the learner stopped) is judged as unanswered and fails the item.
 */
export function judgeProgression(item: AdvancedItem, cardNotes: readonly (readonly number[])[]): AdvancedItemJudgement {
  const chords = expectedChords(item);
  const steps: AdvancedStep[] = chords.map((chord, index) => {
    const notes = cardNotes[index] ?? [];
    return { notes: [...notes], ok: judgeAdvancedChord(chord, notes).ok };
  });
  const firstBad = steps.findIndex((step) => !step.ok);
  const ok = steps.length > 0 && firstBad === -1;
  const reason = ok
    ? "進行を最後まで弾けました"
    : firstBad === -1
      ? "入力がありませんでした"
      : `${firstBad + 1}枚目（${chords[firstBad]!.label}）が違います`;
  return { ok, steps, reason };
}

export const SIGHT_BEATS_PER_BAR = 4;
export const SIGHT_PASS_RATIO = 0.9;
/** A hole longer than this many consecutive beats counts as stopping mid-chart. */
export const SIGHT_MAX_STOP_BEATS = 2;

export interface SightJudgement {
  readonly ok: boolean;
  readonly steps: readonly AdvancedStep[];
  readonly matched: number;
  readonly total: number;
  readonly longestStop: number;
  readonly reason: string;
}

/**
 * Capstone ③ sight reading: one chord per bar, sampled on every beat. The chart passes when at least
 * 90% of the expected beat events sound the right chord and the learner never stops for more than two
 * beats. `beatNotes` is one captured sample per beat, in order.
 */
export function judgeSight(item: AdvancedItem, beatNotes: readonly (readonly number[])[]): SightJudgement {
  const beats = item.chords.length * SIGHT_BEATS_PER_BAR;
  const steps: AdvancedStep[] = [];
  for (let index = 0; index < beats; index += 1) {
    const chord = item.chords[Math.floor(index / SIGHT_BEATS_PER_BAR)]!;
    const notes = beatNotes[index] ?? [];
    steps.push({ notes: [...notes], ok: judgeAdvancedChord(chord, notes).ok });
  }
  const matched = steps.filter((step) => step.ok).length;
  let longestStop = 0;
  let run = 0;
  for (const step of steps) {
    if (step.ok) { run = 0; continue; }
    run += 1;
    longestStop = Math.max(longestStop, run);
  }
  const ratio = beats === 0 ? 0 : matched / beats;
  const ok = beats > 0 && ratio >= SIGHT_PASS_RATIO && longestStop <= SIGHT_MAX_STOP_BEATS;
  const reason = ok
    ? `期待した拍の ${Math.round(ratio * 100)}% を弾けました`
    : longestStop > SIGHT_MAX_STOP_BEATS
      ? `${longestStop}拍続けて音が止まりました`
      : `期待した拍の ${Math.round(ratio * 100)}% にとどまりました（90% 以上で合格）`;
  return { ok, steps, matched, total: beats, longestStop, reason };
}
