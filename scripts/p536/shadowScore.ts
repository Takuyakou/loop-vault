/**
 * P5.36-03 shadow candidate scorer (diagnostic only, pure) — a strict replica of
 * production `scoreTemplates` (default scoring: no quality evidence, no companion/
 * flat-nine candidates). It is used ONLY to read full candidate ranks on
 * sub-window histograms (W2 / B0 / B1). A parity guard test asserts its top-1 label
 * equals production `matchWindow`'s on every fixture window, so any production
 * scorer drift fails loudly. It changes NO production behavior.
 *
 * The candidate SET is constant per window (all 12 roots × the fixed template
 * vocabulary), so a candidate is never "absent"; only its rank moves with the
 * histogram. That is what this module measures.
 */

import { labelFromSymbol, makeChordSymbol, normalizePc } from "../../src/domain/chords";
import type { ChordQuality } from "../../src/domain/types";

// ponytail: duplicated verbatim from legacy.ts `templates`; the parity guard test
// fails if production drifts, at which point re-home to a shared constant.
const TEMPLATES: ReadonlyArray<{ quality: ChordQuality; intervals: number[] }> = [
  { quality: "maj", intervals: [0, 4, 7] },
  { quality: "min", intervals: [0, 3, 7] },
  { quality: "dim", intervals: [0, 3, 6] },
  { quality: "aug", intervals: [0, 4, 8] },
  { quality: "maj7", intervals: [0, 4, 7, 11] },
  { quality: "min7", intervals: [0, 3, 7, 10] },
  { quality: "dom7", intervals: [0, 4, 7, 10] },
  { quality: "min7b5", intervals: [0, 3, 6, 10] },
  { quality: "dim7", intervals: [0, 3, 6, 9] },
  { quality: "six", intervals: [0, 4, 7, 9] },
  { quality: "min6", intervals: [0, 3, 7, 9] },
  { quality: "sixNine", intervals: [0, 2, 4, 7, 9] },
  { quality: "sus2", intervals: [0, 2, 7] },
  { quality: "sus4", intervals: [0, 5, 7] },
  { quality: "dom7sus4", intervals: [0, 5, 7, 10] },
  { quality: "add9", intervals: [0, 2, 4, 7] },
  { quality: "maj9", intervals: [0, 2, 4, 7, 11] },
  { quality: "min9", intervals: [0, 2, 3, 7, 10] },
  { quality: "dom9", intervals: [0, 2, 4, 7, 10] },
  { quality: "min11", intervals: [0, 2, 3, 5, 7, 10] },
  { quality: "dom13", intervals: [0, 2, 4, 7, 10, 21] },
];

export interface ScoredCandidate {
  readonly label: string;
  readonly root: number;
  readonly quality: ChordQuality;
  readonly bass: number | undefined;
  readonly confidence: number;
  /** Chord-tone pitch classes of this candidate. */
  readonly pcs: number[];
}

export function maxIndex(values: readonly number[]): number {
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

/**
 * Replica of production `scoreTemplates(histogram, bassPc)` under default scoring.
 * Returns candidates ranked exactly as `rankWindowCandidates` (confidence desc,
 * then label localeCompare). Empty histogram → the same fallback as production.
 */
export function rankCandidates(histogram: readonly number[], bassPc: number): ScoredCandidate[] {
  const total = histogram.reduce((s, v) => s + v, 0);
  if (total <= 0) {
    const c = makeChordSymbol(0, "maj");
    return [{ label: c.label, root: 0, quality: "maj", bass: undefined, confidence: 0.2, pcs: [0, 4, 7] }];
  }

  const entries: ScoredCandidate[] = [];
  for (let root = 0; root < 12; root += 1) {
    for (const template of TEMPLATES) {
      const pcs = template.intervals.map((interval) => normalizePc(root + interval));
      const pcSet = new Set(pcs);
      const hit = pcs.reduce((sum, pc) => sum + histogram[pc], 0);
      const outside = histogram.reduce((sum, value, pc) => sum + (pcSet.has(pc) ? 0 : value), 0);
      const rootWeight = histogram[root] / total;
      const bassBonus = bassPc === root ? 0.18 : pcSet.has(bassPc) ? 0.08 : -0.04;
      const extensionPenalty = Math.max(0, pcs.length - 4) * 0.015;
      const confidence =
        hit / total - (outside / total) * 0.12 + rootWeight * 0.12 + bassBonus - extensionPenalty;
      const bass = bassPc !== root && pcSet.has(bassPc) ? bassPc : undefined;
      const chord = makeChordSymbol(root, template.quality, [], bass);
      entries.push({
        label: labelFromSymbol(chord),
        root,
        quality: template.quality,
        bass,
        confidence,
        pcs: [...pcSet].sort((a, b) => a - b),
      });
    }
  }
  entries.sort((a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label));
  return entries;
}

/** 1-based rank of the first candidate with `label`, or null if not present. */
export function rankOfLabel(ranked: readonly ScoredCandidate[], label: string): number | null {
  const i = ranked.findIndex((c) => c.label === label);
  return i < 0 ? null : i + 1;
}
