/**
 * P5.37-01 (re-scoped, Option 2) — union-chimera local-evidence partition shadow
 * (diagnostic only, pure, deterministic, oracle-free).
 *
 * It detects ONLY the P5.36-CONFIRMED Family-B signature — a fixed 2-beat window
 * whose top-1 candidate wins in NEITHER beat, whose two beats are materially
 * different coherent harmonies, and whose winner draws defining support from BOTH
 * beats — and, for those windows only, proposes a local-evidence partition into
 * the two beats' coherent candidates. Every other window keeps the exact legacy
 * W2 result. It is NOT a global 1-beat split.
 *
 * Reuse: the P5.36-03 parity-guarded scorer replica (`../p536/shadowScore`) and
 * W2/B0/B1 decomposition (`../p536/subwindow`) — same candidate set, same scorer,
 * candidate generation vs ranking already separated. No candidate vocabulary,
 * scorer, or bass extraction change. No production behavior.
 *
 * Oracle-free: the trigger reads only runtime candidate rankings + per-beat
 * candidate support + bucket pitch-class evidence. No expected/known chord enters.
 */

import { buildWeightedWindows } from "../../src/domain/midi/legacy";
import type { MidiSongData, TrackRole } from "../../src/domain/midi/types";

import { analyzeSubwindows, type SubwindowResult } from "../p536/subwindow";

export type ChimeraReason =
  | "legacy-coherent"
  | "union-chimera-detected"
  | "insufficient-bucket-evidence"
  | "same-state-reattack"
  | "buckets-same-identity"
  | "support-not-spanning";

export interface WindowChimeraDecision {
  readonly windowIndex: number;
  readonly triggered: boolean;
  readonly reason: ChimeraReason;
  readonly w2Winner: string;
  readonly b0Winner: string | null;
  readonly b1Winner: string | null;
  /** When triggered: the two coherent local states (first beat / second beat). */
  readonly state0: string | null;
  readonly state1: string | null;
  readonly b0PcCount: number;
  readonly b1PcCount: number;
  readonly winnerWinsNeitherBeat: boolean;
  readonly bucketsDifferentIdentity: boolean;
  readonly supportSpansBothBeats: boolean;
  readonly rootWinsNeitherBeat: boolean;
}

export interface ChimeraOptions {
  /** A beat-bucket must carry at least this many distinct pitch classes to be "analyzable". */
  readonly minBucketPcs?: number;
}

export interface ChimeraResult {
  readonly windows: readonly WindowChimeraDecision[];
  readonly totalAnalyzed: number;
  readonly triggeredCount: number;
  readonly triggerRate: number;
}

function nonZeroPcCount(histogram: readonly number[] | undefined): number {
  if (!histogram) return 0;
  let n = 0;
  for (const v of histogram) if (v > 0) n += 1;
  return n;
}

/**
 * Analyzes each legacy 2-beat window and marks the confirmed union-chimera ones for
 * a local-evidence partition. Deterministic; never mutates `data`. Bounded: per
 * window it evaluates W2 + B0 + B1 over the fixed candidate set (via the reused
 * decomposition), plus a bucket pitch-class count.
 */
export function analyzeUnionChimera(
  data: MidiSongData,
  roles: Map<number, TrackRole> = new Map(),
  options: ChimeraOptions = {},
): ChimeraResult {
  const minBucketPcs = options.minBucketPcs ?? 3;
  const sub = analyzeSubwindows(data, roles);
  const oneBeat = buildWeightedWindows(data, roles, 1);

  const windows: WindowChimeraDecision[] = [];
  let triggeredCount = 0;

  for (const w of sub.windows as readonly SubwindowResult[]) {
    const i = w.windowIndex;
    const b0PcCount = nonZeroPcCount(oneBeat[2 * i]?.histogram);
    const b1PcCount = nonZeroPcCount(oneBeat[2 * i + 1]?.histogram);

    const winnerWinsNeitherBeat = w.unionOnlyWinner; // w2 winner is top-1 in neither non-empty beat
    const bucketsDifferentIdentity = w.b0WinnerRoot !== null && w.b1WinnerRoot !== null && w.b0WinnerRoot !== w.b1WinnerRoot;
    const supportSpansBothBeats = w.winnerSupportSpansBothBeats;

    let reason: ChimeraReason;
    if (w.b0Empty || w.b1Empty || b0PcCount < minBucketPcs || b1PcCount < minBucketPcs) {
      reason = "insufficient-bucket-evidence";
    } else if (!winnerWinsNeitherBeat) {
      // The W2 winner also wins a beat -> not a chimera (re-attack / rolled / layered / slash / syncopation).
      reason = w.b0Winner === w.b1Winner ? "same-state-reattack" : "legacy-coherent";
    } else if (!bucketsDifferentIdentity) {
      reason = "buckets-same-identity"; // e.g. a layered extended chord: both beats are the same root
    } else if (!supportSpansBothBeats) {
      reason = "support-not-spanning";
    } else {
      reason = "union-chimera-detected";
    }

    const triggered = reason === "union-chimera-detected";
    if (triggered) triggeredCount += 1;

    windows.push({
      windowIndex: i,
      triggered,
      reason,
      w2Winner: w.w2Winner,
      b0Winner: w.b0Winner,
      b1Winner: w.b1Winner,
      state0: triggered ? w.b0Winner : null,
      state1: triggered ? w.b1Winner : null,
      b0PcCount,
      b1PcCount,
      winnerWinsNeitherBeat,
      bucketsDifferentIdentity,
      supportSpansBothBeats,
      rootWinsNeitherBeat: w.rootWinsNeitherBeat,
    });
  }

  return {
    windows,
    totalAnalyzed: windows.length,
    triggeredCount,
    triggerRate: windows.length === 0 ? 0 : triggeredCount / windows.length,
  };
}
