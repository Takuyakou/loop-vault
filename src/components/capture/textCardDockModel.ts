/**
 * P25-03 C: the cards the dock walks (chords and rests in time order) and the shape names it shows.
 */
import type { UnifiedTextResult } from "../../domain/textUnified";
import type { TextProgressionEvent } from "../../domain/textProgression";
import type { GeneratedShapeChoice } from "../../domain/voicingShapes";

export interface DockCard {
  /** The card's own characters in the typed text (the preview card's `data-card-start`). */
  readonly start: number;
  /** Where those characters end (C7 rewrites them). */
  readonly end: number;
  readonly rest: boolean;
  /** The absolute beat of the card (its own sound's key). */
  readonly beat: number;
  readonly bar: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly event?: TextProgressionEvent;
}

export function buildDockCards(unified: UnifiedTextResult, events: readonly TextProgressionEvent[]): DockCard[] {
  const beatsPerBar = unified.beatsPerBar > 0 ? unified.beatsPerBar : 4;
  return unified.slots.flatMap((slot): DockCard[] => {
    if (slot.kind === "hold") return [];
    const beat = (slot.bar - 1) * beatsPerBar + (slot.startBeat - 1);
    const base = { start: slot.span.start, end: slot.span.end, beat, bar: slot.bar, startBeat: slot.startBeat, durationBeats: slot.durationBeats };
    if (slot.kind === "rest") return [{ ...base, rest: true }];
    const index = unified.spans.findIndex((span) => span.attacks.some((attack) => attack.span.start === slot.span.start));
    const event = index < 0 ? undefined : events[index];
    return event === undefined ? [] : [{ ...base, rest: false, event }];
  }).sort((left, right) => left.beat - right.beat || left.start - right.start);
}

/** C2:「2 小節 · 1–2 拍」. */
export function dockPositionText(card: DockCard): string {
  const first = card.startBeat;
  const last = card.startBeat + card.durationBeats - 1;
  const beats = Number.isInteger(first) && Number.isInteger(last) && last > first ? `${first}–${last} 拍` : `${first} 拍`;
  return `${card.bar} 小節 · ${beats}`;
}

export { requestedShapeName, SHAPE_LABEL, usedShapeName } from "../../domain/voicingShapes/names";

export const SHAPE_KEY: Readonly<Record<GeneratedShapeChoice, string>> = { basic: "1", shell: "2", rootless: "3", triad: "4", quartal: "5" };

export const SHAPE_TITLE: Readonly<Record<GeneratedShapeChoice, string>> = {
  basic: "今までどおりのおすすめの音", shell: "左 R・7 / 右 3・5", rootless: "左手 4 音 · ルートなし", triad: "左 2 音 / 右 三和音", quartal: "右手を 4 度で積む",
};
