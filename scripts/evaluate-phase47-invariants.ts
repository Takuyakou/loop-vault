import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { normalizeChordLabel } from "../src/domain/chordIdentity";
import {
  operationCorrectionCostResult,
  summarizeOperationCorrectionCosts,
} from "../src/domain/midi/correctionCost";
import { analyzeMidi } from "../src/domain/midi";
import type { ChordTimelineItem } from "../src/domain/types";
import {
  bestWindow,
  diagnoseLoadedFile,
  identityKey,
  identityKeyForLabel,
  isNonRootSlash,
  loadPhase47Files,
  notesForWindow,
  regressionCorpusDir,
} from "./phase47/evaluationShared";
import {
  generatePartACompanion,
  rankWithIncumbentPreference,
} from "./phase47/partAShadow";

interface FrozenBaseline {
  hashes: {
    rank1: string;
    productTop3: string;
    productCandidatesAndScores: string;
    analyzerOutput: string;
  };
}

const { manifest, files } = await loadPhase47Files(regressionCorpusDir, "dev");
const frozen = JSON.parse(
  await readFile(resolve(cwd(), "docs/phase4.7/00-baseline.json"), "utf8"),
) as FrozenBaseline;
const rows = [];
const baselineCosts = [];
const counterfactualCosts = [];
let generatedTotal = 0;
let duplicateCount = 0;
let missingProvenanceCount = 0;
let baselineCandidateRetainedCount = 0;
let existingScoreRetainedCount = 0;
let existingRelativeOrderRetainedCount = 0;
let rank1InvariantCount = 0;
let baselineCanonicalTop3Count = 0;
let counterfactualCanonicalTop3Count = 0;
let baselineRootTop3Count = 0;
let counterfactualRootTop3Count = 0;
let baselineCanonicalTop3RetainedCount = 0;
let baselineRootTop3RetainedCount = 0;
let newCanonicalMissCount = 0;
let newRootMissCount = 0;
let gainedCanonicalRescueCount = 0;
let gainedRootRescueCount = 0;
let displacedGoldCount = 0;
let applicableCount = 0;
let applicableImprovedCount = 0;
let nonApplicableCount = 0;
let nonApplicableUnchangedCount = 0;
let baselineReciprocalRank = 0;
let counterfactualReciprocalRank = 0;
const resultHash = createHash("sha256");

