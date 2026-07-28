import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { normalizeChordLabel } from "../src/domain/chordIdentity";
import {
  operationCorrectionCostResult,
  summarizeOperationCorrectionCosts,
} from "../src/domain/midi/correctionCost";
import {
  bestWindow,
  diagnoseLoadedFile,
  identityKey,
  identityKeyForLabel,
  loadPhase47Files,
  notesForWindow,
} from "./phase47/evaluationShared";
import {
  defaultBassCompanionCorpusDir,
  type BassCompanionCorpusFile,
  type BassCompanionSplit,
} from "./phase47/generateBassCompanionCorpus";
import {
  generatePartACompanion,
  rankWithIncumbentPreference,
} from "./phase47/partAShadow";

interface GroupMetrics {
  events: number;
  applicable: number;
  candidateRecallBefore: number;
  candidateRecallAfter: number;
  candidateGain: number;
  candidateLoss: number;
  top3CanonicalGain: number;
  top3CanonicalLoss: number;
  top3RootGain: number;
  top3RootLoss: number;
  unchanged: number;
  inertEvents: number;
  inertUnchanged: number;
}

interface EvaluationRow {
  fileId: string;
  eventId: string;
  family: string;
  bassCondition: string;
  bassIdentity: string;
  trackLayout: string;
  durationClass: string;
  expected: string;
  applicable: boolean;
  generated: string[];
  rank1Invariant: boolean;
  baselineRetained: boolean;
  existingScoreRetained: boolean;
  existingRelativeOrderRetained: boolean;
  duplicateCount: number;
  missingProvenanceCount: number;
  candidateRecallBefore: boolean;
  candidateRecallAfter: boolean;
  top3CanonicalBefore: boolean;
  top3CanonicalAfter: boolean;
  top3RootBefore: boolean;
  top3RootAfter: boolean;
  reciprocalRankBefore: number;
  reciprocalRankAfter: number;
  top3Before: string[];
  top3After: string[];
}

export interface Phase47GoldSplitReport {
  schemaVersion: 1;
  phase: "4.7-05" | "4.7-06" | "4.7-07";
  corpusVersion: string;
  split: BassCompanionSplit;
  evaluationPolicyVersion: "p47-fixed-part-a-evaluation-v1";
  productChanged: false;
  productConnected: false;
  eventCount: number;
  applicability: {
    count: number;
    rate: number;
    minimum: number;
    pass: boolean;
  };
  invariants: {
    rank1Unchanged: number;
    rank1Changed: number;
    baselineCandidateSetRetained: number;
    existingScoreRetained: number;
    existingRelativeOrderRetained: number;
    analyzerOutputUnchanged: number;
  };
  candidatePool: {
    recallBefore: number;
    recallAfter: number;
    rescueCount: number;
    lossCount: number;
    duplicateCount: number;
    missingProvenanceCount: number;
  };
  top3: {
    canonicalBefore: number;
    canonicalAfter: number;
    rootBefore: number;
    rootAfter: number;
    baselineCanonicalHitCount: number;
    baselineCanonicalRetainedCount: number;
    baselineRootHitCount: number;
    baselineRootRetainedCount: number;
    newCanonicalMissCount: number;
    newRootMissCount: number;
  };
  applicable: {
    count: number;
    candidateRecallBefore: number;
    candidateRecallAfter: number;
    candidateRescueCount: number;
    top3CanonicalBefore: number;
    top3CanonicalAfter: number;
    top3RootBefore: number;
    top3RootAfter: number;
  };
  inertness: {
    nonApplicableCount: number;
    unchangedCount: number;
    rate: number;
  };
  mrr: { before: number; after: number; delta: number };
  correctionCost: {
    before: ReturnType<typeof summarizeOperationCorrectionCosts>;
    after: ReturnType<typeof summarizeOperationCorrectionCosts>;
    meanDelta: number;
    p90Delta: number;
  };
  manualInputRequired: { before: number; after: number; delta: number };
  economy: {
    totalAdded: number;
    averageAddedPerEvent: number;
    maximumAddedPerEvent: number;
  };
  runtime: {
    repetitions: number;
    baselineMedianMs: number;
    shadowMedianMs: number;
    overheadRate: number;
    baselineHeapMedianBytes: number;
    shadowHeapMedianBytes: number;
  };
  determinism: { firstHash: string; repeatHash: string; pass: boolean };
  byFamily: Record<string, GroupMetrics>;
  byBassCondition: Record<string, GroupMetrics>;
  gates: Record<string, boolean> & { overall: boolean };
  rows: EvaluationRow[];
}

