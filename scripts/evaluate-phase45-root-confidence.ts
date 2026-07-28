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
  buildRootConfidenceRow,
  evaluateRootConfidenceBands,
  rootConfidenceGate,
  selectRootConfidenceBand,
} from "./phase45/rootConfidence";
import { buildSameRootOracleRow } from "./phase45/sameRootOracle";

interface Manifest {
  corpusVersion: string;
  files: CorpusFile[];
}

interface CorpusFile {
  fileId: string;
  path: string;
  split: "dev" | "validation" | "holdout";
  scenarioId: string;
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

const corpusDir = resolve(cwd(), "test/loop-vault-voicing-gold-corpus-v1");
const manifest = JSON.parse(
  await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
) as Manifest;
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
    const rawWindow = bestRawWindow(rawWindows, event, beatsPerBar);
    if (!item || !rawWindow) continue;
    const currentCandidates = [
      item.chord.label,
      ...item.alternatives.map((entry) => entry.chord.label),
    ];
    const oracle = buildSameRootOracleRow({
      fileId: file.fileId,
      eventId: event.eventId,
      scenarioId: file.scenarioId,
      expected: event.chordSymbol,
      currentCandidates,
      rawWindow,
    });
    rows.push(buildRootConfidenceRow({
      fileId: file.fileId,
      eventId: event.eventId,
      scenarioId: file.scenarioId,
      variant: file.variant,
      expected: event.chordSymbol,
      rawWindow,
      currentTop3RootRescue: oracle.currentRootRescue,
      oracleCanonicalGain: oracle.gainedCanonicalRescue,
      oracleRootLoss: oracle.lostRootRescue,
    }));
  }
}

const bandResults = evaluateRootConfidenceBands(rows);
const selectedBand = selectRootConfidenceBand(bandResults);
const report = {
  schemaVersion: 1,
  phase: "4.5-05",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split: "dev",
  entropy: {
    formula: "natural-log entropy of softmax(root-best-raw-scores / 0.1)",
    temperature: 0.1,
  },
  calibrationSearch: {
    usesRawMarginThreshold: false,
    preregisteredNormalizedMarginThresholds: [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2],
    preregisteredRootEntropyThresholds: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25],
    selectionRule: "widest Dev band passing every frozen root-confidence gate",
  },
  gate: rootConfidenceGate,
  selectedBand,
  highConfidenceBandExists: selectedBand !== null,
  bandResults,
  byVariant: summarizeGroup(rows, (row) => row.variant),
  byScenario: summarizeGroup(rows, (row) => row.scenarioId),
  rows,
};

await writeFile(
  resolve(cwd(), "docs/phase4.5/05-root-confidence-calibration.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.5/05-root-confidence-calibration.md"),
  `# Phase 4.5-05 D5 Root Confidence Calibration

Dev-only calibration. Raw root margin is recorded but never used directly as a threshold. The fixed search grid uses normalized margin and root entropy.

## Frozen gate

- root accuracy >= ${percent(rootConfidenceGate.minimumAccuracy)}
- Wilson 95% lower >= ${percent(rootConfidenceGate.minimumWilsonLower)}
- events >= ${rootConfidenceGate.minimumEvents}
- predicted root-loss / canonical-gain <= ${percent(rootConfidenceGate.maximumRootLossToGainRatio)}

## Selected band

${selectedBand ? [
  `- kind: ${selectedBand.band.kind}`,
  `- normalized margin threshold: ${selectedBand.band.normalizedMarginThreshold ?? "n/a"}`,
  `- root entropy threshold: ${selectedBand.band.rootEntropyThreshold ?? "n/a"}`,
  `- events: ${selectedBand.eventCount}`,
  `- root accuracy: ${percent(selectedBand.rootAccuracy)}`,
  `- Wilson 95%: ${percent(selectedBand.wilson95.lower)} - ${percent(selectedBand.wilson95.upper)}`,
  `- expected canonical gains: ${selectedBand.expectedCanonicalGains}`,
  `- expected root losses: ${selectedBand.expectedRootLosses}`,
  `- loss/gain ratio: ${format(selectedBand.rootLossToGainRatio)}`,
].join("\n") : "No preregistered high-confidence band passed every frozen gate."}

All candidate bands and per-event root scores, normalized margins, entropy, note count and quality coverage are in the JSON artifact.
`,
  "utf8",
);
stdout.write(`${JSON.stringify({
  eventCount: rows.length,
  highConfidenceBandExists: selectedBand !== null,
  selectedBand,
}, null, 2)}\n`);

function summarizeGroup<T>(
  rows: readonly T[],
  key: (row: T) => string,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return Object.fromEntries([...counts].sort((a, b) => a[0].localeCompare(b[0])));
}

function bestTimelineItem(
  timeline: readonly ChordTimelineItem[],
  event: GoldEvent,
  beatsPerBar: number,
) {
  return [...timeline].sort((left, right) =>
    itemIou(right, event, beatsPerBar) - itemIou(left, event, beatsPerBar)
    || itemStart(left, beatsPerBar) - itemStart(right, beatsPerBar))[0];
}

function bestRawWindow(
  windows: readonly LegacyWindowCandidateDiagnostic[],
  event: GoldEvent,
  beatsPerBar: number,
) {
  return [...windows].sort((left, right) =>
    windowIou(right, event, beatsPerBar) - windowIou(left, event, beatsPerBar)
    || windowStart(left, beatsPerBar) - windowStart(right, beatsPerBar))[0];
}

function itemIou(item: ChordTimelineItem, event: GoldEvent, beatsPerBar: number) {
  const start = itemStart(item, beatsPerBar);
  return intervalIou(start, start + item.durationBeats, event.startBeat, event.endBeat);
}

function windowIou(
  item: LegacyWindowCandidateDiagnostic,
  event: GoldEvent,
  beatsPerBar: number,
) {
  const start = windowStart(item, beatsPerBar);
  return intervalIou(start, start + item.durationBeats, event.startBeat, event.endBeat);
}

function itemStart(item: ChordTimelineItem, beatsPerBar: number) {
  return (item.bar - 1) * beatsPerBar + item.beat - 1;
}

function windowStart(item: LegacyWindowCandidateDiagnostic, beatsPerBar: number) {
  return (item.bar - 1) * beatsPerBar + item.beat - 1;
}

function intervalIou(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const intersection = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union > 0 ? intersection / union : 0;
}

function percent(value: number) {
  return `${(value * 100).toFixed(4)}%`;
}

function format(value: number | null) {
  return value === null ? "n/a" : value.toFixed(6);
}
