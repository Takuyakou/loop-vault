import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { chordIdentityKey, type NormalizedChordIdentity } from "../src/domain/chordIdentity";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import type { CandidateCatalog } from "../src/domain/midi/candidateCatalog";
import type { ChordTimelineItem, MidiAnalyzerMode } from "../src/domain/midi/types";
import { parseGoldLabel } from "./syntheticGoldCorpus";

/**
 * P4.1.3-M0 — what it would cost a person to repair the blocks the generator missed.
 *
 * No product code changes. The question is narrow and comes before any design:
 * when an automatic candidate does not exist for a region the user wants, is the
 * material to build it already in the Full Timeline, and how many operations
 * would it take to get from what the app offers to what the user wants?
 *
 * The regions are *discovered* — every must-show block with no exactly matching
 * occurrence in the catalog — rather than named. Hard-coding "19 bars" and
 * "22 bars" would be fitting the diagnosis to the two cases that happened to
 * fail, and the next file would fail differently.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const corpusPaths = (optionValue("--corpora")
  ?? ".local-evaluation/holdout-v3,.local-evaluation/long-form-v1.1,.local-evaluation/synthetic-gold-v1"
).split(",").filter(Boolean);
const mode = (optionValue("--mode") ?? "phase4.1.2-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/phase4.1.3/00-manual-repair-baseline.json");

interface GoldEventOut {
  startBar: number;
  startBeatAbsolute: number;
  endBeatAbsolute: number;
  primary: string;
  acceptableAlternatives: string[];
}

interface GoldBlock {
  id: string;
  start_bar: number;
  end_bar: number;
  block_type: string;
  usefulness: string;
  pattern_id: string;
}

interface Scenario {
  scenarioId: string;
  title: string;
  bars: number;
  expectedBlocks: GoldBlock[];
  variants: Array<{ fileName: string; variant: "clean" | "stress"; events: GoldEventOut[] }>;
}

const corpora: Array<{ path: string; name: string; scenarios: Scenario[] }> = [];
for (const path of corpusPaths) {
  const manifest = JSON.parse(
    await readFile(resolve(cwd(), path, "manifest.json"), "utf8"),
  ) as { scenarios: Scenario[] };
  corpora.push({ path, name: path.split(/[/\\]/).pop() ?? path, scenarios: manifest.scenarios });
}

/** Identity of a label, tolerating the gold spellings the product does not emit. */
function identityOf(label: string): string | null {
  const parsed = parseGoldLabel(label) as NormalizedChordIdentity | null;
  return parsed ? chordIdentityKey(parsed) : null;
}

/** Consecutive repeats collapse: the detector merges them by design. */
function collapse(keys: readonly string[]): string[] {
  return keys.filter((key, index) => index === 0 || key !== keys[index - 1]);
}

/**
 * Substitutions, insertions and deletions to turn `from` into `to`.
 *
 * Reported as three numbers rather than one distance because they are three
 * different user actions: replacing a chord, adding one, and removing one.
 */
function editCounts(from: readonly string[], to: readonly string[]) {
  const rows = from.length;
  const columns = to.length;
  // cost, substitutions, insertions, deletions
  type Cell = [number, number, number, number];
  const grid: Cell[][] = Array.from({ length: rows + 1 }, () => Array.from(
    { length: columns + 1 },
    () => [0, 0, 0, 0] as Cell,
  ));
  for (let row = 1; row <= rows; row += 1) grid[row][0] = [row, 0, 0, row];
  for (let column = 1; column <= columns; column += 1) grid[0][column] = [column, 0, column, 0];

  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      const same = from[row - 1] === to[column - 1];
      const diagonal = grid[row - 1][column - 1];
      const substitute: Cell = same
        ? [diagonal[0], diagonal[1], diagonal[2], diagonal[3]]
        : [diagonal[0] + 1, diagonal[1] + 1, diagonal[2], diagonal[3]];
      const above = grid[row - 1][column];
      const remove: Cell = [above[0] + 1, above[1], above[2], above[3] + 1];
      const left = grid[row][column - 1];
      const insert: Cell = [left[0] + 1, left[1], left[2] + 1, left[3]];
      grid[row][column] = [substitute, remove, insert].reduce(
        (best, option) => (option[0] < best[0] ? option : best),
      );
    }
  }
  const [, replacements, insertions, deletions] = grid[rows][columns];
  return { replacementChordCount: replacements, missingChordEventCount: insertions, extraChordEventCount: deletions };
}

