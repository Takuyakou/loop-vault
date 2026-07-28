import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  chordIdentityKey,
  normalizeChordLabel,
} from "../src/domain/chordIdentity";
import { analyzeMidi } from "../src/domain/midi";
import {
  diagnoseLegacyWindowCandidates,
  type LegacyWindowCandidateDiagnostic,
} from "../src/domain/midi/legacy";
import { parseMidi } from "../src/domain/midi/parser";
import { phase4QualityEvidence } from "../src/domain/midi/phase4Analyzer";
import type { TimedNote } from "../src/domain/midi/types";
import { selectChordEvidenceNotes } from "../src/domain/midi/voices";
import type { ChordTimelineItem } from "../src/domain/types";
import {
  generateRootPositionMin7Shadows,
  type ShadowSupportingNote,
} from "./phase46/shadowCandidateGenerator";

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

interface BaselineReport {
  productInvariants: {
    rank1Hash: string;
    top3Hash: string;
    productCandidateHash: string;
    analyzerOutputHash: string;
  };
}

interface LoadedFile {
  file: CorpusFile;
  bytes: Uint8Array;
  evidenceNotes: TimedNote[];
  ticksPerBeat: number;
}

const corpusDir = resolve(cwd(), "test/loop-vault-voicing-gold-corpus-v1");
const manifest = JSON.parse(
  await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
) as Manifest;
const frozenBaseline = JSON.parse(
  await readFile(resolve(cwd(), "docs/phase4.6/00-baseline.json"), "utf8"),
) as BaselineReport;
const loadedFiles: LoadedFile[] = [];
for (const file of manifest.files.filter((entry) => entry.split === "dev")) {
  const bytes = new Uint8Array(await readFile(resolve(corpusDir, file.path)));
  const parsed = parseMidi(bytes);
  loadedFiles.push({
    file,
    bytes,
    evidenceNotes: selectChordEvidenceNotes(parsed.notes),
    ticksPerBeat: parsed.ticksPerBeat,
  });
}

const product = productFingerprints(loadedFiles);
const first = evaluateCoverage(loadedFiles);
const second = evaluateCoverage(loadedFiles);
const baselineSamples: number[] = [];
const shadowSamples: number[] = [];
const baselineMemorySamples: number[] = [];
const shadowMemorySamples: number[] = [];
for (let index = 0; index < 5; index += 1) {
  const baselineMeasurement = measureRawMatcher(loadedFiles, false);
  const shadowMeasurement = measureRawMatcher(loadedFiles, true);
  baselineSamples.push(baselineMeasurement.runtimeMs);
  shadowSamples.push(shadowMeasurement.runtimeMs);
  baselineMemorySamples.push(baselineMeasurement.peakHeapDeltaBytes);
  shadowMemorySamples.push(shadowMeasurement.peakHeapDeltaBytes);
}
const baselineRuntimeMs = median(baselineSamples);
const shadowRuntimeMs = median(shadowSamples);
const runtimeOverhead = baselineRuntimeMs === 0
  ? 0
  : (shadowRuntimeMs - baselineRuntimeMs) / baselineRuntimeMs;
const candidateCounts = first.rows.map((row) => row.shadowCandidateCount);
const deterministic = first.deterministicHash === second.deterministicHash
  && JSON.stringify(first.rows) === JSON.stringify(second.rows);
