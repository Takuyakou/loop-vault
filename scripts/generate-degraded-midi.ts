import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { parseMidi } from "midi-file";
import {
  analyzeMidi,
  hybridAnalyzerVersion,
  legacyAnalyzerVersion,
  legacyBoundaryRerankerVersion,
} from "../src/domain/midi/analysis";
import {
  degradeMidi,
  deterministicDegradationSeed,
  midiDegradationRecipes,
} from "../src/domain/midi/evaluation/degrade";
import { evaluateAnalyzer } from "../src/domain/midi/evaluation/evaluate";
import {
  adaptChordDripManifest,
  type ChordDripCorpusManifest,
  type ChordDripFile,
} from "../src/domain/midi/evaluation/manifest";
import type { EvaluationCaseInput, EvaluationMetrics } from "../src/domain/midi/evaluation/types";

const DEFAULT_INPUT = "docs/loop-vault-evaluation-corpus/manifest.json";
const DEFAULT_OUTPUT = ".local-evaluation/phase3.6.5-dirty";
const DEFAULT_REPORT = "artifacts/phase3.6.5-dirty-baseline";
const DEFAULT_SEED = 365;

const reportCategories = [
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

type ReportCategory = typeof reportCategories[number];

interface GenerateOptions {
  inputManifestPath: string;
  outputDirectory: string;
  globalSeed: number;
}

interface GeneratedCorpus {
  manifest: ChordDripCorpusManifest;
  manifestPath: string;
}

interface AnalyzerDefinition {
  mode: "legacy" | "legacy-boundary-rerank" | "hybrid-v1";
  version: string;
  analyze: (bytes: Uint8Array) => ReturnType<typeof analyzeMidi>;
}

interface AccuracySnapshot {
  rootAt1: number;
  rootAt3: number;
  qualityAt1: number;
  qualityAt3: number;
  exactAt1: number;
  exactAt3: number;
  correctionProxyPerCase: number;
}

interface CategoryMetricsSnapshot extends AccuracySnapshot {
  correctionProxyTotal: number;
}

interface CategoryEvaluation {
  analyzerMode: AnalyzerDefinition["mode"];
  analyzerVersion: string;
  category: ReportCategory;
  caseCount: number;
  metrics: CategoryMetricsSnapshot;
  runtimeMs: number;
  deltaFromClean: AccuracySnapshot;
  deltaFromLegacy: AccuracySnapshot;
}

export async function generateDegradedCorpus(options: GenerateOptions): Promise<GeneratedCorpus> {
  const inputManifestPath = resolve(options.inputManifestPath);
  const outputDirectory = resolve(options.outputDirectory);
  const sourceManifest = JSON.parse(await readFile(inputManifestPath, "utf8")) as ChordDripCorpusManifest;
  const sourceDirectory = dirname(inputManifestPath);
  await mkdir(outputDirectory, { recursive: true });

  const files: ChordDripFile[] = [];
  for (const source of [...sourceManifest.files].sort((a, b) => a.caseId.localeCompare(b.caseId))) {
    const sourceBytes = new Uint8Array(await readFile(resolve(sourceDirectory, source.midiFile)));
    for (const degradation of midiDegradationRecipes) {
      const seed = deterministicDegradationSeed(
        options.globalSeed,
        `${sourceManifest.recipeSha256}:${source.caseId}`,
        degradation.id,
      );
      const bytes = degradeMidi(sourceBytes, degradation, seed);
      const midiFile = `${source.caseId}--${degradation.id}.mid`;
      await writeFile(resolve(outputDirectory, midiFile), bytes);
      const details = midiDetails(bytes);
      files.push({
        ...source,
        caseId: `${source.caseId}--${degradation.id}`,
        midiFile,
        midiSha256: sha256(bytes),
        midiByteLength: bytes.byteLength,
        renderedNoteCount: details.renderedNoteCount,
        clipLengthTicks: details.clipLengthTicks,
        sourceCaseId: source.caseId,
        degradation: {
          id: degradation.id,
          reportCategory: degradation.reportCategory,
          seed,
          transforms: [...degradation.transforms],
        },
      });
    }
  }

  const recipeMaterial = {
    schemaVersion: 1,
    sourceRecipeSha256: sourceManifest.recipeSha256,
    globalSeed: options.globalSeed,
    recipes: midiDegradationRecipes,
    files: files.map((file) => ({
      caseId: file.caseId,
      midiFile: file.midiFile,
      midiSha256: file.midiSha256,
      midiByteLength: file.midiByteLength,
      sourceCaseId: file.sourceCaseId,
      degradation: file.degradation,
    })),
  };
  const manifest: ChordDripCorpusManifest = {
    ...sourceManifest,
    generatorId: `${String(sourceManifest.generatorId ?? "chord-drip")}-phase3.6.5-dirty`,
    generatorVersion: `${sourceManifest.generatorVersion}/phase3.6.5-dirty-v1`,
    sourceRecipeSha256: sourceManifest.recipeSha256,
    recipeSha256: sha256(JSON.stringify(recipeMaterial)),
    dirtyCorpus: {
      schemaVersion: 1,
      globalSeed: options.globalSeed,
      generatedCaseCount: files.length,
    },
    files,
  };
  const manifestPath = resolve(outputDirectory, "manifest.json");
  await writeFile(manifestPath, stableJson(manifest), "utf8");
  return { manifest, manifestPath };
}

async function main(): Promise<void> {
  const cli = parseCliOptions(process.argv.slice(2));
  const inputManifestPath = resolve(cli.inputManifestPath);
  const outputDirectory = resolve(cli.outputDirectory);
  const reportDirectory = resolve(cli.reportDirectory);
  const { globalSeed, limitPerCategory } = cli;
  const generated = await generateDegradedCorpus({ inputManifestPath, outputDirectory, globalSeed });
  const sourceManifest = JSON.parse(await readFile(inputManifestPath, "utf8")) as ChordDripCorpusManifest;

  const cleanCases = await loadCases(sourceManifest, inputManifestPath);
  const dirtyCases = await loadCases(generated.manifest, generated.manifestPath);
  const groupedCases = new Map<ReportCategory, EvaluationCaseInput[]>([["clean", cleanCases]]);
  for (const category of reportCategories.slice(1)) {
    groupedCases.set(category, dirtyCases.filter(({ definition }) => {
      const file = generated.manifest.files.find((entry) => entry.caseId === definition.id);
      return file?.degradation?.reportCategory === category;
    }));
  }

  const analyzers: AnalyzerDefinition[] = [
    { mode: "legacy", version: legacyAnalyzerVersion, analyze: (bytes) => analyzeMidi(bytes, { mode: "legacy" }) },
    {
      mode: "legacy-boundary-rerank",
      version: legacyBoundaryRerankerVersion,
      analyze: (bytes) => analyzeMidi(bytes, { mode: "legacy-boundary-rerank" }),
    },
    { mode: "hybrid-v1", version: hybridAnalyzerVersion, analyze: (bytes) => analyzeMidi(bytes, { mode: "hybrid-v1" }) },
  ];

  const rawResults: Array<{
    analyzer: AnalyzerDefinition;
    category: ReportCategory;
    metrics: EvaluationMetrics;
    runtimeMs: number;
  }> = [];
  for (const analyzer of analyzers) {
    for (const category of reportCategories) {
      const allCases = groupedCases.get(category) ?? [];
      const cases = representativeSubset(allCases, limitPerCategory);
      const started = performance.now();
      const report = evaluateAnalyzer(cases, analyzer.analyze, {
        analyzerMode: analyzer.mode,
        analyzerVersion: analyzer.version,
        datasetId: `${generated.manifest.recipeSha256}:${category}`,
      });
      rawResults.push({
        analyzer,
        category,
        metrics: report.metrics,
        runtimeMs: Number((performance.now() - started).toFixed(3)),
      });
      process.stdout.write(`Evaluated ${analyzer.mode}/${category}: ${cases.length} cases.\n`);
    }
  }

  const results: CategoryEvaluation[] = rawResults.map((entry) => {
    const clean = rawResults.find(
      (candidate) => candidate.analyzer.mode === entry.analyzer.mode && candidate.category === "clean",
    );
    const legacy = rawResults.find(
      (candidate) => candidate.analyzer.mode === "legacy" && candidate.category === entry.category,
    );
    const snapshot = accuracySnapshot(entry.metrics);
    return {
      analyzerMode: entry.analyzer.mode,
      analyzerVersion: entry.analyzer.version,
      category: entry.category,
      caseCount: entry.metrics.caseCount,
      metrics: snapshot,
      runtimeMs: entry.runtimeMs,
      deltaFromClean: subtract(snapshot, accuracySnapshot(clean?.metrics)),
      deltaFromLegacy: subtract(snapshot, accuracySnapshot(legacy?.metrics)),
    };
  });

  const artifact = {
    schemaVersion: 1,
    phase: "3.6.5-stage-a3",
    sourceManifest: relativeDisplay(inputManifestPath),
    dirtyManifest: relativeDisplay(generated.manifestPath),
    sourceCaseCount: cleanCases.length,
    dirtyCaseCount: dirtyCases.length,
    evaluatedCaseLimitPerCategory: limitPerCategory ?? null,
    globalSeed,
    analyzers: analyzers.map(({ mode, version }) => ({ mode, version })),
    results,
    notEvaluated: {
      voiceAwareRerankV1: "Stage A4 is not implemented yet.",
      allInstrumentsMidi: "all_instruments.mid is not available.",
      realGold: "Real MIDI Gold cases: 0.",
    },
  };
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(resolve(reportDirectory, "report.json"), stableJson(artifact), "utf8");
  await writeFile(resolve(reportDirectory, "report.md"), markdownReport(artifact), "utf8");
  process.stdout.write(
    `Generated ${dirtyCases.length} deterministic dirty cases from ${cleanCases.length} clean cases.\n`
      + `Manifest: ${generated.manifestPath}\nReport: ${reportDirectory}\n`,
  );
}

async function loadCases(
  manifest: ChordDripCorpusManifest,
  manifestPath: string,
): Promise<EvaluationCaseInput[]> {
  const definitions = adaptChordDripManifest(manifest);
  return Promise.all(definitions.map(async (definition) => ({
    definition,
    bytes: new Uint8Array(await readFile(resolve(dirname(manifestPath), definition.midiPath))),
  })));
}

function midiDetails(bytes: Uint8Array): { renderedNoteCount: number; clipLengthTicks: number } {
  const midi = parseMidi(bytes);
  let renderedNoteCount = 0;
  let clipLengthTicks = 0;
  for (const track of midi.tracks) {
    let tick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      clipLengthTicks = Math.max(clipLengthTicks, tick);
      if (event.type === "noteOn" && event.velocity > 0) renderedNoteCount += 1;
    }
  }
  return { renderedNoteCount, clipLengthTicks };
}

