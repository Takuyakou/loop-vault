import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  analyzeMidi,
  legacyAnalyzerVersion,
  legacyBoundaryRerankerVersion,
  voiceAwareRerankerVersion,
} from "../src/domain/midi/analysis";
import { evaluateAnalyzer } from "../src/domain/midi/evaluation/evaluate";
import {
  adaptChordDripManifest,
  type ChordDripCorpusManifest,
} from "../src/domain/midi/evaluation/manifest";
import type {
  EvaluationCaseInput,
  EvaluationMetrics,
} from "../src/domain/midi/evaluation/types";
import type { OperationCorrectionCostSummary } from "../src/domain/midi/correctionCost";
import type { MidiProgressionAnalysis } from "../src/domain/types";

const DEFAULT_CLEAN = "docs/loop-vault-evaluation-corpus/manifest.json";
const DEFAULT_DIRTY = ".local-evaluation/phase3.6.5-dirty/manifest.json";
const DEFAULT_REPORT = "artifacts/phase3.6.5-voice-aware";

const categories = [
  "clean",
  "type0",
  "drums",
  "melody",
  "metadata-missing",
  "sustain",
  "jitter",
  "same-channel-mixed",
  "combined",
] as const;

type EvaluationCategory = typeof categories[number];
type EvaluatedMode = "legacy" | "legacy-boundary-rerank" | "voice-aware-rerank-v1";

interface CliOptions {
  cleanManifestPath: string;
  dirtyManifestPath: string;
  reportDirectory: string;
  limitPerCategory?: number;
  reportOnly: boolean;
}

interface MetricsSnapshot {
  rootAt1: number;
  rootAt3: number;
  qualityAt1: number;
  qualityAt3: number;
  exactAt1: number;
  exactAt3: number;
  correctionProxyPerCase: number;
  correctionProxyTotal: number;
  operationCorrectionCostMean: number;
  boundaryPrecision: number;
  boundaryRecall: number;
}

interface EvaluationResult {
  mode: EvaluatedMode;
  version: string;
  category: EvaluationCategory;
  caseCount: number;
  metrics: MetricsSnapshot;
  runtimeMs: number;
  boundaryMatchesLegacy: boolean;
  primaryChangesFromLegacy: number;
  deltaFromLegacy: Omit<MetricsSnapshot, "correctionProxyTotal">;
  candidateDiversity: CandidateDiversitySnapshot;
  operationCorrectionCost: OperationCorrectionCostSummary;
}

export interface CandidateDiversitySnapshot {
  candidateCoverage: number;
  duplicateRootRatio: number;
  manualInputProxyPerCase: number;
  averageDisplayedCandidateCount: number;
  exactTop3MinusTop1Gap: number;
}

interface GuardResult {
  passed: boolean;
  failures: string[];
}

export type DirtyImprovementStatus = "improved" | "unchanged" | "regressed" | "mixed";

export interface OverallGuardResult extends GuardResult {
  status: "passed" | "failed";
}

export function cleanRegressionGuard(
  legacy: MetricsSnapshot,
  voiceAware: MetricsSnapshot,
  boundaryMatchesLegacy: boolean,
): GuardResult {
  const failures: string[] = [];
  if (voiceAware.rootAt1 < legacy.rootAt1) failures.push("clean Root@1 regressed");
  if (voiceAware.qualityAt1 < legacy.qualityAt1) failures.push("clean Quality@1 regressed");
  if (!boundaryMatchesLegacy) failures.push("clean boundaries differ from legacy");
  if (voiceAware.correctionProxyPerCase > legacy.correctionProxyPerCase) {
    failures.push("clean correction proxy/case regressed");
  }
  if (voiceAware.operationCorrectionCostMean > legacy.operationCorrectionCostMean) {
    failures.push("clean operation correction cost regressed");
  }
  return { passed: failures.length === 0, failures };
}

