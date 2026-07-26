import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import type { CandidateCatalog, CatalogPattern } from "../src/domain/midi/candidateCatalog";
import type { RecommendationResult } from "../src/domain/midi/candidateRecommendation";
import {
  buildCatalogView, catalogPageSize, laneRenderPlan, reachableOccurrenceIds, reachablePatternIds,
} from "../src/domain/midi/catalogView";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";

/**
 * P4.1.2-H4 Catalog Hard Gate evaluation.
 *
 * Runs the frozen gates of `docs/phase4.1.2-h/00-catalog-hard-gates.json` over a
 * corpus, and the recommendation targets alongside them but separately: the
 * catalog is judged on whether it keeps and reaches every valid candidate, the
 * recommendation on how well it orders them. Mixing the two is what previously
 * let a ranking shortfall block a safety fix.
 *
 * The gates are read as data rather than restated here so this script cannot
 * quietly disagree with the frozen file.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const corpusPath = optionValue("--corpus") ?? ".local-evaluation/holdout-v3";
const mode = (optionValue("--mode") ?? "phase4.1.2-v1") as MidiAnalyzerMode;
const runtimeCeilingMs = Number(optionValue("--runtime-ceiling") ?? 3000);
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/phase4.1.2-h/04-holdout-v3-results.json");

interface GoldBlock {
  id: string;
  start_bar: number;
  end_bar: number;
  block_type: "progression" | "vamp" | "fragment";
  usefulness: "must-show" | "secondary" | "exclude-from-main";
  pattern_id: string;
}

interface GoldScenario {
  scenarioId: string;
  title: string;
  bars: number;
  expectedBlocks: GoldBlock[];
  variants: Array<{ fileName: string; variant: "clean" | "stress" }>;
}

const manifest = JSON.parse(
  await readFile(resolve(cwd(), corpusPath, "manifest.json"), "utf8"),
) as { scenarios: GoldScenario[] };

interface FileResult {
  scenarioId: string;
  title: string;
  variant: string;
  fingerprint: string;
  bars: number;
  runtimeMs: number;
  viewBuildMs: number;
  catalogPatternCount: number;
  catalogOccurrenceCount: number;
  progressionCount: number;
  vampCount: number;
  fragmentCount: number;
  uncertainCount: number;
  exactDuplicateCount: number;
  belowQualityFloorPatternCount: number;
  validPatternReachability: number;
  /** Reachability through paging, not just through lane membership. */
  pagedPatternReachability: number;
  occurrenceReachability: number;
  previewReachability: number;
  saveReachability: number;
  visiblePatternDuplicateCount: number;
  visibleSlotWasteCount: number;
  mustShowCatalogRecall: number;
  unmatchedMustShow: string[];
  recommendationCount: number;
  eligiblePatternCount: number;
  paddingCount: number;
  stoppedBecause: string;
  viewMode: string;
  laneCounts: Record<string, number>;
  progressionPatternsAvailable: number;
  progressionPrecisionAt3: number | null;
  twoBarFragmentsInTop3: number | null;
  mustShowRecommendedRecall: number;
  patternDiversity: number;
  temporalDiversity: number;
  recommendedIdentities: string[];
  deterministic: boolean;
}

/** Bars a pattern's occurrences state, as `start:end` keys. */
function occurrenceRanges(patterns: readonly CatalogPattern[]): Set<string> {
  const ranges = new Set<string>();
  for (const pattern of patterns) {
    for (const occurrence of pattern.occurrences) {
      ranges.add(`${occurrence.startBar}:${occurrence.endBar}`);
    }
  }
  return ranges;
}

function representativeOf(pattern: CatalogPattern) {
  return pattern.occurrences.find(
    (occurrence) => occurrence.id === pattern.representativeOccurrenceId,
  ) ?? pattern.occurrences[0];
}

/**
 * How widely the recommendations are spread over the song.
 *
 * Measured in tenths so a list that keeps returning to one section reads lower
 * than one that samples the whole file, and normalised by how many tenths the
 * list could possibly touch so a one-item recommendation is not punished for
 * being one item.
 */
