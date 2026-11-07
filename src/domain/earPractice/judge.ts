import { judgeChord } from "../chordDojo/judging";
import { NAMES, pc } from "../chordDojo/recipes";
import type { ChordSymbol } from "../types";

/**
 * How a chord is judged in this practice (the field `judge` of a record):
 *  - `core`     the app's own chord judgement (`judgeChord`, unchanged); for mMaj7 the major 7th is also required;
 *  - `pitchset` the notes this practice made: the same set of note names, nothing else, the bass lowest (7alt);
 *  - `sounded`  the notes of a saved song: the same set of note names as sounded, nothing else, and the same
 *               lowest note name (the height is not asked).
 */
export type EarJudge = "core" | "pitchset" | "sounded";

export interface EarJudgeTarget {
  symbol: ChordSymbol;
  judge: EarJudge;
  /** The notes that were sounded (the answer of `pitchset` / `sounded`). */
  notes: readonly number[];
}

export interface EarVerdict {
  ok: boolean;
  message: string;
}

const sorted = (notes: readonly number[]) => [...new Set(notes)].sort((a, b) => a - b);

export function earJudge(target: EarJudgeTarget, played: readonly number[]): EarVerdict {
  if (target.judge === "core") return judgeCore(target, played);
  return judgeSet(target, played);
}

function judgeCore(target: EarJudgeTarget, played: readonly number[]): EarVerdict {
  const verdict = judgeChord({ chord: target.symbol, notes: target.notes, judge: "core", bass: "self" }, played);
  if (!verdict.ok) return verdict;
  // Hearing the major 7th is the point of mMaj7: the root and the minor 3rd alone are not an answer.
  if (target.symbol.quality === "minMaj7") {
    const seventh = pc(target.symbol.root + 11);
    if (!played.some((note) => pc(note) === seventh)) {
      return { ok: false, message: `長7度(${NAMES[seventh]})がありません` };
    }
  }
  return verdict;
}

function judgeSet(target: EarJudgeTarget, played: readonly number[]): EarVerdict {
  const heard = sorted(target.notes);
  const mine = sorted(played);
  if (!mine.length) return { ok: false, message: "構成の音を弾いてください" };
  const wanted = new Set(heard.map(pc));
  const got = new Set(mine.map(pc));
  const foreign = [...got].find((note) => !wanted.has(note));
  if (foreign !== undefined) return { ok: false, message: `余分な音 ${NAMES[foreign]} があります` };
  const missing = [...wanted].find((note) => !got.has(note));
  if (missing !== undefined) return { ok: false, message: `${NAMES[missing]} がありません` };
  if (pc(mine[0]!) !== pc(heard[0]!)) {
    return { ok: false, message: `一番下の音が ${NAMES[pc(mine[0]!)]}（${NAMES[pc(heard[0]!)]} を指定）` };
  }
  return { ok: true, message: "合いました" };
}
