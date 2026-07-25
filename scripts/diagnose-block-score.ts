import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import type { ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";

/**
 * P4.0-04 score decomposition.
 *
 * The plan forbids re-tuning block selection before the current score is taken
 * apart. This measures how much each term actually contributes:
 *
 *   selectionScore = averageRankingScore + repeatBonus + diversityBonus
 *
 * P4.0-00 observed that the ranking term reads 1.0 for every candidate. This
 * checks that across the whole corpus and reports whether the recovered raw
 * match score carries usable spread instead.
 */
const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const outputDir = resolve(cwd(), "docs/phase4.0");
const outputName = optionValue("--output") ?? "block-score-diagnostic.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;

const rawScores: number[] = [];
const confidences: number[] = [];
let saturatedConfidence = 0;
let totalEvents = 0;
const perFileSpread: number[] = [];

for (const file of manifest.files) {
  const bytes = new Uint8Array(await readFile(resolve(dirname(manifestPath), file.midiFile)));
  const analysis = analyzeMidi(bytes, { mode: "legacy", fileName: file.midiFile });
  const fileRaw: number[] = [];
  for (const block of analysis.blockCandidates) {
    for (const event of block.events ?? []) {
      totalEvents += 1;
      confidences.push(event.confidence);
      if (event.confidence >= 0.9999) saturatedConfidence += 1;
      if (event.rawMatchScore !== undefined) {
        rawScores.push(event.rawMatchScore);
        fileRaw.push(event.rawMatchScore);
      }
    }
  }
  if (fileRaw.length > 1) {
    perFileSpread.push(Math.max(...fileRaw) - Math.min(...fileRaw));
  }
}

function quantiles(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return {
    count: sorted.length,
    min: Number(sorted[0].toFixed(6)),
    p10: Number(at(0.1).toFixed(6)),
    median: Number(at(0.5).toFixed(6)),
    p90: Number(at(0.9).toFixed(6)),
    max: Number(sorted[sorted.length - 1].toFixed(6)),
    distinctValues: new Set(sorted.map((value) => value.toFixed(4))).size,
  };
}

const report = {
  schemaVersion: 1,
  stage: "P4.0-04",
  datasetId: manifest.recipeSha256,
  caseCount: manifest.files.length,
  eventCount: totalEvents,
  confidence: {
    ...quantiles(confidences),
    saturatedAtOne: saturatedConfidence,
    saturatedShare: Number((saturatedConfidence / Math.max(1, totalEvents)).toFixed(6)),
  },
  recoveredRawMatchScore: quantiles(rawScores),
  perFileSpread: quantiles(perFileSpread),
  currentScoreTerms: {
    formula: "averageRankingScore + repeatBonus + diversityBonus",
    repeatBonus: "min(0.25, repeatCount * 0.08)",
    diversityBonus: "min(0.15, uniqueChordCount * 0.03)",
    note: "With the ranking term saturated, the bonuses are the only thing separating candidates.",
  },
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`events: ${totalEvents}\n`);
stdout.write(`confidence saturated at 1.0: ${saturatedConfidence} (${(report.confidence.saturatedShare * 100).toFixed(2)}%)\n`);
stdout.write(`confidence: ${JSON.stringify(quantiles(confidences))}\n`);
stdout.write(`recovered raw match score: ${JSON.stringify(quantiles(rawScores))}\n`);
stdout.write(`per-file raw spread: ${JSON.stringify(quantiles(perFileSpread))}\n`);
