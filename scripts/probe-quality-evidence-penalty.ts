import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidiWithRankingScores } from "../src/domain/midi/legacy";
import { phase4QualityEvidence } from "../src/domain/midi/phase4Analyzer";
import { beatsPerBar } from "../src/domain/midi/timing";
import { evaluateTimeline, loadCorpus } from "./syntheticGoldCorpus";

/**
 * P4.1.1 diagnostic probe: how much of the timeline error is the quality-evidence
 * penalty being too small to enforce its own rule?
 *
 * `qualityEvidence` exists so a chord cannot be named minor while its minor third
 * is silent. The promoted constant is `penalty: 0.08`, tuned on one real corpus
 * where 0.12 collapsed root selection. The gold corpus contains chords whose
 * defining tone is definitively absent, so it can say whether 0.08 is strong
 * enough — a question the real corpus could only answer indirectly.
 *
 * This changes nothing: it calls the analyzer with different option values, the
 * same way the tuning scripts already do. No product default is touched.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const corpusRoot = resolve(cwd(), optionValue("--corpus") ?? ".local-evaluation/synthetic-gold-v1");
const split = optionValue("--split") ?? "dev";
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/phase4.1.1/quality-evidence-penalty-probe.json");
const penalties = (optionValue("--penalties") ?? "0,0.08,0.12,0.2,0.35,0.5")
  .split(",")
  .map(Number);

const corpus = loadCorpus(corpusRoot);
const files = corpus.splits[split];
if (!files) throw new Error(`unknown split: ${split}`);

const located = new Map<string, { scenarioIndex: number; variantIndex: number }>();
corpus.scenarios.forEach((scenario, scenarioIndex) => {
  scenario.variants.forEach((variant, variantIndex) => {
    located.set(variant.fileName, { scenarioIndex, variantIndex });
  });
});

interface Row {
  penalty: number;
  rootAccuracy: number;
  rootAccuracyAgainstAnyAcceptable: number;
  triadAccuracy: number;
  seventhAccuracy: number;
  slashBassAccuracy: number;
  canonicalExact: number;
  acceptableAlternativeMatch: number;
  worstScenarios: Array<{ scenarioId: string; variant: string; canonicalExact: number }>;
}

const rows: Row[] = [];

for (const penalty of penalties) {
  const perFile: Array<{ scenarioId: string; variant: string; metrics: ReturnType<typeof evaluateTimeline> }> = [];
  for (const fileName of files) {
    const position = located.get(fileName);
    if (!position) throw new Error(`file not in manifest: ${fileName}`);
    const scenario = corpus.scenarios[position.scenarioIndex];
    const variant = scenario.variants[position.variantIndex];
    const bytes = new Uint8Array(await readFile(resolve(corpusRoot, "midi", fileName)));

    const analysis = analyzeMidiWithRankingScores(bytes, {}, {
      useQualityEvidence: true,
      // Only the penalty moves; scope and threshold stay as promoted.
      qualityEvidence: { ...phase4QualityEvidence, penalty },
      useCoverageSelection: true,
      useExtractionProfile: true,
    }).analysis;

    perFile.push({
      scenarioId: scenario.scenarioId,
      variant: variant.variant,
      metrics: evaluateTimeline(
        analysis.fullTimeline,
        variant.events,
        beatsPerBar(analysis.timeSignature),
        scenario.boundaryToleranceBeats,
      ),
    });
  }

  const mean = (pick: (metrics: ReturnType<typeof evaluateTimeline>) => number) => Number((
    perFile.reduce((sum, entry) => sum + pick(entry.metrics), 0) / perFile.length
  ).toFixed(6));

  rows.push({
    penalty,
    rootAccuracy: mean((metrics) => metrics.rootAccuracy),
    rootAccuracyAgainstAnyAcceptable: mean((metrics) => metrics.rootAccuracyAgainstAnyAcceptable),
    triadAccuracy: mean((metrics) => metrics.triadAccuracy),
    seventhAccuracy: mean((metrics) => metrics.seventhAccuracy),
    slashBassAccuracy: mean((metrics) => metrics.slashBassAccuracy),
    canonicalExact: mean((metrics) => metrics.canonicalExact),
    acceptableAlternativeMatch: mean((metrics) => metrics.acceptableAlternativeMatch),
    worstScenarios: [...perFile]
      .sort((left, right) => left.metrics.canonicalExact - right.metrics.canonicalExact)
      .slice(0, 5)
      .map((entry) => ({
        scenarioId: entry.scenarioId,
        variant: entry.variant,
        canonicalExact: entry.metrics.canonicalExact,
      })),
  });
}

const report = {
  schemaVersion: 1,
  stage: "P4.1.1 quality-evidence penalty probe",
  split,
  promotedPenalty: phase4QualityEvidence.penalty ?? null,
  scope: phase4QualityEvidence.scope ?? null,
  presenceThreshold: phase4QualityEvidence.presenceThreshold ?? null,
  note: "Diagnostic only. No product default is changed by this script.",
  rows,
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
stdout.write(`split ${split}, promoted penalty ${phase4QualityEvidence.penalty}\n\n`);
stdout.write("penalty  root    rootAlt  triad   7th     bass    exact   alt\n");
for (const row of rows) {
  stdout.write(
    `${String(row.penalty).padEnd(8)} ${pct(row.rootAccuracy).padEnd(7)} `
    + `${pct(row.rootAccuracyAgainstAnyAcceptable).padEnd(8)} ${pct(row.triadAccuracy).padEnd(7)} `
    + `${pct(row.seventhAccuracy).padEnd(7)} ${pct(row.slashBassAccuracy).padEnd(7)} `
    + `${pct(row.canonicalExact).padEnd(7)} ${pct(row.acceptableAlternativeMatch)}\n`,
  );
}
