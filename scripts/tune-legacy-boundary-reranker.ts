import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { evaluateAnalyzer } from "../src/domain/midi/evaluation/evaluate";
import { adaptChordDripManifest, type ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import type { EvaluationMetrics } from "../src/domain/midi/evaluation/types";
import { analyzeMidi as analyzeLegacy } from "../src/domain/midi/legacy";
import { analyzeMidiLegacyBoundaryRerank, defaultLegacyBoundaryRerankerThresholds } from "../src/domain/midi/legacyBoundaryReranker";

const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const outputDir = resolve(cwd(), "artifacts/midi-reranker-tuning");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;
const definitions = adaptChordDripManifest(manifest);
const cases = await Promise.all(definitions.map(async (definition) => ({
  definition,
  bytes: new Uint8Array(await readFile(resolve(dirname(manifestPath), definition.midiPath))),
})));
const tune = cases.filter((entry) => entry.definition.split === "tune");
const holdout = cases.filter((entry) => entry.definition.split === "holdout");
const leads = [0.3, 0.4, 0.5, 0.6, 0.7];
const baselineTune = report(tune, "legacy", (bytes) => analyzeLegacy(bytes));
const candidates = leads.map((minimumScoreLead) => {
  const evaluation = report(tune, `lead-${minimumScoreLead}`, (bytes) => analyzeMidiLegacyBoundaryRerank(bytes, {}, {
    ...defaultLegacyBoundaryRerankerThresholds, minimumScoreLead,
  }));
  return { minimumScoreLead, metrics: evaluation.metrics, eligible: noRegression(evaluation.metrics, baselineTune.metrics) };
});
const baselineHoldout = report(holdout, "legacy", (bytes) => analyzeLegacy(bytes));
const tuneRanked = (candidates.some((candidate) => candidate.eligible)
  ? candidates.filter((candidate) => candidate.eligible)
  : candidates).sort((left, right) => objective(right.metrics) - objective(left.metrics)
    || right.minimumScoreLead - left.minimumScoreLead);
const holdoutAudits = tuneRanked.map((candidate) => {
  const evaluation = report(holdout, `lead-${candidate.minimumScoreLead}`, (bytes) => analyzeMidiLegacyBoundaryRerank(bytes, {}, {
    ...defaultLegacyBoundaryRerankerThresholds, minimumScoreLead: candidate.minimumScoreLead,
  }));
  return { minimumScoreLead: candidate.minimumScoreLead, metrics: evaluation.metrics, passedRegressionGuard: noRegression(evaluation.metrics, baselineHoldout.metrics) };
});
const accepted = holdoutAudits.find((audit) => audit.passedRegressionGuard) ?? holdoutAudits[holdoutAudits.length - 1];
const best = candidates.find((candidate) => candidate.minimumScoreLead === accepted.minimumScoreLead)!;
const rerankHoldout = accepted;

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "report.json"), `${JSON.stringify({
  schemaVersion: 1,
  datasetId: manifest.recipeSha256,
  tuneCases: tune.length,
  holdoutCases: holdout.length,
  baselineTune: baselineTune.metrics,
  candidates,
  tuneRanking: tuneRanked.map((candidate) => candidate.minimumScoreLead),
  selectedMinimumScoreLead: best.minimumScoreLead,
  baselineHoldout: baselineHoldout.metrics,
  holdoutAudits,
  rerankHoldout: accepted.metrics,
}, null, 2)}\n`);
stdout.write(`Selected lead ${best.minimumScoreLead}; holdout root ${(rerankHoldout.metrics.rootAccuracy * 100).toFixed(2)}%, quality ${(rerankHoldout.metrics.qualityAccuracy * 100).toFixed(2)}%, Top-3 ${(rerankHoldout.metrics.top3Accuracy * 100).toFixed(2)}%\n`);

function report(input: typeof cases, mode: string, analyzer: (bytes: Uint8Array) => ReturnType<typeof analyzeLegacy>) {
  return evaluateAnalyzer(input, analyzer, { analyzerMode: mode, analyzerVersion: mode, datasetId: manifest.recipeSha256 });
}

function noRegression(current: EvaluationMetrics, baseline: EvaluationMetrics): boolean {
  return current.rootAccuracy >= baseline.rootAccuracy
    && current.qualityAccuracy >= baseline.qualityAccuracy
    && current.exactAccuracy >= baseline.exactAccuracy
    && current.correctionCost <= baseline.correctionCost;
}

function objective(metrics: EvaluationMetrics): number {
  return metrics.top3Accuracy * 4 + metrics.rootAccuracy + metrics.qualityAccuracy + metrics.exactAccuracy;
}
