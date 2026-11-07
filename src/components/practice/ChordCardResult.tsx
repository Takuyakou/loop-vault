import { useEffect, useState } from "react";
import "./chord-card-result.css";

/**
 * The one way a practice card says "that was right" (P5.26.2-03). 2-5-1 Master and Chord Dojo
 * (progression cards, the one-chord card, random-key cards) all draw it through this module.
 *
 * Three things are kept apart, so none of them crushes the others:
 *  - the moment (≤ CARD_MOMENT_MS): the card's frame flashes and the mark shows; then it is gone;
 *  - this round: a small mark stays on every card that was cleared in the round;
 *  - the shape carries the source, never the colour alone: ✓ on a filled disc = judged from the
 *    MIDI keyboard, ✓ in a hollow ring = the player said so, ✗ in a ring = missed.
 */
export type CardResultState = "idle" | "correct" | "miss";
export type CardResultSource = "midi" | "self";
export interface ChordCardResult {
  readonly state: CardResultState;
  /** Judged from the keyboard, or self-reported ("弾けた"). Self reports are never counted as keyboard clears. */
  readonly source: CardResultSource;
}

export const NO_CARD_RESULT: ChordCardResult = Object.freeze({ state: "idle", source: "midi" });
/** How long the moment layer lasts. One place, not a number in each view. */
export const CARD_MOMENT_MS = 400;

export const cardResult = (ok: boolean, self: boolean): ChordCardResult => ({ state: ok ? "correct" : "miss", source: self ? "self" : "midi" });

const LABELS: Record<Exclude<CardResultState, "idle">, Record<CardResultSource, string>> = {
  correct: { midi: "鍵盤で合いました", self: "自分で判定：弾けた" },
  miss: { midi: "合いませんでした", self: "自分で判定：まだ" },
};

/** The mark itself. `bare` is the glyph only, for places that already draw their own frame (colour inherited). */
export function ChordCardMark({ result, layer, bare = false, corner = false }: {
  readonly result: ChordCardResult;
  readonly layer: "moment" | "set";
  readonly bare?: boolean;
  /** Sits in the card's top-left corner instead of inline. */
  readonly corner?: boolean;
}) {
  if (result.state === "idle") return null;
  return (
    <span className="lv-card-mark" data-state={result.state} data-source={result.source} data-layer={layer} data-bare={bare || undefined} data-corner={corner || undefined}
      role="img" aria-label={LABELS[result.state][result.source]}>
      {result.state === "correct" ? "✓" : "✗"}
    </span>
  );
}

/**
 * The moment layer: shows `value` for CARD_MOMENT_MS after it changes, then is idle again. Pass the
 * result object itself (a new object = a new moment).
 */
export function useCardMoment(value: ChordCardResult | undefined, ms = CARD_MOMENT_MS): ChordCardResult {
  const [shown, setShown] = useState<ChordCardResult>(NO_CARD_RESULT);
  useEffect(() => {
    if (!value || value.state === "idle") { setShown(NO_CARD_RESULT); return undefined; }
    setShown(value);
    const timer = setTimeout(() => setShown(NO_CARD_RESULT), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return shown;
}