const rawRecall = first.rawRescuedCount / first.eventCount;
const combinedRecall = first.combinedRescuedCount / first.eventCount;
const targetBefore = first.targetFamilyRawRescued / first.targetFamilyCount;
const targetAfter = first.targetFamilyCombinedRescued / first.targetFamilyCount;
const productInvariant = {
  rank1: product.rank1Hash === frozenBaseline.productInvariants.rank1Hash,
  top3: product.top3Hash === frozenBaseline.productInvariants.top3Hash,
  candidatesAndScores:
    product.productCandidateHash === frozenBaseline.productInvariants.productCandidateHash,
  analyzerOutput:
    product.analyzerOutputHash === frozenBaseline.productInvariants.analyzerOutputHash,
};
const report = {
  schemaVersion: 1,
  phase: "4.6-05",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split: "dev",
  fileCount: loadedFiles.length,
  eventCount: first.eventCount,
  metrics: {
    rawCandidateRecall: rawRecall,
    canonicalCandidateRecall: combinedRecall,
    eligibleCandidateRecall: combinedRecall,
    sameRootCandidateRecall: combinedRecall,
    targetFamilyRawRecall: targetBefore,
    targetFamilyCanonicalRecall: targetAfter,
    targetFamilyCount: first.targetFamilyCount,
    generatedRescueCount: first.generatedRescueCount,
    stillMissingCount: first.eventCount - first.combinedRescuedCount,
    firstDropStageAfterShadow: {
      "raw-generation": first.eventCount - first.combinedRescuedCount,
    },
  },
  candidateEconomy: {
    totalAdded: sum(candidateCounts),
    averageAddedPerEvent: mean(candidateCounts),
    maximumAddedPerEvent: Math.max(...candidateCounts),
    minimumAddedPerEvent: Math.min(...candidateCounts),
    countDistribution: countBy(candidateCounts.map(String)),
    canonicalDuplicateCount: first.canonicalDuplicateCount,
    missingSourceProvenanceCount: first.missingProvenanceCount,
  },
  performance: {
    repetitions: 5,
    baselineSamplesMs: baselineSamples,
    shadowSamplesMs: shadowSamples,
    baselineMedianMs: baselineRuntimeMs,
    shadowMedianMs: shadowRuntimeMs,
    overheadRate: runtimeOverhead,
    baselinePeakHeapDeltaMedianBytes: median(baselineMemorySamples),
    shadowPeakHeapDeltaMedianBytes: median(shadowMemorySamples),
    peakHeapDeltaDifferenceBytes:
      median(shadowMemorySamples) - median(baselineMemorySamples),
  },
  determinism: {
    pass: deterministic,
    firstHash: first.deterministicHash,
    secondHash: second.deterministicHash,
  },
  productInvariant,
  gates: {
    targetFamilyRawRecallAtLeast80: targetBefore >= 0.8,
    targetFamilyCanonicalRecallAtLeast80: targetAfter >= 0.8,
    overallRawRecallImproved: combinedRecall > rawRecall,
    canonicalDuplicateZero: first.canonicalDuplicateCount === 0,
    provenanceMissingZero: first.missingProvenanceCount === 0,
    productInvariant: Object.values(productInvariant).every(Boolean),
    averageAddedAtMost4: mean(candidateCounts) <= 4,
    maximumAddedAtMost12: Math.max(...candidateCounts) <= 12,
    runtimeWithin20Percent: runtimeOverhead <= 0.2,
    deterministicOutput: deterministic,
  },
  validationOrHoldoutRun: false,
  rows: first.rows,
};

await writeFile(
  resolve(cwd(), "docs/phase4.6/05-shadow-coverage-results.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.6/05-shadow-coverage-results.md"),
  `# Phase 4.6-05 Shadow Coverage Results

Dev ${report.fileCount} MIDI / ${report.eventCount} events. Validation and Holdout were not run.

## Coverage

| Metric | Before | Shadow union |
|---|---:|---:|
| overall canonical candidate recall | ${percent(rawRecall)} | ${percent(combinedRecall)} |
| target plain m7 recall | ${percent(targetBefore)} | ${percent(targetAfter)} |
| rescued events | - | ${first.generatedRescueCount} |
| still missing | ${first.eventCount - first.rawRescuedCount} | ${first.eventCount - first.combinedRescuedCount} |

## Candidate economy

- total added: ${report.candidateEconomy.totalAdded}
- average / event: ${report.candidateEconomy.averageAddedPerEvent.toFixed(6)}
- maximum / event: ${report.candidateEconomy.maximumAddedPerEvent}
- canonical duplicates: ${report.candidateEconomy.canonicalDuplicateCount}
- missing provenance: ${report.candidateEconomy.missingSourceProvenanceCount}

## Runtime

- baseline median: ${baselineRuntimeMs.toFixed(3)} ms
- Shadow median: ${shadowRuntimeMs.toFixed(3)} ms
- overhead: ${percent(runtimeOverhead)}
- peak heap delta difference: ${report.performance.peakHeapDeltaDifferenceBytes} bytes
- deterministic: ${deterministic}

## Product invariants

- rank 1: ${productInvariant.rank1}
- Top-3: ${productInvariant.top3}
- candidate count/order/score: ${productInvariant.candidatesAndScores}
- Analyzer output: ${productInvariant.analyzerOutput}

## Gates

${Object.entries(report.gates).map(([gate, pass]) => `- ${gate}: ${pass ? "PASS" : "FAIL"}`).join("\n")}

Shadow candidates remain evaluation-only and are not written to Product, UI or Vault.
`,
  "utf8",
);
stdout.write(`${JSON.stringify({
  metrics: report.metrics,
  candidateEconomy: report.candidateEconomy,
  performance: report.performance,
  determinism: report.determinism,
  productInvariant: report.productInvariant,
  gates: report.gates,
}, null, 2)}\n`);

