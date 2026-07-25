import { chordIdentityKey, normalizeChordSymbol } from "../chordIdentity";
import type { ChordTimelineItem } from "../types";
import type { Section } from "./sections";

/**
 * Candidate windows derived from the music's own structure.
 *
 * The fixed set 2/4/8/16 cannot express a fourteen-bar section, so on S24 three
 * must-show blocks were unreachable no matter what the selector did — they were
 * never generated. Adding 14, 18 and 20 to the list would fix that corpus and
 * nothing else: the next song with a thirteen-bar bridge would fail the same way.
 *
 * These generators read the material instead. Each answers a different question
 * about where a usable loop could start and end, and each is bounded by the
 * number of bars rather than by every pair of them, so the window count stays
 * linear.
 */

export type StructuralWindowSource =
  | "section-boundary"
  | "event-boundary"
  | "repeat-cycle"
  | "loop-return"
  | "derived-length";

export interface StructuralWindow {
  startBar: number;
  lengthBars: number;
  source: StructuralWindowSource;
  /** Every generator that proposed this span, not only the first to claim it. */
  sources: StructuralWindowSource[];
}

/** Lengths the fixed generator already produces, so they are not emitted twice. */
const FIXED_LENGTHS = new Set([2, 4, 8, 16]);

const MIN_LENGTH = 3;
const MAX_LENGTH = 32;
/** Ceiling on the extra windows, so a pathological file cannot explode the list. */
const MAX_WINDOWS = 1200;

function inRange(lengthBars: number): boolean {
  return lengthBars >= MIN_LENGTH && lengthBars <= MAX_LENGTH && !FIXED_LENGTHS.has(lengthBars);
}

/** Canonical chord identity per bar, or null where nothing sounds. */
function barIdentities(
  timeline: readonly ChordTimelineItem[],
  totalBars: number,
  meter: number,
): Array<string | null> {
  const identities: Array<string | null> = Array.from({ length: totalBars }, () => null);
  for (const item of timeline) {
    const startBeat = (item.bar - 1) * meter + item.beat - 1;
    const endBeat = startBeat + item.durationBeats;
    const key = chordIdentityKey(normalizeChordSymbol(item.chord));
    const firstBar = Math.max(1, Math.floor(startBeat / meter) + 1);
    const lastBar = Math.min(totalBars, Math.ceil(endBeat / meter));
    for (let bar = firstBar; bar <= lastBar; bar += 1) {
      // The chord sounding at the downbeat names the bar; a chord that only
      // arrives late in a bar does not rename it.
      if (identities[bar - 1] === null) identities[bar - 1] = key;
    }
  }
  return identities;
}

/** Bars where the sounding chord differs from the bar before. */
function changeBars(identities: ReadonlyArray<string | null>): number[] {
  const bars: number[] = [];
  identities.forEach((identity, index) => {
    if (index === 0 || identity !== identities[index - 1]) bars.push(index + 1);
  });
  return bars;
}