for (const loaded of files) {
  const windows = diagnoseLoadedFile(loaded);
  const beatsPerBar = loaded.file.timeSignature.numerator
    * (4 / loaded.file.timeSignature.denominator);
  for (const event of loaded.file.events) {
    const window = bestWindow(windows, event, beatsPerBar);
    if (!window) continue;
    const generated = generatePartACompanion(
      window.candidates,
      notesForWindow(loaded, window, beatsPerBar),
    );
    const ranked = rankWithIncumbentPreference(
      window.candidates,
      generated.candidates,
    );
    const baseline = window.candidates;
    const baselineKeys = baseline.map((candidate) => identityKey(candidate.chord));
    const rankedBaseline = ranked.filter((candidate) => candidate.baseline);
    const rankedBaselineKeys = rankedBaseline.map((candidate) =>
      identityKey(candidate.chord));
    const combinedKeys = ranked.map((candidate) => identityKey(candidate.chord));
    const expectedLabels = [
      event.chordSymbol,
      ...(event.acceptableAlternatives ?? []),
    ];
    const expectedKeys = new Set(expectedLabels
      .map(identityKeyForLabel)
      .filter((key): key is string => key !== null));
    const expectedRoots = new Set(expectedLabels
      .map((label) => normalizeChordLabel(label)?.rootPitchClass)
      .filter((root): root is number => root !== undefined));
    const oldTop3 = baseline.slice(0, 3);
    const newTop3 = ranked.slice(0, 3);
    const oldTop3Keys = oldTop3.map((candidate) => identityKey(candidate.chord));
    const newTop3Keys = newTop3.map((candidate) => identityKey(candidate.chord));
    const oldCanonicalHit = oldTop3Keys.some((key) => expectedKeys.has(key));
    const newCanonicalHit = newTop3Keys.some((key) => expectedKeys.has(key));
    const oldRootHit = oldTop3.some((candidate) =>
      expectedRoots.has(candidate.chord.root));
    const newRootHit = newTop3.some((candidate) =>
      expectedRoots.has(candidate.chord.root));
    const oldRank = baseline.findIndex((candidate) =>
      expectedKeys.has(identityKey(candidate.chord)));
    const newRank = ranked.findIndex((candidate) =>
      expectedKeys.has(identityKey(candidate.chord)));
    const rank1Invariant = baseline[0]?.chord.label === ranked[0]?.chord.label
      && baseline[0]?.rawScore === ranked[0]?.rawScore
      && identityKey(baseline[0]!.chord) === identityKey(ranked[0]!.chord)
      && baseline[0]?.chord.root === ranked[0]?.chord.root
      && baseline[0]?.chord.bass === ranked[0]?.chord.bass
      && ranked[0]?.baseline === true;
    const baselineRetained = baselineKeys.every((key) =>
      combinedKeys.includes(key));
    const scoresRetained = baseline.every((candidate, index) =>
      rankedBaseline[index]?.rawScore === candidate.rawScore);
    const relativeOrderRetained = baselineKeys.every((key, index) =>
      rankedBaselineKeys[index] === key);
    const applicable = generated.candidates.length > 0;
    const nonApplicableUnchanged = !applicable
      && JSON.stringify(oldTop3Keys) === JSON.stringify(newTop3Keys)
      && rank1Invariant
      && relativeOrderRetained;
    const displaced = oldTop3Keys.filter((key) => !newTop3Keys.includes(key));
    const displacedGold = displaced.filter((key) => expectedKeys.has(key));

    generatedTotal += generated.candidates.length;
    duplicateCount += combinedKeys.length - new Set(combinedKeys).size;
    missingProvenanceCount += generated.candidates.filter((candidate) =>
      candidate.provenance.noteInstanceIds.length === 0
      || !candidate.provenance.canonicalRoundTrip.passed).length;
    if (baselineRetained) baselineCandidateRetainedCount += 1;
    if (scoresRetained) existingScoreRetainedCount += 1;
    if (relativeOrderRetained) existingRelativeOrderRetainedCount += 1;
    if (rank1Invariant) rank1InvariantCount += 1;
    if (oldCanonicalHit) baselineCanonicalTop3Count += 1;
    if (newCanonicalHit) counterfactualCanonicalTop3Count += 1;
    if (oldRootHit) baselineRootTop3Count += 1;
    if (newRootHit) counterfactualRootTop3Count += 1;
    if (!oldCanonicalHit && newCanonicalHit) gainedCanonicalRescueCount += 1;
    if (!oldRootHit && newRootHit) gainedRootRescueCount += 1;
    if (oldCanonicalHit && newCanonicalHit) {
      baselineCanonicalTop3RetainedCount += 1;
    }
    if (oldRootHit && newRootHit) baselineRootTop3RetainedCount += 1;
    if (oldCanonicalHit && !newCanonicalHit) newCanonicalMissCount += 1;
    if (oldRootHit && !newRootHit) newRootMissCount += 1;
    displacedGoldCount += displacedGold.length;
    if (applicable) {
      applicableCount += 1;
      if ((oldRank < 0 && newRank >= 0)
        || (oldRank >= 0 && newRank >= 0 && newRank < oldRank)
        || (!oldCanonicalHit && newCanonicalHit)) {
        applicableImprovedCount += 1;
      }
    } else {
      nonApplicableCount += 1;
      if (nonApplicableUnchanged) nonApplicableUnchangedCount += 1;
    }
    baselineReciprocalRank += oldRank >= 0 ? 1 / (oldRank + 1) : 0;
    counterfactualReciprocalRank += newRank >= 0 ? 1 / (newRank + 1) : 0;
    baselineCosts.push(operationCorrectionCostResult({
      primary: baseline[0]!.chord,
      alternatives: baseline.slice(1, 3).map((candidate) => candidate.chord),
    }, expectedLabels));
    counterfactualCosts.push(operationCorrectionCostResult({
      primary: ranked[0]!.chord,
      alternatives: ranked.slice(1, 3).map((candidate) => candidate.chord),
    }, expectedLabels));
    const deterministic = {
      baseline: baseline.map((candidate) => ({
        label: candidate.chord.label,
        score: candidate.rawScore,
      })),
      generated: generated.candidates.map((candidate) => ({
        label: candidate.chord.label,
        score: candidate.rawScore,
        identity: candidate.canonicalIdentity,
        provenance: candidate.provenance,
      })),
      ranked: ranked.map((candidate) => ({
        label: candidate.chord.label,
        score: candidate.rawScore,
        baseline: candidate.baseline,
      })),
    };
    const row = {
      fileId: loaded.file.fileId,
      eventId: event.eventId,
      expected: event.chordSymbol,
      applicable,
      oldTop3: oldTop3.map((candidate) => ({
        label: candidate.chord.label,
        score: candidate.rawScore,
      })),
      newTop3: newTop3.map((candidate) => ({
        label: candidate.chord.label,
        score: candidate.rawScore,
        baseline: candidate.baseline,
      })),
      rank1Invariant,
      baselineRetained,
      scoresRetained,
      relativeOrderRetained,
      displaced: oldTop3.filter((candidate) =>
        !newTop3Keys.includes(identityKey(candidate.chord)))
        .map((candidate) => candidate.chord.label),
      displacedGoldCount: displacedGold.length,
      oldCanonicalHit,
      newCanonicalHit,
      oldRootHit,
      newRootHit,
      oldRank: oldRank >= 0 ? oldRank + 1 : null,
      newRank: newRank >= 0 ? newRank + 1 : null,
    };
    rows.push(row);
    resultHash.update(JSON.stringify(deterministic));
  }
}