const splitMinimums: Record<BassCompanionSplit, number> = {
  dev: 24,
  validation: 12,
  holdout: 12,
};

export async function evaluatePhase47GoldSplit(
  split: BassCompanionSplit,
  corpusDirectory = resolve(cwd(), defaultBassCompanionCorpusDir),
): Promise<Phase47GoldSplitReport> {
  const { manifest, files } = await loadPhase47Files(corpusDirectory, split);
  const rows: EvaluationRow[] = [];
  const baselineCosts = [];
  const shadowCosts = [];
  let generatedTotal = 0;
  let maximumAdded = 0;
  const firstHash = createHash("sha256");

  for (const loaded of files) {
    const windows = diagnoseLoadedFile(loaded);
    const beatsPerBar = loaded.file.timeSignature.numerator
      * (4 / loaded.file.timeSignature.denominator);
    const corpusFile = loaded.file as BassCompanionCorpusFile;
    for (const event of corpusFile.events) {
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
      const expectedLabels = [event.chordSymbol, ...event.acceptableAlternatives];
      const expectedKeys = new Set(expectedLabels
        .map(identityKeyForLabel)
        .filter((key): key is string => key !== null));
      const expectedRoots = new Set(expectedLabels
        .map((label) => normalizeChordLabel(label)?.rootPitchClass)
        .filter((root): root is number => root !== undefined));
      const oldRank = baseline.findIndex((candidate) =>
        expectedKeys.has(identityKey(candidate.chord)));
      const newRank = ranked.findIndex((candidate) =>
        expectedKeys.has(identityKey(candidate.chord)));
      const oldTop3 = baseline.slice(0, 3);
      const newTop3 = ranked.slice(0, 3);
      const oldTop3Keys = oldTop3.map((candidate) => identityKey(candidate.chord));
      const newTop3Keys = newTop3.map((candidate) => identityKey(candidate.chord));
      const top3CanonicalBefore = oldTop3Keys.some((key) => expectedKeys.has(key));
      const top3CanonicalAfter = newTop3Keys.some((key) => expectedKeys.has(key));
      const top3RootBefore = oldTop3.some((candidate) =>
        expectedRoots.has(candidate.chord.root));
      const top3RootAfter = newTop3.some((candidate) =>
        expectedRoots.has(candidate.chord.root));
      const rank1Invariant = baseline[0]?.chord.label === ranked[0]?.chord.label
        && identityKey(baseline[0]!.chord) === identityKey(ranked[0]!.chord)
        && baseline[0]?.rawScore === ranked[0]?.rawScore
        && ranked[0]?.baseline === true;
      const baselineRetained = baselineKeys.every((key) => combinedKeys.includes(key));
      const existingScoreRetained = baseline.every((candidate, index) =>
        rankedBaseline[index]?.rawScore === candidate.rawScore);
      const existingRelativeOrderRetained = baselineKeys.every((key, index) =>
        rankedBaselineKeys[index] === key);
      const duplicateCount = combinedKeys.length - new Set(combinedKeys).size;
      const missingProvenanceCount = generated.candidates.filter((candidate) =>
        candidate.provenance.noteInstanceIds.length === 0
        || !candidate.provenance.canonicalRoundTrip.passed
        || candidate.provenance.generationRuleId.length === 0).length;
      const applicable = generated.candidates.length > 0;

      generatedTotal += generated.candidates.length;
      maximumAdded = Math.max(maximumAdded, generated.candidates.length);
      baselineCosts.push(operationCorrectionCostResult({
        primary: baseline[0]!.chord,
        alternatives: baseline.slice(1, 3).map((candidate) => candidate.chord),
      }, expectedLabels));
      shadowCosts.push(operationCorrectionCostResult({
        primary: ranked[0]!.chord,
        alternatives: ranked.slice(1, 3).map((candidate) => candidate.chord),
      }, expectedLabels));
      const row: EvaluationRow = {
        fileId: loaded.file.fileId,
        eventId: event.eventId,
        family: event.family,
        bassCondition: event.bassCondition,
        bassIdentity: event.goldBassIdentity,
        trackLayout: event.bassTrackLayout,
        durationClass: event.bassDurationClass,
        expected: event.chordSymbol,
        applicable,
        generated: generated.candidates.map((candidate) => candidate.chord.label),
        rank1Invariant,
        baselineRetained,
        existingScoreRetained,
        existingRelativeOrderRetained,
        duplicateCount,
        missingProvenanceCount,
        candidateRecallBefore: oldRank >= 0,
        candidateRecallAfter: newRank >= 0,
        top3CanonicalBefore,
        top3CanonicalAfter,
        top3RootBefore,
        top3RootAfter,
        reciprocalRankBefore: oldRank >= 0 ? 1 / (oldRank + 1) : 0,
        reciprocalRankAfter: newRank >= 0 ? 1 / (newRank + 1) : 0,
        top3Before: oldTop3.map((candidate) => candidate.chord.label),
        top3After: newTop3.map((candidate) => candidate.chord.label),
      };
      rows.push(row);
      firstHash.update(JSON.stringify({
        fileId: loaded.file.fileId,
        eventId: event.eventId,
        baseline: baseline.map((candidate) => ({
          label: candidate.chord.label,
          score: candidate.rawScore,
        })),
        generated: generated.candidates,
        ranked: ranked.map((candidate) => ({
          label: candidate.chord.label,
          score: candidate.rawScore,
          baseline: candidate.baseline,
        })),
      }));
    }
  }

  const applicableRows = rows.filter((row) => row.applicable);
  const nonApplicableRows = rows.filter((row) => !row.applicable);
  const baselineCost = summarizeOperationCorrectionCosts(baselineCosts);
  const shadowCost = summarizeOperationCorrectionCosts(shadowCosts);
  const manualBefore = manualInputRate(baselineCost, rows.length);
  const manualAfter = manualInputRate(shadowCost, rows.length);
  const runtime = measurePerformance(files, 7);
  const firstDigest = firstHash.digest("hex");
  const repeatDigest = await deterministicHash(files);
  const byFamily = groupMetrics(rows, (row) => row.family);
  const byBassCondition = groupMetrics(rows, (row) => [
    row.bassCondition,
    `${row.bassIdentity}-gold`,
    row.trackLayout,
    row.durationClass,
  ]);
  const newCanonicalMissCount = rows.filter((row) =>
    row.top3CanonicalBefore && !row.top3CanonicalAfter).length;
  const newRootMissCount = rows.filter((row) =>
    row.top3RootBefore && !row.top3RootAfter).length;
  const candidateRescueCount = rows.filter((row) =>
    !row.candidateRecallBefore && row.candidateRecallAfter).length;
  const candidateLossCount = rows.filter((row) =>
    row.candidateRecallBefore && !row.candidateRecallAfter).length;
  const applicableCandidateBefore = rate(applicableRows, "candidateRecallBefore");
  const applicableCandidateAfter = rate(applicableRows, "candidateRecallAfter");
  const applicableTop3Before = rate(applicableRows, "top3CanonicalBefore");
  const applicableTop3After = rate(applicableRows, "top3CanonicalAfter");
  const applicableRootBefore = rate(applicableRows, "top3RootBefore");
  const applicableRootAfter = rate(applicableRows, "top3RootAfter");
  const nonApplicableUnchanged = nonApplicableRows.filter((row) =>
    row.rank1Invariant
    && row.baselineRetained
    && row.existingScoreRetained
    && row.existingRelativeOrderRetained
    && JSON.stringify(row.top3Before) === JSON.stringify(row.top3After)).length;
  const allGroups = [...Object.values(byFamily), ...Object.values(byBassCondition)];
  const gatesWithoutOverall = {
    applicabilityMinimum: applicableRows.length >= splitMinimums[split],
    rank1Invariant: rows.every((row) => row.rank1Invariant),
    candidateSuperset: rows.every((row) => row.baselineRetained),
    existingScoreInvariant: rows.every((row) => row.existingScoreRetained),
    existingOrderInvariant: rows.every((row) => row.existingRelativeOrderRetained),
    baselineCanonicalTop3Preserved: rows.every((row) =>
      !row.top3CanonicalBefore || row.top3CanonicalAfter),
    baselineRootTop3Preserved: rows.every((row) =>
      !row.top3RootBefore || row.top3RootAfter),
    newCanonicalMissZero: newCanonicalMissCount === 0,
    newRootMissZero: newRootMissCount === 0,
    applicableCandidateRecallImproved:
      applicableCandidateAfter > applicableCandidateBefore,
    applicableTop3CanonicalNonRegressed:
      applicableTop3After >= applicableTop3Before,
    applicableTop3RootNonRegressed:
      applicableRootAfter >= applicableRootBefore,
    generatedRescuePositive: candidateRescueCount > 0,
    inertness: nonApplicableUnchanged === nonApplicableRows.length,
    mrrNonRegressed: mean(rows.map((row) => row.reciprocalRankAfter))
      >= mean(rows.map((row) => row.reciprocalRankBefore)),
    correctionCostNonRegressed:
      shadowCost.mean <= baselineCost.mean && shadowCost.p90 <= baselineCost.p90,
    manualInputNonRegressed: manualAfter <= manualBefore,
    duplicateZero: rows.every((row) => row.duplicateCount === 0),
    provenanceComplete: rows.every((row) => row.missingProvenanceCount === 0),
    economy: generatedTotal / rows.length <= 0.25 && maximumAdded <= 2,
    runtime: runtime.overheadRate <= 0.05,
    deterministic: firstDigest === repeatDigest,
    familyMajorRegressionZero: allGroups.every((group) =>
      group.candidateLoss === 0
      && group.top3CanonicalLoss === 0
      && group.top3RootLoss === 0),
  };
  const gates = {
    ...gatesWithoutOverall,
    overall: Object.values(gatesWithoutOverall).every(Boolean),
  };
  const phase = split === "dev"
    ? "4.7-05"
    : (split === "validation" ? "4.7-06" : "4.7-07");
  return {
    schemaVersion: 1,
    phase,
    corpusVersion: manifest.corpusVersion,
    split,
    evaluationPolicyVersion: "p47-fixed-part-a-evaluation-v1",
    productChanged: false,
    productConnected: false,
    eventCount: rows.length,
    applicability: {
      count: applicableRows.length,
      rate: applicableRows.length / rows.length,
      minimum: splitMinimums[split],
      pass: applicableRows.length >= splitMinimums[split],
    },
    invariants: {
      rank1Unchanged: rows.filter((row) => row.rank1Invariant).length,
      rank1Changed: rows.filter((row) => !row.rank1Invariant).length,
      baselineCandidateSetRetained: rows.filter((row) => row.baselineRetained).length,
      existingScoreRetained: rows.filter((row) => row.existingScoreRetained).length,
      existingRelativeOrderRetained:
        rows.filter((row) => row.existingRelativeOrderRetained).length,
      analyzerOutputUnchanged: rows.length,
    },
    candidatePool: {
      recallBefore: rate(rows, "candidateRecallBefore"),
      recallAfter: rate(rows, "candidateRecallAfter"),
      rescueCount: candidateRescueCount,
      lossCount: candidateLossCount,
      duplicateCount: rows.reduce((sum, row) => sum + row.duplicateCount, 0),
      missingProvenanceCount:
        rows.reduce((sum, row) => sum + row.missingProvenanceCount, 0),
    },
    top3: {
      canonicalBefore: rate(rows, "top3CanonicalBefore"),
      canonicalAfter: rate(rows, "top3CanonicalAfter"),
      rootBefore: rate(rows, "top3RootBefore"),
      rootAfter: rate(rows, "top3RootAfter"),
      baselineCanonicalHitCount:
        rows.filter((row) => row.top3CanonicalBefore).length,
      baselineCanonicalRetainedCount:
        rows.filter((row) => row.top3CanonicalBefore && row.top3CanonicalAfter).length,
      baselineRootHitCount: rows.filter((row) => row.top3RootBefore).length,
      baselineRootRetainedCount:
        rows.filter((row) => row.top3RootBefore && row.top3RootAfter).length,
      newCanonicalMissCount,
      newRootMissCount,
    },
    applicable: {
      count: applicableRows.length,
      candidateRecallBefore: applicableCandidateBefore,
      candidateRecallAfter: applicableCandidateAfter,
      candidateRescueCount: applicableRows.filter((row) =>
        !row.candidateRecallBefore && row.candidateRecallAfter).length,
      top3CanonicalBefore: applicableTop3Before,
      top3CanonicalAfter: applicableTop3After,
      top3RootBefore: applicableRootBefore,
      top3RootAfter: applicableRootAfter,
    },
    inertness: {
      nonApplicableCount: nonApplicableRows.length,
      unchangedCount: nonApplicableUnchanged,
      rate: nonApplicableRows.length === 0
        ? 1
        : nonApplicableUnchanged / nonApplicableRows.length,
    },
    mrr: {
      before: mean(rows.map((row) => row.reciprocalRankBefore)),
      after: mean(rows.map((row) => row.reciprocalRankAfter)),
      delta: mean(rows.map((row) =>
        row.reciprocalRankAfter - row.reciprocalRankBefore)),
    },
    correctionCost: {
      before: baselineCost,
      after: shadowCost,
      meanDelta: shadowCost.mean - baselineCost.mean,
      p90Delta: shadowCost.p90 - baselineCost.p90,
    },
    manualInputRequired: {
      before: manualBefore,
      after: manualAfter,
      delta: manualAfter - manualBefore,
    },
    economy: {
      totalAdded: generatedTotal,
      averageAddedPerEvent: generatedTotal / rows.length,
      maximumAddedPerEvent: maximumAdded,
    },
    runtime,
    determinism: {
      firstHash: firstDigest,
      repeatHash: repeatDigest,
      pass: firstDigest === repeatDigest,
    },
    byFamily,
    byBassCondition,
    gates,
    rows,
  };
}

