import type { ChordTimelineItem, ProgressionBlockCandidate } from "../types";
import { normaliseEvidence, scoreBlockQuality } from "./blockQuality";
import {
  buildCandidateEvents, candidateStats, recoverRawMatchScore,
  structuredSignature, summaryFromEvents,
} from "./candidateBlock";
import {
  selectProgressionCandidates,
  type CandidateSelectionDiagnostic,
  type CandidateSelectionEntry,
} from "./candidateSelection";

/**
 * Block extraction for the reranker analyzers.
 *
 * Shares the Candidate Block v2 model with the legacy path so P4.0-06 compares
 * analyzers on the same block definition. Previously this built its own per-beat
 * label grid and its own dedup key, which meant a block-level comparison across
 * analyzers was measuring two different things.
 */
export function extractHybridBlocks(
  timeline: readonly ChordTimelineItem[],
  totalBars: number,
  beatsPerBar = 4,
  rankingScores?: readonly number[],
  diagnostics?: CandidateSelectionDiagnostic[],
): ProgressionBlockCandidate[] {
  const raw: CandidateSelectionEntry[] = [];
  // Without internal ranking scores the UI confidences are the only evidence
  // available, which keeps the no-argument call equivalent to passing them.
  const rawMatchScores = rankingScores
    ? rankingScores.map(recoverRawMatchScore)
    : timeline.map((item) => item.confidence);
  const normalise = normaliseEvidence(rawMatchScores);

  for (const lengthBars of [2, 4, 8, 16] as const) {
    // Build each window once and tally signatures, so repeat counting is a
    // lookup instead of a rescan of the whole timeline per window.
    const windows = [];
    for (let startBar = 1; startBar + lengthBars - 1 <= totalBars; startBar += 1) {
      const events = buildCandidateEvents(
        timeline, startBar, lengthBars, beatsPerBar, rawMatchScores,
      );
      if (!events.length) continue;
      windows.push({ startBar, events, signature: structuredSignature(events) });
    }
    const repeatCounts = new Map<string, number>();
    for (const window of windows) {
      repeatCounts.set(window.signature, (repeatCounts.get(window.signature) ?? 0) + 1);
    }

    for (const { startBar, events, signature } of windows) {
      const endBar = startBar + lengthBars - 1;
      const chords = timeline.filter((item) => item.bar >= startBar && item.bar <= endBar);
      const stats = candidateStats(events, lengthBars);
      const repeatCount = repeatCounts.get(signature) ?? 1;
      const quality = scoreBlockQuality(events, {
        repeatCount, beatsPerBar, normaliseEvidence: normalise,
      });
      raw.push({
        dedupeKey: signature,
        selectionScore: quality.total,
        densityClass: stats.densityClass,
        quality,
        candidate: {
          id: `hybrid-bars-${startBar}-${endBar}`,
          startBar,
          endBar,
          lengthBars,
          chords: [...chords],
          events,
          stats,
          structuredSignature: signature,
          summaryText: summaryFromEvents(events, lengthBars, beatsPerBar),
          confidence: clamp(average(events.map((event) => event.confidence))),
          ...(repeatCount > 1 ? { repeatCount } : {}),
          labels: repeatCount > 1
            ? ["main", ...(lengthBars === 4 ? ["turnaround"] : [])]
            : [lengthBars === 4 ? "turnaround" : "variation"],
          warnings: [...new Set(events.flatMap((event) => event.warnings))],
        },
      });
    }
  }
  return selectProgressionCandidates(raw, totalBars, diagnostics);
}

export function beatGridSignature(
  chords: readonly ChordTimelineItem[],
  startBar: number,
  lengthBars: number,
  beatsPerBar = 4,
): string[] {
  const startBeat = (startBar - 1) * beatsPerBar;
  return Array.from({ length: Math.ceil(lengthBars * beatsPerBar) }, (_, offset) => {
    const beat = startBeat + offset;
    return chords.find((item) => {
      const itemStart = (item.bar - 1) * beatsPerBar + item.beat - 1;
      return beat >= itemStart && beat < itemStart + item.durationBeats;
    })?.chord.label ?? "N.C.";
  });
}

function average(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function clamp(value: number): number { return Math.max(0, Math.min(0.92, Number(value.toFixed(4)))); }