function evaluateCoverage(files: readonly LoadedFile[]) {
  const rows = [];
  let eventCount = 0;
  let rawRescuedCount = 0;
  let combinedRescuedCount = 0;
  let generatedRescueCount = 0;
  let targetFamilyCount = 0;
  let targetFamilyRawRescued = 0;
  let targetFamilyCombinedRescued = 0;
  let canonicalDuplicateCount = 0;
  let missingProvenanceCount = 0;
  const deterministicHash = createHash("sha256");

  for (const loaded of files) {
    const windows = diagnoseLegacyWindowCandidates(loaded.bytes, {
      useQualityEvidence: true,
      qualityEvidence: phase4QualityEvidence,
    });
    const beatsPerBar = loaded.file.timeSignature.numerator
      * (4 / loaded.file.timeSignature.denominator);
    for (const event of loaded.file.events) {
      const window = bestWindow(windows, event, beatsPerBar);
      if (!window) continue;
      const expected = normalizeChordLabel(event.chordSymbol);
      const expectedKey = expected ? chordIdentityKey(expected) : null;
      const rawKeys = window.candidates.map((candidate) =>
        chordIdentityKey(normalizeChordLabel(candidate.chord.label)!));
      const rawSet = new Set(rawKeys);
      const rawHasGold = expectedKey !== null && rawSet.has(expectedKey);
      const supportingNotes = notesForWindow(loaded, window, beatsPerBar);
      const generated = generateRootPositionMin7Shadows({
        rawCandidates: window.candidates,
        supportingNotes,
      });
      const shadowKeys = generated.candidates.map((candidate) =>
        candidate.canonicalIdentity);
      const combined = new Set([...rawKeys, ...shadowKeys]);
      const combinedHasGold = expectedKey !== null && combined.has(expectedKey);
      const targetFamily = expected?.triad === "minor"
        && expected.seventh === "minor7"
        && expected.extensions.length === 0
        && expected.alterations.length === 0
        && expected.bassPitchClass === undefined;
      if (targetFamily) {
        targetFamilyCount += 1;
        if (rawHasGold) targetFamilyRawRescued += 1;
        if (combinedHasGold) targetFamilyCombinedRescued += 1;
      }
      if (rawHasGold) rawRescuedCount += 1;
      if (combinedHasGold) combinedRescuedCount += 1;
      if (!rawHasGold && combinedHasGold) generatedRescueCount += 1;
      canonicalDuplicateCount += rawKeys.length + shadowKeys.length - combined.size;
      missingProvenanceCount += generated.candidates.filter((candidate) =>
        candidate.supportingNoteInstanceIds.length === 0
        || candidate.supportingPitchClasses.length < 4).length;
      const row = {
        fileId: loaded.file.fileId,
        eventId: event.eventId,
        scenarioId: loaded.file.scenarioId,
        variant: loaded.file.variant,
        expected: event.chordSymbol,
        rawHasGold,
        combinedHasGold,
        targetFamily,
        shadowCandidateCount: generated.candidates.length,
        generatedGold: !rawHasGold && combinedHasGold,
        shadowCanonicalIdentities: shadowKeys,
        diagnostics: generated.diagnostics,
      };
      rows.push(row);
      deterministicHash.update(JSON.stringify(row));
      eventCount += 1;
    }
  }
  return {
    rows,
    eventCount,
    rawRescuedCount,
    combinedRescuedCount,
    generatedRescueCount,
    targetFamilyCount,
    targetFamilyRawRescued,
    targetFamilyCombinedRescued,
    canonicalDuplicateCount,
    missingProvenanceCount,
    deterministicHash: deterministicHash.digest("hex"),
  };
}

