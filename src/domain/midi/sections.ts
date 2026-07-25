import { normalizePc } from "../chords";
import type { ChordTimelineItem } from "../types";
import { beatsPerBar } from "./timing";
import type { MidiSongData, TimedNote } from "./types";
import { selectChordEvidenceNotes } from "./voices";

/**
 * Section segmentation.
 *
 * Estimates where a song changes character, as a pure function that can be
 * inspected on its own. It is deliberately not wired into candidate selection:
 * a wrong boundary must never be able to remove a candidate, so section
 * information can only ever be added as a soft signal later.
 *
 * Sections are numbered, never named. Calling something a chorus requires
 * knowing the song's form, which none of these signals establish.
 */

export interface ActivitySummary {
  noteCount: number;
  averagePolyphony: number;
  averageDuration: number;
  bassNotes: number;
  percussionNotes: number;
  distinctPitchClasses: number;
}

export interface ChromaSummary {
  /** Duration-weighted pitch-class distribution, summing to 1. */
  distribution: number[];
  dominantPitchClass: number;
}

export type SectionBoundaryReason =
  | "harmonic-novelty"
  | "activity-change"
  | "instrumentation-change"
  | "silence-gap"
  | "song-start"
  | "song-end";

export interface Section {
  id: string;
  startBar: number;
  endBar: number;
  confidence: number;
  reasons: SectionBoundaryReason[];
  activitySummary: ActivitySummary;
  chromaSummary: ChromaSummary;
}

export interface SegmentationOptions {
  minimumSectionBars?: number;
  /** Chroma distance above which a bar is treated as a new area. */
  noveltyThreshold?: number;
  /** Relative activity change above which a bar is treated as a new area. */
  activityThreshold?: number;
  /**
   * Bars compared either side of a candidate boundary. Comparing single bars
   * detects chord changes, not section changes: an ordinary `C Am F G` loop
   * looks novel at every bar. A window averages the loop out and leaves the
   * change of area visible.
   */
  comparisonWindowBars?: number;
}

const DEFAULT_MINIMUM_SECTION_BARS = 4;
const DEFAULT_NOVELTY_THRESHOLD = 0.42;
const DEFAULT_ACTIVITY_THRESHOLD = 0.55;
const DEFAULT_COMPARISON_WINDOW_BARS = 4;

/** Bar lines carry the strongest prior, two-bar lines a weaker one. */
function boundaryPrior(bar: number): number {
  if ((bar - 1) % 4 === 0) return 1;
  if ((bar - 1) % 2 === 0) return 0.6;
  return 0.25;
}

function notesInBar(notes: readonly TimedNote[], bar: number, meter: number, ticksPerBeat: number) {
  const startTick = (bar - 1) * meter * ticksPerBeat;
  const endTick = bar * meter * ticksPerBeat;
  return notes.filter(
    (note) => note.startTick < endTick && note.startTick + note.durationTick > startTick,
  );
}

function activityOf(notes: readonly TimedNote[], ticksPerBeat: number): ActivitySummary {
  const pitchClasses = new Set(notes.map((note) => normalizePc(note.pitch)));
  const percussion = notes.filter((note) => note.channel === 9).length;
  const bass = notes.filter((note) => note.pitch < 52).length;
  const totalDuration = notes.reduce((sum, note) => sum + note.durationTick, 0);
  return {
    noteCount: notes.length,
    averagePolyphony: Number((notes.length / Math.max(1, new Set(notes.map((note) => note.startTick)).size)).toFixed(4)),
    averageDuration: Number((totalDuration / Math.max(1, notes.length) / ticksPerBeat).toFixed(4)),
    bassNotes: bass,
    percussionNotes: percussion,
    distinctPitchClasses: pitchClasses.size,
  };
}

function chromaOf(timeline: readonly ChordTimelineItem[], fromBar: number, toBar: number): ChromaSummary {
  const distribution = Array(12).fill(0) as number[];
  for (const item of timeline) {
    if (item.bar < fromBar || item.bar > toBar) continue;
    distribution[normalizePc(item.chord.root)] += item.durationBeats;
    if (item.chord.bass !== undefined) {
      distribution[normalizePc(item.chord.bass)] += item.durationBeats * 0.5;
    }
  }
  const total = distribution.reduce((sum, value) => sum + value, 0);
  const normalized = total > 0 ? distribution.map((value) => Number((value / total).toFixed(6))) : distribution;
  let dominant = 0;
  normalized.forEach((value, index) => {
    if (value > normalized[dominant]) dominant = index;
  });
  return { distribution: normalized, dominantPitchClass: dominant };
}

function chromaDistance(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / 2;
}

function instrumentationOf(notes: readonly TimedNote[]): string {
  return [...new Set(notes.map((note) => note.trackIndex))].sort((a, b) => a - b).join(",");
}

