import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  chordIdentityKey,
  normalizeChordLabel,
} from "../src/domain/chordIdentity";
import { analyzeMidi } from "../src/domain/midi";
import type { ChordTimelineItem } from "../src/domain/types";

interface Manifest {
  corpusVersion: string;
  files: CorpusFile[];
}

interface CorpusFile {
  fileId: string;
  path: string;
  split: "dev" | "validation" | "holdout";
  scenarioId: string;
  scenarioSlug: string;
  variant: "clean" | "stress";
  timeSignature: { numerator: number; denominator: number };
  events: GoldEvent[];
}

interface GoldEvent {
  eventId: string;
  startBeat: number;
  endBeat: number;
  chordSymbol: string;
}

interface FunnelReport {
  metrics: Record<string, unknown>;
  rows: Array<{
    fileId: string;
    eventId: string;
    expected: string;
    firstDropStage: string | null;
  }>;
}

const corpusDir = resolve(cwd(), "test/loop-vault-voicing-gold-corpus-v1");
const manifest = JSON.parse(
  await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
) as Manifest;
const funnel = JSON.parse(
  await readFile(
    resolve(cwd(), "docs/phase4.5/02-candidate-recall-funnel.json"),
    "utf8",
  ),
) as FunnelReport;
const files = manifest.files.filter((file) => file.split === "dev");
const fileById = new Map(files.map((file) => [file.fileId, file]));
const rank1Hash = createHash("sha256");
const top3Hash = createHash("sha256");
const productCandidateHash = createHash("sha256");
const analyzerHash = createHash("sha256");
const candidateCounts: number[] = [];
let duplicateCanonicalIdentityCount = 0;
let eventCount = 0;
let peakHeapDeltaBytes = 0;
const heapStart = process.memoryUsage().heapUsed;
const startedAt = performance.now();

for (const file of files) {
  const bytes = new Uint8Array(await readFile(resolve(corpusDir, file.path)));
  const analysis = analyzeMidi(bytes, { mode: "phase4-v1", fileName: file.path });
  analyzerHash.update(JSON.stringify(analysis));
  peakHeapDeltaBytes = Math.max(
    peakHeapDeltaBytes,
    process.memoryUsage().heapUsed - heapStart,
  );
  const beatsPerBar = file.timeSignature.numerator * (4 / file.timeSignature.denominator);
  for (const event of file.events) {
    const item = bestTimelineItem(analysis.fullTimeline, event, beatsPerBar);
    const candidates = item
      ? [item.chord, ...item.alternatives.map((entry) => entry.chord)]
      : [];
    const candidateScores = item
      ? [item.confidence, ...item.alternatives.map((entry) => entry.confidence)]
      : [];
    const top3 = candidates.slice(0, 3);
    rank1Hash.update(JSON.stringify({
      fileId: file.fileId,
      eventId: event.eventId,
      chord: candidates[0]?.label ?? null,
      score: candidateScores[0] ?? null,
    }));
    top3Hash.update(JSON.stringify({
      fileId: file.fileId,
      eventId: event.eventId,
      candidates: top3.map((chord, index) => ({
        label: chord.label,
        score: candidateScores[index],
      })),
    }));
    productCandidateHash.update(JSON.stringify({
      fileId: file.fileId,
      eventId: event.eventId,
      candidates: candidates.map((chord, index) => ({
        label: chord.label,
        score: candidateScores[index],
      })),
    }));
    candidateCounts.push(candidates.length);
    const keys = candidates.flatMap((chord) => {
      const identity = normalizeChordLabel(chord.label);
      return identity ? [chordIdentityKey(identity)] : [];
    });
    duplicateCanonicalIdentityCount += keys.length - new Set(keys).size;
    eventCount += 1;
  }
}

