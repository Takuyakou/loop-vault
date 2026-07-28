import { Midi } from "@tonejs/midi";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { analyzeMidi } from "../src/domain/midi/analysis";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(root, "docs", "phase5");
const accuracyReportPath = resolve(outputDirectory, "00-accuracy-first-evaluation.json");
const modes = ["phase4-v1", "hybrid-v1"] as const satisfies readonly MidiAnalyzerMode[];

interface Fixture {
  alias: string;
  kind: "synthetic" | "real";
  bytes: Uint8Array;
  durationSeconds: number;
  sampleCount: number;
}

interface ModeMeasurement {
  mode: MidiAnalyzerMode;
  samplesMs: number[];
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  runtimePerMinuteMs: number;
  peakObservedRssMb: number;
  maximumResidentSetMb: number;
  mainThreadBlockedP95Ms: number;
  timelineCount: number;
  blockCount: number;
  deterministic: boolean;
}

const fixtures: Fixture[] = [
  fixture("synthetic-180s", "synthetic", buildThreeMinuteMidi(), 7),
  ...optionalFixture(
    "all-instruments",
    resolve(root, ".local-evaluation", "midi", "all_instruments.mid"),
    5,
  ),
  ...optionalFixture(
    "suran-remix",
    resolve(root, ".local-evaluation", "phase4.1", "fixtures", "suran-remix.mid"),
    5,
  ),
  ...optionalFixture(
    "endless-reference",
    resolve(root, ".local-evaluation", "phase4.1.1", "fixtures", "endless.mid"),
    3,
  ),
];

const measurements = fixtures.map((entry) => ({
  alias: entry.alias,
  kind: entry.kind,
  durationSeconds: round(entry.durationSeconds, 3),
  modes: modes.map((mode) => measure(entry, mode)),
}));
const typical = measurements.filter((entry) =>
  entry.durationSeconds >= 150 && entry.durationSeconds <= 220);
const typicalHybridSamples = typical.flatMap((entry) =>
  entry.modes.find((mode) => mode.mode === "hybrid-v1")?.samplesMs ?? []);
const accuracy = readAccuracyComparison();
const correctionImproved = accuracy.filter((entry) =>
  entry.hybrid.correctionCostMean < entry.phase4.correctionCostMean).length;
const correctionRegressed = accuracy.filter((entry) =>
  entry.hybrid.correctionCostMean > entry.phase4.correctionCostMean).length;
const adoption = typicalHybridSamples.length > 0
  && Math.max(...typicalHybridSamples) <= 10_000
  && correctionImproved > correctionRegressed;

