import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { parseChordLabel } from "../src/domain/chords";
import { analyzeMidi } from "../src/domain/midi";
import {
  operationCorrectionCostResult,
  summarizeOperationCorrectionCosts,
} from "../src/domain/midi/correctionCost";
import {
  diagnoseLegacyWindowCandidates,
  type LegacyWindowCandidateDiagnostic,
} from "../src/domain/midi/legacy";
import { phase4QualityEvidence } from "../src/domain/midi/phase4Analyzer";
import type { ChordTimelineItem } from "../src/domain/types";
import {
  buildSameRootOracleRow,
  summarizeSameRootOracle,
  type SameRootOracleRow,
} from "./phase45/sameRootOracle";

interface Manifest {
  corpusVersion: string;
  files: CorpusFile[];
}

interface CorpusFile {
  fileId: string;
  path: string;
  split: "dev" | "validation" | "holdout";
  scenarioId: string;
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
const manifest = JSON.parse(
  await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
) as Manifest;
const files = manifest.files.filter((file) => file.split === "dev");
const rows: SameRootOracleRow[] = [];
const currentCorrections = [];
const oracleCorrections = [];

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
    const currentCandidates = item
      ? [item.chord.label, ...item.alternatives.map((entry) => entry.chord.label)]
      : [];
    const row = buildSameRootOracleRow({
      fileId: file.fileId,
      eventId: event.eventId,
      scenarioId: file.scenarioId,
      expected: event.chordSymbol,
      currentCandidates,
      rawWindow: bestRawWindow(rawWindows, event, beatsPerBar) ?? null,
    });
    rows.push(row);
    currentCorrections.push(correction(currentCandidates, event.chordSymbol));
    oracleCorrections.push(correction(row.oracleCandidates, event.chordSymbol));
  }
}

const metrics = summarizeSameRootOracle(rows);
const currentCorrection = summarizeOperationCorrectionCosts(currentCorrections);
const oracleCorrection = summarizeOperationCorrectionCosts(oracleCorrections);
const currentManual = manualRate(currentCorrection.byCategory, metrics.eventCount);
const oracleManual = manualRate(oracleCorrection.byCategory, metrics.eventCount);
const scenarioDelta = scenarioDeltas(rows);
const gate = {
  oracleGainMinimum: 0.03,
  oracleGainPass: metrics.oracleSameRootGain >= 0.03,
  netRescuePass: metrics.netRescueCount > 0,
  lostRootRatioMaximum: 0.25,
  lostRootRatioPass: metrics.lostRootToGainedRatio !== null
    && metrics.lostRootToGainedRatio <= 0.25,
  correctionMeanPass: oracleCorrection.mean < currentCorrection.mean,
  manualInputPass: oracleManual <= currentManual,
  rank1InvariantPass: metrics.rank1ChangeCount === 0,
};
const report = {
  schemaVersion: 1,
  phase: "4.5-04",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split: "dev",
  oracle: "A-current-primary-root-pool",
  goldUsedForAllocation: false,
  oracleB: {
    executed: false,
    reason: "D3 did not establish one allocation-editable family that justifies a separate family oracle.",
  },
  metrics: {
    ...metrics,
    currentCorrectionCost: currentCorrection,
    oracleCorrectionCost: oracleCorrection,
    correctionCostMeanDelta: oracleCorrection.mean - currentCorrection.mean,
    currentManualInputRequiredRate: currentManual,
    oracleManualInputRequiredRate: oracleManual,
    manualInputRequiredDelta: oracleManual - currentManual,
  },
  gate,
  scenarioDelta,
  changedRows: rows.filter((row) =>
    row.gainedCanonicalRescue || row.lostRootRescue),
  rows,
};

