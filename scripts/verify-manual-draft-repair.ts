import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { chordIdentityKey, type NormalizedChordIdentity } from "../src/domain/chordIdentity";
import { createManualDraft } from "../src/domain/midi/manualDraft";
import { draftEditable, validateDraft } from "../src/domain/midi/manualDraftEditing";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";
import { parseGoldLabel } from "./syntheticGoldCorpus";

/**
 * Do the ten regions M0 found actually reach the editor, and what does repairing
 * them cost once they are there?
 *
 * M0 predicted the cost and M1 checked the range function in isolation. This
 * checks the whole path a user would take: select the range, get a draft, open
 * it in the editor, and see how many chords still need changing.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const baselinePath = optionValue("--baseline") ?? "docs/phase4.1.3/00-manual-repair-baseline.json";
const mode = (optionValue("--mode") ?? "phase4.1.2-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/phase4.1.3/03-manual-draft-repair.json");

interface BaselineRegion {
  corpus: string;
  scenarioId: string;
  variant: string;
  blockId: string;
  goldStartBar: number;
  goldEndBar: number;
  goldChordSequence: string[];
  timelineSourceComplete: boolean;
}

const baseline = JSON.parse(await readFile(resolve(cwd(), baselinePath), "utf8")) as {
  corpora: string[];
  regions: BaselineRegion[];
};

const fileOf = new Map<string, { corpusPath: string; fileName: string }>();
for (const corpusPath of baseline.corpora) {
  const manifest = JSON.parse(
    await readFile(resolve(cwd(), corpusPath, "manifest.json"), "utf8"),
  ) as { scenarios: Array<{ scenarioId: string; variants: Array<{ fileName: string; variant: string }> }> };
  const name = corpusPath.split(/[/\\]/).pop() ?? corpusPath;
  for (const scenario of manifest.scenarios) {
    for (const variant of scenario.variants) {
      fileOf.set(`${name}:${scenario.scenarioId}:${variant.variant}`, {
        corpusPath, fileName: variant.fileName,
      });
    }
  }
}

const identityOf = (label: string) => {
  const parsed = parseGoldLabel(label) as NormalizedChordIdentity | null;
  return parsed ? chordIdentityKey(parsed) : null;
};
const collapse = (keys: readonly string[]) => keys.filter(
  (key, index) => index === 0 || key !== keys[index - 1],
);

interface Row {
  corpus: string;
  scenarioId: string;
  variant: string;
  blockId: string;
  lengthBars: number;
  reachesEditor: boolean;
  editorSlotCount: number;
  canSave: boolean;
  validationErrors: number;
  validationWarnings: number;
  matchesGold: boolean;
  chordEditsStillNeeded: number;
  rangeSelections: number;
  totalOperations: number;
}

const rows: Row[] = [];

for (const region of baseline.regions) {
  const located = fileOf.get(`${region.corpus}:${region.scenarioId}:${region.variant}`);
  if (!located) throw new Error(`no file for ${region.scenarioId}`);
  const bytes = new Uint8Array(
    await readFile(resolve(cwd(), located.corpusPath, "midi", located.fileName)),
  );
  const analysis = analyzeMidi(bytes, { mode });

  const draft = createManualDraft({
    timeline: analysis.fullTimeline,
    range: {
      startBar: region.goldStartBar, startBeat: 1, endBar: region.goldEndBar, endBeat: 4,
    },
    now: "2026-07-26T00:00:00.000Z",
  });
  const editable = draftEditable(draft);
  const validation = validateDraft(draft);

  const built = collapse(
    draft.events.map((event) => identityOf(event.chord.label))
      .filter((key): key is string => key !== null),
  );
  const gold = collapse(
    region.goldChordSequence.map(identityOf).filter((key): key is string => key !== null),
  );
  const matched = built.filter((key, index) => key === gold[index]).length;
  const chordEditsStillNeeded = Math.max(built.length, gold.length) - matched;

  rows.push({
    corpus: region.corpus,
    scenarioId: region.scenarioId,
    variant: region.variant,
    blockId: region.blockId,
    lengthBars: draft.lengthBars,
    reachesEditor: editable.slots.length > 0,
    editorSlotCount: editable.slots.length,
    canSave: validation.canSave,
    validationErrors: validation.errors.length,
    validationWarnings: validation.warnings.length,
    matchesGold: chordEditsStillNeeded === 0,
    chordEditsStillNeeded,
    rangeSelections: 1,
    totalOperations: 1 + chordEditsStillNeeded,
  });
}

const report = {
  schemaVersion: 1,
  stage: "P4.1.3-M3",
  mode,
  baseline: baselinePath,
  regionCount: rows.length,
  summary: {
    reachesEditor: rows.filter((row) => row.reachesEditor).length,
    canSave: rows.filter((row) => row.canSave).length,
    matchesGold: rows.filter((row) => row.matchesGold).length,
    zeroChordEdits: rows.filter((row) => row.chordEditsStillNeeded === 0).length,
    withinTwoOperations: rows.filter((row) => row.totalOperations <= 2).length,
    withinFiveOperations: rows.filter((row) => row.totalOperations <= 5).length,
    meanOperations: Number((rows.reduce(
      (sum, row) => sum + row.totalOperations, 0,
    ) / rows.length).toFixed(4)),
    medianOperations: [...rows]
      .map((row) => row.totalOperations)
      .sort((left, right) => left - right)[Math.floor(rows.length / 2)],
  },
  rows,
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`${rows.length} regions taken through select -> draft -> editor\n\n`);
for (const row of rows) {
  stdout.write(
    `  ${row.corpus} ${row.scenarioId}_${row.variant} ${row.blockId} `
    + `${row.lengthBars} bars  editor ${row.editorSlotCount} slots  `
    + `${row.matchesGold ? "matches gold" : `${row.chordEditsStillNeeded} chord edits left`}  `
    + `save ${row.canSave ? "ok" : "BLOCKED"}  total ${row.totalOperations} ops\n`,
  );
}
stdout.write(
  `\nreaches editor ${report.summary.reachesEditor}/${rows.length}`
  + `  matches gold ${report.summary.matchesGold}/${rows.length}`
  + `  <=2 ops ${report.summary.withinTwoOperations}/${rows.length}`
  + `  mean ${report.summary.meanOperations}\n`,
);