const product = await productFingerprints();
const firstHash = resultHash.digest("hex");
const repeatHash = await deterministicInvariantHash();
const baselineCost = summarizeOperationCorrectionCosts(baselineCosts);
const counterfactualCost = summarizeOperationCorrectionCosts(counterfactualCosts);
const performanceReport = measurePerformance(7);
const invariantReport = {
  schemaVersion: 1,
  phase: "4.7-03",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  eventCount: rows.length,
  rank1: {
    unchangedCount: rank1InvariantCount,
    changedCount: rows.length - rank1InvariantCount,
    pass: rank1InvariantCount === rows.length,
  },
  candidateSuperset: {
    baselineRetainedCount: baselineCandidateRetainedCount,
    existingScoreRetainedCount,
    existingRelativeOrderRetainedCount,
    duplicateCount,
    missingProvenanceCount,
    pass: baselineCandidateRetainedCount === rows.length
      && existingScoreRetainedCount === rows.length
      && existingRelativeOrderRetainedCount === rows.length
      && duplicateCount === 0
      && missingProvenanceCount === 0,
  },
  productInvariants: {
    ...product,
    rank1HashMatchesFrozen: product.rank1Hash === frozen.hashes.rank1,
    top3HashMatchesFrozen: product.top3Hash === frozen.hashes.productTop3,
    candidateHashMatchesFrozen:
      product.productCandidateHash === frozen.hashes.productCandidatesAndScores,
    analyzerHashMatchesFrozen:
      product.analyzerOutputHash === frozen.hashes.analyzerOutput,
  },
  economy: {
    totalAdded: generatedTotal,
    averageAddedPerEvent: generatedTotal / rows.length,
    maximumAddedPerEvent: Math.max(...rows.map((row) => row.applicable ? 1 : 0)),
  },
  determinism: {
    firstHash,
    repeatHash,
    pass: firstHash === repeatHash,
  },
  performance: performanceReport,
  productChanged: false,
  validationOrHoldoutRun: false,
};