function accuracySnapshot(metrics?: EvaluationMetrics): CategoryMetricsSnapshot {
  const correctionProxyTotal = metrics?.correctionCost ?? 0;
  return {
    rootAt1: metrics?.rootAccuracy ?? 0,
    rootAt3: metrics?.rootTop3Accuracy ?? 0,
    qualityAt1: metrics?.qualityAccuracy ?? 0,
    qualityAt3: metrics?.qualityTop3Accuracy ?? 0,
    exactAt1: metrics?.exactAccuracy ?? 0,
    exactAt3: metrics?.exactTop3Accuracy ?? 0,
    correctionProxyPerCase: correctionProxyPerCase(correctionProxyTotal, metrics?.caseCount ?? 0),
    correctionProxyTotal,
  };
}

export function correctionProxyPerCase(correctionProxyTotal: number, caseCount: number): number {
  return caseCount > 0 ? rounded(correctionProxyTotal / caseCount) : 0;
}

function subtract(value: AccuracySnapshot, baseline: AccuracySnapshot): AccuracySnapshot {
  return {
    rootAt1: rounded(value.rootAt1 - baseline.rootAt1),
    rootAt3: rounded(value.rootAt3 - baseline.rootAt3),
    qualityAt1: rounded(value.qualityAt1 - baseline.qualityAt1),
    qualityAt3: rounded(value.qualityAt3 - baseline.qualityAt3),
    exactAt1: rounded(value.exactAt1 - baseline.exactAt1),
    exactAt3: rounded(value.exactAt3 - baseline.exactAt3),
    correctionProxyPerCase: rounded(value.correctionProxyPerCase - baseline.correctionProxyPerCase),
  };
}

