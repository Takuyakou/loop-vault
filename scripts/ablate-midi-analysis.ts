import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import type { MidiProgressionAnalysis } from "../src/domain/types";
import { evaluateAnalyzer } from "../src/domain/midi/evaluation/evaluate";
import { adaptChordDripManifest, type ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import type { EvaluationMetrics } from "../src/domain/midi/evaluation/types";
import { buildHybridPipeline, defaultHybridFeatures, timelineFromHybridPipeline } from "../src/domain/midi/hybrid";
import type { HybridFeatureFlags } from "../src/domain/midi/types";

const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const outputDir = resolve(cwd(), "artifacts/midi-ablation");
const docsPath = resolve(cwd(), "docs/phase3.6.1-ablation-report.md");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;
const definitions = adaptChordDripManifest(manifest);
const cases = await Promise.all(definitions.map(async (definition) => ({
  definition,
  bytes: new Uint8Array(await readFile(resolve(dirname(manifestPath), definition.midiPath))),
})));
const variants = [
  { id: "all-on", features: { ...defaultHybridFeatures } },
  ...Object.keys(defaultHybridFeatures).map((feature) => ({
    id: `without-${feature}`,
    features: { ...defaultHybridFeatures, [feature]: false },
  })),
] as Array<{ id: string; features: HybridFeatureFlags }>;

const reports = variants.map((variant) => evaluateAnalyzer(cases, (bytes) => analysis(bytes, variant.features), {
  analyzerMode: variant.id,
  analyzerVersion: "hybrid-symbolic-v1",
  datasetId: manifest.recipeSha256,
}));
const baseline = reports[0];
const result = reports.map((report) => ({ id: report.analyzerMode, metrics: report.metrics, delta: delta(report.metrics, baseline.metrics), byCategory: report.byCategory }));
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "report.json"), `${JSON.stringify({ schemaVersion: 1, datasetId: manifest.recipeSha256, variants: result }, null, 2)}\n`);
await writeFile(docsPath, markdown(result), "utf8");
stdout.write(`Evaluated ${variants.length} ablations across ${cases.length} cases\n`);

function analysis(bytes: Uint8Array, features: HybridFeatureFlags): MidiProgressionAnalysis {
  const pipeline = buildHybridPipeline(bytes, { features });
  return {
    totalBars: pipeline.data.totalBars,
    fullTimeline: timelineFromHybridPipeline(pipeline),
    blockCandidates: [],
    analyzedAt: "1970-01-01T00:00:00.000Z",
    analyzerVersion: "hybrid-symbolic-v1",
  };
}

function delta(current: EvaluationMetrics, baseline: EvaluationMetrics) {
  return {
    rootAccuracy: current.rootAccuracy - baseline.rootAccuracy,
    qualityAccuracy: current.qualityAccuracy - baseline.qualityAccuracy,
    exactAccuracy: current.exactAccuracy - baseline.exactAccuracy,
    top3Accuracy: current.top3Accuracy - baseline.top3Accuracy,
    boundaryPrecision: current.boundaryPrecision - baseline.boundaryPrecision,
    boundaryRecall: current.boundaryRecall - baseline.boundaryRecall,
    overSegmentationRate: current.overSegmentationRate - baseline.overSegmentationRate,
    correctionCost: current.correctionCost - baseline.correctionCost,
  };
}

function markdown(results: typeof result): string {
  const lines = [
    "# Phase 3.6.1 MIDI Ablation Report", "",
    "Each row disables exactly one hybrid feature. Deltas are relative to `all-on`.", "",
    "| Variant | Root | Root delta | Quality | Quality delta | Top-3 | Top-3 delta | Boundary F1 | Corrections | Correction delta |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...results.map((entry) => `| ${entry.id} | ${pct(entry.metrics.rootAccuracy)} | ${signedPct(entry.delta.rootAccuracy)} | ${pct(entry.metrics.qualityAccuracy)} | ${signedPct(entry.delta.qualityAccuracy)} | ${pct(entry.metrics.top3Accuracy)} | ${signedPct(entry.delta.top3Accuracy)} | ${pct(f1(entry.metrics.boundaryPrecision, entry.metrics.boundaryRecall))} | ${entry.metrics.correctionCost} | ${signed(entry.delta.correctionCost)} |`),
    "", "## Interpretation", "",
    "- Positive accuracy deltas after disabling a feature indicate that the feature currently hurts this corpus.",
    "- Negative correction deltas are improvements.",
    "- This evaluates raw hybrid output on the synthetic corpus; product output still keeps legacy primary chords.",
  ];
  return `${lines.join("\n")}\n`;
}

function pct(value: number): string { return `${(value * 100).toFixed(2)}%`; }
function signedPct(value: number): string { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}pp`; }
function signed(value: number): string { return `${value >= 0 ? "+" : ""}${value}`; }
function f1(precision: number, recall: number): number { return precision + recall ? 2 * precision * recall / (precision + recall) : 0; }
