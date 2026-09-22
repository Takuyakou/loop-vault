/**
 * P5.36-02 meter-normalized chord-identity A/B (shadow / diagnostic only, pure).
 *
 * Compares, for the SAME source events, two diagnostic views:
 *   A = the source meter as parsed (e.g. 1/4),
 *   B = a diagnostic 4/4 meter view via `withMeterView` (notes untouched),
 * at two independent levels:
 *   Level A (evidence window): window membership, histogram, bassHistogram,
 *     structural bass.
 *   Level B (semantic identity): legacy top-1 chord, root, slash bass, via the
 *     exact exported `matchWindow`.
 *
 * It changes NO production behavior: `buildWeightedWindows`/`matchWindow` are
 * consumed read-only, notes are never mutated, and the window WIDTH is never
 * changed (still 2 beats — sub-window work is P5.36-03). Only the diagnostic
 * meter/grid view differs between A and B (§11).
 */

import { buildWeightedWindows, matchWindow } from "../../src/domain/midi/legacy";
import { withMeterView } from "../p534/isolationCore";
import type { MidiSongData, TimedNote, TrackRole } from "../../src/domain/midi/types";

const EPS = 1e-9;

export interface WindowAB {
  readonly windowIndex: number;
  readonly membershipEqual: boolean;
  readonly contributionCountA: number;
  readonly contributionCountB: number;
  /** Histograms bit-equal (within EPS). */
  readonly histogramEqual: boolean;
  /** Histograms equal after per-window normalization by their sum (scale cancels). */
  readonly histogramProportional: boolean;
  /** B/A scale on the first non-zero histogram bin (1 when identical), or null if empty. */
  readonly histogramScale: number | null;
  readonly bassPcA: number | null;
  readonly bassPcB: number | null;
  readonly topA: string;
  readonly topB: string;
  readonly bassA: number | null;
  readonly bassB: number | null;
  readonly identityEqual: boolean;
}

export interface MeterABResult {
  readonly windowCountA: number;
  readonly windowCountB: number;
  readonly windows: readonly WindowAB[];
  readonly membershipAllEqual: boolean;
  readonly histogramAllEqual: boolean;
  readonly histogramAllProportional: boolean;
  readonly identityAllEqual: boolean;
}

function overlaps(note: TimedNote, startTick: number, endTick: number): boolean {
  return note.startTick < endTick && note.startTick + note.durationTick > startTick;
}

/** Stable, non-private membership key for a note (positional, not a raw pitch dump). */
function membershipKey(notes: readonly TimedNote[], startTick: number, endTick: number): string {
  return notes
    .filter((n) => overlaps(n, startTick, endTick))
    .map((n) => `${n.pitch}:${n.startTick}:${n.durationTick}:${n.trackIndex}`)
    .sort()
    .join("|");
}

function maxIndex(values: readonly number[]): number {
  let bi = 0;
  let bv = Number.NEGATIVE_INFINITY;
  values.forEach((v, i) => {
    if (v > bv) {
      bv = v;
      bi = i;
    }
  });
  return bi;
}

function histSum(h: readonly number[]): number {
  return h.reduce((s, v) => s + v, 0);
}

function equalWithin(a: readonly number[], b: readonly number[], eps: number): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (Math.abs(a[i] - b[i]) > eps) return false;
  return true;
}

function proportional(a: readonly number[], b: readonly number[]): boolean {
  const sa = histSum(a);
  const sb = histSum(b);
  if (sa <= EPS && sb <= EPS) return true;
  if (sa <= EPS || sb <= EPS) return false;
  for (let i = 0; i < a.length; i += 1) if (Math.abs(a[i] / sa - b[i] / sb) > 1e-9) return false;
  return true;
}

/**
 * Runs the meter A/B. Pure and deterministic; never mutates `data`. `roles` must
 * be the same for both views (meter does not change note roles).
 */
export function meterIdentityAB(
  data: MidiSongData,
  roles: Map<number, TrackRole> = new Map(),
): MeterABResult {
  const dataB = withMeterView(data, 4, 4);
  const ticksPerBeat = Math.max(1, data.ticksPerBeat);
  const windowsA = buildWeightedWindows(data, roles, 2);
  const windowsB = buildWeightedWindows(dataB, roles, 2);

  const n = Math.max(windowsA.length, windowsB.length);
  const windows: WindowAB[] = [];
  let membershipAllEqual = true;
  let histogramAllEqual = true;
  let histogramAllProportional = true;
  let identityAllEqual = true;

  for (let i = 0; i < n; i += 1) {
    const wa = windowsA[i];
    const wb = windowsB[i];
    const startTick = i * 2 * ticksPerBeat;
    const endTick = (i * 2 + 2) * ticksPerBeat;

    // Membership from the (unchanged) note set over the identical tick range.
    const keyA = membershipKey(data.notes, startTick, endTick);
    const keyB = membershipKey(dataB.notes, startTick, endTick);
    const membershipEqual = keyA === keyB && wa !== undefined && wb !== undefined;

    const histA = wa?.histogram ?? Array(12).fill(0);
    const histB = wb?.histogram ?? Array(12).fill(0);
    const histogramEqual = equalWithin(histA, histB, EPS);
    const histogramProportional = proportional(histA, histB);
    let scale: number | null = null;
    for (let pc = 0; pc < 12; pc += 1) {
      if (Math.abs(histA[pc]) > EPS) {
        scale = histB[pc] / histA[pc];
        break;
      }
    }

    const itemA = wa ? matchWindow(wa) : undefined;
    const itemB = wb ? matchWindow(wb) : undefined;
    const topA = itemA?.chord.label ?? "(none)";
    const topB = itemB?.chord.label ?? "(none)";
    const bassA = itemA?.chord.bass ?? null;
    const bassB = itemB?.chord.bass ?? null;
    const identityEqual = topA === topB && bassA === bassB;

    if (wa && wb) {
      if (!membershipEqual) membershipAllEqual = false;
      if (!histogramEqual) histogramAllEqual = false;
      if (!histogramProportional) histogramAllProportional = false;
      if (!identityEqual) identityAllEqual = false;
    }

    windows.push({
      windowIndex: i,
      membershipEqual,
      contributionCountA: wa?.noteCount ?? 0,
      contributionCountB: wb?.noteCount ?? 0,
      histogramEqual,
      histogramProportional,
      histogramScale: scale,
      bassPcA: wa ? maxIndex(wa.bassHistogram) : null,
      bassPcB: wb ? maxIndex(wb.bassHistogram) : null,
      topA,
      topB,
      bassA,
      bassB,
      identityEqual,
    });
  }

  return {
    windowCountA: windowsA.length,
    windowCountB: windowsB.length,
    windows,
    membershipAllEqual,
    histogramAllEqual,
    histogramAllProportional,
    identityAllEqual,
  };
}
