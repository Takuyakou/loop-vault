import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { analyzeMidi, hybridAnalyzerVersion } from "../src/domain/midi/analysis";
import { evaluateAnalyzer } from "../src/domain/midi/evaluation/evaluate";
import { adaptChordDripManifest, type ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import { defaultAnalyzerWeights, type AnalyzerWeights } from "../src/domain/midi/weights";

const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const outputDir = resolve(cwd(), "artifacts/midi-tuning");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;
const definitions = adaptChordDripManifest(manifest);
const cases = await Promise.all(definitions.map(async (definition) => ({
  definition,
  bytes: new Uint8Array(await readFile(resolve(dirname(manifestPath), definition.midiPath))),
})));
const tuneCases = cases.filter((entry) => entry.definition.split === "tune");
const holdoutCases = cases.filter((entry) => entry.definition.split === "holdout");
const candidates: Array<{ id: string; weights: AnalyzerWeights }> = [
  { id: "default", weights: { ...defaultAnalyzerWeights } },
  { id: "bass-root-up", weights: { ...defaultAnalyzerWeights, bassRoleRootWeight: 1.5, bassRoleQualityWeight: 0.55 } },
  { id: "ornament-strict", weights: { ...defaultAnalyzerWeights, passingTonePenalty: 0.5, chromaticApproachPenalty: 0.44, shortUpperVoicePenalty: 0.56 } },
];

const evaluated = candidates.map((candidate) => {
  const report = evaluateAnalyzer(tuneCases, (bytes) => analyzeMidi(bytes, { mode: "hybrid-v1", weights: candidate.weights }), {
    analyzerMode: `hybrid-v1:${candidate.id}`,
    analyzerVersion: hybridAnalyzerVersion,
    datasetId: `${manifest.recipeSha256}:tune`,
  });
  return { ...candidate, metrics: report.metrics, score: score(report.metrics) };
}).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
const best = evaluated[0];
const holdout = evaluateAnalyzer(holdoutCases, (bytes) => analyzeMidi(bytes, { mode: "hybrid-v1", weights: best.weights }), {
  analyzerMode: `hybrid-v1:${best.id}`,
  analyzerVersion: hybridAnalyzerVersion,
  datasetId: `${manifest.recipeSha256}:holdout`,
});

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "run-config.json"), `${JSON.stringify({ schemaVersion: 1, datasetId: manifest.recipeSha256, tuneCases: tuneCases.length, holdoutCases: holdoutCases.length, candidateIds: candidates.map((item) => item.id) }, null, 2)}\n`);
await writeFile(resolve(outputDir, "candidates.jsonl"), `${evaluated.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
await writeFile(resolve(outputDir, "best-weights.json"), `${JSON.stringify({ id: best.id, weights: best.weights, tuneMetrics: best.metrics }, null, 2)}\n`);
await writeFile(resolve(outputDir, "holdout-report.md"), holdoutMarkdown(best.id, holdout.metrics));
stdout.write(`Best ${best.id}: tune Top-3 ${(best.metrics.top3Accuracy * 100).toFixed(2)}%, holdout Top-3 ${(holdout.metrics.top3Accuracy * 100).toFixed(2)}%\n`);

function score(metrics: typeof evaluated[number]["metrics"]): number {
  return metrics.top3Accuracy * 4 + metrics.rootAccuracy + metrics.qualityAccuracy - metrics.correctionCost / Math.max(1, metrics.caseCount * 100);
}

function holdoutMarkdown(id: string, metrics: typeof holdout.metrics): string {
  return `# MIDI Holdout Report\n\n- Weights: ${id}\n- Cases: ${metrics.caseCount}\n- Root: ${(metrics.rootAccuracy * 100).toFixed(2)}%\n- Quality: ${(metrics.qualityAccuracy * 100).toFixed(2)}%\n- Exact: ${(metrics.exactAccuracy * 100).toFixed(2)}%\n- Top-3: ${(metrics.top3Accuracy * 100).toFixed(2)}%\n- Boundary precision: ${(metrics.boundaryPrecision * 100).toFixed(2)}%\n- Boundary recall: ${(metrics.boundaryRecall * 100).toFixed(2)}%\n- Correction cost: ${metrics.correctionCost}\n`;
}
