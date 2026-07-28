import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi";
import type { ChordTimelineItem } from "../src/domain/types";
import {
  bestWindow,
  diagnoseLoadedFile,
  loadPhase47Files,
  regressionCorpusDir,
} from "./phase47/evaluationShared";

interface FrozenMetrics {
  metrics: Record<string, unknown>;
  top3MissLabelCounts: Record<string, number>;
}

const { manifest, files } = await loadPhase47Files(regressionCorpusDir, "dev");
const prior = JSON.parse(
  await readFile(resolve(cwd(), "docs/phase4.5/00-baseline.json"), "utf8"),
) as FrozenMetrics;
const rank1 = createHash("sha256");
const top3 = createHash("sha256");
const candidateSet = createHash("sha256");
const analyzer = createHash("sha256");
let rawCandidateCount = 0;
let targetCount = 0;
let targetRawHit = 0;
let targetTop3Hit = 0;

for (const loaded of files) {
  const analysis = analyzeMidi(loaded.bytes, {
    mode: "phase4-v1",
    fileName: loaded.file.path,
  });
  analyzer.update(JSON.stringify(analysis));
  const windows = diagnoseLoadedFile(loaded);
  const beatsPerBar = loaded.file.timeSignature.numerator
    * (4 / loaded.file.timeSignature.denominator);
  for (const event of loaded.file.events) {
    const item = bestTimelineItem(
      analysis.fullTimeline,
      event.startBeat,
      event.endBeat,
      beatsPerBar,
    );
    const displayed = item
      ? [item.chord, ...item.alternatives.map((entry) => entry.chord)]
      : [];
    const confidences = item
      ? [item.confidence, ...item.alternatives.map((entry) => entry.confidence)]
      : [];
    const window = bestWindow(windows, event, beatsPerBar);
    rawCandidateCount += window?.candidates.length ?? 0;
    const target = event.chordSymbol === "A7b9";
    if (target) {
      targetCount += 1;
      if (window?.candidates.some((candidate) =>
        candidate.chord.label === "A7(b9)")) targetRawHit += 1;
      if (displayed.slice(0, 3).some((chord) =>
        chord.label === "A7(b9)")) targetTop3Hit += 1;
    }
    rank1.update(JSON.stringify({
      fileId: loaded.file.fileId,
      eventId: event.eventId,
      chord: displayed[0]?.label ?? null,
      confidence: confidences[0] ?? null,
    }));
    top3.update(JSON.stringify({
      fileId: loaded.file.fileId,
      eventId: event.eventId,
      candidates: displayed.slice(0, 3).map((chord, index) => ({
        label: chord.label,
        confidence: confidences[index] ?? null,
      })),
    }));
    candidateSet.update(JSON.stringify({
      fileId: loaded.file.fileId,
      eventId: event.eventId,
      candidates: window?.candidates.map((candidate) => ({
        label: candidate.chord.label,
        score: candidate.rawScore,
      })) ?? [],
    }));
  }
}

const runtimeSamples = Array.from({ length: 7 }, () => {
  const started = performance.now();
  let checksum = 0;
  for (const loaded of files) {
    checksum += analyzeMidi(loaded.bytes, {
      mode: "phase4-v1",
      fileName: loaded.file.path,
    }).fullTimeline.length;
  }
  if (checksum === 0) throw new Error("Phase 4.8 baseline produced no timeline.");
  return performance.now() - started;
});
const report = {
  schemaVersion: 1,
  phase: "4.8-00",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  fileVersion: 1,
  files: files.length,
  events: files.reduce((sum, file) => sum + file.file.events.length, 0),
  rawCandidateCount,
  hashes: {
    rank1: rank1.digest("hex"),
    top3: top3.digest("hex"),
    candidateSet: candidateSet.digest("hex"),
    analyzerOutput: analyzer.digest("hex"),
  },
  target7b9: {
    events: targetCount,
    rawRecall: targetCount === 0 ? 0 : targetRawHit / targetCount,
    top3Recall: targetCount === 0 ? 0 : targetTop3Hit / targetCount,
    missing: targetCount - targetRawHit,
  },
  productMetrics: prior.metrics,
  top3MissLabelCounts: prior.top3MissLabelCounts,
  runtime: {
    samplesMs: runtimeSamples,
    medianMs: median(runtimeSamples),
  },
  productChanged: false,
};

await Promise.all([
  writeFile(
    resolve(cwd(), "docs/phase4.8/00-baseline.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    resolve(cwd(), "docs/phase4.8/00-baseline.md"),
    `# Phase 4.8-00 Baseline

- Existing Dev: ${report.files} files / ${report.events} events
- Raw candidates: ${report.rawCandidateCount}
- A7(b9) raw / Top-3 recall: ${(report.target7b9.rawRecall * 100).toFixed(4)}% / ${(report.target7b9.top3Recall * 100).toFixed(4)}%
- A7(b9) missing: ${report.target7b9.missing}/${report.target7b9.events}
- Analyzer median runtime: ${report.runtime.medianMs.toFixed(3)} ms
- rank 1 hash: \`${report.hashes.rank1}\`
- Top-3 hash: \`${report.hashes.top3}\`
- candidate set hash: \`${report.hashes.candidateSet}\`
- Analyzer output hash: \`${report.hashes.analyzerOutput}\`

Product、score、confidence、Timeline、Vault schemaは変更していない。
`,
    "utf8",
  ),
]);
stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function bestTimelineItem(
  timeline: readonly ChordTimelineItem[],
  startBeat: number,
  endBeat: number,
  beatsPerBar: number,
) {
  return [...timeline].sort((left, right) => {
    const leftStart = (left.bar - 1) * beatsPerBar + left.beat - 1;
    const rightStart = (right.bar - 1) * beatsPerBar + right.beat - 1;
    return iou(rightStart, rightStart + right.durationBeats, startBeat, endBeat)
      - iou(leftStart, leftStart + left.durationBeats, startBeat, endBeat)
      || leftStart - rightStart;
  })[0];
}

function iou(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const intersection = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union > 0 ? intersection / union : 0;
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
