import type { PatternCandidate } from "./patternCandidate";
import type { Section } from "./sections";

/**
 * Structural evidence for a candidate's span.
 *
 * The G0 taxonomy attributed 93.5% of rank failures to `not-selected`: the
 * pattern was generated and grouped correctly and the selector picked something
 * else. What it picked were long windows starting at arbitrary bars, because
 * nothing in the objective could tell an arbitrary span from a span the music
 * itself marks out.
 *
 * These signals answer that question from the material — where sections begin,
 * where a cycle repeats, where a loop closes. No gold information reaches this
 * file: it never sees a scenario id, a block id or a fixed bar position.
 */

export interface PatternEvidence {
  /** 0..1. How strongly the span's edges are marked by the music. */
  structuralSalience: number;
  /** Bars from the start of the song, normalised. Used for spreading picks. */
  temporalPosition: number;
}

const SECTION_TOLERANCE_BARS = 1;

/**
 * How well a span lines up with something structural.
 *
 * Additive and capped: a span that starts on a section boundary and closes a
 * repeat cycle is more strongly marked than one that only does the first. A span
 * that matches nothing scores zero rather than negative — it is unmarked, not
 * wrong.
 */
export function structuralSalience(
  pattern: PatternCandidate,
  sections: readonly Section[],
  repeatPeriods: ReadonlySet<number>,
): number {
  const { startBar, endBar, lengthBars } = pattern.representative;
  let score = 0;

  const nearSectionStart = sections.some(
    (section) => Math.abs(section.startBar - startBar) <= SECTION_TOLERANCE_BARS,
  );
  const nearSectionEnd = sections.some(
    (section) => Math.abs(section.endBar - endBar) <= SECTION_TOLERANCE_BARS,
  );
  if (nearSectionStart) score += 0.35;
  if (nearSectionEnd) score += 0.2;

  // A span whose length is a period the song actually repeats at is a loop the
  // music proposes, not one the window set happened to offer.
  if (repeatPeriods.has(lengthBars)) score += 0.25;

  // Phrase positions. Bars 1, 9, 17 … carry more weight than an offset start,
  // and this is derived from the bar grid rather than from any corpus.
  if ((startBar - 1) % 8 === 0) score += 0.2;
  else if ((startBar - 1) % 4 === 0) score += 0.1;

  return Math.min(1, score);
}

/** Periods at which the song's bar-level chord sequence actually repeats. */
export function repeatPeriodsOf(patterns: readonly PatternCandidate[]): Set<number> {
  const periods = new Set<number>();
  for (const pattern of patterns) {
    // A pattern with more than one occurrence repeats; the gap between the first
    // two is the period the ear hears.
    if (pattern.occurrences.length < 2) continue;
    const gap = pattern.occurrences[1].startBar - pattern.occurrences[0].startBar;
    if (gap >= 2 && gap <= 64) periods.add(gap);
    periods.add(pattern.lengthBars);
  }
  return periods;
}

/**
 * How far a span sits from everything already chosen.
 *
 * Bar overlap alone is too blunt: two sixteen-bar windows two bars apart barely
 * overlap by proportion yet show the user almost the same music. This measures
 * the distance between span centres, so picks spread across the song.
 */
export function temporalNovelty(
  pattern: PatternCandidate,
  chosen: ReadonlyArray<{ startBar: number; endBar: number }>,
  totalBars: number,
): number {
  if (chosen.length === 0) return 1;
  const centre = (pattern.representative.startBar + pattern.representative.endBar) / 2;
  const nearest = Math.min(...chosen.map(
    (entry) => Math.abs(centre - (entry.startBar + entry.endBar) / 2),
  ));
  return totalBars <= 0 ? 0 : Math.min(1, nearest / (totalBars / 2));
}

/** Share of a span's bars that no chosen span already shows. */
export function overlapPenalty(
  pattern: PatternCandidate,
  covered: ReadonlySet<number>,
): number {
  if (pattern.coveredBars.length === 0) return 1;
  const redundant = pattern.coveredBars.filter((bar) => covered.has(bar)).length;
  return redundant / pattern.coveredBars.length;
}