export function dirtyImprovementStatus(
  legacy: MetricsSnapshot,
  voiceAware: MetricsSnapshot,
): DirtyImprovementStatus {
  const deltas = [
    voiceAware.rootAt1 - legacy.rootAt1,
    voiceAware.rootAt3 - legacy.rootAt3,
    voiceAware.qualityAt1 - legacy.qualityAt1,
    voiceAware.qualityAt3 - legacy.qualityAt3,
    voiceAware.exactAt1 - legacy.exactAt1,
    voiceAware.exactAt3 - legacy.exactAt3,
    legacy.correctionProxyPerCase - voiceAware.correctionProxyPerCase,
    legacy.operationCorrectionCostMean - voiceAware.operationCorrectionCostMean,
  ];
  const improved = deltas.some((value) => value > 0);
  const regressed = deltas.some((value) => value < 0);
  if (improved && regressed) return "mixed";
  if (improved) return "improved";
  if (regressed) return "regressed";
  return "unchanged";
}

export function strictOverallGuard(
  cleanGuard: GuardResult,
  determinismPassed: boolean,
  dirtyStatus: Readonly<Record<string, DirtyImprovementStatus>>,
): OverallGuardResult {
  const failures = [...cleanGuard.failures];
  if (!determinismPassed) failures.push("determinism check failed");

  const entries = Object.entries(dirtyStatus).sort(([left], [right]) => left.localeCompare(right));
  for (const [category, status] of entries) {
    if (status === "regressed" || status === "mixed") {
      failures.push(`dirty category regressed: ${category} (${status})`);
    }
  }
  if (!entries.some(([, status]) => status === "improved")) {
    failures.push("dirty improvement requirement not met");
  }
  for (const category of ["drums", "type0"]) {
    if (dirtyStatus[category] !== "improved") {
      failures.push(`required dirty category did not improve: ${category}`);
    }
  }
  return {
    status: failures.length === 0 ? "passed" : "failed",
    passed: failures.length === 0,
    failures,
  };
}

export function shouldFailStrictExit(
  overallGuard: OverallGuardResult,
  reportOnly: boolean,
): boolean {
  return !overallGuard.passed && !reportOnly;
}

