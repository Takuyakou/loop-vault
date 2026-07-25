import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { adaptChordDripManifest, type ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import { aggregateV2, evaluateCaseV2 } from "../src/domain/midi/evaluation/metricsV2";
import type { MidiEvaluationCase } from "../src/domain/midi/evaluation/types";
import { analyzeMidiPhase4 } from "../src/domain/midi/phase4Analyzer";
import type { QualityEvidenceOptions, QualityEvidenceScope } from "../src/domain/midi/qualityEvidence";

/**
 * P4.0-05D quality-evidence search.
 *
 * Reads the tune subset only. The holdout subset is never touched here: it is
 * evaluated once, separately, after a configuration is chosen.
 */
const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const splitPath = resolve(cwd(), "docs/phase4.0/00-corpus-split.json");
const outputDir = resolve(cwd(), "docs/phase4.0");
const outputName = optionValue("--output") ?? "quality-evidence-tune.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;
const split = JSON.parse(await readFile(splitPath, "utf8")) as {
  tune: { caseIds: string[] };
  holdout: { caseIds: string[] };
};
const tuneIds = new Set(split.tune.caseIds);

const definitions: MidiEvaluationCase[] = adaptChordDripManifest(manifest)
  .filter((definition) => tuneIds.has(definition.id))
  .map((definition) => ({ ...definition, split: "tune" as const }));

const cases = await Promise.all(definitions.map(async (definition) => ({
  definition,
  bytes: new Uint8Array(await readFile(resolve(dirname(manifestPath), definition.midiPath))),
})));

stdout.write(`tune cases: ${cases.length} (holdout is not read here)\n\n`);

const baseline = aggregateV2(cases.map(({ definition, bytes }) =>
  evaluateCaseV2(definition, analyzeMidi(bytes, { mode: "legacy" }).fullTimeline)));

// The coarse pass showed `third` scope is worse than `full`, and a cliff between
// 0.10 and 0.15 where root accuracy collapses. This pass resolves the region
// below that cliff.
const scopes: QualityEvidenceScope[] = ["full"];
const penalties = [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14];
const thresholds = [0.01, 0.02, 0.03];

interface Row {
  config: QualityEvidenceOptions;
  root: number;
  triad: number;
  quality: number;
  bassSlash: number;
  canonicalExact: number;
  top3Canonical: number;
  top3Root: number;
  passesGate: boolean;
  failing: string[];
}

const base = baseline.durationWeighted;
const rows: Row[] = [];

for (const scope of scopes) {
  for (const penalty of penalties) {
    for (const presenceThreshold of thresholds) {
      const config: QualityEvidenceOptions = { scope, penalty, presenceThreshold };
      const metrics = aggregateV2(cases.map(({ definition, bytes }) =>
        evaluateCaseV2(definition, analyzeMidiPhase4(bytes, {}, config).fullTimeline)));
      const value = metrics.durationWeighted;

      // Same rules as the frozen gate, evaluated on tune for search purposes.
      const failing: string[] = [];
      const check = (name: string, after: number, before: number, tolerancePp: number) => {
        if ((after - before) * 100 < -tolerancePp) failing.push(name);
      };
      check("root", value.rootAccuracy, base.rootAccuracy, 0.5);
      check("triad", value.triadAccuracy, base.triadAccuracy, 0.5);
      check("quality", value.qualityAccuracy, base.qualityAccuracy, 0.5);
      check("bassSlash", value.bassSlashAccuracy, base.bassSlashAccuracy, 0.5);
      check("top3Root", value.top3RootAccuracy, base.top3RootAccuracy, 3.0);
      check("top3Quality", value.top3QualityAccuracy, base.top3QualityAccuracy, 3.0);
      const improves = (value.canonicalExactAccuracy - base.canonicalExactAccuracy) * 100 >= 0.5
        || (value.top3CanonicalAccuracy - base.top3CanonicalAccuracy) * 100 >= 0.5;
      if (!improves) failing.push("requireAny");

      rows.push({
        config,
        root: value.rootAccuracy,
        triad: value.triadAccuracy,
        quality: value.qualityAccuracy,
        bassSlash: value.bassSlashAccuracy,
        canonicalExact: value.canonicalExactAccuracy,
        top3Canonical: value.top3CanonicalAccuracy,
        top3Root: value.top3RootAccuracy,
        passesGate: failing.length === 0,
        failing,
      });
    }
  }
}

const pp = (after: number, before: number) => `${((after - before) * 100 >= 0 ? "+" : "")}${((after - before) * 100).toFixed(2)}`;
stdout.write(`legacy tune baseline: root ${(base.rootAccuracy * 100).toFixed(2)}%  triad ${(base.triadAccuracy * 100).toFixed(2)}%  `
  + `canonicalExact ${(base.canonicalExactAccuracy * 100).toFixed(2)}%  top3canon ${(base.top3CanonicalAccuracy * 100).toFixed(2)}%\n\n`);
stdout.write("scope  pen   thr    root    triad   qual    canon   top3    gate\n");
for (const row of rows) {
  stdout.write(
    `${String(row.config.scope).padEnd(6)} ${String(row.config.penalty).padEnd(5)} ${String(row.config.presenceThreshold).padEnd(6)} `
    + `${pp(row.root, base.rootAccuracy).padStart(6)}  ${pp(row.triad, base.triadAccuracy).padStart(6)}  `
    + `${pp(row.quality, base.qualityAccuracy).padStart(6)}  ${pp(row.canonicalExact, base.canonicalExactAccuracy).padStart(6)}  `
    + `${pp(row.top3Canonical, base.top3CanonicalAccuracy).padStart(6)}  `
    + `${row.passesGate ? "PASS" : `FAIL(${row.failing.join(",")})`}\n`,
  );
}

const passing = rows.filter((row) => row.passesGate)
  .sort((left, right) => right.canonicalExact - left.canonicalExact);
stdout.write(`\ngate-passing configs on tune: ${passing.length}\n`);
if (passing[0]) {
  stdout.write(`best by canonicalExact: ${JSON.stringify(passing[0].config)} `
    + `(${pp(passing[0].canonicalExact, base.canonicalExactAccuracy)}pp)\n`);
}

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify({
  schemaVersion: 1,
  stage: "P4.0-05D",
  subset: "tune",
  tuneCaseCount: cases.length,
  legacyBaseline: base,
  grid: { scopes, penalties, thresholds },
  rows,
  gatePassing: passing.map((row) => row.config),
}, null, 2)}\n`, "utf8");