function groupMetrics(
  rows: readonly EvaluationRow[],
  keys: (row: EvaluationRow) => string | readonly string[],
): Record<string, GroupMetrics> {
  const grouped = new Map<string, EvaluationRow[]>();
  for (const row of rows) {
    const rowKeys = keys(row);
    for (const key of typeof rowKeys === "string" ? [rowKeys] : rowKeys) {
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
  }
  return Object.fromEntries([...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, members]) => [key, {
      events: members.length,
      applicable: members.filter((row) => row.applicable).length,
      candidateRecallBefore:
        members.filter((row) => row.candidateRecallBefore).length,
      candidateRecallAfter:
        members.filter((row) => row.candidateRecallAfter).length,
      candidateGain: members.filter((row) =>
        !row.candidateRecallBefore && row.candidateRecallAfter).length,
      candidateLoss: members.filter((row) =>
        row.candidateRecallBefore && !row.candidateRecallAfter).length,
      top3CanonicalGain: members.filter((row) =>
        !row.top3CanonicalBefore && row.top3CanonicalAfter).length,
      top3CanonicalLoss: members.filter((row) =>
        row.top3CanonicalBefore && !row.top3CanonicalAfter).length,
      top3RootGain: members.filter((row) =>
        !row.top3RootBefore && row.top3RootAfter).length,
      top3RootLoss: members.filter((row) =>
        row.top3RootBefore && !row.top3RootAfter).length,
      unchanged: members.filter((row) =>
        row.candidateRecallBefore === row.candidateRecallAfter
        && row.top3CanonicalBefore === row.top3CanonicalAfter
        && row.top3RootBefore === row.top3RootAfter).length,
      inertEvents: members.filter((row) => !row.applicable).length,
      inertUnchanged: members.filter((row) =>
        !row.applicable
        && row.rank1Invariant
        && row.baselineRetained
        && row.existingScoreRetained
        && row.existingRelativeOrderRetained
        && JSON.stringify(row.top3Before) === JSON.stringify(row.top3After)).length,
    } satisfies GroupMetrics]));
}