const runtimeMs = performance.now() - startedAt;
const missing = funnel.rows.filter((row) => row.firstDropStage === "raw-generation");
const familyLabels = [...new Set(funnel.rows.map((row) => row.expected))].sort();
const familyStats = familyLabels.map((label) => {
  const all = funnel.rows.filter((row) => row.expected === label);
  const absent = missing.filter((row) => row.expected === label);
  const scenarios = new Set(absent.flatMap((row) => {
    const file = fileById.get(row.fileId);
    return file ? [file.scenarioId] : [];
  }));
  const cleanMissing = absent.filter((row) =>
    fileById.get(row.fileId)?.variant === "clean").length;
  const stressMissing = absent.filter((row) =>
    fileById.get(row.fileId)?.variant === "stress").length;
  return {
    label,
    goldCount: all.length,
    missingCount: absent.length,
    missingRate: all.length === 0 ? 0 : absent.length / all.length,
    uniqueScenarioCount: scenarios.size,
    cleanMissing,
    stressMissing,
  };
});
const report = {
  schemaVersion: 1,
  phase: "4.6-00",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split: "dev",
  files: files.length,
  eventCount,
  recallFunnel: funnel.metrics,
  missingRawCandidateCount: missing.length,
  familyStats,
  productInvariants: {
    rank1Hash: rank1Hash.digest("hex"),
    top3Hash: top3Hash.digest("hex"),
    productCandidateHash: productCandidateHash.digest("hex"),
    analyzerOutputHash: analyzerHash.digest("hex"),
    candidateCount: {
      total: candidateCounts.reduce((sum, value) => sum + value, 0),
      mean: mean(candidateCounts),
      minimum: Math.min(...candidateCounts),
      maximum: Math.max(...candidateCounts),
    },
    canonicalDuplicateCount: duplicateCanonicalIdentityCount,
  },
  performance: {
    runtimeMs,
    runtimePerEventMs: eventCount === 0 ? 0 : runtimeMs / eventCount,
    peakHeapDeltaBytes: Math.max(0, peakHeapDeltaBytes),
  },
};

await writeFile(
  resolve(cwd(), "docs/phase4.6/00-baseline.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.6/00-baseline.md"),
  `# Phase 4.6-00 Baseline

Dev ${files.length} MIDI / ${eventCount} events. Product \`phase4-v1\` was rerun without Shadow candidates.

## Recall Funnel

- raw / canonical / eligible / same-root recall: ${percent(Number(funnel.metrics.rawCandidateRecall))}
- displayed Top-3 canonical: ${percent(Number(funnel.metrics.displayedTop3Canonical))}
- raw candidate missing: ${missing.length}

## Product invariant fingerprints

- rank 1 hash: \`${report.productInvariants.rank1Hash}\`
- Top-3 hash: \`${report.productInvariants.top3Hash}\`
- all product candidates + scores hash: \`${report.productInvariants.productCandidateHash}\`
- analyzer output hash: \`${report.productInvariants.analyzerOutputHash}\`
- product candidate count total / mean / min / max: ${report.productInvariants.candidateCount.total} / ${report.productInvariants.candidateCount.mean.toFixed(4)} / ${report.productInvariants.candidateCount.minimum} / ${report.productInvariants.candidateCount.maximum}
- canonical duplicate: ${duplicateCanonicalIdentityCount}

## Performance

- runtime: ${runtimeMs.toFixed(3)} ms
- runtime per event: ${report.performance.runtimePerEventMs.toFixed(6)} ms
- observed peak heap delta: ${report.performance.peakHeapDeltaBytes} bytes

Runtime and heap are environment-sensitive baselines. P4.6 compares Shadow generation in the same process and run.

## Family distribution

| Gold label | Gold | Missing | Missing rate | Scenarios | Clean / Stress missing |
|---|---:|---:|---:|---:|---:|
${familyStats.map((family) =>
    `| ${family.label} | ${family.goldCount} | ${family.missingCount} | ${percent(family.missingRate)} | ${family.uniqueScenarioCount} | ${family.cleanMissing} / ${family.stressMissing} |`)
  .join("\n")}
`,
  "utf8",
);
stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function bestTimelineItem(
  timeline: readonly ChordTimelineItem[],
  event: GoldEvent,
  beatsPerBar: number,
) {
  return [...timeline].sort((left, right) => {
    const leftStart = (left.bar - 1) * beatsPerBar + left.beat - 1;
    const rightStart = (right.bar - 1) * beatsPerBar + right.beat - 1;
    return intervalIou(
      rightStart,
      rightStart + right.durationBeats,
      event.startBeat,
      event.endBeat,
    ) - intervalIou(
      leftStart,
      leftStart + left.durationBeats,
      event.startBeat,
      event.endBeat,
    ) || leftStart - rightStart;
  })[0];
}

function intervalIou(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const intersection = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union > 0 ? intersection / union : 0;
}

function mean(values: readonly number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(value: number) {
  return `${(value * 100).toFixed(4)}%`;
}
