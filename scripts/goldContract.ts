import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import type { GoldScenario } from "./syntheticGoldCorpus";

/**
 * Rank constraints as satisfiable priority groups.
 *
 * The corpus expresses ranking expectations per block (`rank_constraint: "top3"`),
 * which breaks down as soon as more than three distinct patterns carry that
 * label: S23 marks four, and no candidate list can put four distinct cards in
 * three slots. Restating the expectation as a group with a minimum number of
 * hits keeps the musical intent — "the progressions come first" — while being
 * satisfiable.
 *
 * Groups are derived from the corpus itself. The amendments file only records
 * deviations, so every change to the contract is visible in git even though the
 * corpus lives outside it.
 */

export interface RankConstraintGroup {
  id: string;
  patternIds: string[];
  /** How many of this group's patterns must appear in the first three cards. */
  top3MinHits: number;
  /** How many must be reachable across all visible cards. */
  allVisibleMinHits: number;
  /** This group may not outrank the named group's satisfied hits. */
  afterGroup?: string;
  derivedFrom: string;
}

export interface ContractAmendment {
  reason: string;
  groups: RankConstraintGroup[];
}

export type ContractAmendments = Record<string, ContractAmendment>;

const amendmentsPath = "docs/phase4.1.2/00-gold-contract-amendments.json";

export function loadContractAmendments(path = amendmentsPath): ContractAmendments {
  try {
    const parsed = JSON.parse(readFileSync(resolve(cwd(), path), "utf8"));
    return parsed.amendments ?? {};
  } catch {
    return {};
  }
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Derives groups from `rank_constraint`, then applies any amendment.
 *
 * `top3MinHits` is capped at the window size, which is what makes the derived
 * contract satisfiable without weakening it: S23's four progressions still have
 * to fill all three top slots and all four have to be reachable.
 */
export function deriveRankConstraintGroups(
  scenario: GoldScenario,
  amendments: ContractAmendments = {},
): RankConstraintGroup[] {
  const amendment = amendments[scenario.scenarioId];
  if (amendment) return amendment.groups;

  const groups: RankConstraintGroup[] = [];
  const mustShow = scenario.expectedBlocks.filter((block) => block.usefulness !== "exclude-from-main");

  const topPatterns = distinct(
    mustShow.filter((block) => block.rank_constraint === "top3").map((block) => block.pattern_id),
  );
  if (topPatterns.length > 0) {
    groups.push({
      id: `${scenario.scenarioId}-top3`,
      patternIds: topPatterns,
      top3MinHits: Math.min(topPatterns.length, 3),
      allVisibleMinHits: topPatterns.length,
      derivedFrom: "rank_constraint=top3",
    });
  }

  const tenPatterns = distinct(
    mustShow.filter((block) => block.rank_constraint === "top10").map((block) => block.pattern_id),
  ).filter((id) => !topPatterns.includes(id));
  if (tenPatterns.length > 0) {
    groups.push({
      id: `${scenario.scenarioId}-top10`,
      patternIds: tenPatterns,
      top3MinHits: 0,
      allVisibleMinHits: tenPatterns.length,
      derivedFrom: "rank_constraint=top10",
    });
  }

  const afterPatterns = distinct(
    mustShow.filter((block) => block.rank_constraint === "after-progressions").map((block) => block.pattern_id),
  ).filter((id) => !topPatterns.includes(id) && !tenPatterns.includes(id));
  if (afterPatterns.length > 0) {
    groups.push({
      id: `${scenario.scenarioId}-after-progressions`,
      patternIds: afterPatterns,
      top3MinHits: 0,
      allVisibleMinHits: afterPatterns.length,
      ...(groups[0] ? { afterGroup: groups[0].id } : {}),
      derivedFrom: "rank_constraint=after-progressions",
    });
  }

  return groups;
}

export interface GroupSatisfaction {
  id: string;
  top3Hits: number;
  top3MinHits: number;
  top3Satisfied: boolean;
  allVisibleHits: number;
  allVisibleMinHits: number;
  allVisibleSatisfied: boolean;
  orderSatisfied: boolean;
}

/**
 * Evaluates the groups against a card list.
 *
 * `hit` means the pattern is reachable from the cards in question, so a card
 * that offers its other occurrences counts for each of them — which is the whole
 * point of grouping patterns rather than counting rows.
 */
export function evaluateRankConstraintGroups(
  groups: readonly RankConstraintGroup[],
  reaches: (rows: "top3" | "all", patternId: string) => boolean,
  firstIndexOf: (patternId: string) => number,
): GroupSatisfaction[] {
  const satisfaction = new Map<string, GroupSatisfaction>();

  for (const group of groups) {
    const top3Hits = group.patternIds.filter((id) => reaches("top3", id)).length;
    const allVisibleHits = group.patternIds.filter((id) => reaches("all", id)).length;
    satisfaction.set(group.id, {
      id: group.id,
      top3Hits,
      top3MinHits: group.top3MinHits,
      top3Satisfied: top3Hits >= group.top3MinHits,
      allVisibleHits,
      allVisibleMinHits: group.allVisibleMinHits,
      allVisibleSatisfied: allVisibleHits >= group.allVisibleMinHits,
      orderSatisfied: true,
    });
  }

  // Ordering: a group marked `afterGroup` may not place a card above the
  // earliest card of the group it follows.
  for (const group of groups) {
    if (!group.afterGroup) continue;
    const reference = groups.find((candidate) => candidate.id === group.afterGroup);
    if (!reference) continue;
    const earliestSelf = Math.min(...group.patternIds.map(firstIndexOf).filter((index) => index >= 0), Infinity);
    const earliestReference = Math.min(
      ...reference.patternIds.map(firstIndexOf).filter((index) => index >= 0),
      Infinity,
    );
    const entry = satisfaction.get(group.id);
    if (!entry) continue;
    // Nothing from either group on screen is not an ordering violation.
    entry.orderSatisfied = earliestSelf === Infinity
      || earliestReference === Infinity
      || earliestReference < earliestSelf;
  }

  return [...satisfaction.values()];
}
