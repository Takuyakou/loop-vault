import { barRangeLabel, segmentContent, type CorrectionModel, type CorrectionSegment } from "./correctionModel";
import { buildSaveCandidate, cardsInRange, type SaveCandidateResult, type SaveRange } from "./saveCandidate";
import type { ChordTimelineItem } from "../types";

/**
 * P10.2 addendum 2 §1: with no range chosen, the whole song is saved — from the bar the
 * first card starts in to the bar the last card ends in (no rests before or after).
 * Undefined when there are no cards.
 */
export function wholeSongRange(model: CorrectionModel): SaveRange | undefined {
  const first = model.cards[0];
  const last = model.cards[model.cards.length - 1];
  if (!first || !last) return undefined;
  const meter = model.context.meter;
  return { startBar: Math.floor(first.start / meter + 1e-6) + 1, endBar: Math.floor((last.start + last.duration - 1e-6) / meter) + 1 };
}

/**
 * P10.3 §4: the section a progression was saved from, for its memo — 「区切り3（9〜12小節）」, or
 * just the bars for an 8-bar stand-in section (its name is its bars).
 */
export function sectionMemo(segment: CorrectionSegment): string {
  const bars = barRangeLabel(segment.startBar, segment.endBar);
  return segment.source === "fallback-8bar" || segment.label === bars ? bars : `${segment.label}（${bars}）`;
}

export interface SectionSaveRow {
  segment: CorrectionSegment;
  range: SaveRange;
  /** The chord names, in order. */
  names: string[];
  /** Later segments with the same chords (the 「n回出てくる」 rule); they are not saved again. */
  sameAs: string[];
  /** Already in the Vault (a saved range with the same bars). */
  saved: boolean;
  /** What saving this segment makes, or why it cannot be saved. */
  result: SaveCandidateResult;
}

/**
 * P10.2 addendum 2 §2.2: one row per segment, in order; a segment with the same chords as
 * an earlier one is folded into that row. Saved rows and rows that cannot be saved start
 * unticked (the dialog decides the ticks from `saved` and `result.ok`).
 */
export function sectionSaveRows(model: CorrectionModel, timeline: readonly ChordTimelineItem[], savedKeys: ReadonlySet<string>): SectionSaveRow[] {
  const meter = model.context.meter;
  const rows: SectionSaveRow[] = [];
  const byContent = new Map<string, SectionSaveRow>();
  for (const segment of model.segments) {
    const content = segmentContent(segment, model.cards, meter);
    const same = content ? byContent.get(content) : undefined;
    if (same) { same.sameAs.push(segment.label); continue; }
    const range = { startBar: segment.startBar, endBar: segment.endBar };
    const row: SectionSaveRow = {
      segment,
      range,
      names: cardsInRange(model, range).map((card) => card.name.label),
      sameAs: [],
      saved: savedKeys.has(`${range.startBar}-${range.endBar}`),
      result: buildSaveCandidate(model, range, timeline),
    };
    rows.push(row);
    if (content) byContent.set(content, row);
  }
  return rows;
}