function timelineInRange(
  timeline: readonly ChordTimelineItem[],
  startBar: number,
  endBar: number,
  meter: number,
) {
  const startBeat = (startBar - 1) * meter;
  const endBeat = endBar * meter;
  return timeline.filter((item) => {
    const itemStart = (item.bar - 1) * meter + item.beat - 1;
    return itemStart < endBeat && itemStart + item.durationBeats > startBeat;
  });
}

interface RegionReport {
  corpus: string;
  scenarioId: string;
  variant: string;
  fingerprint: string;
  blockId: string;
  goldStartBar: number;
  goldEndBar: number;
  goldLengthBars: number;
  goldChordSequence: string[];
  timelineChordSequence: string[];
  timelineEventCount: number;
  timelineSourceComplete: boolean;
  missingFromTimeline: string[];
  nearestCandidateBarIoU: number;
  nearestCandidateStartBar: number | null;
  nearestCandidateEndBar: number | null;
  nearestCandidateChordSequence: string[];
  boundaryAdjustmentBars: number;
  boundaryOperationCount: number;
  /** Chord edits measured against the nearest candidate, for the boundary-move path. */
  missingChordEventCount: number;
  extraChordEventCount: number;
  replacementChordCount: number;
  /** Chord edits measured against the timeline range, for the range-selection path. */
  rangeMissingChordEventCount: number;
  rangeExtraChordEventCount: number;
  rangeReplacementChordCount: number;
  splitMergeCount: number;
  manualRepairOperationCount: number | null;
  boundaryMoveOperationCount: number;
  manualRangeOperationCount: number;
  repairableWithCurrentUi: boolean;
  repairableWithin2Edits: boolean;
  repairableWithin5Edits: boolean;
}

const regions: RegionReport[] = [];

const scannedFiles: Array<{ corpus: string; files: number }> = [];

