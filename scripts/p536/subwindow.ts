/**
 * P5.36-03 sub-window isolation / wrong-root score decomposition (diagnostic only,
 * pure). For each legacy 2-beat window (W2) it also ranks candidates on the first
 * beat (B0), the second beat (B1), via production's own 1-beat windows, and reads
 * the W2-winner's support provenance across the two beats and the exact-onset
 * clusters (AC). It tests the "union-only winner" hypothesis WITHOUT determining
 * harmony from beat labels and WITHOUT any oracle input.
 *
 * Production is untouched: `buildWeightedWindows` is consumed read-only (at its
 * supported durations 2 and 1), the scorer is the parity-guarded replica, and
 * nothing is wired into the analyzer. `SAME_ANALYSIS_WINDOW` is treated as distinct
 * from `SAME_HARMONIC_STATE`.
 */

import { buildWeightedWindows } from "../../src/domain/midi/legacy";
import { beatsPerBar } from "../../src/domain/midi/timing";
import type { MidiSongData, TrackRole } from "../../src/domain/midi/types";

import { analyzeAttackProvenance } from "./attackProvenance";
import { maxIndex, rankCandidates, rankOfLabel } from "./shadowScore";

export interface WinnerPcSupport {
  readonly b0Only: number;
  readonly b1Only: number;
  readonly both: number;
  readonly unsupported: number;
}

export interface SubwindowResult {
  readonly windowIndex: number;
  readonly w2Winner: string;
  readonly w2WinnerConfidence: number;
  readonly b0Winner: string | null;
  readonly b1Winner: string | null;
  readonly winnerRoot: number;
  readonly b0WinnerRoot: number | null;
  readonly b1WinnerRoot: number | null;
  readonly b0Empty: boolean;
  readonly b1Empty: boolean;
  /** 1-based rank of the W2 winner's label within B0 / B1 rankings (null if absent/empty). */
  readonly w2WinnerRankInB0: number | null;
  readonly w2WinnerRankInB1: number | null;
  /** W2 winner (exact label) wins in NEITHER non-empty beat — a union-only winner. */
  readonly unionOnlyWinner: boolean;
  /** The W2 winner's ROOT wins in neither non-empty beat — the wrong root is a pure union artifact. */
  readonly rootWinsNeitherBeat: boolean;
  /** Where the W2 winner's chord tones are actually supported. */
  readonly winnerPcSupport: WinnerPcSupport;
  /** True when the winner's defining evidence spans BOTH beats (chimera support). */
  readonly winnerSupportSpansBothBeats: boolean;
  readonly w2BassPc: number;
  readonly b0BassPc: number | null;
  readonly b1BassPc: number | null;
  readonly bassChange: boolean;
  readonly onsetClusterCount: number;
  /** Distinct onset clusters that introduce the W2 winner's matched pitch classes. */
  readonly winnerPcClusterSpan: number;
}

export interface SubwindowOptions {
  readonly attackToleranceTicks?: number;
}

export interface SubwindowAnalysis {
  readonly windows: readonly SubwindowResult[];
}

export function analyzeSubwindows(
  data: MidiSongData,
  roles: Map<number, TrackRole> = new Map(),
  options: SubwindowOptions = {},
): SubwindowAnalysis {
  const w2 = buildWeightedWindows(data, roles, 2);
  const one = buildWeightedWindows(data, roles, 1);
  const prov = analyzeAttackProvenance(data, roles, { durationBeats: 2, bucketCount: 2, attackToleranceTicks: options.attackToleranceTicks });
  void beatsPerBar; // window grids already align by construction

  const windows: SubwindowResult[] = [];

  w2.forEach((win, i) => {
    if (win.totalWeight <= 0) return; // only inspect windows with evidence

    const rankW2 = rankCandidates(win.histogram, maxIndex(win.bassHistogram));
    const winner = rankW2[0];

    const b0 = one[2 * i];
    const b1 = one[2 * i + 1];
    const b0Empty = !b0 || b0.totalWeight <= 0;
    const b1Empty = !b1 || b1.totalWeight <= 0;

    const rankB0 = b0Empty ? [] : rankCandidates(b0!.histogram, maxIndex(b0!.bassHistogram));
    const rankB1 = b1Empty ? [] : rankCandidates(b1!.histogram, maxIndex(b1!.bassHistogram));
    const b0Winner = rankB0[0]?.label ?? null;
    const b1Winner = rankB1[0]?.label ?? null;
    const b0WinnerRoot = rankB0[0]?.root ?? null;
    const b1WinnerRoot = rankB1[0]?.root ?? null;
    const w2WinnerRankInB0 = b0Empty ? null : rankOfLabel(rankB0, winner.label);
    const w2WinnerRankInB1 = b1Empty ? null : rankOfLabel(rankB1, winner.label);

    const unionOnlyWinner =
      !b0Empty && !b1Empty && winner.label !== b0Winner && winner.label !== b1Winner;
    const rootWinsNeitherBeat =
      !b0Empty && !b1Empty && winner.root !== b0WinnerRoot && winner.root !== b1WinnerRoot;

    // Support of the winner's chord tones across the two beats.
    let b0Only = 0, b1Only = 0, both = 0, unsupported = 0;
    for (const pc of winner.pcs) {
      const in0 = !b0Empty && b0!.histogram[pc] > 0;
      const in1 = !b1Empty && b1!.histogram[pc] > 0;
      if (in0 && in1) both += 1;
      else if (in0) b0Only += 1;
      else if (in1) b1Only += 1;
      else unsupported += 1;
    }
    const winnerSupportSpansBothBeats = (b0Only > 0 || both > 0) && (b1Only > 0 || both > 0) && (b0Only + b1Only) > 0;

    const w2BassPc = maxIndex(win.bassHistogram);
    const b0BassPc = b0Empty ? null : maxIndex(b0!.bassHistogram);
    const b1BassPc = b1Empty ? null : maxIndex(b1!.bassHistogram);
    const bassChange = b0BassPc !== null && b1BassPc !== null && b0BassPc !== b1BassPc;

    // Cross-cluster (AC) support: distinct exact-onset clusters that introduce the
    // winner's matched pitch classes.
    const pWin = prov.windows[i];
    const winnerPcs = new Set(winner.pcs);
    const clusterIds = new Set<number>();
    for (const a of pWin?.attacks ?? []) {
      if (winnerPcs.has(a.pitchClass)) clusterIds.add(a.onsetClusterId);
    }

    windows.push({
      windowIndex: i,
      w2Winner: winner.label,
      w2WinnerConfidence: winner.confidence,
      b0Winner,
      b1Winner,
      winnerRoot: winner.root,
      b0WinnerRoot,
      b1WinnerRoot,
      b0Empty,
      b1Empty,
      w2WinnerRankInB0,
      w2WinnerRankInB1,
      unionOnlyWinner,
      rootWinsNeitherBeat,
      winnerPcSupport: { b0Only, b1Only, both, unsupported },
      winnerSupportSpansBothBeats,
      w2BassPc,
      b0BassPc,
      b1BassPc,
      bassChange,
      onsetClusterCount: pWin?.onsetClusterCount ?? 0,
      winnerPcClusterSpan: clusterIds.size,
    });
  });

  return { windows };
}