const displacementReport = {
  schemaVersion: 1,
  phase: "4.7-03",
  corpusVersion: manifest.corpusVersion,
  eventCount: rows.length,
  top3: {
    canonicalBefore: baselineCanonicalTop3Count / rows.length,
    canonicalAfter: counterfactualCanonicalTop3Count / rows.length,
    rootBefore: baselineRootTop3Count / rows.length,
    rootAfter: counterfactualRootTop3Count / rows.length,
    baselineCanonicalRetainedCount: baselineCanonicalTop3RetainedCount,
    baselineRootRetainedCount: baselineRootTop3RetainedCount,
    newCanonicalMissCount,
    newRootMissCount,
    gainedCanonicalRescueCount,
    gainedRootRescueCount,
    displacedGoldCount,
  },
  applicability: {
    applicableCount,
    improvedApplicableCount: applicableImprovedCount,
    conditionalEfficacy: applicableCount === 0
      ? 0
      : applicableImprovedCount / applicableCount,
  },
  inertness: {
    nonApplicableCount,
    unchangedNonApplicableCount: nonApplicableUnchangedCount,
    rate: nonApplicableCount === 0
      ? 1
      : nonApplicableUnchangedCount / nonApplicableCount,
  },
  mrr: {
    before: baselineReciprocalRank / rows.length,
    after: counterfactualReciprocalRank / rows.length,
    delta: (counterfactualReciprocalRank - baselineReciprocalRank) / rows.length,
  },
  correctionCost: {
    before: baselineCost,
    after: counterfactualCost,
    meanDelta: counterfactualCost.mean - baselineCost.mean,
    p90Delta: counterfactualCost.p90 - baselineCost.p90,
  },
  manualInputRequired: {
    before: (baselineCost.byCategory["manual-input"]
      + baselineCost.byCategory.unrepresentable) / rows.length,
    after: (counterfactualCost.byCategory["manual-input"]
      + counterfactualCost.byCategory.unrepresentable) / rows.length,
  },
  rows,
};

