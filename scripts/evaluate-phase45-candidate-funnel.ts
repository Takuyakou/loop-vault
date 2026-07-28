import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi";
import {
  diagnoseLegacyWindowCandidates,
  type LegacyWindowCandidateDiagnostic,
} from "../src/domain/midi/legacy";
import { phase4QualityEvidence } from "../src/domain/midi/phase4Analyzer";
import type { ChordTimelineItem } from "../src/domain/types";
import {
  buildCandidateFunnelRow,
  summarizeCandidateFunnel,
} from "./phase45/candidateFunnel";

interface CorpusManifest {
  corpusVersion: string;
  files: CorpusFile[];
}

interface CorpusFile {
  fileId: string;
  path: string;
  split: "dev" | "validation" | "holdout";
  timeSignature: { numerator: number; denominator: number };
  events: GoldEvent[];
}

interface GoldEvent {
  eventId: string;
  startBeat: number;
  endBeat: number;
  chordSymbol: string;
}

const corpusDir = resolve(cwd(), "test/loop-vault-voicing-gold-corpus-v1");
const output = resolve(cwd(), "docs/phase4.5/02-candidate-recall-funnel.json");
const markdown = resolve(cwd(), "docs/phase4.5/02-candidate-recall-funnel.md");
const manifest = JSON.parse(
  await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
) as CorpusManifest;
const files = manifest.files.filter((file) => file.split === "dev");
const rows = [];

for (const file of files) {
  const bytes = new Uint8Array(await readFile(resolve(corpusDir, file.path)));
  const analysis = analyzeMidi(bytes, { mode: "phase4-v1", fileName: file.path });
  const rawWindows = diagnoseLegacyWindowCandidates(bytes, {
    useQualityEvidence: true,
    qualityEvidence: phase4QualityEvidence,
  });
  const beatsPerBar = file.timeSignature.numerator * (4 / file.timeSignature.denominator);

  for (const event of file.events) {
    const item = bestTimelineItem(analysis.fullTimeline, event, beatsPerBar);
    const displayedCandidates = item
      ? [item.chord.label, ...item.alternatives.map((entry) => entry.chord.label)].slice(0, 3)
      : [];
    rows.push(buildCandidateFunnelRow({
      fileId: file.fileId,
      eventId: event.eventId,
      startBeat: event.startBeat,
      endBeat: event.endBeat,
      expected: event.chordSymbol,
      detectedRank1: item?.chord.label ?? null,
      displayedCandidates,
      rawWindow: bestRawWindow(rawWindows, event, beatsPerBar) ?? null,
    }));
  }
}

const summary = summarizeCandidateFunnel(rows);
const report = {
  schemaVersion: 1,
  phase: "4.5-02",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split: "dev",
  fileCount: files.length,
  metrics: summary,
  gate: {
    minimumRecall: 0.9,
    rawCandidateRecallPass: summary.rawCandidateRecall >= 0.9,
    canonicalCandidateRecallPass: summary.canonicalCandidateRecall >= 0.9,
    eligibleCandidateRecallPass: summary.eligibleCandidateRecall >= 0.9,
    sameRootCandidateRecallPass: summary.sameRootCandidateRecall >= 0.9,
    sameRootMeanRankPass: summary.sameRootGoldMeanRank !== null
      && summary.sameRootGoldMeanRank <= 3,
  },
  missRows: rows.filter((row) => !row.funnel["allocated-top3"]),
  rows,
};

await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(markdown, `# Phase 4.5-02 D2 Candidate Recall Funnel

Dev ${files.length} MIDI / ${summary.eventCount} events. Canonical identity is used at every stage.

| Metric | Result | Frozen gate |
|---|---:|---:|
| rawCandidateRecall | ${percent(summary.rawCandidateRecall)} | >= 90% |
| canonicalCandidateRecall | ${percent(summary.canonicalCandidateRecall)} | >= 90% |
| eligibleCandidateRecall | ${percent(summary.eligibleCandidateRecall)} | >= 90% |
| sameRootCandidateRecall | ${percent(summary.sameRootCandidateRecall)} | >= 90% |
| sameRoot Gold Top-1 | ${percent(summary.sameRootGoldTop1Rate)} | diagnostic |
| sameRoot Gold Top-2 | ${percent(summary.sameRootGoldTop2Rate)} | diagnostic |
| sameRoot Gold Top-3 | ${percent(summary.sameRootGoldTop3Rate)} | diagnostic |
| sameRoot Gold mean rank | ${format(summary.sameRootGoldMeanRank)} | <= 3 |
| global Gold mean rank | ${format(summary.globalGoldMeanRank)} | diagnostic |
| displayed Top-3 canonical | ${percent(summary.displayedTop3Canonical)} | baseline |

## First drop stage

${Object.entries(summary.firstDropStageCounts)
  .map(([stage, count]) => `- ${stage}: ${count}`)
  .join("\n")}

## Decision input

The raw, canonical, eligible and same-root recalls are evaluated against the preregistered 90% gate. A failed upstream recall gate prevents allocation promotion even when a same-root oracle can improve displayed Top-3. Detailed miss rows, ranks and drop reasons are in the JSON artifact.
`, "utf8");
stdout.write(`${JSON.stringify(report.metrics, null, 2)}\n`);

function bestTimelineItem(
  timeline: readonly ChordTimelineItem[],
  event: GoldEvent,
  beatsPerBar: number,
): ChordTimelineItem | undefined {
  return [...timeline].sort((left, right) => {
    const leftStart = (left.bar - 1) * beatsPerBar + (left.beat - 1);
    const rightStart = (right.bar - 1) * beatsPerBar + (right.beat - 1);
    return intervalIou(rightStart, rightStart + right.durationBeats, event.startBeat, event.endBeat)
      - intervalIou(leftStart, leftStart + left.durationBeats, event.startBeat, event.endBeat)
      || leftStart - rightStart;
  })[0];
}

function bestRawWindow(
  windows: readonly LegacyWindowCandidateDiagnostic[],
  event: GoldEvent,
  beatsPerBar: number,
): LegacyWindowCandidateDiagnostic | undefined {
  return [...windows].sort((left, right) => {
    const leftStart = (left.bar - 1) * beatsPerBar + (left.beat - 1);
    const rightStart = (right.bar - 1) * beatsPerBar + (right.beat - 1);
    return intervalIou(rightStart, rightStart + right.durationBeats, event.startBeat, event.endBeat)
      - intervalIou(leftStart, leftStart + left.durationBeats, event.startBeat, event.endBeat)
      || leftStart - rightStart;
  })[0];
}

function intervalIou(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const intersection = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union > 0 ? intersection / union : 0;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(4)}%`;
}

function format(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(6);
}