function temporalSpread(
  recommended: readonly CatalogPattern[],
  totalBars: number,
): number {
  if (recommended.length === 0 || totalBars <= 0) return 1;
  const tenths = new Set(recommended.map((pattern) => {
    const representative = representativeOf(pattern);
    return Math.min(9, Math.floor(((representative.startBar - 1) / totalBars) * 10));
  }));
  return Number((tenths.size / Math.min(10, recommended.length)).toFixed(6));
}

function evaluate(
  bytes: Uint8Array,
  scenario: GoldScenario,
  variant: "clean" | "stress",
): FileResult {
  const started = performance.now();
  const analysis = analyzeMidi(bytes, { mode });
  const runtimeMs = Number((performance.now() - started).toFixed(1));

  const catalog = analysis.candidateCatalog as CandidateCatalog | undefined;
  const recommendation = analysis.candidateRecommendation as RecommendationResult | undefined;
  if (catalog === undefined || recommendation === undefined) {
    throw new Error(`mode ${mode} produced no catalog for ${scenario.scenarioId}`);
  }

  const viewStarted = performance.now();
  const view = buildCatalogView(catalog, recommendation);
  const viewBuildMs = Number((performance.now() - viewStarted).toFixed(2));

  const byId = new Map(catalog.patterns.map((pattern) => [pattern.patternId, pattern]));
  const reachedPatterns = reachablePatternIds(view);
  const reachedOccurrences = reachableOccurrenceIds(view);
  const totalOccurrences = catalog.patterns.reduce(
    (sum, pattern) => sum + pattern.occurrences.length,
    0,
  );

  // Reachability through the render path rather than through the data: a lane
  // that holds everything but cannot page to the end is still a lane whose tail
  // the user never sees.
  const pagedIds = new Set<string>();
  for (const lane of view.lanes) {
    let limit = view.pageSize;
    let plan = laneRenderPlan(lane, { open: true, limit });
    let guard = 0;
    while (plan.remaining > 0 && guard < 10000) {
      limit += view.pageSize;
      plan = laneRenderPlan(lane, { open: true, limit });
      guard += 1;
    }
    for (const entry of plan.visible) pagedIds.add(entry.patternId);
  }

  const laneIds = view.lanes.flatMap((lane) => lane.entries.map((entry) => entry.patternId));
  const visiblePatternDuplicateCount = laneIds.length - new Set(laneIds).size;
  const recommendedIds = recommendation.recommendations.map((entry) => entry.patternId);
  const visibleSlotWasteCount = recommendedIds.length - new Set(recommendedIds).size;

  const ranges = occurrenceRanges(catalog.patterns);
  const mustShow = scenario.expectedBlocks.filter((block) => block.usefulness === "must-show");
  const unmatchedMustShow = mustShow.filter(
    (block) => !ranges.has(`${block.start_bar}:${block.end_bar}`),
  );
  const mustShowCatalogRecall = mustShow.length === 0
    ? 1
    : Number(((mustShow.length - unmatchedMustShow.length) / mustShow.length).toFixed(6));

  const recommendedPatterns = recommendedIds
    .map((id) => byId.get(id))
    .filter((pattern): pattern is CatalogPattern => pattern !== undefined);
  const recommendedRanges = occurrenceRanges(recommendedPatterns);
  const mustShowRecommendedRecall = mustShow.length === 0
    ? 1
    : Number((mustShow.filter(
      (block) => recommendedRanges.has(`${block.start_bar}:${block.end_bar}`),
    ).length / mustShow.length).toFixed(6));

  const top3 = recommendedPatterns.slice(0, 3);
  const progressionPatternsAvailable = catalog.progressionPatternIds.length;
  // Only defined where the file actually offers three progressions to choose
  // between; scoring it on a file with two would measure the file, not the ranker.
  const measurableAt3 = progressionPatternsAvailable >= 3 && top3.length === 3;
  const progressionPrecisionAt3 = measurableAt3
    ? Number((top3.filter((pattern) => pattern.candidateKind === "progression").length / 3).toFixed(6))
    : null;
  const twoBarFragmentsInTop3 = measurableAt3
    ? top3.filter(
      (pattern) => pattern.candidateKind === "fragment" && pattern.qualitySummary.lengthBars <= 2,
    ).length
    : null;

  const recommendedIdentities = recommendedPatterns.map(
    (pattern) => pattern.normalizedProgressionIdentity,
  );

  // Three runs, because a single repeat cannot distinguish a stable result from
  // one that alternates.
  const rerun = () => {
    const again = analyzeMidi(bytes, { mode });
    const againCatalog = again.candidateCatalog as CandidateCatalog;
    const againRecommendation = again.candidateRecommendation as RecommendationResult;
    return JSON.stringify({
      patterns: againCatalog.patterns.map((pattern) => pattern.patternId),
      recommendations: againRecommendation.recommendations.map((entry) => entry.patternId),
      view: buildCatalogView(againCatalog, againRecommendation).lanes.map(
        (lane) => [lane.kind, lane.entries.map((entry) => entry.patternId)],
      ),
    });
  };
  const baseline = JSON.stringify({
    patterns: catalog.patterns.map((pattern) => pattern.patternId),
    recommendations: recommendedIds,
    view: view.lanes.map((lane) => [lane.kind, lane.entries.map((entry) => entry.patternId)]),
  });
  const deterministic = rerun() === baseline && rerun() === baseline;

  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    variant,
    fingerprint: fingerprintMidiBytes(bytes),
    bars: analysis.totalBars,
    runtimeMs,
    viewBuildMs,
    catalogPatternCount: catalog.patterns.length,
    catalogOccurrenceCount: totalOccurrences,
    progressionCount: catalog.progressionPatternIds.length,
    vampCount: catalog.vampPatternIds.length,
    fragmentCount: catalog.fragmentPatternIds.length,
    uncertainCount: catalog.uncertainPatternIds.length,
    exactDuplicateCount: catalog.diagnostics.exactDuplicateCount,
    belowQualityFloorPatternCount: catalog.diagnostics.belowQualityFloorPatternCount,
    validPatternReachability: catalog.patterns.length === 0
      ? 1
      : Number((reachedPatterns.size / catalog.patterns.length).toFixed(6)),
    pagedPatternReachability: catalog.patterns.length === 0
      ? 1
      : Number((pagedIds.size / catalog.patterns.length).toFixed(6)),
    occurrenceReachability: totalOccurrences === 0
      ? 1
      : Number((reachedOccurrences.size / totalOccurrences).toFixed(6)),
    // Preview and save both act on an occurrence reached from its card, so they
    // share reachability by construction. Reported separately because the frozen
    // gate list names them separately.
    previewReachability: totalOccurrences === 0
      ? 1
      : Number((reachedOccurrences.size / totalOccurrences).toFixed(6)),
    saveReachability: totalOccurrences === 0
      ? 1
      : Number((reachedOccurrences.size / totalOccurrences).toFixed(6)),
    visiblePatternDuplicateCount,
    visibleSlotWasteCount,
    mustShowCatalogRecall,
    unmatchedMustShow: unmatchedMustShow.map((block) => `${block.id}@${block.start_bar}-${block.end_bar}`),
    recommendationCount: recommendation.recommendations.length,
    eligiblePatternCount: recommendation.eligiblePatternCount,
    paddingCount: recommendation.paddingCount,
    stoppedBecause: recommendation.stoppedBecause,
    viewMode: view.mode,
    laneCounts: Object.fromEntries(view.lanes.map((lane) => [lane.kind, lane.totalCount])),
    progressionPatternsAvailable,
    progressionPrecisionAt3,
    twoBarFragmentsInTop3,
    mustShowRecommendedRecall,
    patternDiversity: recommendedIds.length === 0
      ? 1
      : Number((new Set(recommendedIdentities).size / recommendedIds.length).toFixed(6)),
    temporalDiversity: temporalSpread(recommendedPatterns, analysis.totalBars),
    recommendedIdentities,
    deterministic,
  };
}

