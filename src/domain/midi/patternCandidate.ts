import type { CandidateOccurrence, CandidatePattern } from "./occurrence";

/**
 * Patterns as the unit a display slot is spent on.
 *
 * Occurrences are the right unit for evidence and scoring: each one has its own
 * bars, its own absolute chords and its own voicing. They are the wrong unit for
 * a card. Selecting occurrences and rendering one card each let the same
 * progression take four of ten slots on `15.Endless,endless.` — the list covered
 * the song and offered the user one usable progression.
 *
 * Aggregating first is what fixes that. Filtering duplicates out afterwards in
 * the view would leave selection still spending its budget on them, so the gap
 * would move rather than close.
 */

export interface PatternCandidate {
  patternId: string;
  normalizedProgressionIdentity: string;
  /** Every occurrence, deduplicated by id and ordered by position. */
  occurrences: CandidateOccurrence[];
  /**
   * The occurrence the card shows.
   *
   * The highest scoring one, so the card leads with the clearest statement of the
   * progression. This is separate from the pattern's identity anchor: that stays
   * the earliest occurrence so `transposeOffset` keeps meaning the same thing.
   */
  representative: CandidateOccurrence;
  /**
   * Harmonic-active bars the card itself shows: the representative's bars.
   *
   * Selection accounts on this rather than on the union. Crediting a card with
   * every bar its siblings touch makes a single pick look like it has covered
   * most of the song, which fires the coverage stop after two picks and leaves
   * the list shorter than before. The union is still reported, as `reachableBars`.
   */
  coveredBars: number[];
  /** Bars reachable from this card once its other occurrences are opened. */
  reachableBars: number[];
  /** The representative's score. Patterns are not credited for being frequent. */
  score: number;
  lengthBars: number;
}

function barsOf(
  occurrence: CandidateOccurrence,
  active: ReadonlySet<number>,
): number[] {
  const bars: number[] = [];
  for (let bar = occurrence.startBar; bar <= occurrence.endBar; bar += 1) {
    if (active.has(bar)) bars.push(bar);
  }
  return bars;
}

/**
 * Picks the occurrence a card leads with.
 *
 * Deterministic all the way down: score, then position, then id. Two runs on the
 * same file must produce the same card, and a tie broken by iteration order
 * would not.
 */
function pickRepresentative(occurrences: readonly CandidateOccurrence[]): CandidateOccurrence {
  return [...occurrences].sort((left, right) => right.score - left.score
    || left.startBar - right.startBar
    || left.lengthBars - right.lengthBars
    || left.id.localeCompare(right.id))[0];
}

/**
 * Aggregates grouped patterns into the candidates selection works on.
 *
 * Coverage is the union over every occurrence, because a card that can offer its
 * other appearances genuinely reaches those bars. What it must not do is claim
 * the same bars twice by appearing twice, which is why the caller selects
 * patterns rather than occurrences.
 */
export function buildPatternCandidates(
  patterns: readonly CandidatePattern[],
  harmonicActiveBars: readonly number[],
): PatternCandidate[] {
  const active = new Set(harmonicActiveBars);

  return patterns
    .map((pattern) => {
      const byId = new Map<string, CandidateOccurrence>();
      for (const occurrence of pattern.occurrences) byId.set(occurrence.id, occurrence);
      const occurrences = [...byId.values()].sort(
        (left, right) => left.startBar - right.startBar
          || left.lengthBars - right.lengthBars
          || left.id.localeCompare(right.id),
      );
      const representative = pickRepresentative(occurrences);
      const reachable = new Set<number>();
      for (const occurrence of occurrences) {
        for (const bar of barsOf(occurrence, active)) reachable.add(bar);
      }

      return {
        patternId: pattern.patternId,
        normalizedProgressionIdentity: pattern.normalizedProgressionIdentity,
        occurrences,
        representative,
        coveredBars: barsOf(representative, active),
        reachableBars: [...reachable].sort((left, right) => left - right),
        score: representative.score,
        lengthBars: representative.lengthBars,
      };
    })
    .sort((left, right) => right.score - left.score
      || left.representative.startBar - right.representative.startBar
      || left.patternId.localeCompare(right.patternId));
}
