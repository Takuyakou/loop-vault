import { buildPracticeChordRequirements } from "../practice/chordRequirements";
import { matchPerformance } from "../practice/matchPerformance";
import { NAMES, pc } from "../chordDojo/recipes";
import { earJudge, type EarJudgeTarget, type EarVerdict } from "./judge";

/**
 * P23-22 J1: what the screen needs to say about an answer — the verdict as it was (same words, same ok), and the
 * notes that were extra or missing so a screen can mark them (P23-23). Pitch classes, sorted, the way the app
 * names notes; empty when the answer was right or nothing was pressed.
 *
 * The words come from `earJudge` (unchanged); the two lists are read with the same rules that judge uses, so the
 * lists and the words never disagree.
 */
export interface EarJudgement extends EarVerdict {
  /** The note names that were pressed and are not part of the answer. */
  readonly extra: readonly number[];
  /** The note names of the answer that were not pressed. */
  readonly missing: readonly number[];
  /** The lowest pressed note is not the one the answer asks for. */
  readonly bassWrong: boolean;
  /** Nothing was pressed: no note lists to speak of. */
  readonly empty: boolean;
  /**
   * P23-23a S13: the one missing note name the words themselves say (`B がありません` / `長7度(B)がありません`),
   * as a note number 0-11. Absent when the words name no missing note (an extra note, the bass, or nothing pressed).
   */
  readonly namedMissing?: number;
}

/** The note name whose absence the words speak of, if any (the words are the source: nothing more is told). */
function namedMissingOf(message: string): number | undefined {
  const seventh = /^長7度\((.+)\)がありません$/.exec(message);
  const plain = /^(.+) がありません$/.exec(message);
  const name = seventh?.[1] ?? plain?.[1];
  if (name === undefined) return undefined;
  const index = NAMES.indexOf(name);
  return index < 0 ? undefined : index;
}

const pcsOf = (notes: readonly number[]): number[] => [...new Set(notes.map(pc))].sort((left, right) => left - right);

const sorted = (notes: readonly number[]): number[] => [...new Set(notes)].sort((left, right) => left - right);

export function judgeEarAnswer(target: EarJudgeTarget, played: readonly number[]): EarJudgement {
  const verdict = earJudge(target, played);
  const namedMissing = namedMissingOf(verdict.message);
  const named = namedMissing === undefined ? {} : { namedMissing };
  const mine = sorted(played);
  if (mine.length === 0) return { ...verdict, ...named, extra: [], missing: [], bassWrong: false, empty: true };
  if (target.judge === "core") {
    const requirements = buildPracticeChordRequirements(target.symbol, "normal");
    // The same allowance `judgeChord` makes: a written bass that is not a chord tone is part of the answer.
    const bassPc = pc(target.symbol.bass ?? target.symbol.root);
    const allowed = requirements.allowedPitchClasses.includes(bassPc)
      ? requirements
      : { ...requirements, allowedPitchClasses: [...requirements.allowedPitchClasses, bassPc] };
    const match = matchPerformance(
      { ...allowed, requiredBassPitchClass: bassPc },
      { heldMidiNotes: mine, sustainedMidiNotes: [], attackRevision: 1, timestampMs: 0 },
    );
    const missing = [...match.missingPitchClasses];
    // Hearing the major 7th is the point of mMaj7; `judgeCore` says so in its own words, so list it too.
    const seventh = target.symbol.quality === "minMaj7" ? pc(target.symbol.root + 11) : undefined;
    if (seventh !== undefined && !verdict.ok && verdict.message.startsWith("長7度") && !missing.includes(seventh)) {
      missing.push(seventh);
    }
    return { ...verdict, ...named, extra: match.foreignPitchClasses, missing, bassWrong: !match.bassMatches, empty: false };
  }
  const heard = sorted(target.notes);
  const wanted = pcsOf(heard);
  const got = pcsOf(mine);
  return {
    ...verdict,
    ...named,
    extra: got.filter((note) => !wanted.includes(note)),
    missing: wanted.filter((note) => !got.includes(note)),
    bassWrong: pc(mine[0]!) !== pc(heard[0]!),
    empty: false,
  };
}