await Promise.all([
  writeJson("docs/phase4.7/03-invariant-results.json", invariantReport),
  writeJson("docs/phase4.7/03-existing-dev-displacement.json", displacementReport),
  writeFile(
    resolve(cwd(), "docs/phase4.7/03-invariant-results.md"),
    `# Phase 4.7-03 Invariant Results

## Existing Dev 320 events

- rank 1 raw/canonical/root/bass/score/source unchanged: ${rank1InvariantCount} / ${rows.length}
- baseline candidate retained: ${baselineCandidateRetainedCount} / ${rows.length}
- existing score retained: ${existingScoreRetainedCount} / ${rows.length}
- existing relative order retained: ${existingRelativeOrderRetainedCount} / ${rows.length}
- canonical duplicate: ${duplicateCount}
- missing provenance: ${missingProvenanceCount}
- added: ${generatedTotal} (${(generatedTotal / rows.length).toFixed(6)}/event, max ${invariantReport.economy.maximumAddedPerEvent})
- deterministic: ${invariantReport.determinism.pass}

## Frozen Product hashes

- rank 1: ${invariantReport.productInvariants.rank1HashMatchesFrozen ? "PASS" : "FAIL"}
- Product Top-3: ${invariantReport.productInvariants.top3HashMatchesFrozen ? "PASS" : "FAIL"}
- Product candidates + scores: ${invariantReport.productInvariants.candidateHashMatchesFrozen ? "PASS" : "FAIL"}
- Analyzer output: ${invariantReport.productInvariants.analyzerHashMatchesFrozen ? "PASS" : "FAIL"}

## Runtime

- baseline median: ${performanceReport.baselineMedianMs.toFixed(3)} ms
- Shadow median: ${performanceReport.shadowMedianMs.toFixed(3)} ms
- overhead: ${(performanceReport.overheadRate * 100).toFixed(4)}%
- Gate <= 5%: ${performanceReport.overheadRate <= 0.05 ? "PASS" : "FAIL"}

ShadowはProduct pipelineへ未接続で、Validation / Holdoutは未実行。
`,
    "utf8",
  ),
  writeFile(
    resolve(cwd(), "docs/phase4.7/03-existing-dev-displacement.md"),
    `# Phase 4.7-03 Existing Dev Displacement

| Metric | Before | Counterfactual |
|---|---:|---:|
| Top-3 canonical | ${(displacementReport.top3.canonicalBefore * 100).toFixed(4)}% | ${(displacementReport.top3.canonicalAfter * 100).toFixed(4)}% |
| Top-3 root | ${(displacementReport.top3.rootBefore * 100).toFixed(4)}% | ${(displacementReport.top3.rootAfter * 100).toFixed(4)}% |
| MRR | ${displacementReport.mrr.before.toFixed(6)} | ${displacementReport.mrr.after.toFixed(6)} |
| correction cost mean | ${baselineCost.mean.toFixed(6)} | ${counterfactualCost.mean.toFixed(6)} |
| correction cost p90 | ${baselineCost.p90} | ${counterfactualCost.p90} |
| manual input required | ${(displacementReport.manualInputRequired.before * 100).toFixed(4)}% | ${(displacementReport.manualInputRequired.after * 100).toFixed(4)}% |

- applicable: ${applicableCount}
- improved applicable: ${applicableImprovedCount}
- conditional efficacy: ${(displacementReport.applicability.conditionalEfficacy * 100).toFixed(4)}%
- non-applicable inertness: ${(displacementReport.inertness.rate * 100).toFixed(4)}%
- baseline canonical Top-3 retained: ${baselineCanonicalTop3RetainedCount} / ${baselineCanonicalTop3Count}
- baseline root Top-3 retained: ${baselineRootTop3RetainedCount} / ${baselineRootTop3Count}
- new canonical / root miss: ${newCanonicalMissCount} / ${newRootMissCount}
- gained canonical / root rescue: ${gainedCanonicalRescueCount} / ${gainedRootRescueCount}
- displaced Gold: ${displacedGoldCount}

これは既存Devのcounterfactual診断であり、新Goldの代替ではない。
`,
    "utf8",
  ),
]);

stdout.write(`${JSON.stringify({
  invariant: invariantReport,
  displacement: {
    top3: displacementReport.top3,
    applicability: displacementReport.applicability,
    inertness: displacementReport.inertness,
    mrr: displacementReport.mrr,
    correctionCost: displacementReport.correctionCost,
    manualInputRequired: displacementReport.manualInputRequired,
  },
}, null, 2)}\n`);

async function deterministicInvariantHash() {
  const hash = createHash("sha256");
  for (const loaded of files) {
    const windows = diagnoseLoadedFile(loaded);
    const beatsPerBar = loaded.file.timeSignature.numerator
      * (4 / loaded.file.timeSignature.denominator);
    for (const event of loaded.file.events) {
      const window = bestWindow(windows, event, beatsPerBar);
      if (!window) continue;
      const generated = generatePartACompanion(
        window.candidates,
        notesForWindow(loaded, window, beatsPerBar),
      );
      const ranked = rankWithIncumbentPreference(
        window.candidates,
        generated.candidates,
      );
      hash.update(JSON.stringify({
        baseline: window.candidates.map((candidate) => ({
          label: candidate.chord.label,
          score: candidate.rawScore,
        })),
        generated: generated.candidates.map((candidate) => ({
          label: candidate.chord.label,
          score: candidate.rawScore,
          identity: candidate.canonicalIdentity,
          provenance: candidate.provenance,
        })),
        ranked: ranked.map((candidate) => ({
          label: candidate.chord.label,
          score: candidate.rawScore,
          baseline: candidate.baseline,
        })),
      }));
    }
  }
  return hash.digest("hex");
}

