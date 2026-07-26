import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { encodeMidi, realiseScenario, sha256Hex } from "./longFormCorpus";
import { HOLDOUT_V3_SCENARIOS } from "./holdoutV3Scenarios";

/**
 * Writes holdout-v3: eight scenarios, clean and stress, sixteen files.
 *
 * Generated after the H0-H3 contracts, thresholds and implementation are frozen,
 * and evaluated once. The MIDI stays outside git; only fingerprints are committed
 * so the corpus can be rebuilt from this repository and checked byte for byte.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const corpusRoot = resolve(cwd(), optionValue("--out") ?? ".local-evaluation/holdout-v3");
const fingerprintPath = resolve(
  cwd(),
  optionValue("--fingerprints") ?? "docs/phase4.1.2-h/04-holdout-v3-corpus.json",
);

await mkdir(resolve(corpusRoot, "midi"), { recursive: true });

const scenarios: Array<Record<string, unknown>> = [];
const fingerprints: Array<Record<string, unknown>> = [];

for (const plan of HOLDOUT_V3_SCENARIOS) {
  const bars = plan.bars.length;
  for (const block of plan.expectedBlocks) {
    if (block.start_bar < 1 || block.end_bar > bars) {
      throw new Error(`${plan.scenarioId} block ${block.id} outside 1-${bars}`);
    }
  }
  for (const pattern of plan.expectedPatterns) {
    for (const occurrence of pattern.occurrences) {
      if (occurrence.startBar < 1 || occurrence.endBar > bars) {
        throw new Error(`${plan.scenarioId} pattern ${pattern.pattern_id} outside 1-${bars}`);
      }
    }
  }

  const variants: Array<Record<string, unknown>> = [];
  for (const variant of ["clean", "stress"] as const) {
    const { notes, events, stress } = realiseScenario(plan, variant);
    const bytes = encodeMidi(plan, notes, stress);
    const fileName = `${plan.scenarioId}_${plan.title}_${variant}.mid`;
    await writeFile(resolve(corpusRoot, "midi", fileName), bytes);
    variants.push({ fileName, sha256: sha256Hex(bytes), bytes: bytes.length, variant, events });
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
  format: "loop-vault-holdout-v3",
  generatorVersion: "loop-vault-p412-h4-holdout-v3",
  ppq: 480,
  timeSignature: "4/4",
  description:
    "Held-out companion to Long-form Corpus v1.1, built from different keys, "
    + "section lengths and layouts, generated after H0-H3 were frozen and run once.",
  limitations: [
    "Gold by construction; not an independent expert transcription.",
    "One generator produced both the material and the labels.",
    "Held-out from tuning, not from the generator's own habits.",
  ],
  scenarios,
};

await writeFile(resolve(corpusRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

await mkdir(resolve(fingerprintPath, ".."), { recursive: true });
await writeFile(
  fingerprintPath,
  `${JSON.stringify({
    schemaVersion: 1,
    stage: "P4.1.2-H4",
    format: manifest.format,
    generatorVersion: manifest.generatorVersion,
    corpusLocation: ".local-evaluation/holdout-v3 (not committed)",
    scenarioCount: HOLDOUT_V3_SCENARIOS.length,
    fileCount: fingerprints.length,
    files: fingerprints,
  }, null, 2)}\n`,
  "utf8",
);

stdout.write(`wrote ${fingerprints.length} files across ${HOLDOUT_V3_SCENARIOS.length} scenarios\n`);
for (const scenario of scenarios) {
  stdout.write(
    `  ${scenario.scenarioId} ${String(scenario.title).padEnd(34)} `
    + `${String(scenario.bars).padStart(3)} bars  ${scenario.bpm} bpm\n`,
  );
}