const results: FileResult[] = [];
for (const scenario of manifest.scenarios) {
  for (const variant of scenario.variants) {
    const bytes = new Uint8Array(
      await readFile(resolve(cwd(), corpusPath, "midi", variant.fileName)),
    );
    results.push(evaluate(bytes, scenario, variant.variant));
  }
}

// --- Catalog Hard Gates ----------------------------------------------------

interface GateResult {
  id: string;
  verdict: "pass" | "fail" | "not-evaluated";
  detail: string;
  offenders?: string[];
}

const label = (row: FileResult) => `${row.scenarioId}_${row.variant}`;

function gate(id: string, predicate: (row: FileResult) => boolean): GateResult {
  const offenders = results.filter((row) => !predicate(row)).map(label);
  return {
    id,
    verdict: offenders.length === 0 ? "pass" : "fail",
    detail: `${results.length - offenders.length}/${results.length} files`,
    ...(offenders.length > 0 ? { offenders: offenders.slice(0, 16) } : {}),
  };
}

const hardGates: GateResult[] = [
  gate("valid-pattern-reachability", (row) => row.validPatternReachability === 1),
  gate("paged-pattern-reachability", (row) => row.pagedPatternReachability === 1),
  gate("occurrence-reachability", (row) => row.occurrenceReachability === 1),
  gate("visible-pattern-duplicate-count", (row) => row.visiblePatternDuplicateCount === 0),
  gate("visible-slot-waste-count", (row) => row.visibleSlotWasteCount === 0),
  gate("exact-duplicate-count", (row) => row.exactDuplicateCount === 0),
  gate("must-show-catalog-recall", (row) => row.mustShowCatalogRecall === 1),
  gate("preview-reachability", (row) => row.previewReachability === 1),
  gate("save-reachability", (row) => row.saveReachability === 1),
  gate("deterministic", (row) => row.deterministic),
  gate("analysis-runtime", (row) => row.runtimeMs <= runtimeCeilingMs),
  gate("no-padding", (row) => row.paddingCount === 0),
];