const report = {
  schemaVersion: 1,
  phase: "5-hybrid-runtime-reassessment",
  policy: {
    hardStopSeconds: 10,
    typicalDurationRangeSeconds: [150, 220],
    relativeRuntimeIsGate: false,
    synchronousFrontend: true,
  },
  measurements,
  typicalThreeMinuteSummary: {
    fixtureCount: typical.length,
    sampleCount: typicalHybridSamples.length,
    medianMs: percentile(typicalHybridSamples, 0.5),
    p95Ms: percentile(typicalHybridSamples, 0.95),
    maxMs: maximum(typicalHybridSamples),
    underTenSeconds: typicalHybridSamples.length > 0
      && maximum(typicalHybridSamples) <= 10_000,
  },
  accuracy,
  correctionCostDecision: {
    improvedCorpora: correctionImproved,
    regressedCorpora: correctionRegressed,
  },
  decision: {
    adoptHybridForAccuracyFirst: adoption,
    stableAnalyzer: "phase4-v1",
    accuracyFirstAnalyzer: adoption ? "hybrid-v1" : "phase4-v1",
    reason: adoption
      ? "Typical three-minute runtime and correction-cost gates passed."
      : "Typical runtime was measured independently, but Hybrid did not reduce correction cost across the evaluated corpora.",
    candidateUnionContinuesWithoutHybrid: true,
  },
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  resolve(outputDirectory, "02-hybrid-runtime-reassessment.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
writeFileSync(
  resolve(outputDirectory, "02-hybrid-runtime-reassessment.md"),
  markdown(report),
  "utf8",
);
process.stdout.write(`${JSON.stringify(report.typicalThreeMinuteSummary)}\n`);
process.stdout.write(`${report.decision.reason}\n`);

function fixture(
  alias: string,
  kind: Fixture["kind"],
  bytes: Uint8Array,
  sampleCount: number,
): Fixture {
  return {
    alias,
    kind,
    bytes,
    durationSeconds: new Midi(bytes).duration,
    sampleCount,
  };
}

function optionalFixture(alias: string, path: string, sampleCount: number): Fixture[] {
  if (!existsSync(path)) return [];
  return [fixture(alias, "real", new Uint8Array(readFileSync(path)), sampleCount)];
}

function measure(input: Fixture, mode: MidiAnalyzerMode): ModeMeasurement {
  analyzeMidi(input.bytes, { mode });
  const samplesMs: number[] = [];
  let peakObservedRssMb = process.memoryUsage().rss / 1024 / 1024;
  let firstResult = "";
  let deterministic = true;
  let timelineCount = 0;
  let blockCount = 0;

  for (let index = 0; index < input.sampleCount; index += 1) {
    const startedAt = performance.now();
    const analysis = analyzeMidi(input.bytes, { mode });
    samplesMs.push(round(performance.now() - startedAt, 3));
    peakObservedRssMb = Math.max(
      peakObservedRssMb,
      process.memoryUsage().rss / 1024 / 1024,
    );
    timelineCount = analysis.fullTimeline.length;
    blockCount = analysis.blockCandidates.length;
    const stableResult = JSON.stringify({
      timeline: analysis.fullTimeline,
      blocks: analysis.blockCandidates.map((candidate) => candidate.id),
    });
    if (index === 0) firstResult = stableResult;
    else deterministic = deterministic && stableResult === firstResult;
  }

  return {
    mode,
    samplesMs,
    medianMs: percentile(samplesMs, 0.5),
    p95Ms: percentile(samplesMs, 0.95),
    maxMs: maximum(samplesMs),
    runtimePerMinuteMs: round(
      percentile(samplesMs, 0.5) / Math.max(1, input.durationSeconds / 60),
      3,
    ),
    peakObservedRssMb: round(peakObservedRssMb, 3),
    maximumResidentSetMb: round(process.resourceUsage().maxRSS / 1024, 3),
    // Analysis is synchronous today. This is the measured upper bound for the
    // interval in which the frontend event loop cannot process another action.
    mainThreadBlockedP95Ms: percentile(samplesMs, 0.95),
    timelineCount,
    blockCount,
    deterministic,
  };
}

function readAccuracyComparison() {
  const parsed = JSON.parse(readFileSync(accuracyReportPath, "utf8")) as {
    corpora: Array<{
      id: string;
      eventCount: number;
      modes: Array<{
        id: string;
        canonicalExact: number;
        rootAccuracy: number;
        top3Canonical: number;
        candidateRecall: number;
        correctionCostMean: number;
        manualInputRate: number;
        rank1Adoption: number;
      }>;
    }>;
  };
  return parsed.corpora.map((corpus) => {
    const phase4 = corpus.modes.find((entry) => entry.id === "phase4-v1");
    const hybrid = corpus.modes.find((entry) => entry.id === "hybrid-v1");
    if (!phase4 || !hybrid) throw new Error(`Missing comparison modes for ${corpus.id}.`);
    return {
      corpus: corpus.id,
      eventCount: corpus.eventCount,
      phase4: {
        ...phase4,
        correctionsPerEightEvents: round(phase4.correctionCostMean * 8, 3),
        rank2Or3RescueRate: round(phase4.top3Canonical - phase4.rank1Adoption, 6),
      },
      hybrid: {
        ...hybrid,
        correctionsPerEightEvents: round(hybrid.correctionCostMean * 8, 3),
        rank2Or3RescueRate: round(hybrid.top3Canonical - hybrid.rank1Adoption, 6),
      },
    };
  });
}

function markdown(value: typeof report): string {
  const performanceRows = value.measurements.flatMap((entry) =>
    entry.modes.map((mode) =>
      `| ${entry.alias} | ${entry.durationSeconds.toFixed(1)}s | ${mode.mode} | ${mode.medianMs.toFixed(1)} | ${mode.p95Ms.toFixed(1)} | ${mode.maxMs.toFixed(1)} | ${mode.peakObservedRssMb.toFixed(1)} | ${mode.deterministic ? "PASS" : "FAIL"} |`),
  ).join("\n");
  const accuracyRows = value.accuracy.map((entry) =>
    `| ${entry.corpus} | ${entry.phase4.canonicalExact.toFixed(4)} | ${entry.hybrid.canonicalExact.toFixed(4)} | ${entry.phase4.candidateRecall.toFixed(4)} | ${entry.hybrid.candidateRecall.toFixed(4)} | ${entry.phase4.correctionCostMean.toFixed(4)} | ${entry.hybrid.correctionCostMean.toFixed(4)} |`,
  ).join("\n");
  return `# Phase 5 Hybrid Runtime Reassessment

## Decision

- Hybrid for Accuracy First: **${value.decision.adoptHybridForAccuracyFirst ? "ADOPT" : "NOT ADOPTED"}**
- Stable analyzer: \`${value.decision.stableAnalyzer}\`
- Accuracy First analyzer: \`${value.decision.accuracyFirstAnalyzer}\`
- Candidate Union without Hybrid: **CONTINUE**
- Reason: ${value.decision.reason}

296秒のEndlessだけを停止根拠にはしていない。150〜220秒を「約3分」として、
synthetic 180秒、利用可能な実MIDIを別々に測定した。相対runtimeはGateにしていない。

## Typical MIDI

- samples: ${value.typicalThreeMinuteSummary.sampleCount}
- median: ${value.typicalThreeMinuteSummary.medianMs.toFixed(1)}ms
- p95: ${value.typicalThreeMinuteSummary.p95Ms.toFixed(1)}ms
- max: ${value.typicalThreeMinuteSummary.maxMs.toFixed(1)}ms
- 10 seconds hard stop: ${value.typicalThreeMinuteSummary.underTenSeconds ? "PASS" : "FAIL"}

## Runtime / Memory

| Fixture | Duration | Mode | Median ms | P95 ms | Max ms | Peak observed RSS MB | Deterministic |
|---|---:|---|---:|---:|---:|---:|---|
${performanceRows}

\`mainThreadBlockedP95Ms\`は各P95と同値である。現在のProduct解析は同期処理であり、
Captureは解析前に進捗表示を描画するが、解析中に入力イベントは処理できない。
Hybridを採用しない判断はruntime単独ではなく、下記の修正コスト比較による。

## Accuracy / Correction Cost

| Corpus | Phase4 exact | Hybrid exact | Phase4 recall | Hybrid recall | Phase4 cost | Hybrid cost |
|---|---:|---:|---:|---:|---:|---:|
${accuracyRows}

- correction-cost improved corpora: ${value.correctionCostDecision.improvedCorpora}
- correction-cost regressed corpora: ${value.correctionCostDecision.regressedCorpora}

Hybridは約3分の10秒Gateを独立に評価したが、Phase4よりCorpus横断の修正負担を
下げる条件を満たさない。したがってAnalyzer既定は変更せず、補完性の高い軽量modeを
使うCandidate UnionをHybrid非依存で継続する。
`;
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1),
  );
  return round(sorted[index]!, 3);
}

function maximum(values: readonly number[]): number {
  return values.length > 0 ? round(Math.max(...values), 3) : 0;
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function buildThreeMinuteMidi(): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  const chords = [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]];
  for (let time = 0, index = 0; time < 180; time += 2, index += 1) {
    for (const pitch of chords[index % chords.length]!) {
      track.addNote({ midi: pitch, time, duration: 1.9, velocity: 0.8 });
    }
  }
  return new Uint8Array(midi.toArray());
}
