import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import {
  encodeMidi, realiseScenario, sha256Hex, type ScenarioPlan,
} from "./longFormCorpus";
import { LONG_FORM_SCENARIOS, MAX_BARS, MIN_BARS } from "./longFormScenarios";

/**
 * Writes Long-form Corpus v1.1: 12 scenarios, clean and stress, 96 to 192 bars.
 *
 * MIDI goes to the corpus directory outside git; the manifest and splits go
 * beside it. Only the fingerprints and the aggregate report are committed.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const corpusRoot = resolve(cwd(), optionValue("--out") ?? ".local-evaluation/long-form-v1.1");
const fingerprintPath = resolve(cwd(), optionValue("--fingerprints") ?? "docs/phase4.1.2/01-long-form-corpus.json");

await mkdir(resolve(corpusRoot, "midi"), { recursive: true });

interface VariantRecord {
  fileName: string;
  sha256: string;
  bytes: number;
  variant: "clean" | "stress";
  events: ReturnType<typeof realiseScenario>["events"];
}

const scenarios: Array<Record<string, unknown>> = [];
const splits: Record<string, string[]> = { dev: [], validation: [], "holdout-v2": [] };
const fingerprints: Array<Record<string, unknown>> = [];

for (const plan of LONG_FORM_SCENARIOS as ScenarioPlan[]) {
  const bars = plan.bars.length;
  if (bars < MIN_BARS || bars > MAX_BARS) {
    throw new Error(`${plan.scenarioId} has ${bars} bars, outside ${MIN_BARS}-${MAX_BARS}`);
  }
  for (const block of plan.expectedBlocks) {
    if (block.start_bar < 1 || block.end_bar > bars) {
      throw new Error(`${plan.scenarioId} block ${block.id} outside 1-${bars}`);
    }
  }

  const variants: VariantRecord[] = [];
  for (const variant of ["clean", "stress"] as const) {
    const { notes, events, stress } = realiseScenario(plan, variant);
    const bytes = encodeMidi(plan, notes, stress);
    const fileName = `${plan.scenarioId}_${plan.title}_${variant}.mid`;
    await writeFile(resolve(corpusRoot, "midi", fileName), bytes);
    variants.push({ fileName, sha256: sha256Hex(bytes), bytes: bytes.length, variant, events });
    splits[plan.split].push(fileName);
    fingerprints.push({
      scenarioId: plan.scenarioId,
      title: plan.title,
      variant,
      split: plan.split,
      bars,
      bpm: plan.bpm,
      sha256: sha256Hex(bytes),
      byteLength: bytes.length,
      goldEvents: events.length,
      stressFeatures: variant === "stress" ? plan.stressFeatures : [],
    });
  }

  scenarios.push({
    scenarioId: plan.scenarioId,
    title: plan.title,
    description: plan.description,
    bars,
    bpm: plan.bpm,
    split: plan.split,
    tags: plan.tags,
    stressFeatures: plan.stressFeatures,
    boundaryToleranceBeats: plan.boundaryToleranceBeats,
    expectedInvariants: plan.expectedInvariants,
    sections: plan.sections,
    expectedBlocks: plan.expectedBlocks,
    expectedPatterns: plan.expectedPatterns,
    variants,
  });
}

const manifest = {
  format: "loop-vault-long-form-corpus-v1.1",
  generatorVersion: "loop-vault-p412-longform-v1",
  ppq: 480,
  timeSignature: "4/4",
  description:
    "Long-form companion to Synthetic Gold Corpus v1. Every file is 96 to 192 bars so repeat counts behave as they do in real songs.",
  limitations: [
    "Gold by construction; not an independent expert transcription.",
    "One generator produced both the audio and the labels.",
    "Filler material uses a seven-chord cycle so it forms no 2/4/8/16-bar repeat; real songs are not so tidy.",
  ],
  scenarios,
};

await writeFile(resolve(corpusRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(resolve(corpusRoot, "splits.json"), `${JSON.stringify(splits, null, 2)}\n`, "utf8");

await mkdir(resolve(fingerprintPath, ".."), { recursive: true });
await writeFile(
  fingerprintPath,
  `${JSON.stringify({
    schemaVersion: 1,
    stage: "P4.1.2-A1",
    format: manifest.format,
    generatorVersion: manifest.generatorVersion,
    corpusLocation: ".local-evaluation/long-form-v1.1 (not committed)",
    scenarioCount: LONG_FORM_SCENARIOS.length,
    fileCount: fingerprints.length,
    barRange: [MIN_BARS, MAX_BARS],
    splits: Object.fromEntries(Object.entries(splits).map(([name, files]) => [name, files.length])),
    // Fingerprints only: the MIDI itself is regenerated from this repository.
    files: fingerprints,
  }, null, 2)}\n`,
  "utf8",
);

stdout.write(`wrote ${fingerprints.length} files across ${LONG_FORM_SCENARIOS.length} scenarios\n`);
for (const [name, files] of Object.entries(splits)) {
  stdout.write(`  ${name.padEnd(12)} ${files.length} files\n`);
}
for (const scenario of scenarios) {
  stdout.write(
    `  ${scenario.scenarioId} ${String(scenario.title).padEnd(30)} `
    + `${String(scenario.bars).padStart(3)} bars  ${scenario.split}\n`,
  );
}
