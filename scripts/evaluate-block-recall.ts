import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import type { ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";

/**
 * Block recall for the `no-block-recall-regression` gate.
 *
 * Each corpus case is one generated progression, so its ground-truth block is
 * the whole clip: bars 1..N. Recall asks whether the candidate list contains a
 * block overlapping that span at the given IoU, which is what a user needs in
 * order to save the progression without rebuilding it by hand.
 */
const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const outputDir = resolve(cwd(), "docs/phase4.0");
const outputName = optionValue("--output") ?? "block-recall-report.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;
const modes: MidiAnalyzerMode[] = ["legacy", "legacy-boundary-rerank", "voice-aware-rerank-v1", "phase4-v1"];

function iou(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const intersection = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart) + 1);
  if (intersection === 0) return 0;
  const union = (aEnd - aStart + 1) + (bEnd - bStart + 1) - intersection;
  return union > 0 ? intersection / union : 0;
}

const results: Record<string, unknown> = {};

for (const mode of modes) {
  let atFifty = 0;
  let atEighty = 0;
  let exact = 0;
  let cases = 0;
  const missed: string[] = [];

  for (const file of manifest.files) {
    const bytes = new Uint8Array(await readFile(resolve(dirname(manifestPath), file.midiFile)));
    const analysis = analyzeMidi(bytes, { mode, fileName: file.midiFile });
    const truthEnd = analysis.totalBars;
    cases += 1;

    const best = analysis.blockCandidates.reduce(
      (highest, block) => Math.max(highest, iou(1, truthEnd, block.startBar, block.endBar)),
      0,
    );
    if (best >= 0.5) atFifty += 1; else missed.push(file.caseId);
    if (best >= 0.8) atEighty += 1;
    if (best >= 0.999) exact += 1;
  }

  const ratio = (value: number) => Number((value / Math.max(1, cases)).toFixed(6));
  results[mode] = {
    caseCount: cases,
    blockRecallAtIoU50: ratio(atFifty),
    blockRecallAtIoU80: ratio(atEighty),
    exactSpanRecall: ratio(exact),
    missedAtIoU50: missed,
  };
  const row = results[mode] as { blockRecallAtIoU50: number; blockRecallAtIoU80: number; exactSpanRecall: number };
  stdout.write(`${mode.padEnd(26)} IoU50 ${(row.blockRecallAtIoU50 * 100).toFixed(1)}%  `
    + `IoU80 ${(row.blockRecallAtIoU80 * 100).toFixed(1)}%  exact ${(row.exactSpanRecall * 100).toFixed(1)}%\n`);
}

const legacy = results.legacy as { blockRecallAtIoU50: number };
const phase4 = results["phase4-v1"] as { blockRecallAtIoU50: number };
const deltaPp = (phase4.blockRecallAtIoU50 - legacy.blockRecallAtIoU50) * 100;
stdout.write(`\nphase4-v1 vs legacy at IoU50: ${deltaPp >= 0 ? "+" : ""}${deltaPp.toFixed(2)}pp `
  + `(gate tolerance 1.0pp) -> ${deltaPp >= -1 ? "PASS" : "FAIL"}\n`);

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify({
  schemaVersion: 1,
  stage: "P4.0-06",
  datasetId: manifest.recipeSha256,
  groundTruthBlock: "the whole generated clip, bars 1..totalBars",
  results,
  gate: {
    id: "no-block-recall-regression",
    metric: "blockRecallAtIoU50",
    deltaPp: Number(deltaPp.toFixed(6)),
    toleranceLossPp: 1.0,
    verdict: deltaPp >= -1 ? "PASS" : "FAIL",
  },
}, null, 2)}\n`, "utf8");