function measurePerformance(repetitions: number) {
  const baselineSamples: number[] = [];
  const shadowSamples: number[] = [];
  const baselineHeapSamples: number[] = [];
  const shadowHeapSamples: number[] = [];
  for (let index = 0; index < repetitions; index += 1) {
    const baseline = measure(false);
    const shadow = measure(true);
    baselineSamples.push(baseline.runtimeMs);
    shadowSamples.push(shadow.runtimeMs);
    baselineHeapSamples.push(baseline.heapDeltaBytes);
    shadowHeapSamples.push(shadow.heapDeltaBytes);
  }
  const baselineMedianMs = median(baselineSamples);
  const shadowMedianMs = median(shadowSamples);
  return {
    repetitions,
    baselineSamplesMs: baselineSamples,
    shadowSamplesMs: shadowSamples,
    baselineMedianMs,
    shadowMedianMs,
    overheadRate: baselineMedianMs === 0
      ? 0
      : (shadowMedianMs - baselineMedianMs) / baselineMedianMs,
    baselineHeapMedianBytes: median(baselineHeapSamples),
    shadowHeapMedianBytes: median(shadowHeapSamples),
  };
}

function measure(withShadow: boolean) {
  const started = performance.now();
  const heapStart = process.memoryUsage().heapUsed;
  let checksum = 0;
  for (const loaded of files) {
    const windows = diagnoseLoadedFile(loaded);
    const beatsPerBar = loaded.file.timeSignature.numerator
      * (4 / loaded.file.timeSignature.denominator);
    for (const event of loaded.file.events) {
      const window = bestWindow(windows, event, beatsPerBar);
      if (!window) continue;
      checksum += window.candidates.length;
      if (withShadow) {
        const sourceNeedsEvidence = window.candidates[0]
          ? isNonRootSlash(window.candidates[0].chord)
          : false;
        const generated = generatePartACompanion(
          window.candidates,
          sourceNeedsEvidence
            ? notesForWindow(loaded, window, beatsPerBar)
            : [],
        );
        checksum += generated.candidates.length;
      }
    }
  }
  if (checksum === 0) throw new Error("P4.7 performance pipeline produced no data.");
  return {
    runtimeMs: performance.now() - started,
    heapDeltaBytes: Math.max(0, process.memoryUsage().heapUsed - heapStart),
  };
}

async function productFingerprints() {
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
      const item = bestTimelineItem(
        analysis.fullTimeline,
        event.startBeat,
        event.endBeat,
        beatsPerBar,
      );
      const candidates = item
        ? [item.chord, ...item.alternatives.map((entry) => entry.chord)]
        : [];
      const scores = item
        ? [item.confidence, ...item.alternatives.map((entry) => entry.confidence)]
        : [];
      rank1Hash.update(JSON.stringify({
        fileId: loaded.file.fileId,
        eventId: event.eventId,
        chord: candidates[0]?.label ?? null,
        score: scores[0] ?? null,
      }));
      top3Hash.update(JSON.stringify({
        fileId: loaded.file.fileId,
        eventId: event.eventId,
        candidates: candidates.slice(0, 3).map((chord, index) => ({
          label: chord.label,
          score: scores[index],
        })),
      }));
      productCandidateHash.update(JSON.stringify({
        fileId: loaded.file.fileId,
        eventId: event.eventId,
        candidates: candidates.map((chord, index) => ({
          label: chord.label,
          score: scores[index],
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

async function writeJson(path: string, value: unknown) {
  await writeFile(
    resolve(cwd(), path),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}
