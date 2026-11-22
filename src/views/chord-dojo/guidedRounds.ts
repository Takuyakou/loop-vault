/**
 * P23-51 (rule 2, mocks ③ and ⑥): a block is shown in rounds of five — 20 is 5×4, 14 is 5・5・4, 10 is 5×2.
 * The scoring and the pass counts do not change; the rounds are only how the block is shown and paused.
 * Positions are 1-based within one part of a block (the name questions, the ear questions or the delayed set).
 */
export const ROUND_SIZE = 5;

export type DotState = "ok" | "bad" | "now" | "todo";
export type BarState = "full" | "part" | "empty";

export interface RoundState {
  readonly round: number;
  readonly rounds: number;
  /** One dot per question of the current round. */
  readonly dots: readonly DotState[];
  /** One bar per round of the part. */
  readonly bars: readonly BarState[];
}

export function roundCount(total: number): number {
  return Math.max(1, Math.ceil(total / ROUND_SIZE));
}

export function roundOf(position: number): number {
  return Math.max(1, Math.ceil(position / ROUND_SIZE));
}

/**
 * `results[i]` is the answer at position i + 1: true (correct), false (anything else recorded) or undefined
 * (not answered). `answeredNow` marks the current question as answered (its dot shows the result).
 */
export function roundState(position: number, total: number, results: readonly (boolean | undefined)[]): RoundState {
  const rounds = roundCount(total);
  const round = Math.min(roundOf(position), rounds);
  const first = (round - 1) * ROUND_SIZE + 1;
  const last = Math.min(total, round * ROUND_SIZE);
  const dots: DotState[] = [];
  for (let at = first; at <= last; at += 1) {
    const result = results[at - 1];
    dots.push(result === true ? "ok" : result === false ? "bad" : at === position ? "now" : "todo");
  }
  const bars: BarState[] = [];
  for (let index = 1; index <= rounds; index += 1) {
    const from = (index - 1) * ROUND_SIZE;
    const to = Math.min(total, index * ROUND_SIZE);
    const answered = results.slice(from, to).filter((value) => value !== undefined).length;
    bars.push(answered >= to - from ? "full" : answered > 0 || index === round ? "part" : "empty");
  }
  return { round, rounds, dots, bars };
}

/** A pause comes after the last question of a round, except after the last round (the result screen follows). */
export function breakAfter(position: number, total: number): boolean {
  return position < total && position % ROUND_SIZE === 0;
}

export interface RoundScore {
  readonly round: number;
  readonly rounds: number;
  readonly correct: number;
  readonly count: number;
  readonly totalCorrect: number;
  readonly totalCount: number;
}

/** The numbers of the pause screen, after the question at `position` (the last of its round). */
export function roundScore(position: number, total: number, results: readonly (boolean | undefined)[]): RoundScore {
  const round = roundOf(position);
  const from = (round - 1) * ROUND_SIZE;
  const inRound = results.slice(from, Math.min(position, round * ROUND_SIZE));
  const soFar = results.slice(0, position);
  return {
    round,
    rounds: roundCount(total),
    correct: inRound.filter((value) => value === true).length,
    count: inRound.length,
    totalCorrect: soFar.filter((value) => value === true).length,
    totalCount: soFar.length,
  };
}
