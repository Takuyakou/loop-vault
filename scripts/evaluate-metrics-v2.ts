import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { adaptChordDripManifest, type ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import {
  aggregateV2, evaluateCaseV2, pairedComparison,
  type CaseMetricsV2,
} from "../src/domain/midi/evaluation/metricsV2";
import type { MidiEvaluationCase } from "../src/domain/midi/evaluation/types";

const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const splitPath = resolve(cwd(), "docs/phase4.0/00-corpus-split.json");
const outputDir = resolve(cwd(), "docs/phase4.0");
const outputName = optionValue("--output") ?? "normalized-baseline.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;
const split = JSON.parse(await readFile(splitPath, "utf8")) as {
  tune: { caseIds: string[] };
  holdout: { caseIds: string[] };
};
const holdoutIds = new Set(split.holdout.caseIds);

// The Phase 4.0 split replaces the manifest adapter's own tune/holdout guess so
// every stage reads the same frozen assignment.
const definitions: MidiEvaluationCase[] = adaptChordDripManifest(manifest).map((definition) => ({
  ...definition,
  split: holdoutIds.has(definition.id) ? "holdout" : "tune",
}));

const cases = await Promise.all(definitions.map(async (definition) => ({
  definition,
  bytes: new Uint8Array(await readFile(resolve(dirname(manifestPath), definition.midiPath))),
})));

const modes = [
  { key: "legacy", mode: "legacy" },
  { key: "legacyBoundaryRerank", mode: "legacy-boundary-rerank" },
  { key: "voiceAwareRerank", mode: "voice-aware-rerank-v1" },
] as const;

const results: Record<string, CaseMetricsV2[]> = {};
const runtimeMs: Record<string, number> = {};
for (const { key, mode } of modes) {
  const start = performance.now();
  results[key] = cases.map(({ definition, bytes }) =>
    evaluateCaseV2(definition, analyzeMidi(bytes, { mode: mode as never }).fullTimeline));
  runtimeMs[key] = Number((performance.now() - start).toFixed(1));
}

const subsets = (rows: CaseMetricsV2[]) => ({
  full: aggregateV2(rows),
  tune: aggregateV2(rows.filter((row) => row.split === "tune")),
  holdout: aggregateV2(rows.filter((row) => row.split === "holdout")),
});

const report = {
  schemaVersion: 1,
  stage: "P4.0-02",
  datasetId: manifest.recipeSha256,
  caseCount: cases.length,
  splitPolicy: { tune: split.tune.caseIds.length, holdout: split.holdout.caseIds.length },
  analyzers: Object.fromEntries(modes.map(({ key }) => [key, {
    runtimeMs: runtimeMs[key],
    ...subsets(results[key]),
  }])),
  pairedVsLegacy: Object.fromEntries(
    modes.filter(({ key }) => key !== "legacy").map(({ key }) => [key, {
      canonicalExact: pairedComparison(results.legacy, results[key], "canonicalExactAccuracy"),
      root: pairedComparison(results.legacy, results[key], "rootAccuracy"),
      quality: pairedComparison(results.legacy, results[key], "qualityAccuracy"),
      top3Canonical: pairedComparison(results.legacy, results[key], "top3CanonicalAccuracy"),
    }]),
  ),
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
for (const { key } of modes) {
  const full = report.analyzers[key].full;
  stdout.write(`\n${key} (${runtimeMs[key]} ms)\n`);
  stdout.write(`  duration-weighted  root ${pct(full.durationWeighted.rootAccuracy)}  triad ${pct(full.durationWeighted.triadAccuracy)}  quality ${pct(full.durationWeighted.qualityAccuracy)}\n`);
  stdout.write(`                     seventh ${pct(full.durationWeighted.seventhAccuracy)}  ext ${pct(full.durationWeighted.extensionAccuracy)}  bass ${pct(full.durationWeighted.bassSlashAccuracy)}\n`);
  stdout.write(`                     canonicalExact ${pct(full.durationWeighted.canonicalExactAccuracy)}  pitchSet ${pct(full.durationWeighted.pitchSetEquivalentAccuracy)}\n`);
  stdout.write(`                     top3canon ${pct(full.durationWeighted.top3CanonicalAccuracy)}  top5canon ${pct(full.durationWeighted.top5CanonicalAccuracy)}  unmatched ${pct(full.durationWeighted.unmatchedRate)}\n`);
  stdout.write(`                     top3root ${pct(full.durationWeighted.top3RootAccuracy)}  top3quality ${pct(full.durationWeighted.top3QualityAccuracy)}\n`);
  stdout.write(`  event-weighted     canonicalExact ${pct(full.eventWeighted.canonicalExactAccuracy)}  top3 ${pct(full.eventWeighted.top3CanonicalAccuracy)}\n`);
  const rep = full.representabilityBeats;
  stdout.write(`  representable(beats) ${rep.representable}/${rep.total}  detector-vocab-unsupported ${rep.detectorVocabularyUnsupported}  parser-unsupported ${rep.parserUnsupported}\n`);
  stdout.write(`  holdout canonicalExact ${pct(report.analyzers[key].holdout.durationWeighted.canonicalExactAccuracy)}\n`);
}
