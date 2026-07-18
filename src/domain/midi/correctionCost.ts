import { parseChordLabel } from "../chords";
import { QUICK_CHORD_ALTERNATIVE_LIMIT } from "../chordAlternatives";
import type { ChordSymbol, Tension } from "../types";

export type OperationCorrectionCost = 0 | 1 | 2 | 3 | 4;

export type OperationCorrectionCategory =
  | "primary"
  | "alternative"
  | "structure-editor"
  | "manual-input"
  | "unrepresentable";

export interface DetectedChordCandidates {
  primary: ChordSymbol | string;
  alternatives: readonly (ChordSymbol | string)[];
}

export interface OperationCorrectionCostResult {
  cost: OperationCorrectionCost;
  category: OperationCorrectionCategory;
  acceptedLabel?: string;
}

export interface OperationCorrectionCostSummary {
  segmentCount: number;
  total: number;
  mean: number;
  median: number;
  p90: number;
  byCost: Record<OperationCorrectionCost, number>;
  byCategory: Record<OperationCorrectionCategory, number>;
}

export type CorrectionFeedbackEditMethod =
  | "alternative-selection"
  | "structure-editor"
  | "manual-label"
  | "manual-input";

export function operationCorrectionCost(
  detected: DetectedChordCandidates | undefined,
  acceptableLabels: readonly string[],
): OperationCorrectionCost {
  return operationCorrectionCostResult(detected, acceptableLabels).cost;
}

export function operationCorrectionCostResult(
  detected: DetectedChordCandidates | undefined,
  acceptableLabels: readonly string[],
): OperationCorrectionCostResult {
  if (!detected || acceptableLabels.length === 0) {
    return { cost: 4, category: "unrepresentable" };
  }

  const primary = chordSymbol(detected.primary);
  const displayedAlternatives = detected.alternatives
    .slice(0, QUICK_CHORD_ALTERNATIVE_LIMIT)
    .map(chordSymbol)
    .filter((chord): chord is ChordSymbol => chord !== undefined);
  const startingChords = [primary, ...displayedAlternatives]
    .filter((chord): chord is ChordSymbol => chord !== undefined);

  const candidates = acceptableLabels.map((acceptedLabel) => {
    const accepted = parseChordLabel(acceptedLabel);
    if (primary && accepted && chordSymbolsEqual(primary, accepted)) {
      return { cost: 0, category: "primary", acceptedLabel } as const;
    }
    if (accepted && displayedAlternatives.some((candidate) => chordSymbolsEqual(candidate, accepted))) {
      return { cost: 1, category: "alternative", acceptedLabel } as const;
    }
    if (accepted && startingChords.some((candidate) => structureEditorCanReach(candidate, accepted))) {
      return { cost: 2, category: "structure-editor", acceptedLabel } as const;
    }
    if (accepted) {
      return { cost: 3, category: "manual-input", acceptedLabel } as const;
    }
    return { cost: 4, category: "unrepresentable", acceptedLabel } as const;
  });

  return candidates.sort((left, right) => left.cost - right.cost
    || left.acceptedLabel.localeCompare(right.acceptedLabel))[0]
    ?? { cost: 4, category: "unrepresentable" };
}

export function summarizeOperationCorrectionCosts(
  results: readonly (OperationCorrectionCost | OperationCorrectionCostResult)[],
): OperationCorrectionCostSummary {
  const normalized = results.map((value) => typeof value === "number"
    ? { cost: value, category: categoryForCost(value) }
    : value);
  const costs = normalized.map((result) => result.cost).sort((left, right) => left - right);
  const total = costs.reduce<number>((sum, cost) => sum + cost, 0);
  const byCost: Record<OperationCorrectionCost, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const byCategory: Record<OperationCorrectionCategory, number> = {
    primary: 0,
    alternative: 0,
    "structure-editor": 0,
    "manual-input": 0,
    unrepresentable: 0,
  };
  normalized.forEach((result) => {
    byCost[result.cost] += 1;
    byCategory[result.category] += 1;
  });
  return {
    segmentCount: costs.length,
    total,
    mean: costs.length ? rounded(total / costs.length) : 0,
    median: percentile(costs, 0.5),
    p90: percentile(costs, 0.9),
    byCost,
    byCategory,
  };
}

export function operationCorrectionCostFromEditMethod(
  editMethod: CorrectionFeedbackEditMethod,
): OperationCorrectionCost {
  if (editMethod === "alternative-selection") return 1;
  if (editMethod === "structure-editor") return 2;
  return 3;
}

export function structureEditorCanReach(source: ChordSymbol, target: ChordSymbol): boolean {
  return tensionKey(source.tensions) === tensionKey(target.tensions);
}

function chordSymbol(value: ChordSymbol | string): ChordSymbol | undefined {
  return typeof value === "string" ? parseChordLabel(value) ?? undefined : value;
}

function chordSymbolsEqual(left: ChordSymbol, right: ChordSymbol): boolean {
  return left.root === right.root
    && left.quality === right.quality
    && left.bass === right.bass
    && tensionKey(left.tensions) === tensionKey(right.tensions);
}

function tensionKey(tensions: readonly Tension[]): string {
  return [...tensions].sort().join(",");
}

function categoryForCost(cost: OperationCorrectionCost): OperationCorrectionCategory {
  return (["primary", "alternative", "structure-editor", "manual-input", "unrepresentable"] as const)[cost];
}

function percentile(sorted: readonly number[], percentileValue: number): number {
  if (sorted.length === 0) return 0;
  if (percentileValue === 0.5 && sorted.length % 2 === 0) {
    const upper = sorted.length / 2;
    return rounded((sorted[upper - 1] + sorted[upper]) / 2);
  }
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)];
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}
