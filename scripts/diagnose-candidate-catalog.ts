import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";

/**
 * Candidate Catalog and Recommendation diagnostic.
 *
 * Reports the two numbers the H0 contract separates: how much the catalog holds,
 * and how many of those the recommendation puts first. A file whose catalog is
 * large and whose recommendation is one is working as intended.
 *
 * Only fingerprints and counts are written; no MIDI bytes and no absolute paths.
 */
function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const midiPaths = (optionValue("--midi") ?? "").split(",").filter(Boolean);
const mode = (optionValue("--mode") ?? "phase4.1.2-v1") as MidiAnalyzerMode;
const outputPath = optionValue("--output");

if (midiPaths.length === 0) {
  throw new Error("Usage: vite-node scripts/diagnose-candidate-catalog.ts --midi <path[,path]> [--mode <mode>] [--output <path>]");
}

const rows = [];
for (const path of midiPaths) {
  const bytes = new Uint8Array(await readFile(resolve(cwd(), path)));
  const started = performance.now();
  const analysis = analyzeMidi(bytes, { mode, fileName: basename(path) });
  const runtimeMs = Number((performance.now() - started).toFixed(1));
  const catalog = analysis.candidateCatalog;
  const recommendation = analysis.candidateRecommendation;

  rows.push({
    fingerprint: fingerprintMidiBytes(bytes),
    byteLength: bytes.length,
    totalBars: analysis.totalBars,
    mode,
    runtimeMs,
    catalog: catalog === undefined ? null : {
      version: catalog.catalogVersion,
      patternCount: catalog.patterns.length,
      progressionCount: catalog.progressionPatternIds.length,
      vampCount: catalog.vampPatternIds.length,
      fragmentCount: catalog.fragmentPatternIds.length,
      uncertainCount: catalog.uncertainPatternIds.length,
      occurrenceCount: catalog.diagnostics.occurrenceCount,
      rawWindowCount: catalog.diagnostics.rawWindowCount,
      exactDuplicateCount: catalog.diagnostics.exactDuplicateCount,
      unreachablePatternCount: catalog.diagnostics.unreachablePatternCount,
      unreachableOccurrenceCount: catalog.diagnostics.unreachableOccurrenceCount,
      belowQualityFloorPatternCount: catalog.diagnostics.belowQualityFloorPatternCount,
    },
    recommendation: recommendation === undefined ? null : {
      version: recommendation.version,
      count: recommendation.recommendations.length,
      eligiblePatternCount: recommendation.eligiblePatternCount,
      evaluatedPatternCount: recommendation.evaluatedPatternCount,
      paddingCount: recommendation.paddingCount,
      stoppedBecause: recommendation.stoppedBecause,
      ranks: recommendation.recommendations.map((entry) => ({
        rank: entry.rank,
        score: entry.recommendationScore,
        reasons: entry.reasons,
      })),
    },
  });
}

if (outputPath) {
  await mkdir(resolve(cwd(), outputPath, ".."), { recursive: true });
  await writeFile(
    resolve(cwd(), outputPath),
    `${JSON.stringify({ schemaVersion: 1, stage: "P4.1.2-H", mode, files: rows }, null, 2)}\n`,
    "utf8",
  );
}

for (const row of rows) {
  const catalog = row.catalog;
  const recommendation = row.recommendation;
  stdout.write(
    `${row.fingerprint.slice(7, 19)}  bars ${String(row.totalBars).padStart(4)}`
    + `  catalog ${String(catalog?.patternCount ?? 0).padStart(4)}`
    + ` (prog ${catalog?.progressionCount ?? 0} vamp ${catalog?.vampCount ?? 0}`
    + ` frag ${catalog?.fragmentCount ?? 0} unc ${catalog?.uncertainCount ?? 0})`
    + `  recommended ${String(recommendation?.count ?? 0).padStart(2)}`
    + `/${String(recommendation?.eligiblePatternCount ?? 0).padStart(4)} eligible`
    + `  padding ${recommendation?.paddingCount ?? 0}`
    + `  ${recommendation?.stoppedBecause ?? "-"}`
    + `  ${row.runtimeMs} ms\n`,
  );
}
