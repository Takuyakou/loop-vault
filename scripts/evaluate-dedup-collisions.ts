import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import {
  buildCandidateEvents, candidateStats, structuredSignature,
} from "../src/domain/midi/candidateBlock";
import type { ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import type { ChordTimelineItem } from "../src/domain/types";

/**
 * Measures how often candidate dedup used to merge structurally different
 * blocks.
 *
 * v1 keyed dedup on the per-bar summary text, so two blocks whose compressed
 * text matched were treated as the same candidate even when one of them held a
 * second chord in a bar or a differently placed change. This compares that key
 * against the v2 structured signature over the whole corpus.
 */
const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const outputDir = resolve(cwd(), "docs/phase4.0");
const outputName = optionValue("--output") ?? "dedup-collision-report.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;

/** The v1 key: one representative label per bar, joined into a display string. */
function legacySummaryKey(
  timeline: readonly ChordTimelineItem[],
  startBar: number,
  lengthBars: number,
): string {
  const labels: string[] = [];
  for (let bar = startBar; bar < startBar + lengthBars; bar += 1) {
    const starting = timeline.filter((entry) => entry.bar === bar);
    labels.push(
      [...starting].sort((left, right) =>
        right.durationBeats - left.durationBeats || right.confidence - left.confidence)[0]
        ?.chord.label ?? "N.C.",
    );
  }
  return `| ${labels.join(" | ")} |`;
}

let totalBlocks = 0;
let collidingBlocks = 0;
let lostSecondChordBars = 0;
let sustainBarsShownAsNoChord = 0;
const perCase: Array<Record<string, unknown>> = [];
const densityTally = new Map<string, number>();

for (const file of manifest.files) {
  const bytes = new Uint8Array(await readFile(resolve(dirname(manifestPath), file.midiFile)));
  const analysis = analyzeMidi(bytes, { mode: "legacy", fileName: file.midiFile });
  const timeline = analysis.fullTimeline;
  const totalBars = analysis.totalBars;

  const legacyGroups = new Map<string, Set<string>>();
  let caseBlocks = 0;
  for (const lengthBars of [4, 8, 16] as const) {
    if (totalBars < lengthBars) continue;
    for (let start = 1; start <= totalBars - lengthBars + 1; start += 1) {
      const events = buildCandidateEvents(timeline, start, lengthBars);
      const signature = structuredSignature(events);
      const legacyKey = legacySummaryKey(timeline, start, lengthBars);
      const group = legacyGroups.get(legacyKey) ?? new Set<string>();
      group.add(signature);
      legacyGroups.set(legacyKey, group);
      caseBlocks += 1;
      const density = candidateStats(events, lengthBars).densityClass;
      densityTally.set(density, (densityTally.get(density) ?? 0) + 1);
    }
  }

  // A legacy key covering more than one structure is a collision: those blocks
  // would have been deduplicated into one candidate.
  const collisions = [...legacyGroups.values()].filter((group) => group.size > 1);
  const collided = collisions.reduce((sum, group) => sum + group.size, 0);
  totalBlocks += caseBlocks;
  collidingBlocks += collided;

  let caseLostChords = 0;
  let caseSustainGaps = 0;
  for (let bar = 1; bar <= totalBars; bar += 1) {
    const starting = timeline.filter((entry) => entry.bar === bar);
    if (starting.length > 1) caseLostChords += starting.length - 1;
    if (starting.length === 0) {
      const sustaining = timeline.some((entry) => {
        const start = (entry.bar - 1) * 4 + entry.beat - 1;
        return start < bar * 4 && start + entry.durationBeats > (bar - 1) * 4;
      });
      if (sustaining) caseSustainGaps += 1;
    }
  }
  lostSecondChordBars += caseLostChords;
  sustainBarsShownAsNoChord += caseSustainGaps;

  if (collided > 0 || caseLostChords > 0 || caseSustainGaps > 0) {
    perCase.push({
      caseId: file.caseId,
      totalBars,
      blocks: caseBlocks,
      legacyCollidedBlocks: collided,
      barsLosingASecondChord: caseLostChords,
      sustainBarsLegacyShowedAsNoChord: caseSustainGaps,
    });
  }
}

const report = {
  schemaVersion: 1,
  stage: "P4.0-03",
  datasetId: manifest.recipeSha256,
  caseCount: manifest.files.length,
  totals: {
    rawBlocks: totalBlocks,
    legacyCollidedBlocks: collidingBlocks,
    legacyCollisionRate: Number((collidingBlocks / Math.max(1, totalBlocks)).toFixed(6)),
    v2CollidedBlocks: 0,
    barsLosingASecondChord: lostSecondChordBars,
    sustainBarsLegacyShowedAsNoChord: sustainBarsShownAsNoChord,
  },
  densityClassDistribution: Object.fromEntries(
    [...densityTally].sort((left, right) => right[1] - left[1]),
  ),
  affectedCases: perCase.sort((left, right) =>
    Number(right.legacyCollidedBlocks) - Number(left.legacyCollidedBlocks)
    || String(left.caseId).localeCompare(String(right.caseId))),
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`raw blocks: ${totalBlocks}\n`);
stdout.write(`legacy summary-text collisions: ${collidingBlocks} (${(report.totals.legacyCollisionRate * 100).toFixed(2)}%)\n`);
stdout.write(`bars losing a second chord under v1: ${lostSecondChordBars}\n`);
stdout.write(`sustain bars v1 rendered as N.C.: ${sustainBarsShownAsNoChord}\n`);
stdout.write(`affected cases: ${perCase.length}/${manifest.files.length}\n`);
stdout.write(`density classes: ${JSON.stringify(report.densityClassDistribution)}\n`);