export function segmentSections(
  data: MidiSongData,
  timeline: readonly ChordTimelineItem[],
  options: SegmentationOptions = {},
): Section[] {
  const minimumBars = options.minimumSectionBars ?? DEFAULT_MINIMUM_SECTION_BARS;
  const noveltyThreshold = options.noveltyThreshold ?? DEFAULT_NOVELTY_THRESHOLD;
  const activityThreshold = options.activityThreshold ?? DEFAULT_ACTIVITY_THRESHOLD;
  const windowBars = options.comparisonWindowBars ?? DEFAULT_COMPARISON_WINDOW_BARS;
  const meter = beatsPerBar(data.timeSignature);
  const totalBars = Math.max(1, data.totalBars);
  const evidence = selectChordEvidenceNotes(data.notes);

  const perBar = Array.from({ length: totalBars }, (_, index) => {
    const bar = index + 1;
    const all = notesInBar(data.notes, bar, meter, data.ticksPerBeat);
    const harmonic = notesInBar(evidence, bar, meter, data.ticksPerBeat);
    return {
      bar,
      activity: activityOf(all, data.ticksPerBeat),
      chroma: chromaOf(timeline, bar, bar),
      instrumentation: instrumentationOf(all),
      silent: harmonic.length === 0,
    };
  });

  /** Boundary candidates, scored rather than snapped to a grid. */
  const boundaries: Array<{ bar: number; strength: number; reasons: SectionBoundaryReason[] }> = [];
  for (let index = 1; index < perBar.length; index += 1) {
    const previous = perBar[index - 1];
    const current = perBar[index];
    const reasons: SectionBoundaryReason[] = [];
    let strength = 0;

    // Windows either side of the candidate boundary, clipped to the song.
    const before = chromaOf(timeline, Math.max(1, current.bar - windowBars), current.bar - 1);
    const after = chromaOf(timeline, current.bar, Math.min(totalBars, current.bar + windowBars - 1));
    const novelty = chromaDistance(before.distribution, after.distribution);
    if (novelty >= noveltyThreshold) {
      reasons.push("harmonic-novelty");
      strength += novelty;
    }

    const beforeNotes = perBar
      .slice(Math.max(0, index - windowBars), index)
      .reduce((sum, entry) => sum + entry.activity.noteCount, 0);
    const afterNotes = perBar
      .slice(index, Math.min(perBar.length, index + windowBars))
      .reduce((sum, entry) => sum + entry.activity.noteCount, 0);
    const previousNotes = Math.max(1, beforeNotes);
    const activityChange = Math.abs(afterNotes - beforeNotes) / previousNotes;
    if (activityChange >= activityThreshold) {
      reasons.push("activity-change");
      strength += Math.min(1, activityChange) * 0.5;
    }

    if (previous.instrumentation !== current.instrumentation) {
      reasons.push("instrumentation-change");
      strength += 0.4;
    }

    if (previous.silent && !current.silent) {
      reasons.push("silence-gap");
      strength += 0.5;
    }

    if (reasons.length > 0) {
      boundaries.push({ bar: current.bar, strength: strength * boundaryPrior(current.bar), reasons });
    }
  }

  // A short fill should not become its own section, so a boundary is only
  // accepted once the previous section has reached the minimum length.
  const accepted: Array<{ bar: number; strength: number; reasons: SectionBoundaryReason[] }> = [];
  let lastBoundary = 1;
  for (const boundary of boundaries.sort((left, right) => left.bar - right.bar)) {
    if (boundary.bar - lastBoundary < minimumBars) continue;
    if (totalBars - boundary.bar + 1 < minimumBars) continue;
    accepted.push(boundary);
    lastBoundary = boundary.bar;
  }

  const starts = [1, ...accepted.map((boundary) => boundary.bar)];
  return starts.map((startBar, index) => {
    const endBar = index + 1 < starts.length ? starts[index + 1] - 1 : totalBars;
    const bars = perBar.slice(startBar - 1, endBar);
    const boundary = accepted.find((candidate) => candidate.bar === startBar);
    const noteCount = bars.reduce((sum, entry) => sum + entry.activity.noteCount, 0);
    return {
      id: `Section ${index + 1}`,
      startBar,
      endBar,
      confidence: Number(Math.min(1, boundary ? boundary.strength : 1).toFixed(4)),
      reasons: boundary ? boundary.reasons : [index === 0 ? "song-start" : "song-end"],
      activitySummary: {
        noteCount,
        averagePolyphony: Number((bars.reduce((sum, entry) => sum + entry.activity.averagePolyphony, 0) / Math.max(1, bars.length)).toFixed(4)),
        averageDuration: Number((bars.reduce((sum, entry) => sum + entry.activity.averageDuration, 0) / Math.max(1, bars.length)).toFixed(4)),
        bassNotes: bars.reduce((sum, entry) => sum + entry.activity.bassNotes, 0),
        percussionNotes: bars.reduce((sum, entry) => sum + entry.activity.percussionNotes, 0),
        distinctPitchClasses: new Set(bars.flatMap((entry) => (
          entry.chroma.distribution.flatMap((value, pitchClass) => (value > 0 ? [pitchClass] : []))
        ))).size,
      },
      chromaSummary: chromaOf(timeline, startBar, endBar),
    };
  });
}

export interface SegmentationQuality {
  sectionCount: number;
  boundaryPrecision: number;
  boundaryRecall: number;
  overSegmentationRate: number;
  underSegmentationRate: number;
}

/** Compares estimated boundaries with reference ones inside a bar tolerance. */
export function evaluateSegmentation(
  sections: readonly Section[],
  referenceBoundaries: readonly number[],
  toleranceBars = 2,
): SegmentationQuality {
  const estimated = sections.slice(1).map((section) => section.startBar);
  const matched = estimated.filter((bar) => referenceBoundaries.some(
    (reference) => Math.abs(reference - bar) <= toleranceBars,
  ));
  const recalled = referenceBoundaries.filter((reference) => estimated.some(
    (bar) => Math.abs(reference - bar) <= toleranceBars,
  ));
  const ratio = (value: number, total: number) => (total === 0 ? 0 : Number((value / total).toFixed(6)));
  return {
    sectionCount: sections.length,
    boundaryPrecision: ratio(matched.length, estimated.length),
    boundaryRecall: ratio(recalled.length, referenceBoundaries.length),
    overSegmentationRate: ratio(Math.max(0, estimated.length - recalled.length), Math.max(1, referenceBoundaries.length)),
    underSegmentationRate: ratio(Math.max(0, referenceBoundaries.length - recalled.length), Math.max(1, referenceBoundaries.length)),
  };
}