for (const corpus of corpora) {
  let filesScanned = 0;
  for (const scenario of corpus.scenarios) {
  for (const variant of scenario.variants) {
    const bytes = new Uint8Array(
      await readFile(resolve(cwd(), corpus.path, "midi", variant.fileName)),
    );
    filesScanned += 1;
    const analysis = analyzeMidi(bytes, { mode });
    const catalog = analysis.candidateCatalog as CandidateCatalog | undefined;
    if (catalog === undefined) throw new Error(`mode ${mode} produced no catalog`);
    const meter = analysis.fullTimeline.length > 0 ? 4 : 4;

    const occurrences = catalog.patterns.flatMap((pattern) => pattern.occurrences);
    const exactSpans = new Set(
      occurrences.map((occurrence) => `${occurrence.startBar}:${occurrence.endBar}`),
    );

    for (const block of scenario.expectedBlocks) {
      if (block.usefulness !== "must-show") continue;
      // Discovered, not named: only the blocks with no exact occurrence.
      if (exactSpans.has(`${block.start_bar}:${block.end_bar}`)) continue;

      const goldEvents = variant.events.filter(
        (event) => event.startBar >= block.start_bar && event.startBar <= block.end_bar,
      );
      const goldKeys = collapse(
        goldEvents.map((event) => identityOf(event.primary)).filter((key): key is string => key !== null),
      );

      const timelineItems = timelineInRange(analysis.fullTimeline, block.start_bar, block.end_bar, meter);
      const timelineKeys = collapse(
        timelineItems.map((item) => identityOf(item.chord.label)).filter((key): key is string => key !== null),
      );

      // Is the material there at all? If the Full Timeline already states every
      // chord the block needs, a range selection is enough and no chord editing
      // is required. If it is not, no amount of range selection helps and the
      // detector is the thing to fix.
      const timelineSet = new Set(timelineKeys);
      const missingFromTimeline = [...new Set(goldKeys)].filter((key) => !timelineSet.has(key));
      const timelineSourceComplete = missingFromTimeline.length === 0;

      const goldBars = block.end_bar - block.start_bar + 1;
      let bestIoU = 0;
      let best: { startBar: number; endBar: number; keys: string[] } | null = null;
      for (const occurrence of occurrences) {
        const overlap = Math.max(
          0,
          Math.min(block.end_bar, occurrence.endBar) - Math.max(block.start_bar, occurrence.startBar) + 1,
        );
        if (overlap === 0) continue;
        const union = goldBars + occurrence.lengthBars - overlap;
        const iou = overlap / union;
        if (iou > bestIoU) {
          bestIoU = iou;
          best = {
            startBar: occurrence.startBar,
            endBar: occurrence.endBar,
            keys: collapse(
              occurrence.events
                .map((event) => identityOf(event.chord.label))
                .filter((key): key is string => key !== null),
            ),
          };
        }
      }

      // Two different starting points, so two different edit counts. Charging the
      // range-selection path for the nearest candidate's mistakes would overstate
      // its cost by exactly the errors it never inherits.
      const counts = editCounts(best?.keys ?? [], goldKeys);
      const rangeCounts = editCounts(timelineKeys, goldKeys);
      const boundaryAdjustmentBars = best === null
        ? goldBars
        : Math.abs(best.startBar - block.start_bar) + Math.abs(best.endBar - block.end_bar);
      const boundaryOperationCount = best === null
        ? 2
        : (best.startBar === block.start_bar ? 0 : 1) + (best.endBar === block.end_bar ? 0 : 1);

      // A split is needed where one product event states two gold chords in a
      // row; a merge where two product events state one. Counted on the collapsed
      // sequences so a repeat is not charged as either.
      const splitMergeCount = Math.abs(timelineKeys.length - goldKeys.length);

      // The current UI can neither build a candidate from an arbitrary range nor
      // move an existing candidate's boundaries, so when the exact span is absent
      // the repair is not expressible at all — not "expensive", impossible. That
      // is recorded as null rather than as a large number.
      const repairableWithCurrentUi = bestIoU === 1;
      const manualRepairOperationCount = repairableWithCurrentUi
        ? counts.replacementChordCount + counts.missingChordEventCount + counts.extraChordEventCount
        : null;

      // What it would cost with a range-selection flow: one selection, plus any
      // chord editing the timeline does not already give for free. The chords
      // come from the timeline, not from the nearest candidate, so the candidate's
      // extra or missing event is not inherited.
      const manualRangeOperationCount = 1
        + rangeCounts.replacementChordCount
        + rangeCounts.missingChordEventCount
        + rangeCounts.extraChordEventCount;

      // The alternative design: keep automatic candidates and let the user drag
      // their edges. Costed separately so the two are comparable rather than
      // asserted.
      const boundaryMoveOperationCount = boundaryOperationCount
        + counts.replacementChordCount
        + counts.missingChordEventCount
        + counts.extraChordEventCount;

      regions.push({
        corpus: corpus.name,
        scenarioId: scenario.scenarioId,
        variant: variant.variant,
        fingerprint: fingerprintMidiBytes(bytes),
        blockId: block.id,
        goldStartBar: block.start_bar,
        goldEndBar: block.end_bar,
        goldLengthBars: goldBars,
        goldChordSequence: goldEvents.map((event) => event.primary),
        timelineChordSequence: timelineItems.map((item) => item.chord.label),
        timelineEventCount: timelineItems.length,
        timelineSourceComplete,
        missingFromTimeline,
        nearestCandidateBarIoU: Number(bestIoU.toFixed(6)),
        nearestCandidateStartBar: best?.startBar ?? null,
        nearestCandidateEndBar: best?.endBar ?? null,
        nearestCandidateChordSequence: best?.keys ?? [],
        boundaryAdjustmentBars,
        boundaryOperationCount,
        ...counts,
        rangeMissingChordEventCount: rangeCounts.missingChordEventCount,
        rangeExtraChordEventCount: rangeCounts.extraChordEventCount,
        rangeReplacementChordCount: rangeCounts.replacementChordCount,
        splitMergeCount,
        manualRepairOperationCount,
        boundaryMoveOperationCount,
        manualRangeOperationCount,
        repairableWithCurrentUi,
        repairableWithin2Edits: manualRangeOperationCount <= 2,
        repairableWithin5Edits: manualRangeOperationCount <= 5,
      });
    }
  }
  }
  scannedFiles.push({ corpus: corpus.name, files: filesScanned });
}

