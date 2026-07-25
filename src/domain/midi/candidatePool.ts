import type { CandidateOccurrence } from "./occurrence";

/**
 * Candidate pool normalisation.
 *
 * Stage E tripled the pool — 78 patterns to 235, 143 occurrences to 362 — and the
 * G0 ablation showed what that cost: selected recall fell from 0.866 to 0.745 and
 * clean/stress selection agreement from 0.785 to 0.700. More candidates is not
 * more choice when several of them are the same choice written differently.
 *
 * Two passes, both conservative. Nothing is removed that a user could reach and
 * not reach afterwards.
 */

export interface PoolNormalizationDiagnostics {
  occurrencesBefore: number;
  occurrencesAfter: number;
  patternsBefore: number;
  patternsAfter: number;
  /** Windows produced by more than one generator, merged rather than duplicated. */
  multiSourceWindows: number;
  /** Occurrences dropped because another occurrence strictly dominated them. */
  dominatedRemoved: number;
  poolMultiplier: number;
}

/** The chord sequence, ignoring exact timing: what the candidate says, not when. */
function chordSequenceOf(occurrence: CandidateOccurrence): string {
  return occurrence.events.map((event) => event.identityKey).join(">");
}

function coveredBarsOf(occurrence: CandidateOccurrence, active: ReadonlySet<number>): number[] {
  const bars: number[] = [];
  for (let bar = occurrence.startBar; bar <= occurrence.endBar; bar += 1) {
    if (active.has(bar)) bars.push(bar);
  }
  return bars;
}

/**
 * Whether `candidate` is strictly dominated by `other`.
 *
 * Dominance requires the same pattern, the same chord sequence, a subset of the
 * covered bars, and no better score. The chord-sequence equality is what protects
 * nesting: a four-bar motif inside an eight-bar phrase states fewer chords, so it
 * is never dominated by the phrase that contains it. Length alone never prunes
 * anything.
 */
function isDominatedBy(
  candidate: CandidateOccurrence,
  other: CandidateOccurrence,
  active: ReadonlySet<number>,
): boolean {
  if (candidate.id === other.id) return false;
  if (candidate.relativeSignature !== other.relativeSignature) return false;
  if (chordSequenceOf(candidate) !== chordSequenceOf(other)) return false;
  if (candidate.score > other.score) return false;

  const otherBars = new Set(coveredBarsOf(other, active));
  const ownBars = coveredBarsOf(candidate, active);
  if (ownBars.length === 0) return false;
  // A bar only this candidate reaches is a reason to keep it, whatever else it
  // shares with the other.
  return ownBars.every((bar) => otherBars.has(bar));
}

export function normalizeCandidatePool(
  occurrences: readonly CandidateOccurrence[],
  harmonicActiveBars: readonly number[],
): { occurrences: CandidateOccurrence[]; diagnostics: PoolNormalizationDiagnostics } {
  const active = new Set(harmonicActiveBars);
  const patternsBefore = new Set(occurrences.map((entry) => entry.relativeSignature)).size;

  // Pass 1: exact merge. `buildOccurrences` already keys on span, so what is
  // counted here is how often more than one generator asked for the same window —
  // the duplication that would otherwise appear as two identical cards.
  const bySpan = new Map<string, CandidateOccurrence>();
  let multiSourceWindows = 0;
  for (const occurrence of occurrences) {
    const key = `${occurrence.startBar}:${occurrence.endBar}`;
    const existing = bySpan.get(key);
    if (!existing) {
      bySpan.set(key, occurrence);
      continue;
    }
    multiSourceWindows += 1;
    // Keep the better-scoring reading and union the provenance.
    const kept = occurrence.score > existing.score ? occurrence : existing;
    bySpan.set(key, {
      ...kept,
      sourceKinds: [...new Set([...(existing.sourceKinds ?? []), ...(occurrence.sourceKinds ?? [])])],
    });
  }
  const merged = [...bySpan.values()];

  // Pass 2: strict dominance. Grouped by pattern first so the comparison is
  // linear in the size of each group rather than quadratic across the pool.
  const byPattern = new Map<string, CandidateOccurrence[]>();
  for (const occurrence of merged) {
    const group = byPattern.get(occurrence.relativeSignature) ?? [];
    group.push(occurrence);
    byPattern.set(occurrence.relativeSignature, group);
  }

  const survivors: CandidateOccurrence[] = [];
  let dominatedRemoved = 0;
  for (const group of byPattern.values()) {
    // Best first, so a candidate is only ever compared against something already
    // kept and the relation cannot cycle.
    const ordered = [...group].sort((left, right) => right.score - left.score
      || left.startBar - right.startBar
      || left.id.localeCompare(right.id));
    const kept: CandidateOccurrence[] = [];
    for (const occurrence of ordered) {
      if (kept.some((other) => isDominatedBy(occurrence, other, active))) {
        dominatedRemoved += 1;
        continue;
      }
      kept.push(occurrence);
    }
    survivors.push(...kept);
  }

  survivors.sort((left, right) => left.startBar - right.startBar
    || left.lengthBars - right.lengthBars
    || left.id.localeCompare(right.id));

  return {
    occurrences: survivors,
    diagnostics: {
      occurrencesBefore: occurrences.length,
      occurrencesAfter: survivors.length,
      patternsBefore,
      patternsAfter: new Set(survivors.map((entry) => entry.relativeSignature)).size,
      multiSourceWindows,
      dominatedRemoved,
      poolMultiplier: occurrences.length === 0
        ? 1
        : Number((survivors.length / occurrences.length).toFixed(4)),
    },
  };
}