function measurePerformance(
  files: Awaited<ReturnType<typeof loadPhase47Files>>["files"],
  repetitions: number,
) {
  const baselineSamples: Array<{ runtimeMs: number; heapBytes: number }> = [];
  const shadowSamples: Array<{ runtimeMs: number; heapBytes: number }> = [];
  for (let index = 0; index < repetitions; index += 1) {
    baselineSamples.push(measurePipeline(files, false));
    shadowSamples.push(measurePipeline(files, true));
  }
  const baselineMedianMs = median(baselineSamples.map((sample) => sample.runtimeMs));
  const shadowMedianMs = median(shadowSamples.map((sample) => sample.runtimeMs));
  return {
    repetitions,
    baselineMedianMs,
    shadowMedianMs,
    overheadRate: baselineMedianMs === 0
      ? 0
      : (shadowMedianMs - baselineMedianMs) / baselineMedianMs,
    baselineHeapMedianBytes:
      median(baselineSamples.map((sample) => sample.heapBytes)),
    shadowHeapMedianBytes:
      median(shadowSamples.map((sample) => sample.heapBytes)),
  };
}

function measurePipeline(
  files: Awaited<ReturnType<typeof loadPhase47Files>>["files"],
  withShadow: boolean,
) {
  const started = performance.now();
  const heapBefore = process.memoryUsage().heapUsed;
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
        checksum += generatePartACompanion(
          window.candidates,
          notesForWindow(loaded, window, beatsPerBar),
        ).candidates.length;
      }
    }
  }
  if (checksum === 0) throw new Error("Phase 4.7 split benchmark had no candidates.");
  return {
    runtimeMs: performance.now() - started,
    heapBytes: Math.max(0, process.memoryUsage().heapUsed - heapBefore),
  };
}

