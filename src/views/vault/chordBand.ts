import type { ChordTimelineItem } from "../../domain/types";

/**
 * P8.9-09b Vault row chord band: one line, each frame as wide as its chord lasts, repeated
 * chords merged ("×3"), and what does not fit summed up as "+N小節".
 * Widths are computed here (12px IBM Plex Mono is 7.2px per character) so the component
 * can decide how many frames fit before rendering.
 */

export interface ChordBandGroup {
  readonly label: string;
  /** Index of the first chord in the block (the one that is auditioned). */
  readonly first: number;
  readonly indices: readonly number[];
  readonly beats: number;
  readonly bar: number;
}

const CHAR_PX = 7.2;
const COUNT_CHAR_PX = 6;
/** Horizontal padding plus border of one frame. */
const FRAME_PAD_PX = 14;
const PX_PER_BEAT = 8;
/** A long held chord never takes more than this, so one chord cannot fill the band. */
const MAX_FRAME_PX = 128;
/** Names up to this many characters are never cut. */
export const FULL_NAME_CHARS = 9;
/** Degrees (10px mono, 6px per character) up to this many characters fit too; longer ones are cut. */
const FULL_DEGREE_CHARS = 7;
export const BAND_GAP_PX = 4;
export const BAND_MORE_PX = 52;

export function groupChords(chords: readonly ChordTimelineItem[]): ChordBandGroup[] {
  const groups: { label: string; first: number; indices: number[]; beats: number; bar: number }[] = [];
  chords.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && last.label === item.chord.label) {
      last.indices.push(index);
      last.beats += item.durationBeats;
      return;
    }
    groups.push({ label: item.chord.label, first: index, indices: [index], beats: item.durationBeats, bar: item.bar });
  });
  return groups;
}

export function groupWidth(group: ChordBandGroup, degree?: string): number {
  const name = Math.min(group.label.length, FULL_NAME_CHARS) * CHAR_PX;
  const count = group.indices.length > 1 ? 3 + (1 + String(group.indices.length).length) * COUNT_CHAR_PX : 0;
  const degreeWidth = degree ? Math.min([...degree].length, FULL_DEGREE_CHARS) * COUNT_CHAR_PX : 0;
  const minimum = Math.max(name + count, degreeWidth) + FRAME_PAD_PX;
  return Math.ceil(Math.max(minimum, Math.min(MAX_FRAME_PX, group.beats * PX_PER_BEAT)));
}

/** How many groups fit in `width` px, and the bars left over for the "+N小節" note. */
export function layoutChordBand(
  groups: readonly ChordBandGroup[],
  width: number,
  totalBars: number,
  degreeOf: (group: ChordBandGroup) => string | undefined = () => undefined,
): { shown: number; restBars: number } {
  const widths = groups.map((group) => groupWidth(group, degreeOf(group)));
  const all = widths.reduce((sum, value, index) => sum + value + (index ? BAND_GAP_PX : 0), 0);
  if (all <= width) return { shown: groups.length, restBars: 0 };
  let used = 0;
  let shown = 0;
  while (shown < groups.length) {
    const next = used + (shown ? BAND_GAP_PX : 0) + widths[shown]!;
    if (next + BAND_GAP_PX + BAND_MORE_PX > width) break;
    used = next;
    shown += 1;
  }
  const firstBar = groups[0]?.bar ?? 1;
  const hidden = groups[shown];
  return { shown, restBars: hidden ? Math.max(1, totalBars - (hidden.bar - firstBar)) : 0 };
}