function markdownReport(artifact: {
  sourceCaseCount: number;
  dirtyCaseCount: number;
  evaluatedCaseLimitPerCategory?: number | null;
  globalSeed: number;
  results: CategoryEvaluation[];
}): string {
  const rows = artifact.results.map((entry) => [
    entry.category,
    entry.analyzerMode,
    String(entry.caseCount),
    percent(entry.metrics.rootAt1),
    percent(entry.metrics.rootAt3),
    percent(entry.metrics.qualityAt1),
    percent(entry.metrics.qualityAt3),
    percent(entry.metrics.exactAt1),
    percent(entry.metrics.exactAt3),
    entry.metrics.correctionProxyPerCase.toFixed(6),
    String(entry.metrics.correctionProxyTotal),
    entry.runtimeMs.toFixed(3),
    signedPercent(entry.deltaFromClean.rootAt1),
    signedPercent(entry.deltaFromLegacy.rootAt1),
    signedNumber(entry.deltaFromClean.correctionProxyPerCase),
    signedNumber(entry.deltaFromLegacy.correctionProxyPerCase),
  ].join(" | "));
  return [
    "# Phase 3.6.5 Stage A3 Dirty Corpus Baseline",
    "",
    `- Clean cases: ${artifact.sourceCaseCount}`,
    `- Dirty cases: ${artifact.dirtyCaseCount}`,
    `- Evaluation subset: ${artifact.evaluatedCaseLimitPerCategory ?? "all"} case(s) per category`,
    `- Global seed: ${artifact.globalSeed}`,
    "- Correction proxy/case normalizes the existing wrong-primary-segment proxy by case count; total is the raw proxy, not Stage B2 operation cost.",
    "- voice-aware-rerank-v1: not evaluated (Stage A4 is not implemented).",
    "- all_instruments.mid: not available.",
    "- Real MIDI Gold cases: 0; real-world accuracy is not evaluable.",
    "",
    "Category | Analyzer | Cases | Root@1 | Root@3 | Quality@1 | Quality@3 | Exact@1 | Exact@3 | Correction proxy/case | Correction proxy total | Runtime ms | Root@1 vs clean | Root@1 vs legacy | Correction/case vs clean | Correction/case vs legacy",
    "--- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:",
    ...rows,
    "",
  ].join("\n");
}

