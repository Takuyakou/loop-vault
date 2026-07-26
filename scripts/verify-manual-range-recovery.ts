import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { chordIdentityKey, type NormalizedChordIdentity } from "../src/domain/chordIdentity";
import { createCandidateFromTimelineRange } from "../src/domain/midi/manualRange";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";
import { parseGoldLabel } from "./syntheticGoldCorpus";

/**
 * Does the M1 range function actually recover the blocks M0 said it would?
 *
 * M0 measured that the chords were present and predicted one operation would be
 * enough. This checks the prediction rather than trusting it: for every region
 * M0 found, build the candidate from the gold range and compare its chord
 * sequence to the gold sequence. A prediction that is only ever cited and never
 * tested is how an estimate becomes a claim.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const baselinePath = optionValue("--baseline") ?? "docs/phase4.1.3/00-manual-repair-baseline.json";
const mode = (optionValue("--mode") ?? "phase4.1.2-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/phase4.1.3/01-manual-range-recovery.json");

interface BaselineRegion {
  corpus: string;
  scenarioId: string;
  variant: string;
  blockId: string;
  goldStartBar: number;
  goldEndBar: number;
  goldChordSequence: string[];
  timelineSourceComplete: boolean;
  manualRangeOperationCount: number;
}

const baseline = JSON.parse(await readFile(resolve(cwd(), baselinePath), "utf8")) as {
  corpora: string[];
  regions: BaselineRegion[];
};

interface Scenario {
  scenarioId: string;
  variants: Array<{ fileName: string; variant: string }>;
}

const fileOf = new Map<string, { corpusPath: string; fileName: string }>();
for (const corpusPath of baseline.corpora) {
  const manifest = JSON.parse(
    await readFile(resolve(cwd(), corpusPath, "manifest.json"), "utf8"),
  ) as { scenarios: Scenario[] };
  const name = corpusPath.split(/[/\\]/).pop() ?? corpusPath;
  for (const scenario of manifest.scenarios) {
    for (const variant of scenario.variants) {
      fileOf.set(`${name}:${scenario.scenarioId}:${variant.variant}`, {
        corpusPath, fileName: variant.fileName,
      });
    }
  }
}

function identityOf(label: string): string | null {
  const parsed = parseGoldLabel(label) as NormalizedChordIdentity | null;
  return parsed ? chordIdentityKey(parsed) : null;
}

const collapse = (keys: readonly string[]) => keys.filter(
  (key, index) => index === 0 || key !== keys[index - 1],
);

interface RecoveryRow {
  corpus: string;
  scenarioId: string;
  variant: string;
  blockId: string;
  startBar: number;
  endBar: number;
  lengthBars: number;
  candidateEventCount: number;
  goldChordCount: number;
  chordSequenceMatchesGold: boolean;
  mismatchIndex: number | null;
  predictedOperations: number;
  observedChordEdits: number;
  observedOperations: number;
  predictionHeld: boolean;
  warnings: string[];
}

const rows: RecoveryRow[] = [];

for (const region of baseline.regions) {
  const located = fileOf.get(`${region.corpus}:${region.scenarioId}:${region.variant}`);
  if (!located) throw new Error(`no file for ${region.corpus}:${region.scenarioId}:${region.variant}`);
  const bytes = new Uint8Array(
    await readFile(resolve(cwd(), located.corpusPath, "midi", located.fileName)),
  );
  const analysis = analyzeMidi(bytes, { mode });

  const candidate = createCandidateFromTimelineRange({
    timeline: analysis.fullTimeline,
    startBar: region.goldStartBar,
    startBeat: 1,
    endBar: region.goldEndBar,
    endBeat: 4,
  });

  const built = collapse(
    candidate.events
      .map((event) => identityOf(event.chord.label))
      .filter((key): key is string => key !== null),
  );
  const gold = collapse(
    region.goldChordSequence
      .map((label) => identityOf(label))
      .filter((key): key is string => key !== null),
  );

  let mismatchIndex: number | null = null;
  for (let index = 0; index < Math.max(built.length, gold.length); index += 1) {
    if (built[index] !== gold[index]) { mismatchIndex = index; break; }
  }
  const matches = mismatchIndex === null;
  // Every position that would still need a chord edit after the selection.
  const observedChordEdits = matches
    ? 0
    : Math.max(built.length, gold.length) - built.filter((key, index) => key === gold[index]).length;

  rows.push({
    corpus: region.corpus,
    scenarioId: region.scenarioId,
    variant: region.variant,
    blockId: region.blockId,
    startBar: candidate.startBar,
    endBar: candidate.endBar,
    lengthBars: candidate.lengthBars,
    candidateEventCount: candidate.events.length,
    goldChordCount: region.goldChordSequence.length,
    chordSequenceMatchesGold: matches,
    mismatchIndex,
    predictedOperations: region.manualRangeOperationCount,
    observedChordEdits,
    observedOperations: 1 + observedChordEdits,
    predictionHeld: 1 + observedChordEdits === region.manualRangeOperationCount,
    warnings: candidate.warnings,
  });
}

const report = {
  schemaVersion: 1,
  stage: "P4.1.3-M1",
  mode,
  baseline: baselinePath,
  regionCount: rows.length,
  summary: {
    chordSequenceMatchesGold: rows.filter((row) => row.chordSequenceMatchesGold).length,
    predictionHeld: rows.filter((row) => row.predictionHeld).length,
    oneOperation: rows.filter((row) => row.observedOperations === 1).length,
    withinTwoOperations: rows.filter((row) => row.observedOperations <= 2).length,
  },
  rows,
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`${rows.length} regions rebuilt from their range\n\n`);
for (const row of rows) {
  stdout.write(
    `  ${row.corpus} ${row.scenarioId}_${row.variant} ${row.blockId} `
    + `${row.startBar}-${row.endBar} (${row.lengthBars} bars)  `
    + `${row.chordSequenceMatchesGold ? "matches gold" : `differs at ${row.mismatchIndex}`}  `
    + `predicted ${row.predictedOperations} ops, observed ${row.observedOperations}`
    + `${row.predictionHeld ? "" : "  <- prediction did not hold"}\n`,
  );
}
stdout.write(`\nmatches gold ${report.summary.chordSequenceMatchesGold}/${rows.length}`
  + `  one operation ${report.summary.oneOperation}/${rows.length}`
  + `  prediction held ${report.summary.predictionHeld}/${rows.length}\n`);