export function evaluationExitCode(
  overallGuard: OverallGuardResult,
  reportOnly: boolean,
): 0 | 1 {
  return shouldFailStrictExit(overallGuard, reportOnly) ? 1 : 0;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const started = performance.now();
  const clean = await loadManifestCases(options.cleanManifestPath);
  const dirty = await loadManifestCases(options.dirtyManifestPath);
  const grouped = groupCases(clean, dirty);
  const analyzers: Array<{
    mode: EvaluatedMode;
    version: string;
  }> = [
    { mode: "legacy", version: legacyAnalyzerVersion },
    { mode: "legacy-boundary-rerank", version: legacyBoundaryRerankerVersion },
    { mode: "voice-aware-rerank-v1", version: voiceAwareRerankerVersion },
  ];
  const results: EvaluationResult[] = [];

  for (const category of categories) {
    const allCases = grouped.get(category) ?? [];
    const cases = representativeSubset(allCases, options.limitPerCategory);
    let legacyAnalyses: ReadonlyMap<Uint8Array, ReturnType<typeof analyzeMidi>> | undefined;
    for (const analyzer of analyzers) {
      const evaluationStarted = performance.now();
      const analyses = new Map(cases.map((input) => [
        input.bytes,
        analyzeMidi(input.bytes, { mode: analyzer.mode }),
      ]));
      if (analyzer.mode === "legacy") legacyAnalyses = analyses;
      const report = evaluateAnalyzer(
        cases,
        (bytes) => requiredAnalysis(analyses, bytes),
        {
          analyzerMode: analyzer.mode,
          analyzerVersion: analyzer.version,
          datasetId: `${category}:${cases.length}`,
        },
      );
      const metrics = snapshot(report.metrics);
      const legacyResult = results.find(
        (entry) => entry.mode === "legacy" && entry.category === category,
      );
      const boundaryMatchesLegacy = cases.every((input) => JSON.stringify(timelinePositions(
        requiredAnalysis(analyses, input.bytes),
      )) === JSON.stringify(timelinePositions(requiredAnalysis(legacyAnalyses, input.bytes))));
      const primaryChangesFromLegacy = cases.reduce((total, input) => {
        const current = requiredAnalysis(analyses, input.bytes).fullTimeline;
        const legacy = requiredAnalysis(legacyAnalyses, input.bytes).fullTimeline;
        return total + current.filter(
          (item, index) => item.chord.label !== legacy[index]?.chord.label,
        ).length;
      }, 0);
      results.push({
        mode: analyzer.mode,
        version: analyzer.version,
        category,
        caseCount: cases.length,
        metrics,
        runtimeMs: rounded(performance.now() - evaluationStarted),
        boundaryMatchesLegacy,
        primaryChangesFromLegacy,
        deltaFromLegacy: subtract(metrics, legacyResult?.metrics ?? metrics),
        candidateDiversity: candidateDiversitySnapshot(cases, analyses, metrics),
        operationCorrectionCost: report.metrics.operationCorrectionCost,
      });
      process.stdout.write(`Evaluated ${analyzer.mode}/${category}: ${cases.length} cases.\n`);
    }
  }

  const cleanLegacy = requiredResult(results, "legacy", "clean");
  const cleanVoiceAware = requiredResult(results, "voice-aware-rerank-v1", "clean");
  const cleanGuard = cleanRegressionGuard(
    cleanLegacy.metrics,
    cleanVoiceAware.metrics,
    cleanVoiceAware.boundaryMatchesLegacy,
  );
  const dirtyStatus = Object.fromEntries(categories.slice(1).map((category) => {
    const legacy = requiredResult(results, "legacy", category);
    const voiceAware = requiredResult(results, "voice-aware-rerank-v1", category);
    return [category, dirtyImprovementStatus(legacy.metrics, voiceAware.metrics)];
  })) as Record<string, DirtyImprovementStatus>;
  const improvedCategoryCount = Object.values(dirtyStatus).filter((status) => status === "improved").length;
  const regressedCategoryCount = Object.values(dirtyStatus).filter(
    (status) => status === "regressed" || status === "mixed",
  ).length;
  const determinism = await determinismCheck([
    ...representativeSubset(grouped.get("clean") ?? [], 10),
    ...categories.slice(1).flatMap((category) => representativeSubset(grouped.get(category) ?? [], 2)),
  ]);
  const overallGuard = strictOverallGuard(cleanGuard, determinism.passed, dirtyStatus);
  const realGoldCaseCount = await readRealGoldCaseCount();
  const artifact = {
    schemaVersion: 1,
    phase: options.reportDirectory.includes("correction-cost")
      ? "3.6.5-stage-b2"
      : options.reportDirectory.includes("candidate-diversity")
        ? "3.6.5-stage-b1"
        : "3.6.5-stage-a4",
    status: overallGuard.passed ? "passed" : "failed-strict-guard",
    overallGuard,
    strictExitEnforced: !options.reportOnly,
    defaultAnalyzerMode: "legacy",
    sourceCaseCount: clean.allCases.length,
    dirtyCaseCount: dirty.allCases.length,
    evaluatedCaseLimitPerCategory: options.limitPerCategory ?? null,
    results,
    cleanGuard,
    dirtyStatus,
    improvedCategoryCount,
    regressedCategoryCount,
    determinism,
    realGold: realGoldCaseCount > 0
      ? { status: "available", caseCount: realGoldCaseCount }
      : { status: "not-evaluable", caseCount: 0 },
    totalRuntimeMs: rounded(performance.now() - started),
  };
  await mkdir(resolve(options.reportDirectory), { recursive: true });
  await writeFile(resolve(options.reportDirectory, "report.json"), stableJson(artifact), "utf8");
  await writeFile(resolve(options.reportDirectory, "report.md"), markdown(artifact), "utf8");
  process.stdout.write(`Report: ${resolve(options.reportDirectory)}\nStatus: ${artifact.status}\n`);
  process.exitCode = evaluationExitCode(overallGuard, options.reportOnly);
}

