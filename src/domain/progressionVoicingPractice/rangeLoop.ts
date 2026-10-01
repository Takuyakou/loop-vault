/** Session-only range selection. Card ordinals are authoritative even without event ids. */
export interface VoicingLoopRange {
  readonly first: number;
  readonly last: number;
}

export interface VoicingLoopRangeSelection {
  readonly active?: VoicingLoopRange;
  readonly pendingStart?: number;
}

export const emptyVoicingLoopRangeSelection: VoicingLoopRangeSelection = Object.freeze({});

export function selectVoicingLoopRangeCard(
  selection: VoicingLoopRangeSelection,
  cardIndex: number,
  cardCount: number,
  immediate = false,
): VoicingLoopRangeSelection {
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= cardCount) return selection;
  if (immediate) return Object.freeze({ active: Object.freeze({ first: cardIndex, last: cardIndex }) });
  if (selection.pendingStart === undefined) {
    return Object.freeze({ ...selection, pendingStart: cardIndex });
  }
  return Object.freeze({ active: Object.freeze({
    first: Math.min(selection.pendingStart, cardIndex),
    last: Math.max(selection.pendingStart, cardIndex),
  }) });
}

export function cancelVoicingLoopRangePending(selection: VoicingLoopRangeSelection): VoicingLoopRangeSelection {
  return selection.pendingStart === undefined ? selection : Object.freeze({ active: selection.active });
}

export function rangeContainsCard(range: VoicingLoopRange | undefined, cardIndex: number): boolean {
  return !range || cardIndex >= range.first && cardIndex <= range.last;
}

export function rangeBeatBounds(
  events: readonly { readonly startBeat: number; readonly durationBeats: number }[],
  range: VoicingLoopRange | undefined,
): { readonly startBeat: number; readonly endBeat: number } | undefined {
  if (!range || range.first < 0 || range.last < range.first || range.last >= events.length) return undefined;
  const first = events[range.first]!;
  const last = events[range.last]!;
  return Object.freeze({ startBeat: first.startBeat, endBeat: last.startBeat + last.durationBeats });
}