// Read from the recorded run rather than restated, so this script and the
// timeline verifier cannot report different numbers for the same gate.
hardGates.push(await (async (): Promise<GateResult> => {
  try {
    const recorded = JSON.parse(
      await readFile(resolve(cwd(), "docs/phase4.1.2-h/04-timeline-non-regression.json"), "utf8"),
    ) as { checked: number; identical: number; differing: string[] };
    return {
      id: "chord-corpus-non-regression",
      verdict: recorded.identical === recorded.checked ? "pass" : "fail",
      detail: `${recorded.identical}/${recorded.checked} identical`,
      ...(recorded.differing.length > 0 ? { offenders: recorded.differing.slice(0, 12) } : {}),
    };
  } catch {
    return {
      id: "chord-corpus-non-regression",
      verdict: "not-evaluated",
      detail: "run scripts/verify-timeline-non-regression.ts first",
    };
  }
})());

// --- Recommendation targets (measured, not gated) --------------------------

const defined = <T>(values: Array<T | null>) => values.filter((value): value is T => value !== null);

function summary(values: number[]) {
  if (values.length === 0) return { n: 0, min: null, mean: null, max: null };
  return {
    n: values.length,
    min: Number(Math.min(...values).toFixed(6)),
    mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)),
    max: Number(Math.max(...values).toFixed(6)),
  };
}

const byScenario = new Map<string, FileResult[]>();
for (const row of results) {
  const list = byScenario.get(row.scenarioId) ?? [];
  list.push(row);
  byScenario.set(row.scenarioId, list);
}
const agreements: number[] = [];
for (const rows of byScenario.values()) {
  const clean = rows.find((row) => row.variant === "clean");
  const stress = rows.find((row) => row.variant === "stress");
  if (!clean || !stress) continue;
  const left = new Set(clean.recommendedIdentities);
  const right = new Set(stress.recommendedIdentities);
  const union = new Set([...left, ...right]);
  const shared = [...left].filter((identity) => right.has(identity)).length;
  agreements.push(union.size === 0 ? 1 : Number((shared / union.size).toFixed(6)));
}

