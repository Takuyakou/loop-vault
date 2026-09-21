/**
 * P5.34 isolation harness core (shadow-only, deterministic).
 *
 * This module is a diagnostic tool for LF-MIDI-001. It does NOT change product
 * behavior; it re-runs the existing segmentation/chord path with controlled
 * meter/onset views and records privacy-safe aggregate counts.
 *
 * The instrumented path is:
 *   source → parseMidi/preparedData → weighted windows → per-window chord
 *   → smoothed timeline → block candidates → formatted text.
 *
 * The window grid is the shared core of `legacy-v1` and `phase4-v1` (both call
 * `buildWeightedWindows`). Chord identity uses the exported `matchWindow`
 * (legacy default scoring); identity/quality-evidence differences are a
 * separate P5.34-02 concern.
 */

import { normalizePc } from "../../src/domain/chords";
import {
  buildWeightedWindows,
  extractBlockCandidates,
  matchWindow,
  smoothTimeline,
} from "../../src/domain/midi/legacy";
import type { WeightedWindow } from "../../src/domain/midi/legacy";
import { beatsPerBar } from "../../src/domain/midi/timing";
import type { MidiSongData, TrackRole } from "../../src/domain/midi/types";
import { selectChordEvidenceNotes } from "../../src/domain/midi/voices";
import type { ChordSymbol } from "../../src/domain/types";

export interface IsolationCounts {
  windowCount: number;
  timelineItemCount: number;
  blockItemCount: number;
  occupiedBarCount: number;
  formattedBarCount: number;
  dashCount: number;
}

export interface IsolationResult {
  counts: IsolationCounts;
  /** Privacy-safe chord labels, in timeline order. */
  labels: string[];
  /** Bar numbers of the smoothed timeline items. */
  timelineBars: number[];
}

export type Segmenter = "legacy" | "meter-independent";

/** Largest note end tick → beat extent, independent of meter. */
export function sourceExtentBeat(data: MidiSongData): number {
  const lastTick = data.notes.reduce(
    (max, note) => Math.max(max, note.startTick + note.durationTick),
    0,
  );
  return Math.max(1, Math.ceil(lastTick / data.ticksPerBeat));
}

/**
 * Diagnostic 4/4 meter view (variant B). Only `timeSignature` and the
 * meter-derived `totalBars` change; notes, ticksPerBeat, tempo, and every other
 * field stay identical by reference.
 */
export function withMeterView(
  data: MidiSongData,
  numerator: number,
  denominator: number,
): MidiSongData {
  const barLengthBeats = (numerator * 4) / denominator;
  const totalBeats = sourceExtentBeat(data);
  const totalBars = Math.max(1, Math.ceil(totalBeats / barLengthBeats));
  return { ...data, timeSignature: `${numerator}/${denominator}`, totalBars };
}

// Shadow copies of the private weight helpers in legacy.ts. Kept local so the
// meter-independent segmenter can be expressed without a production refactor.
function shadowOverlaps(
  note: MidiSongData["notes"][number],
  startTick: number,
  endTick: number,
): boolean {
  return note.startTick < endTick && note.startTick + note.durationTick > startTick;
}
function shadowRangeFactor(pitch: number): number {
  if (pitch < 48) return 1.4;
  if (pitch >= 72) return 0.6;
  return 1;
}
function shadowVelocityFactor(velocity: number): number {
  return 0.7 + Math.max(0, Math.min(1, velocity)) * 0.5;
}
function shadowRoleFactor(role: TrackRole): number {
  if (role === "bass") return 1.5;
  if (role === "harmony") return 1.3;
  if (role === "melody") return 0.5;
  if (role === "percussion") return 0;
  return 1;
}

/**
 * Meter-independent weighted windows (variant C).
 *
 * The grid extent is derived from the unchanged source-note extent, and the
 * bar/beat labels use a nominal 4/4 grid only for display/block purposes. Meter
 * (`timeSignature`/`totalBars`) never defines a harmonic window.
 */
