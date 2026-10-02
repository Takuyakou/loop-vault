import type { CorrectionCard } from "./correctionModel";
import type { SaveRange } from "./saveCandidate";

/**
 * P10.2 §9: the save range by right-clicking cards, the same steps as Voicing Loop's
 * section loop (`selectVoicingLoopRangeCard`): the first right-click marks 「ここから」, the
 * second decides (either order; the same card twice = its bars); Shift decides at once.
 * The workspace works in whole bars: from the bar the earlier card starts in to the bar
 * the later card ends in.
 */
export function pickRangeCard(
  pending: CorrectionCard | undefined,
  card: CorrectionCard,
  meter: number,
  immediate = false,
): { pending?: CorrectionCard; range?: SaveRange } {
  if (immediate) return { range: cardsBarRange(card, card, meter) };
  if (!pending) return { pending: card };
  return { range: cardsBarRange(pending, card, meter) };
}

/** The whole bars two cards span together, in either order. */
export function cardsBarRange(a: CorrectionCard, b: CorrectionCard, meter: number): SaveRange {
  const [first, last] = a.start <= b.start ? [a, b] : [b, a];
  return { startBar: Math.floor(first.start / meter + 1e-6) + 1, endBar: Math.floor((last.start + last.duration - 1e-6) / meter) + 1 };
}

/**
 * P10.2 §8: the card a click on bar `bar` selects — the one sounding on its first beat
 * (a card carried over from the bar before counts), else the first starting in the bar.
 */
export function cardForBar<T extends { start: number; duration: number }>(cards: readonly T[], bar: number, meter: number): T | undefined {
  const head = (bar - 1) * meter;
  return cards.find((card) => card.start <= head + 1e-6 && card.start + card.duration > head + 1e-6)
    ?? cards.find((card) => card.start > head && card.start < head + meter - 1e-6);
}
