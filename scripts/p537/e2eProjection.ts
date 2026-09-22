/**
 * P5.37-02 end-to-end DEFAULT-analyzer projection (diagnostic / shadow only).
 *
 * Baseline parity (test-locked): the per-window quality-scored candidates from the
 * read-only `diagnoseLegacyWindowCandidates(bytes, phase4 scoring)` + the exported
 * `smoothTimeline` reproduce the exact production `analyzeMidi` (phase4-symbolic-v1)
 * `fullTimeline`. On that faithful reconstruction it injects the FROZEN
 * union-chimera partition (P5.37-01 policy v1) into the pre-smoothing window items
 * for triggered windows only, then re-smooths — measuring whether the correction
 * survives downstream smoothing to the FINAL timeline (Gate L).
 *
 * It changes NO production behavior: production functions are consumed read-only,
 * the scorer/vocabulary are unchanged, and nothing is wired into the analyzer.
 */

import { diagnoseLegacyWindowCandidates, smoothTimeline } from "../../src/domain/midi/legacy";
import { phase4QualityEvidence } from "../../src/domain/midi/phase4Analyzer";
import { beatsPerBar } from "../../src/domain/midi/timing";
import { makeChordSymbol, parseChordLabel } from "../../src/domain/chords";
import type { ChordSymbol, ChordTimelineItem } from "../../src/domain/types";
import type { MidiSongData, TrackRole } from "../../src/domain/midi/types";

import { analyzeUnionChimera } from "./unionChimera";

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function chordFromLabel(label: string): ChordSymbol {
  return parseChordLabel(label) ?? makeChordSymbol(0, "maj");
}

function toItem(bar: number, beat: number, durationBeats: number, chord: ChordSymbol, confidence: number): ChordTimelineItem {
  return { bar, beat, durationBeats, chord, confidence, alternatives: [], warnings: [] };
}

export interface E2EProjectionResult {
  readonly baselineTimeline: readonly string[];
  readonly correctedTimeline: readonly string[];
  readonly baselineCount: number;
  readonly correctedCount: number;
  readonly triggeredWindows: number;
  /** chord families present in baseline but gone from corrected (removed chimeras). */
  readonly removedLabels: string[];
  /** chord families present in corrected but not baseline (introduced local states). */
  readonly addedLabels: string[];
}

/**
 * Projects the frozen union-chimera partition through the default-analyzer flow.
 * `bytes` (real MIDI) or `data` (synthetic) — one is required. Pure/deterministic.
 */
export function projectUnionChimeraEndToEnd(
  bytes: Uint8Array,
  data: MidiSongData,
  roles: Map<number, TrackRole> = new Map(),
): E2EProjectionResult {
  const barLen = beatsPerBar(data.timeSignature);
  const scoring = { useQualityEvidence: true as const, qualityEvidence: phase4QualityEvidence };

  // Faithful pre-smoothing per-window items (quality scoring == production default).
  const diag = diagnoseLegacyWindowCandidates(bytes, scoring);
  const baseItems: ChordTimelineItem[] = diag.map((w) =>
    toItem(w.bar, w.beat, w.durationBeats, w.candidates[0]!.chord, clampConfidence(w.candidates[0]!.rawScore)),
  );

  // Frozen union-chimera decisions per window (default-scoring policy v1, unchanged).
  const chimera = analyzeUnionChimera(data, roles);
  const decisionByIndex = new Map(chimera.windows.map((w) => [w.windowIndex, w]));

  const correctedItems: ChordTimelineItem[] = [];
  let triggeredWindows = 0;
  diag.forEach((w, i) => {
    const decision = decisionByIndex.get(i);
    const base = baseItems[i]!;
    if (decision?.triggered && decision.state0 && decision.state1) {
      triggeredWindows += 1;
      // Split the 2-beat window into two 1-beat coherent local states.
      const startAbs = (w.bar - 1) * barLen + (w.beat - 1);
      const midAbs = startAbs + 1;
      const barOf = (abs: number) => Math.floor(abs / barLen) + 1;
      const beatOf = (abs: number) => (abs % barLen) + 1;
      correctedItems.push(toItem(barOf(startAbs), beatOf(startAbs), 1, chordFromLabel(decision.state0), base.confidence));
      correctedItems.push(toItem(barOf(midAbs), beatOf(midAbs), 1, chordFromLabel(decision.state1), base.confidence));
    } else {
      correctedItems.push(base);
    }
  });

  const baselineTimeline = smoothTimeline(baseItems, barLen).map((it) => it.chord.label);
  const correctedTimeline = smoothTimeline(correctedItems, barLen).map((it) => it.chord.label);

  const baseSet = new Set(baselineTimeline);
  const corrSet = new Set(correctedTimeline);
  const removedLabels = [...baseSet].filter((l) => !corrSet.has(l)).sort();
  const addedLabels = [...corrSet].filter((l) => !baseSet.has(l)).sort();

  return {
    baselineTimeline,
    correctedTimeline,
    baselineCount: baselineTimeline.length,
    correctedCount: correctedTimeline.length,
    triggeredWindows,
    removedLabels,
    addedLabels,
  };
}