export function buildMeterIndependentWindows(
  data: MidiSongData,
  roles: Map<number, TrackRole>,
  durationBeats: 1 | 2 | 4 = 2,
): WeightedWindow[] {
  const nominalBarLength = 4;
  const beatExtent = sourceExtentBeat(data);
  const windows: WeightedWindow[] = [];

  for (let startBeat = 0; startBeat < beatExtent; startBeat += durationBeats) {
    const histogram = Array(12).fill(0) as number[];
    const bassHistogram = Array(12).fill(0) as number[];
    let totalWeight = 0;
    let melodyWeight = 0;
    let noteCount = 0;
    const startTick = startBeat * data.ticksPerBeat;
    const endTick = (startBeat + durationBeats) * data.ticksPerBeat;
    const overlapping = data.notes.filter((note) =>
      shadowOverlaps(note, startTick, endTick),
    );
    const simultaneityBonus = overlapping.length >= 3 ? 1.2 : 1;

    for (const note of overlapping) {
      const role = roles.get(note.trackIndex) ?? "mixed";
      if (role === "percussion") continue;
      noteCount += 1;
      const overlapTick =
        Math.min(note.startTick + note.durationTick, endTick) -
        Math.max(note.startTick, startTick);
      const overlapBeats = Math.max(0, overlapTick / data.ticksPerBeat);
      // Meter-independent beat-position factor: no bar-start bonus.
      const beatPositionFactor = Number.isInteger(startBeat) ? 1.2 : 0.8;
      const weight =
        overlapBeats *
        beatPositionFactor *
        shadowRangeFactor(note.pitch) *
        shadowVelocityFactor(note.velocity) *
        shadowRoleFactor(role) *
        simultaneityBonus;
      const pc = normalizePc(note.pitch);
      histogram[pc] += weight;
      totalWeight += weight;
      if (note.pitch < 60 || role === "bass") {
        bassHistogram[pc] += weight * 1.25;
      }
      if (role === "melody") {
        melodyWeight += weight;
      }
    }

    windows.push({
      bar: Math.floor(startBeat / nominalBarLength) + 1,
      beat: (startBeat % nominalBarLength) + 1,
      durationBeats,
      histogram,
      bassHistogram,
      totalWeight,
      melodyWeight,
      noteCount,
    });
  }

  return windows;
}

/**
 * Transient onset snap (variant D). Returns a shallow copy whose note start
 * ticks are snapped to the nearest multiple of `toleranceTicks`; the source
 * `data` (and its notes) are never mutated.
 */
export function snapOnsets(data: MidiSongData, toleranceTicks: number): MidiSongData {
  if (toleranceTicks <= 0) return data;
  return {
    ...data,
    notes: data.notes.map((note) => ({
      ...note,
      startTick: Math.round(note.startTick / toleranceTicks) * toleranceTicks,
    })),
  };
}

/** PPQ-normalized onset sweep points, deterministic and de-duplicated. */
export function onsetSweepTicks(ticksPerBeat: number): number[] {
  const p = Math.max(1, ticksPerBeat);
  const raw = [0, p / 96, p / 48, p / 24, p / 16, p / 8].map((v) => Math.round(v));
  return [...new Set(raw)].sort((a, b) => a - b);
}

/** Runs the instrumented path for one prepared `data` and returns the counts. */
export function instrument(
  data: MidiSongData,
  roles: Map<number, TrackRole>,
  options: { durationBeats?: 1 | 2 | 4; segmenter?: Segmenter } = {},
): IsolationResult {
  const durationBeats = options.durationBeats ?? 2;
  const segmenter = options.segmenter ?? "legacy";
  const evidenceData = { ...data, notes: selectChordEvidenceNotes(data.notes) };

  const windows =
    segmenter === "meter-independent"
      ? buildMeterIndependentWindows(evidenceData, roles, durationBeats)
      : buildWeightedWindows(evidenceData, roles, durationBeats);

  const barLengthBeats =
    segmenter === "meter-independent" ? 4 : beatsPerBar(data.timeSignature);

  const ranked = [];
  let previous: ChordSymbol | undefined;
  for (const window of windows) {
    const item = matchWindow(window, previous);
    previous = item.chord;
    ranked.push(item);
  }
  const smoothed = smoothTimeline(ranked, barLengthBeats);

  const totalBars =
    segmenter === "meter-independent"
      ? Math.max(1, Math.ceil(sourceExtentBeat(data) / 4))
      : data.totalBars;
  const blocks = extractBlockCandidates(smoothed, totalBars, undefined, barLengthBeats);

  const bars = smoothed.map((item) => item.bar);
  const firstBar = bars.length > 0 ? Math.min(...bars) : 1;
  const lastBar = bars.length > 0 ? Math.max(...bars) : 1;
  const formattedBarCount = lastBar - firstBar + 1;
  const occupiedBarCount = new Set(bars).size;
  const dashCount = Math.max(0, formattedBarCount - occupiedBarCount);

  return {
    counts: {
      windowCount: windows.length,
      timelineItemCount: smoothed.length,
      blockItemCount: blocks.length,
      occupiedBarCount,
      formattedBarCount,
      dashCount,
    },
    labels: smoothed.map((item) => item.chord.label),
    timelineBars: bars,
  };
}
