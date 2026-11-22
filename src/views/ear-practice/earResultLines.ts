/**
 * P23-23b X8: the seconds' line under a chord card of the result screen.
 * The length is the chord's seconds over the longest of the question; the line is the warning colour when the chord
 * took more than one and a half times the question's median. A card with no seconds (shown from the start, judged by
 * the player) has no line at all.
 */
export interface SecondsLine {
  /** 0-1, the share of the longest chord of this question. */
  ratio: number;
  /** Yellow: this chord took more than 1.5 × the median of the question. */
  slow: boolean;
}

export function secondsLines(cards: ReadonlyArray<{ sec?: number }>, medianSec?: number): Array<SecondsLine | undefined> {
  const seconds = cards.map((card) => card.sec).filter((value): value is number => value !== undefined);
  const longest = seconds.length ? Math.max(...seconds) : 0;
  return cards.map((card) => {
    if (card.sec === undefined || longest <= 0) return undefined;
    return { ratio: card.sec / longest, slow: medianSec !== undefined && card.sec > medianSec * 1.5 };
  });
}