export function structuralWindows(
  timeline: readonly ChordTimelineItem[],
  totalBars: number,
  meter: number,
  sections: readonly Section[] = [],
): StructuralWindow[] {
  const identities = barIdentities(timeline, totalBars, meter);
  const changes = changeBars(identities);
  const found = new Map<string, StructuralWindow>();

  const add = (startBar: number, lengthBars: number, source: StructuralWindowSource) => {
    if (startBar < 1 || startBar + lengthBars - 1 > totalBars) return;
    if (!inRange(lengthBars)) return;
    const key = `${startBar}:${lengthBars}`;
    const existing = found.get(key);
    if (!existing) {
      // First source to claim a window names it, so the attribution is stable;
      // later ones are recorded rather than creating a second window.
      found.set(key, { startBar, lengthBars, source, sources: [source] });
      return;
    }
    if (!existing.sources.includes(source)) existing.sources.push(source);
  };

  // 1. Section boundaries. A section is the unit a user asks for by name, so its
  //    exact span should be graspable whatever length it happens to be.
  //
  //    Spans between non-adjacent boundaries are included as well, because the
  //    segmenter reports boundaries at roughly four-fifths precision: a section it
  //    split in two is recovered by joining the pair, and one it merged is
  //    recovered by the pieces. Bounded at four joins, so the count stays linear.
  const sectionStarts = sections.map((section) => section.startBar);
  for (let index = 0; index < sections.length; index += 1) {
    for (let join = 0; join < 4; join += 1) {
      const endIndex = index + join + 1;
      const endBar = endIndex < sectionStarts.length
        ? sectionStarts[endIndex] - 1
        : sections[sections.length - 1].endBar;
      add(sectionStarts[index], endBar - sectionStarts[index] + 1, "section-boundary");
    }
  }

  // 2. Event boundaries. Windows that begin and end on a chord change, spanning
  //    one to four consecutive change-to-change segments. Bounded at four so the
  //    count stays linear in the number of changes.
  for (let index = 0; index < changes.length; index += 1) {
    for (let span = 1; span <= 4; span += 1) {
      const endIndex = index + span;
      const endBar = endIndex < changes.length ? changes[endIndex] - 1 : totalBars;
      add(changes[index], endBar - changes[index] + 1, "event-boundary");
    }
  }

  // 3. Repeat cycles. Where the bar sequence repeats with period p, p is the
  //    natural loop length even when it is not a power of two.
  for (let period = MIN_LENGTH; period <= MAX_LENGTH; period += 1) {
    let runStart = 1;
    let runLength = 0;
    for (let bar = 1; bar + period <= totalBars; bar += 1) {
      const matches = identities[bar - 1] !== null && identities[bar - 1] === identities[bar + period - 1];
      if (matches) {
        if (runLength === 0) runStart = bar;
        runLength += 1;
        // One window per run: the first full cycle of it.
        if (runLength === period) add(runStart, period, "repeat-cycle");
      } else {
        runLength = 0;
      }
    }
  }

  // 4. Loop returns. A span that ends just before its opening chord comes back is
  //    a loop the ear already hears as closed.
  for (let bar = 1; bar <= totalBars; bar += 1) {
    const identity = identities[bar - 1];
    if (identity === null) continue;
    for (let next = bar + MIN_LENGTH; next <= Math.min(totalBars, bar + MAX_LENGTH); next += 1) {
      if (identities[next - 1] !== identity) continue;
      add(bar, next - bar, "loop-return");
      break;
    }
  }

  // 5. Section-derived lengths, applied at every chord change.
  //
  //    A section boundary is the only thing that defines a fourteen-bar span when
  //    the chords inside it cycle every four bars, and the segmenter's boundaries
  //    are only about four-fifths right — so anchoring on them alone misses the
  //    span by a bar or two and the section stays ungraspable. Taking the section
  //    *lengths* the file exhibits and trying them at each chord change recovers
  //    the span without assuming the boundary was found exactly.
  //
  //    The lengths come from the material. Nothing here knows the number 14.
  const derivedLengths = [...new Set([
    // Lengths of the detected sections, and of joins of up to four of them.
    ...sections.flatMap((section, index) => Array.from({ length: 4 }, (_unused, join) => {
      const endIndex = index + join + 1;
      const endBar = endIndex < sectionStarts.length
        ? sectionStarts[endIndex] - 1
        : sections[sections.length - 1].endBar;
      return endBar - section.startBar + 1;
    })),
    ...changes.slice(1).map((bar, index) => bar - changes[index]),
  ])]
    .filter(inRange)
    .sort((left, right) => left - right)
    .slice(0, 16);
  for (const startBar of changes) {
    for (const lengthBars of derivedLengths) add(startBar, lengthBars, "derived-length");
  }

  // Deterministic order, then the ceiling. Sorting before truncating means the
  // same file always yields the same windows.
  return [...found.values()]
    .sort((left, right) => left.startBar - right.startBar
      || left.lengthBars - right.lengthBars
      || left.source.localeCompare(right.source))
    .slice(0, MAX_WINDOWS);
}