const report = {
  schemaVersion: 1,
  stage: "P4.1.3-M0",
  corpora: corpusPaths,
  filesScanned: scannedFiles,
  mode,
  productCodeChanged: false,
  regionSelection:
    "every must-show block with no exactly matching occurrence in the catalog, discovered per file rather than named",
  currentUiCapabilities: {
    createCandidateFromArbitraryTimelineRange: false,
    moveExistingCandidateBoundaries: false,
    replaceChordInSavedProgression: true,
    insertChordAfter: true,
    deleteChord: true,
    splitChord: true,
    mergeChords: true,
    note:
      "Chord-level editing exists (progressionEditing/splitMerge.ts, chordReplacement.ts) and is reachable "
      + "from CaptureView and ProgressionDetailView. What does not exist is any way to say which bars the "
      + "block covers: candidates arrive with fixed boundaries and the Full Timeline view only previews single chords.",
  },
  regionCount: regions.length,
  summary: {
    timelineSourceComplete: regions.filter((region) => region.timelineSourceComplete).length,
    repairableWithCurrentUi: regions.filter((region) => region.repairableWithCurrentUi).length,
    repairableWithin2Edits: regions.filter((region) => region.repairableWithin2Edits).length,
    repairableWithin5Edits: regions.filter((region) => region.repairableWithin5Edits).length,
    maxNearestCandidateBarIoU: regions.length === 0
      ? null
      : Math.max(...regions.map((region) => region.nearestCandidateBarIoU)),
    meanBoundaryMoveOperationCount: regions.length === 0
      ? null
      : Number((regions.reduce((sum, region) => sum + region.boundaryMoveOperationCount, 0) / regions.length).toFixed(4)),
    meanManualRangeOperationCount: regions.length === 0
      ? null
      : Number((regions.reduce((sum, region) => sum + region.manualRangeOperationCount, 0) / regions.length).toFixed(4)),
  },
  regions,
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`${regions.length} unmatched must-show regions\n\n`);
for (const region of regions) {
  stdout.write(
    `${region.corpus} ${region.scenarioId}_${region.variant} ${region.blockId} `
    + `bars ${region.goldStartBar}-${region.goldEndBar} (${region.goldLengthBars})\n`
    + `  timeline complete   ${region.timelineSourceComplete ? "yes" : `NO (missing ${region.missingFromTimeline.length})`}`
    + `  timeline events ${region.timelineEventCount}, gold chords ${region.goldChordSequence.length}\n`
    + `  nearest candidate   ${region.nearestCandidateStartBar}-${region.nearestCandidateEndBar}`
    + `  IoU ${region.nearestCandidateBarIoU}  boundary ${region.boundaryAdjustmentBars} bars`
    + ` (${region.boundaryOperationCount} ops)\n`
    + `  vs candidate        replace ${region.replacementChordCount}`
    + `  add ${region.missingChordEventCount}  remove ${region.extraChordEventCount}`
    + `  split/merge ${region.splitMergeCount}\n`
    + `  vs timeline range   replace ${region.rangeReplacementChordCount}`
    + `  add ${region.rangeMissingChordEventCount}  remove ${region.rangeExtraChordEventCount}\n`
    + `  current UI          ${region.repairableWithCurrentUi ? `${region.manualRepairOperationCount} ops` : "NOT EXPRESSIBLE"}`
    + `   boundary-move: ${region.boundaryMoveOperationCount} ops`
    + `   range-selection: ${region.manualRangeOperationCount} ops`
    + `  (<=2 ${region.repairableWithin2Edits ? "yes" : "no"}, <=5 ${region.repairableWithin5Edits ? "yes" : "no"})\n\n`,
  );
}
