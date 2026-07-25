import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import {
  buildCandidateEvents, candidateStats, type CandidateDensityClass,
} from "../src/domain/midi/candidateBlock";
import type { ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import { beatsPerBar } from "../src/domain/midi/timing";

/**
 * P4.0-04 density recall.
 *
 * Checks that low-density blocks survive selection. v1 gave a bonus for having
 * more distinct chords, so a one-chord vamp or a two-to-five chord loop was
 * ranked below busier blocks purely for being sparse. This measures, per density
 * class, how often a class that exists in the raw candidates also appears in the
 * final list.
 */
const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const outputDir = resolve(cwd(), "docs/phase4.0");
const outputName = optionValue("--output") ?? "density-recall-report.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;
const classes: readonly CandidateDensityClass[] = ["vamp", "compact", "standard", "dense"];

const rawCounts = new Map<CandidateDensityClass, number>();
const selectedCounts = new Map<CandidateDensityClass, number>();
const availableCases = new Map<CandidateDensityClass, number>();
const recalledCases = new Map<CandidateDensityClass, number>();
const lengthCounts = new Map<number, number>();
let totalRaw = 0;
let totalSelected = 0;

for (const file of manifest.files) {
  const bytes = new Uint8Array(await readFile(resolve(dirname(manifestPath), file.midiFile)));
  const analysis = analyzeMidi(bytes, { mode: "legacy", fileName: file.midiFile });
  const barLength = beatsPerBar(analysis.timeSignature);

  const rawClasses = new Set<CandidateDensityClass>();
  for (const lengthBars of [2, 4, 8, 16] as const) {
    if (analysis.totalBars < lengthBars) continue;
    for (let start = 1; start <= analysis.totalBars - lengthBars + 1; start += 1) {
      const events = buildCandidateEvents(analysis.fullTimeline, start, lengthBars, barLength);
      if (!events.length) continue;
      const density = candidateStats(events, lengthBars).densityClass;
      rawCounts.set(density, (rawCounts.get(density) ?? 0) + 1);
      rawClasses.add(density);
      totalRaw += 1;
    }
  }

  const selectedClasses = new Set<CandidateDensityClass>();
  for (const block of analysis.blockCandidates) {
    const density = block.stats?.densityClass;
    if (!density) continue;
    selectedCounts.set(density, (selectedCounts.get(density) ?? 0) + 1);
    selectedClasses.add(density);
    lengthCounts.set(block.lengthBars, (lengthCounts.get(block.lengthBars) ?? 0) + 1);
    totalSelected += 1;
  }

  for (const density of rawClasses) {
    availableCases.set(density, (availableCases.get(density) ?? 0) + 1);
    if (selectedClasses.has(density)) {
      recalledCases.set(density, (recalledCases.get(density) ?? 0) + 1);
    }
  }
}

const ratio = (value: number, total: number) => (total <= 0 ? 0 : Number((value / total).toFixed(6)));

const report = {
  schemaVersion: 1,
  stage: "P4.0-04",
  datasetId: manifest.recipeSha256,
  caseCount: manifest.files.length,
  totals: { rawBlocks: totalRaw, selectedBlocks: totalSelected },
  byDensityClass: Object.fromEntries(classes.map((density) => {
    const available = availableCases.get(density) ?? 0;
    const recalled = recalledCases.get(density) ?? 0;
    return [density, {
      rawBlocks: rawCounts.get(density) ?? 0,
      selectedBlocks: selectedCounts.get(density) ?? 0,
      casesWhereClassExists: available,
      casesWhereClassSelected: recalled,
      densityClassRecall: ratio(recalled, available),
    }];
  })),
  selectedLengthDistribution: Object.fromEntries(
    [...lengthCounts].sort((left, right) => left[0] - right[0]),
  ),
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`raw blocks ${totalRaw}, selected ${totalSelected}\n`);
for (const density of classes) {
  const row = report.byDensityClass[density];
  stdout.write(`  ${density.padEnd(9)} raw ${String(row.rawBlocks).padStart(4)}  selected ${String(row.selectedBlocks).padStart(3)}  `
    + `recall ${(row.densityClassRecall * 100).toFixed(1)}% (${row.casesWhereClassSelected}/${row.casesWhereClassExists} cases)\n`);
}
stdout.write(`selected lengths: ${JSON.stringify(report.selectedLengthDistribution)}\n`);