async function loadManifestCases(path: string): Promise<{
  manifest: ChordDripCorpusManifest;
  allCases: EvaluationCaseInput[];
  categoryById: Map<string, EvaluationCategory>;
}> {
  const absolute = resolve(path);
  const manifest = JSON.parse(await readFile(absolute, "utf8")) as ChordDripCorpusManifest;
  const definitions = adaptChordDripManifest(manifest);
  const allCases = await Promise.all(definitions.map(async (definition) => ({
    definition,
    bytes: new Uint8Array(await readFile(resolve(dirname(absolute), definition.midiPath))),
  })));
  return {
    manifest,
    allCases,
    categoryById: new Map(manifest.files.map((file) => [
      file.caseId,
      (file.degradation?.reportCategory ?? "clean") as EvaluationCategory,
    ])),
  };
}

function groupCases(
  clean: Awaited<ReturnType<typeof loadManifestCases>>,
  dirty: Awaited<ReturnType<typeof loadManifestCases>>,
): Map<EvaluationCategory, EvaluationCaseInput[]> {
  const result = new Map<EvaluationCategory, EvaluationCaseInput[]>([["clean", clean.allCases]]);
  for (const category of categories.slice(1)) {
    result.set(category, dirty.allCases.filter(
      (input) => dirty.categoryById.get(input.definition.id) === category,
    ));
  }
  return result;
}

function snapshot(metrics: EvaluationMetrics): MetricsSnapshot {
  return {
    rootAt1: metrics.rootAccuracy,
    rootAt3: metrics.rootTop3Accuracy,
    qualityAt1: metrics.qualityAccuracy,
    qualityAt3: metrics.qualityTop3Accuracy,
    exactAt1: metrics.exactAccuracy,
    exactAt3: metrics.exactTop3Accuracy,
    correctionProxyPerCase: metrics.caseCount > 0
      ? rounded(metrics.correctionCost / metrics.caseCount)
      : 0,
    correctionProxyTotal: metrics.correctionCost,
    operationCorrectionCostMean: metrics.operationCorrectionCost.mean,
    boundaryPrecision: metrics.boundaryPrecision,
    boundaryRecall: metrics.boundaryRecall,
  };
}

export function candidateDiversitySnapshot(
  cases: readonly EvaluationCaseInput[],
  analyses: ReadonlyMap<Uint8Array, MidiProgressionAnalysis>,
  metrics: MetricsSnapshot,
): CandidateDiversitySnapshot {
  let expectedDuration = 0;
  let coveredDuration = 0;
  let manualInputs = 0;
  let displayedCandidates = 0;
  let timelineItems = 0;
  let duplicateRoots = 0;
  let alternativeCount = 0;

  for (const input of cases) {
    const analysis = requiredAnalysis(analyses, input.bytes);
    for (const item of analysis.fullTimeline) {
      const candidates = [item.chord, ...item.alternatives.map((alternative) => alternative.chord)].slice(0, 5);
      displayedCandidates += candidates.length;
      timelineItems += 1;
      const roots = new Set<number>();
      candidates.forEach((candidate, index) => {
        if (index > 0) {
          alternativeCount += 1;
          if (roots.has(candidate.root)) duplicateRoots += 1;
        }
        roots.add(candidate.root);
      });
    }
    for (const expected of input.definition.expected.chordTimeline) {
      const duration = expected.endBeat - expected.startBeat;
      const prediction = bestTimelineOverlap(expected.startBeat, expected.endBeat, analysis);
      const labels = prediction
        ? [prediction.chord.label, ...prediction.alternatives.map((alternative) => alternative.chord.label)].slice(0, 5)
        : [];
      const accepted = [expected.primary, ...(expected.acceptableAlternatives ?? [])];
      const covered = labels.some((label) => accepted.includes(label));
      expectedDuration += duration;
      if (covered) coveredDuration += duration;
      else manualInputs += 1;
    }
  }

  return {
    candidateCoverage: ratio(coveredDuration, expectedDuration),
    duplicateRootRatio: ratio(duplicateRoots, alternativeCount),
    manualInputProxyPerCase: cases.length > 0 ? rounded(manualInputs / cases.length) : 0,
    averageDisplayedCandidateCount: timelineItems > 0 ? rounded(displayedCandidates / timelineItems) : 0,
    exactTop3MinusTop1Gap: rounded(metrics.exactAt3 - metrics.exactAt1),
  };
}

