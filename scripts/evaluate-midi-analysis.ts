import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi, hybridAnalyzerVersion, legacyAnalyzerVersion } from "../src/domain/midi/analysis";
import { evaluateAnalyzer } from "../src/domain/midi/evaluation/evaluate";
import { adaptChordDripManifest, type ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import { comparisonMarkdown } from "../src/domain/midi/evaluation/report";
import { analyzeMidiLegacyBoundaryRerank, defaultLegacyBoundaryRerankerThresholds } from "../src/domain/midi/legacyBoundaryReranker";

const args = argv.slice(2);
const datasetArg = valueOf("--dataset") ?? "docs/loop-vault-evaluation-corpus/manifest.json";
const manifestPath = resolve(cwd(), datasetArg);
const outputDir = resolve(cwd(), "artifacts/midi-evaluation");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;
const definitions = adaptChordDripManifest(manifest);
const cases = await Promise.all(definitions.map(async (definition) => ({
  definition,
  bytes: new Uint8Array(await readFile(resolve(dirname(manifestPath), definition.midiPath))),
})));
await mkdir(outputDir, { recursive: true });

const baseline = evaluateAnalyzer(cases, (bytes) => analyzeMidi(bytes), {
  analyzerMode: "legacy", analyzerVersion: legacyAnalyzerVersion, datasetId: manifest.recipeSha256,
});
await writeFile(resolve(outputDir, "baseline.json"), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");

if (args.includes("--compare")) {
  const candidate = evaluateAnalyzer(cases, (bytes) => analyzeMidi(bytes, { mode: "hybrid-v1" }), {
    analyzerMode: "hybrid-v1", analyzerVersion: hybridAnalyzerVersion, datasetId: manifest.recipeSha256,
  });
  await writeFile(resolve(outputDir, "hybrid-v1.json"), `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  await writeFile(resolve(outputDir, "comparison.md"), comparisonMarkdown(baseline, candidate), "utf8");
  stdout.write(`Hybrid root ${(candidate.metrics.rootAccuracy * 100).toFixed(2)}%, exact ${(candidate.metrics.exactAccuracy * 100).toFixed(2)}%\n`);
}

if (args.includes("--rerank")) {
  const minimumScoreLead = Number(valueOf("--minimum-score-lead") ?? defaultLegacyBoundaryRerankerThresholds.minimumScoreLead);
  const candidate = evaluateAnalyzer(cases, (bytes) => analyzeMidiLegacyBoundaryRerank(bytes, {}, {
    ...defaultLegacyBoundaryRerankerThresholds,
    minimumScoreLead,
  }), {
    analyzerMode: "legacy-boundary-rerank", analyzerVersion: "legacy-boundary-rerank-v1", datasetId: manifest.recipeSha256,
  });
  await writeFile(resolve(outputDir, "legacy-boundary-rerank.json"), `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  await writeFile(resolve(outputDir, "legacy-boundary-rerank-comparison.md"), comparisonMarkdown(baseline, candidate), "utf8");
  stdout.write(`Rerank lead ${minimumScoreLead}: root ${(candidate.metrics.rootAccuracy * 100).toFixed(2)}%, quality ${(candidate.metrics.qualityAccuracy * 100).toFixed(2)}%, exact ${(candidate.metrics.exactAccuracy * 100).toFixed(2)}%, Top-3 ${(candidate.metrics.top3Accuracy * 100).toFixed(2)}%\n`);
}

stdout.write(`Evaluated ${cases.length} cases: root ${(baseline.metrics.rootAccuracy * 100).toFixed(2)}%, exact ${(baseline.metrics.exactAccuracy * 100).toFixed(2)}%\n`);

function valueOf(name: string): string | undefined {
  const equals = args.find((entry) => entry.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