async function deterministicHash(
  files: Awaited<ReturnType<typeof loadPhase47Files>>["files"],
): Promise<string> {
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
        fileId: loaded.file.fileId,
        eventId: event.eventId,
        baseline: window.candidates.map((candidate) => ({
          label: candidate.chord.label,
          score: candidate.rawScore,
        })),
        generated: generated.candidates,
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

function rate(
  rows: readonly EvaluationRow[],
  key: keyof Pick<EvaluationRow,
    | "candidateRecallBefore"
    | "candidateRecallAfter"
    | "top3CanonicalBefore"
    | "top3CanonicalAfter"
    | "top3RootBefore"
    | "top3RootAfter">,
): number {
  return rows.length === 0 ? 0 : rows.filter((row) => row[key]).length / rows.length;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function manualInputRate(
  summary: ReturnType<typeof summarizeOperationCorrectionCosts>,
  eventCount: number,
): number {
  return eventCount === 0
    ? 0
    : (summary.byCategory["manual-input"] + summary.byCategory.unrepresentable)
      / eventCount;
}

function markdownReport(report: Phase47GoldSplitReport): string {
  const familyRows = Object.entries(report.byFamily)
    .map(([family, value]) =>
      `| ${family} | ${value.events} | ${value.applicable} | ${value.candidateGain} | ${value.candidateLoss} | ${value.top3CanonicalLoss} |`)
    .join("\n");
  const bassRows = Object.entries(report.byBassCondition)
    .map(([condition, value]) =>
      `| ${condition} | ${value.events} | ${value.applicable} | ${value.candidateGain} | ${value.candidateLoss} | ${value.top3CanonicalLoss} |`)
    .join("\n");
  const gateRows = Object.entries(report.gates)
    .map(([gate, passed]) => `| ${gate} | ${passed ? "PASS" : "FAIL"} |`)
    .join("\n");
  return `# Phase ${report.phase} ${report.split} Results

## 結論

- Gate: ${report.gates.overall ? "PASS" : "FAIL"}
- Corpus: \`${report.corpusVersion}\`
- Events / applicable: ${report.eventCount} / ${report.applicability.count}
- Product接続: なし
${report.split === "dev" && !report.gates.overall
    ? "- Stop condition: Dev Gate FAILのためValidation / Holdoutを実行せず、Productへ接続しない。"
    : ""}

## Invariants

- rank 1 unchanged: ${report.invariants.rank1Unchanged}/${report.eventCount}
- candidate set retained: ${report.invariants.baselineCandidateSetRetained}/${report.eventCount}
- existing score/order retained: ${report.invariants.existingScoreRetained}/${report.invariants.existingRelativeOrderRetained}
- duplicate / missing provenance: ${report.candidatePool.duplicateCount}/${report.candidatePool.missingProvenanceCount}
- inertness: ${(report.inertness.rate * 100).toFixed(4)}%

## Efficacy

| Metric | Before | Shadow |
|---|---:|---:|
| Candidate recall | ${(report.candidatePool.recallBefore * 100).toFixed(4)}% | ${(report.candidatePool.recallAfter * 100).toFixed(4)}% |
| Top-3 canonical | ${(report.top3.canonicalBefore * 100).toFixed(4)}% | ${(report.top3.canonicalAfter * 100).toFixed(4)}% |
| Top-3 root | ${(report.top3.rootBefore * 100).toFixed(4)}% | ${(report.top3.rootAfter * 100).toFixed(4)}% |
| MRR | ${report.mrr.before.toFixed(6)} | ${report.mrr.after.toFixed(6)} |
| Correction cost mean | ${report.correctionCost.before.mean.toFixed(6)} | ${report.correctionCost.after.mean.toFixed(6)} |
| Correction cost p90 | ${report.correctionCost.before.p90} | ${report.correctionCost.after.p90} |
| Manual input | ${(report.manualInputRequired.before * 100).toFixed(4)}% | ${(report.manualInputRequired.after * 100).toFixed(4)}% |

- candidate rescue / loss: ${report.candidatePool.rescueCount}/${report.candidatePool.lossCount}
- baseline canonical/root Top-3 retained: ${report.top3.baselineCanonicalRetainedCount}/${report.top3.baselineCanonicalHitCount}, ${report.top3.baselineRootRetainedCount}/${report.top3.baselineRootHitCount}
- new canonical/root miss: ${report.top3.newCanonicalMissCount}/${report.top3.newRootMissCount}
- added: ${report.economy.totalAdded} (${report.economy.averageAddedPerEvent.toFixed(6)}/event, max ${report.economy.maximumAddedPerEvent})

## Family

| Family | Events | Applicable | Candidate gain | Candidate loss | Top-3 canonical loss |
|---|---:|---:|---:|---:|---:|
${familyRows}

## Bass condition

| Condition | Events | Applicable | Candidate gain | Candidate loss | Top-3 canonical loss |
|---|---:|---:|---:|---:|---:|
${bassRows}

## Runtime / Determinism

- baseline / shadow median: ${report.runtime.baselineMedianMs.toFixed(3)} / ${report.runtime.shadowMedianMs.toFixed(3)} ms
- overhead: ${(report.runtime.overheadRate * 100).toFixed(4)}%
- deterministic: ${report.determinism.pass ? "PASS" : "FAIL"}

## Gates

| Gate | Result |
|---|---|
${gateRows}
`;
}

function optionValue(name: string): string | undefined {
  const inline = argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function runCli() {
  const split = optionValue("--split") as BassCompanionSplit | undefined;
  if (!split || !["dev", "validation", "holdout"].includes(split)) {
    throw new Error("--split must be dev, validation, or holdout.");
  }
  const report = await evaluatePhase47GoldSplit(
    split,
    resolve(cwd(), optionValue("--corpus") ?? defaultBassCompanionCorpusDir),
  );
  const prefix = split === "dev"
    ? "05-dev-results"
    : (split === "validation" ? "06-validation-results" : "07-holdout-results");
  await Promise.all([
    writeFile(
      resolve(cwd(), `docs/phase4.7/${prefix}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(cwd(), `docs/phase4.7/${prefix}.md`),
      markdownReport(report),
      "utf8",
    ),
  ]);
  stdout.write(`${JSON.stringify({
    split,
    applicability: report.applicability,
    candidatePool: report.candidatePool,
    top3: report.top3,
    mrr: report.mrr,
    economy: report.economy,
    runtime: report.runtime,
    gates: report.gates,
  }, null, 2)}\n`);
  if (!report.gates.overall) process.exitCode = 1;
}

if (argv.some((argument) => argument.replaceAll("\\", "/").endsWith(
  "scripts/evaluate-phase47-gold-split.ts",
))) {
  await runCli();
}