function subtract(
  value: MetricsSnapshot,
  baseline: MetricsSnapshot,
): Omit<MetricsSnapshot, "correctionProxyTotal"> {
  return {
    rootAt1: rounded(value.rootAt1 - baseline.rootAt1),
    rootAt3: rounded(value.rootAt3 - baseline.rootAt3),
    qualityAt1: rounded(value.qualityAt1 - baseline.qualityAt1),
    qualityAt3: rounded(value.qualityAt3 - baseline.qualityAt3),
    exactAt1: rounded(value.exactAt1 - baseline.exactAt1),
    exactAt3: rounded(value.exactAt3 - baseline.exactAt3),
    correctionProxyPerCase: rounded(value.correctionProxyPerCase - baseline.correctionProxyPerCase),
    operationCorrectionCostMean: rounded(
      value.operationCorrectionCostMean - baseline.operationCorrectionCostMean,
    ),
    boundaryPrecision: rounded(value.boundaryPrecision - baseline.boundaryPrecision),
    boundaryRecall: rounded(value.boundaryRecall - baseline.boundaryRecall),
  };
}

async function determinismCheck(cases: readonly EvaluationCaseInput[]): Promise<{
  passed: boolean;
  checkedCaseCount: number;
  failedCaseIds: string[];
}> {
  const failedCaseIds = cases.filter((input) => {
    const first = analyzeMidi(input.bytes, { mode: "voice-aware-rerank-v1" });
    const second = analyzeMidi(input.bytes, { mode: "voice-aware-rerank-v1" });
    return JSON.stringify(first) !== JSON.stringify(second);
  }).map((input) => input.definition.id);
  return { passed: failedCaseIds.length === 0, checkedCaseCount: cases.length, failedCaseIds };
}

async function readRealGoldCaseCount(): Promise<number> {
  try {
    const report = JSON.parse(
      await readFile(resolve("artifacts/real-midi-evaluation/report.json"), "utf8"),
    ) as { datasets?: { realMidiGold?: { legacy?: { caseCount?: number } } } };
    return report.datasets?.realMidiGold?.legacy?.caseCount ?? 0;
  } catch {
    return 0;
  }
}