await writeFile(
  resolve(cwd(), "docs/phase4.5/04-same-root-oracle.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.5/04-same-root-oracle.md"),
  `# Phase 4.5-04 D4 Same-root Oracle

Oracle A keeps the current rank 1 byte-for-byte and replaces slots 2-3 with the highest raw-score canonical identities from rank 1's root pool. Gold labels are used only for evaluation.

| Metric | Current | Oracle | Delta |
|---|---:|---:|---:|
| Top-3 canonical | ${percent(metrics.currentTop3Canonical)} | ${percent(metrics.oracleSameRootTop3Canonical)} | ${signedPercent(metrics.oracleSameRootGain)} |
| Top-3 root | ${percent(metrics.currentTop3Root)} | ${percent(metrics.oracleTop3Root)} | ${signedPercent(metrics.top3RootDelta)} |
| MRR | ${metrics.currentMRR.toFixed(6)} | ${metrics.oracleMRR.toFixed(6)} | ${signed(metrics.MRRDelta)} |
| correction mean | ${currentCorrection.mean.toFixed(6)} | ${oracleCorrection.mean.toFixed(6)} | ${signed(oracleCorrection.mean - currentCorrection.mean)} |
| manual input | ${percent(currentManual)} | ${percent(oracleManual)} | ${signedPercent(oracleManual - currentManual)} |

- gained canonical rescue: ${metrics.gainedCanonicalRescueCount}
- lost root rescue: ${metrics.lostRootRescueCount}
- net rescue: ${metrics.netRescueCount}
- lost-root / gained ratio: ${format(metrics.lostRootToGainedRatio)}
- rank 1 changes: ${metrics.rank1ChangeCount}

## Frozen gate

${Object.entries(gate).map(([name, value]) => `- ${name}: ${value}`).join("\n")}

Oracle B was not executed: D3 did not establish one allocation-editable family that warrants a Gold-independent family-specific oracle.
`,
  "utf8",
);
stdout.write(`${JSON.stringify(report.metrics, null, 2)}\n`);

function correction(labels: readonly string[], expected: string) {
  const primary = labels[0] ? parseChordLabel(labels[0]) : null;
  return operationCorrectionCostResult(primary ? {
    primary,
    alternatives: labels.slice(1),
  } : undefined, [expected]);
}

function manualRate(
  categories: Record<"primary" | "alternative" | "structure-editor" | "manual-input" | "unrepresentable", number>,
  count: number,
): number {
  return count === 0 ? 0 : (categories["manual-input"] + categories.unrepresentable) / count;
}

function scenarioDeltas(rows: readonly SameRootOracleRow[]) {
  const result: Record<string, { gains: number; losses: number }> = {};
  for (const row of rows) {
    const entry = result[row.scenarioId] ?? { gains: 0, losses: 0 };
    if (row.gainedCanonicalRescue) entry.gains += 1;
    if (row.lostRootRescue) entry.losses += 1;
    result[row.scenarioId] = entry;
  }
  return result;
}

function bestTimelineItem(
  timeline: readonly ChordTimelineItem[],
  event: GoldEvent,
  beatsPerBar: number,
) {
  return [...timeline].sort((left, right) =>
    iouScore(right, event, beatsPerBar) - iouScore(left, event, beatsPerBar)
    || timelineStart(left, beatsPerBar) - timelineStart(right, beatsPerBar))[0];
}

function bestRawWindow(
  windows: readonly LegacyWindowCandidateDiagnostic[],
  event: GoldEvent,
  beatsPerBar: number,
) {
  return [...windows].sort((left, right) =>
    rawIouScore(right, event, beatsPerBar) - rawIouScore(left, event, beatsPerBar)
    || rawStart(left, beatsPerBar) - rawStart(right, beatsPerBar))[0];
}

function iouScore(item: ChordTimelineItem, event: GoldEvent, beatsPerBar: number) {
  const start = timelineStart(item, beatsPerBar);
  return intervalIou(start, start + item.durationBeats, event.startBeat, event.endBeat);
}

function rawIouScore(
  item: LegacyWindowCandidateDiagnostic,
  event: GoldEvent,
  beatsPerBar: number,
) {
  const start = rawStart(item, beatsPerBar);
  return intervalIou(start, start + item.durationBeats, event.startBeat, event.endBeat);
}

function timelineStart(item: ChordTimelineItem, beatsPerBar: number) {
  return (item.bar - 1) * beatsPerBar + (item.beat - 1);
}

function rawStart(item: LegacyWindowCandidateDiagnostic, beatsPerBar: number) {
  return (item.bar - 1) * beatsPerBar + (item.beat - 1);
}

function intervalIou(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const intersection = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union > 0 ? intersection / union : 0;
}

function percent(value: number) {
  return `${(value * 100).toFixed(4)}%`;
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(4)}pp`;
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(6)}`;
}

function format(value: number | null) {
  return value === null ? "n/a" : value.toFixed(6);
}