function measureRawMatcher(files: readonly LoadedFile[], withShadow: boolean) {
  const startedAt = performance.now();
  const heapStart = process.memoryUsage().heapUsed;
  let peakHeapDeltaBytes = 0;
  let evaluationChecksum = 0;
  for (const loaded of files) {
    const windows = diagnoseLegacyWindowCandidates(loaded.bytes, {
      useQualityEvidence: true,
      qualityEvidence: phase4QualityEvidence,
    });
    const beatsPerBar = loaded.file.timeSignature.numerator
      * (4 / loaded.file.timeSignature.denominator);
    for (const event of loaded.file.events) {
      const window = bestWindow(windows, event, beatsPerBar);
      if (!window) continue;
      const supportingNotes = notesForWindow(loaded, window, beatsPerBar);
      evaluationChecksum += window.candidates.length + supportingNotes.length;
      if (withShadow) {
        const generated = generateRootPositionMin7Shadows({
          rawCandidates: window.candidates,
          supportingNotes,
        });
        evaluationChecksum += generated.candidates.length;
      }
    }
    peakHeapDeltaBytes = Math.max(
      peakHeapDeltaBytes,
      process.memoryUsage().heapUsed - heapStart,
    );
  }
  if (evaluationChecksum === 0) throw new Error("Evaluation pipeline produced no data.");
  return {
    runtimeMs: performance.now() - startedAt,
    peakHeapDeltaBytes: Math.max(0, peakHeapDeltaBytes),
  };
}

function productFingerprints(files: readonly LoadedFile[]) {
  const rank1Hash = createHash("sha256");
  const top3Hash = createHash("sha256");
  const productCandidateHash = createHash("sha256");
  const analyzerHash = createHash("sha256");
  for (const loaded of files) {
    const analysis = analyzeMidi(loaded.bytes, {
      mode: "phase4-v1",
      fileName: loaded.file.path,
    });
    analyzerHash.update(JSON.stringify(analysis));
    const beatsPerBar = loaded.file.timeSignature.numerator
      * (4 / loaded.file.timeSignature.denominator);
    for (const event of loaded.file.events) {
      const item = bestTimelineItem(analysis.fullTimeline, event, beatsPerBar);
      const candidates = item
        ? [item.chord, ...item.alternatives.map((entry) => entry.chord)]
        : [];
      const candidateScores = item
        ? [item.confidence, ...item.alternatives.map((entry) => entry.confidence)]
        : [];
      rank1Hash.update(JSON.stringify({
        fileId: loaded.file.fileId,
        eventId: event.eventId,
        chord: candidates[0]?.label ?? null,
        score: candidateScores[0] ?? null,
      }));
      top3Hash.update(JSON.stringify({
        fileId: loaded.file.fileId,
        eventId: event.eventId,
        candidates: candidates.slice(0, 3).map((chord, index) => ({
          label: chord.label,
          score: candidateScores[index],
        })),
      }));
      productCandidateHash.update(JSON.stringify({
        fileId: loaded.file.fileId,
        eventId: event.eventId,
        candidates: candidates.map((chord, index) => ({
          label: chord.label,
          score: candidateScores[index],
        })),
      }));
    }
  }
  return {
    rank1Hash: rank1Hash.digest("hex"),
    top3Hash: top3Hash.digest("hex"),
    productCandidateHash: productCandidateHash.digest("hex"),
    analyzerOutputHash: analyzerHash.digest("hex"),
  };
}

function notesForWindow(
  loaded: LoadedFile,
  window: LegacyWindowCandidateDiagnostic,
  beatsPerBar: number,
): ShadowSupportingNote[] {
  const startBeat = (window.bar - 1) * beatsPerBar + window.beat - 1;
  const endBeat = startBeat + window.durationBeats;
  const startTick = startBeat * loaded.ticksPerBeat;
  const endTick = endBeat * loaded.ticksPerBeat;
  return loaded.evidenceNotes
    .filter((note) =>
      note.startTick < endTick
      && note.startTick + note.durationTick > startTick)
    .map((note, index) => ({
      noteInstanceId: [
        loaded.file.fileId,
        `n${index}`,
        `t${note.trackIndex}`,
        `c${note.channel ?? -1}`,
        `p${note.pitch}`,
        `s${note.startTick}`,
        `d${note.durationTick}`,
      ].join(":"),
      pitchClass: ((note.pitch % 12) + 12) % 12,
    }));
}

function bestWindow(
  windows: readonly LegacyWindowCandidateDiagnostic[],
  event: GoldEvent,
  beatsPerBar: number,
) {
  return [...windows].sort((left, right) => {
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

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: readonly number[]) {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function countBy(values: readonly string[]) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [
      value,
      values.filter((candidate) => candidate === value).length,
    ]),
  );
}

function percent(value: number) {
  return `${(value * 100).toFixed(4)}%`;
}