export function parseCliOptions(args: readonly string[]): CliOptions {
  const allowed = new Set(["--clean", "--dirty", "--report", "--limit-per-category"]);
  const values = new Map<string, string>();
  let reportOnly = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--run-cli") continue;
    if (argument === "--report-only") {
      if (reportOnly) throw new Error("Duplicate flag: --report-only");
      reportOnly = true;
      continue;
    }
    if (!allowed.has(argument)) throw new Error(`Unknown flag: ${argument}`);
    if (values.has(argument)) throw new Error(`Duplicate flag: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    values.set(argument, value);
    index += 1;
  }
  const limitValue = values.get("--limit-per-category");
  const limit = limitValue === undefined ? undefined : Number(limitValue);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error(`--limit-per-category must be a positive integer, received: ${limitValue}`);
  }
  return {
    cleanManifestPath: values.get("--clean") ?? DEFAULT_CLEAN,
    dirtyManifestPath: values.get("--dirty") ?? DEFAULT_DIRTY,
    reportDirectory: values.get("--report") ?? DEFAULT_REPORT,
    ...(limit !== undefined ? { limitPerCategory: limit } : {}),
    reportOnly,
  };
}

function requiredResult(
  results: readonly EvaluationResult[],
  mode: EvaluatedMode,
  category: EvaluationCategory,
): EvaluationResult {
  const result = results.find((entry) => entry.mode === mode && entry.category === category);
  if (!result) throw new Error(`Missing evaluation result: ${mode}/${category}`);
  return result;
}

function requiredAnalysis(
  analyses: ReadonlyMap<Uint8Array, ReturnType<typeof analyzeMidi>> | undefined,
  bytes: Uint8Array,
): ReturnType<typeof analyzeMidi> {
  const analysis = analyses?.get(bytes);
  if (!analysis) throw new Error("Missing cached analysis");
  return analysis;
}

function timelinePositions(analysis: ReturnType<typeof analyzeMidi>) {
  return analysis.fullTimeline.map((item) => ({
    bar: item.bar,
    beat: item.beat,
    durationBeats: item.durationBeats,
  }));
}

function representativeSubset<T>(values: readonly T[], limit: number | undefined): T[] {
  if (limit === undefined || values.length <= limit) return [...values];
  return Array.from({ length: limit }, (_, index) => values[Math.floor(index * values.length / limit)]);
}

function markdown(artifact: {
  phase?: string;
  status: string;
  overallGuard: OverallGuardResult;
  strictExitEnforced: boolean;
  sourceCaseCount: number;
  dirtyCaseCount: number;
  evaluatedCaseLimitPerCategory: number | null;
  results: EvaluationResult[];
  cleanGuard: GuardResult;
  dirtyStatus: Record<string, DirtyImprovementStatus>;
  determinism: { passed: boolean; checkedCaseCount: number };
  realGold: { status: string; caseCount: number };
  totalRuntimeMs: number;
}): string {
  const accuracyRows = artifact.results.map((entry) => [
    entry.category,
    entry.mode,
    rowGuardStatus(entry, artifact),
    entry.caseCount,
    percent(entry.metrics.rootAt1),
    signedPercent(entry.deltaFromLegacy.rootAt1),
    percent(entry.metrics.rootAt3),
    signedPercent(entry.deltaFromLegacy.rootAt3),
    percent(entry.metrics.qualityAt1),
    signedPercent(entry.deltaFromLegacy.qualityAt1),
    percent(entry.metrics.qualityAt3),
    signedPercent(entry.deltaFromLegacy.qualityAt3),
    percent(entry.metrics.exactAt1),
    signedPercent(entry.deltaFromLegacy.exactAt1),
    percent(entry.metrics.exactAt3),
    signedPercent(entry.deltaFromLegacy.exactAt3),
  ].join(" | "));
  const boundaryRows = artifact.results.map((entry) => [
    entry.category,
    entry.mode,
    rowGuardStatus(entry, artifact),
    entry.metrics.correctionProxyPerCase.toFixed(4),
    signedNumber(entry.deltaFromLegacy.correctionProxyPerCase),
    percent(entry.metrics.boundaryPrecision),
    signedPercent(entry.deltaFromLegacy.boundaryPrecision),
    percent(entry.metrics.boundaryRecall),
    signedPercent(entry.deltaFromLegacy.boundaryRecall),
    entry.boundaryMatchesLegacy ? "yes" : "no",
    entry.primaryChangesFromLegacy,
    entry.runtimeMs.toFixed(1),
  ].join(" | "));
  const diversityRows = artifact.results.map((entry) => [
    entry.category,
    entry.mode,
    percent(entry.candidateDiversity.candidateCoverage),
    percent(entry.candidateDiversity.duplicateRootRatio),
    entry.candidateDiversity.manualInputProxyPerCase.toFixed(4),
    entry.candidateDiversity.averageDisplayedCandidateCount.toFixed(2),
    signedPercent(entry.candidateDiversity.exactTop3MinusTop1Gap),
  ].join(" | "));
  const operationCostRows = artifact.results.map((entry) => [
    entry.category,
    entry.mode,
    entry.operationCorrectionCost.segmentCount,
    entry.operationCorrectionCost.total,
    entry.operationCorrectionCost.mean.toFixed(4),
    entry.operationCorrectionCost.median.toFixed(2),
    entry.operationCorrectionCost.p90.toFixed(2),
    entry.operationCorrectionCost.byCost[0],
    entry.operationCorrectionCost.byCost[1],
    entry.operationCorrectionCost.byCost[2],
    entry.operationCorrectionCost.byCost[3],
    entry.operationCorrectionCost.byCost[4],
  ].join(" | "));
  return [
    artifact.phase === "3.6.5-stage-b2"
      ? "# Phase 3.6.5 Stage B2 Correction Cost Evaluation"
      : artifact.phase === "3.6.5-stage-b1"
        ? "# Phase 3.6.5 Stage B1 Candidate Diversity Evaluation"
        : "# Phase 3.6.5 Stage A4 Voice-Aware Evaluation",
    "",
    `- Status: ${artifact.status}`,
    `- Overall guard: ${artifact.overallGuard.status.toUpperCase()}`,
    `- Strict exit: ${artifact.strictExitEnforced ? "enabled" : "report-only"}`,
    ...artifact.overallGuard.failures.map((failure) => `- Guard failure: ${failure}`),
    "- Default analyzer: legacy (unchanged)",
    `- Clean cases: ${artifact.sourceCaseCount}`,
    `- Dirty cases: ${artifact.dirtyCaseCount}`,
    `- Evaluation subset: ${artifact.evaluatedCaseLimitPerCategory ?? "all"} case(s) per category`,
    `- Clean guard: ${artifact.cleanGuard.passed ? "PASS" : `FAIL (${artifact.cleanGuard.failures.join(", ")})`}`,
    `- Determinism: ${artifact.determinism.passed ? "PASS" : "FAIL"} (${artifact.determinism.checkedCaseCount} cases)`,
    `- Real MIDI Gold: ${artifact.realGold.status} (${artifact.realGold.caseCount} cases)`,
    `- Total runtime: ${(artifact.totalRuntimeMs / 1000).toFixed(1)} s`,
    "",
    "## Accuracy and legacy delta",
    "",
    "Category | Analyzer | Guard | Cases | Root@1 | Delta | Root@3 | Delta | Quality@1 | Delta | Quality@3 | Delta | Exact@1 | Delta | Exact@3 | Delta",
    "--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:",
    ...accuracyRows,
    "",
    "## Boundary, correction, and runtime",
    "",
    "Category | Analyzer | Guard | Correction/case | Delta | Boundary P | Delta | Boundary R | Delta | Legacy boundary identical | Primary changes | Runtime ms",
    "--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---:",
    ...boundaryRows,
    "",
    "## Candidate diversity",
    "",
    "Category | Analyzer | Candidate coverage | Duplicate-root ratio | Manual input proxy/case | Avg displayed candidates | Exact @3-@1",
    "--- | --- | ---: | ---: | ---: | ---: | ---:",
    ...diversityRows,
    "",
    "## Operation correction cost (Stage B2)",
    "",
    "Category | Analyzer | Segments | Total | Mean | Median | P90 | Cost 0 | Cost 1 | Cost 2 | Cost 3 | Cost 4",
    "--- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:",
    ...operationCostRows,
    "",
    "## Dirty status",
    "",
    ...Object.entries(artifact.dirtyStatus).map(([category, status]) => `- ${category}: ${status}`),
    "",
    "Correction proxy remains the existing wrong-primary-segment proxy. Operation correction cost is reported separately and does not change the old field.",
    "",
  ].join("\n");
}

function bestTimelineOverlap(
  startBeat: number,
  endBeat: number,
  analysis: MidiProgressionAnalysis,
) {
  return analysis.fullTimeline.map((item) => {
    const itemStart = (item.bar - 1) * 4 + item.beat - 1;
    const overlap = Math.max(0, Math.min(endBeat, itemStart + item.durationBeats) - Math.max(startBeat, itemStart));
    return { item, overlap, itemStart };
  }).filter((entry) => entry.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || left.itemStart - right.itemStart)[0]?.item;
}

function ratio(value: number, total: number): number {
  return total <= 0 ? 0 : rounded(value / total);
}

function rowGuardStatus(
  entry: EvaluationResult,
  artifact: {
    cleanGuard: GuardResult;
    dirtyStatus: Record<string, DirtyImprovementStatus>;
  },
): string {
  if (entry.mode !== "voice-aware-rerank-v1") return "reference";
  if (entry.category === "clean") return artifact.cleanGuard.passed ? "pass" : "fail";
  return artifact.dirtyStatus[entry.category] ?? "not-evaluated";
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function signedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}pp`;
}

function signedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;
}

if (process.argv.includes("--run-cli")) {
  await main();
}