const countDistribution: Record<string, number> = {};
for (const row of results) {
  const key = String(row.recommendationCount);
  countDistribution[key] = (countDistribution[key] ?? 0) + 1;
}

const recommendationTargets = {
  progressionPrecisionAt3: summary(defined(results.map((row) => row.progressionPrecisionAt3))),
  twoBarFragmentsInTop3: summary(defined(results.map((row) => row.twoBarFragmentsInTop3))),
  mustShowRecommendedRecall: summary(results.map((row) => row.mustShowRecommendedRecall)),
  patternDiversity: summary(results.map((row) => row.patternDiversity)),
  temporalDiversity: summary(results.map((row) => row.temporalDiversity)),
  cleanStressAgreement: summary(agreements),
  recommendationCount: summary(results.map((row) => row.recommendationCount)),
  paddingCount: summary(results.map((row) => row.paddingCount)),
};

const performance_ = {
  runtimeMs: summary(results.map((row) => row.runtimeMs)),
  viewBuildMs: summary(results.map((row) => row.viewBuildMs)),
  largestCatalog: Math.max(...results.map((row) => row.catalogPatternCount)),
  pageSize: catalogPageSize,
  // A single page is what the DOM holds at once, whatever the catalog size.
  worstCaseFirstPaintCards: Math.min(
    catalogPageSize,
    Math.max(...results.map((row) => row.catalogPatternCount)),
  ),
  pagesToReachLargestLane: Math.ceil(
    Math.max(...results.map((row) => row.catalogPatternCount)) / catalogPageSize,
  ),
};

const verdict = hardGates.some((entry) => entry.verdict === "fail") ? "FAIL" : "PASS";

const report = {
  schemaVersion: 1,
  stage: "P4.1.2-H4",
  corpus: corpusPath,
  mode,
  runOnce: true,
  fileCount: results.length,
  catalogHardGates: hardGates,
  catalogVerdict: verdict,
  recommendationTargets,
  recommendationCountDistribution: countDistribution,
  performance: performance_,
  files: results,
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`Catalog Hard Gates: ${verdict}  (${results.length} files, mode ${mode})\n\n`);
for (const entry of hardGates) {
  const mark = entry.verdict === "pass" ? "PASS" : (entry.verdict === "fail" ? "FAIL" : "----");
  stdout.write(`${mark}  ${entry.id.padEnd(34)} ${entry.detail}\n`);
  if (entry.offenders) stdout.write(`      ${entry.offenders.join(", ")}\n`);
}
stdout.write("\nRecommendation targets (measured, not gated)\n");
for (const [name, value] of Object.entries(recommendationTargets)) {
  stdout.write(
    `  ${name.padEnd(28)} n ${String(value.n).padStart(3)}`
    + `  min ${String(value.min).padStart(9)}  mean ${String(value.mean).padStart(9)}`
    + `  max ${String(value.max).padStart(9)}\n`,
  );
}
stdout.write("\nRecommendation count distribution\n");
for (const [count, files] of Object.entries(countDistribution).sort(
  (left, right) => Number(left[0]) - Number(right[0]),
)) {
  stdout.write(`  ${count.padStart(3)} recommendations  ${files} files\n`);
}
stdout.write("\nPer file\n");
for (const row of results) {
  stdout.write(
    `  ${label(row).padEnd(28)} catalog ${String(row.catalogPatternCount).padStart(4)}`
    + ` (prog ${String(row.progressionCount).padStart(3)} vamp ${String(row.vampCount).padStart(3)}`
    + ` frag ${String(row.fragmentCount).padStart(3)} unc ${String(row.uncertainCount).padStart(3)})`
    + `  rec ${String(row.recommendationCount).padStart(2)}/${String(row.eligiblePatternCount).padStart(4)}`
    + `  ${row.viewMode.padEnd(7)}  reach ${row.validPatternReachability}/${row.occurrenceReachability}`
    + `  ${String(row.runtimeMs).padStart(7)} ms\n`,
  );
}