interface CliOptions extends GenerateOptions {
  reportDirectory: string;
  limitPerCategory?: number;
}

const valueFlags = new Set([
  "--input",
  "--output",
  "--report",
  "--seed",
  "--limit-per-category",
]);

export function parseCliOptions(args: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--run-cli") continue;
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);

    const equalsIndex = argument.indexOf("=");
    const name = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    if (!valueFlags.has(name)) throw new Error(`Unknown flag: ${name}`);
    if (values.has(name)) throw new Error(`Duplicate flag: ${name}`);

    const value = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : args[index + 1];
    if (value === undefined || value === "" || (equalsIndex < 0 && value.startsWith("--"))) {
      throw new Error(`${name} requires a value`);
    }
    values.set(name, value);
    if (equalsIndex < 0) index += 1;
  }

  return {
    inputManifestPath: values.get("--input") ?? DEFAULT_INPUT,
    outputDirectory: values.get("--output") ?? DEFAULT_OUTPUT,
    reportDirectory: values.get("--report") ?? DEFAULT_REPORT,
    globalSeed: parseSeed(values.get("--seed")),
    limitPerCategory: parseOptionalPositiveInteger(values.get("--limit-per-category")),
  };
}

function parseSeed(value: string | undefined): number {
  if (value === undefined) return DEFAULT_SEED;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
    throw new Error(`--seed must be an unsigned 32-bit integer, received: ${value}`);
  }
  return parsed;
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--limit-per-category must be a positive integer, received: ${value}`);
  }
  return parsed;
}

function representativeSubset<T>(values: readonly T[], limit: number | undefined): T[] {
  if (limit === undefined || values.length <= limit) return [...values];
  return Array.from({ length: limit }, (_, index) => values[Math.floor(index * values.length / limit)]);
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
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
  return `${value >= 0 ? "+" : ""}${value.toFixed(6)}`;
}

function relativeDisplay(path: string): string {
  return relative(process.cwd(), resolve(path)).replaceAll("\\", "/") || ".";
}

if (process.argv.includes("--run-cli")) {
  await main();
}
