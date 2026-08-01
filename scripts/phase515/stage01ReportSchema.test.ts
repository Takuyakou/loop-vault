import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { afterAll, describe, expect, it } from "vitest";
import {
  isMemoryChildOutputPrivacySafe,
  isSnapshotEntryInaccessible,
  classifyRuntimeTerminal,
  interpretTimedChildProcessResult,
  runtimeChildBundleParentRoot,
  runtimeTransitions,
  scavengeRuntimeChildBundles,
  parseMemoryChildOutput,
  measurePairedProtocol,
  runTimedChildProcess,
  runTimedChildProcessAsync,
  stage01ExitCode,
  stage01ExternalContentionState,
  type TimedRuntimeSample,
} from "./evaluate-stage01";
import {
  STAGE01_EXCLUDED_SUITE_ID,
  STAGE01_CASE36_SAMPLES_PER_ATTEMPT,
  STAGE01_CASE36_INPUT_DIGEST_SHA256,
  STAGE01_FROZEN_CASE36_BASELINE_MS,
  STAGE01_FROZEN_RUNTIME_BASELINE_SHA256,
  STAGE01_FROZEN_SUITE_COUNTS,
  STAGE01_FROZEN_SUITE_IDS,
  STAGE01_FROZEN_VOICING40_SELECTION_DIGEST,
  STAGE01_FROZEN_VOICING40_TOTAL_MS,
  STAGE01_PROTECTED_CASE_COUNTS,
  STAGE01_REQUIRED_CONDITION_IDS,
  STAGE01_RUNTIME_AGGREGATE_RULE,
  STAGE01_RUNTIME_ATTEMPT_COUNT,
  STAGE01_VOICING40_SAMPLES_PER_ATTEMPT,
  STAGE01_VOICING40_INPUT_DIGEST_SHA256,
  isStrictStage01NoteEvidenceDedupDiagnostics,
  stage01RuntimeAttemptId,
  stage01Ratio,
  stage01ReportSchema,
} from "./stage01ReportSchema";
import { STAGE01_ANALYZER_CONFIG_SHA256 } from "./stage01CorpusLock";
import {
  evaluateStage01MemoryPair,
  linearSlope,
  memorySampleArithmeticValid,
  memorySampleRetainedPass,
  type Stage01MemorySample,
} from "./stage01MemoryPolicy";

const correctnessImprovement =
  "case 03 exact evidence 66 -> 33; case 02/03 normalized deep equal" as const;
const runtimeRunNonce = "11111111-1111-4111-8111-111111111111" as const;
const runtimeChildBundleRoot = mkdtempSync(resolve(tmpdir(), "p515-runtime-child-bundle-"));
const runtimeChildBundlePath = resolve(runtimeChildBundleRoot, "stage01RuntimeChild.mjs");
buildSync({
  entryPoints: [resolve(import.meta.dirname, "stage01RuntimeChild.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: runtimeChildBundlePath,
  logLevel: "silent",
});
afterAll(() => rmSync(runtimeChildBundleRoot, { recursive: true, force: true }));
const voicingBaseline = {
  median: STAGE01_FROZEN_VOICING40_TOTAL_MS,
  p95: STAGE01_FROZEN_VOICING40_TOTAL_MS,
  max: STAGE01_FROZEN_VOICING40_TOTAL_MS,
};
const invariant = (status: "NOT_APPLICABLE" | "UNCHANGED_BY_CONSTRUCTION") => ({
  status,
  currentReference: 1,
  dependencyProof: "exact-note dedup is confined to offline MIDI analysis",
  verificationTest: "stage01 construction-invariant dependency test",
  constructionInvariant: true,
});
const completedTransitions = (elapsedMs: number): TimedRuntimeSample["transitions"] => [
  { state: "started" as const, monotonicDurationMs: 0 },
  { state: "running" as const, monotonicDurationMs: 0 },
  { state: "child-exited" as const, monotonicDurationMs: elapsedMs },
  { state: "terminal-completed" as const, monotonicDurationMs: elapsedMs },
];
const strictRuntimeFingerprint = () => ({
  warmupRuns: 1 as const,
  warmupAnalysisCount: 1,
  config: { mode: "phase4-v1" as const, enableExactNoteEvidenceDedup: true },
  inputDigestSha256: STAGE01_CASE36_INPUT_DIGEST_SHA256,
  analyzerConfigVersionSha256: STAGE01_ANALYZER_CONFIG_SHA256,
  featureFlagEnabled: true,
  analysisCount: 1,
  measurementKind: "planned" as const,
  plannedSampleIndex: 1,
  benchmarkId: "case36-three-minute" as const,
  protocolAttempt: 1,
  generation: 1 as const,
  attemptId: stage01RuntimeAttemptId({
    runNonce: runtimeRunNonce,
    benchmarkId: "case36-three-minute",
    protocolAttempt: 1,
    featureFlagEnabled: true,
    plannedSampleIndex: 1,
    measurementKind: "planned",
    generation: 1,
  }),
  runNonce: runtimeRunNonce,
  deadlineDurationMs: 300_000 as const,
});
const timeoutTransitions = (): TimedRuntimeSample["transitions"] => [
  { state: "started" as const, monotonicDurationMs: 0 },
  { state: "running" as const, monotonicDurationMs: 0 },
  { state: "terminate-requested" as const, monotonicDurationMs: 300_000 },
  { state: "child-exited" as const, monotonicDurationMs: 300_000 },
  { state: "terminal-timeout" as const, monotonicDurationMs: 300_000 },
];
const measured = (
  samplesPerAttempt: number,
  baselineMs: { median: number; p95: number; max: number },
  featureFlagEnabled: boolean,
  analysisCount: number,
) => ({
  protocolAttemptCount: STAGE01_RUNTIME_ATTEMPT_COUNT,
  samplesPerAttempt,
  aggregateRule: STAGE01_RUNTIME_AGGREGATE_RULE,
  attempts: Array.from({ length: STAGE01_RUNTIME_ATTEMPT_COUNT }, (_, index) => ({
    attempt: index + 1,
    warmupRuns: samplesPerAttempt,
    plannedSampleCount: samplesPerAttempt,
    measuredSampleCount: samplesPerAttempt,
    skippedSampleCount: 0,
    retryCount: 0,
    terminatedAfterTimeoutLimit: false,
    timeoutTargetMs: 300_000,
    measurementOrder: "alternating-OFF-ON; odd-pairs-OFF-first; even-pairs-ON-first",
    rawSamples: Array.from({ length: samplesPerAttempt }, (_, sampleIndex) => {
      const benchmarkId = analysisCount === 1
        ? "case36-three-minute" as const : "voicing-gold-development-40" as const;
      const plannedSampleIndex = sampleIndex + 1;
      return {
      status: "completed" as "completed" | "timeout",
      elapsedMs: 1,
      timeoutMs: 300_000,
      warmupRuns: 1 as const,
      warmupAnalysisCount: analysisCount,
      config: {
        mode: "phase4-v1" as const,
        enableExactNoteEvidenceDedup: featureFlagEnabled,
      },
      inputDigestSha256: analysisCount === 1
        ? STAGE01_CASE36_INPUT_DIGEST_SHA256 : STAGE01_VOICING40_INPUT_DIGEST_SHA256,
      analyzerConfigVersionSha256: STAGE01_ANALYZER_CONFIG_SHA256,
      featureFlagEnabled,
      analysisCount,
      measurementKind: "planned" as "planned" | "timeout-retry",
      plannedSampleIndex,
      benchmarkId,
      protocolAttempt: index + 1,
      generation: 1,
      attemptId: stage01RuntimeAttemptId({
        runNonce: runtimeRunNonce,
        benchmarkId, protocolAttempt: index + 1, featureFlagEnabled,
        plannedSampleIndex, measurementKind: "planned", generation: 1,
      }),
      runNonce: runtimeRunNonce as string,
      deadlineDurationMs: 300_000,
      observedProcessDurationMs: 1,
      timeoutKind: null as TimedRuntimeSample["timeoutKind"],
      lifecycleState: "terminal-completed" as "terminal-completed" | "terminal-timeout",
      transitions: completedTransitions(1),
    }; }),
    samplesMs: Array.from({ length: samplesPerAttempt }, () => 1),
    timeoutCount: 0,
    summaryMs: { count: samplesPerAttempt, median: 1, p95: 1, max: 1 },
    baselineMs: { ...baselineMs },
    ratiosToStage00: {
      median: stage01Ratio(1, baselineMs.median),
      p95: stage01Ratio(1, baselineMs.p95),
      max: stage01Ratio(1, baselineMs.max),
    },
    contentionTelemetry: {
      elapsedMs: 2,
      cpuUserMicros: 1,
      cpuSystemMicros: 1,
      contentionObserved: false,
      reason: "NO_EXTERNAL_CPU_CONTENTION_DECLARED" as const,
    },
    reason: "fixed protocol",
  })),
  samplesMs: Array.from({ length: STAGE01_RUNTIME_ATTEMPT_COUNT * samplesPerAttempt }, () => 1),
  summaryMs: { count: STAGE01_RUNTIME_ATTEMPT_COUNT * samplesPerAttempt, median: 1, p95: 1, max: 1 },
  baselineMs: { ...baselineMs },
  ratiosToStage00: {
    median: stage01Ratio(1, baselineMs.median),
    p95: stage01Ratio(1, baselineMs.p95),
    max: stage01Ratio(1, baselineMs.max),
  },
  outlierNote: "no observed contention",
  timeoutCount: 0,
});

function setMeasured(runtime: ReturnType<typeof measured>, sample: number): void {
  for (const attempt of runtime.attempts) {
    attempt.rawSamples = Array.from({ length: runtime.samplesPerAttempt }, (_, sampleIndex) => {
      const benchmarkId = attempt.rawSamples[0]!.benchmarkId;
      const plannedSampleIndex = sampleIndex + 1;
      return {
      status: "completed" as "completed" | "timeout",
      elapsedMs: sample,
      timeoutMs: 300_000,
      warmupRuns: 1 as const,
      warmupAnalysisCount: attempt.rawSamples[0]!.warmupAnalysisCount,
      config: { ...attempt.rawSamples[0]!.config },
      inputDigestSha256: attempt.rawSamples[0]!.inputDigestSha256,
      analyzerConfigVersionSha256: STAGE01_ANALYZER_CONFIG_SHA256,
      featureFlagEnabled: attempt.rawSamples[0]!.featureFlagEnabled,
      analysisCount: attempt.rawSamples[0]!.analysisCount,
      measurementKind: "planned" as "planned" | "timeout-retry",
      plannedSampleIndex,
      benchmarkId,
      protocolAttempt: attempt.attempt,
      generation: 1,
      attemptId: stage01RuntimeAttemptId({
        runNonce: runtimeRunNonce,
        benchmarkId, protocolAttempt: attempt.attempt,
        featureFlagEnabled: attempt.rawSamples[0]!.featureFlagEnabled,
        plannedSampleIndex, measurementKind: "planned", generation: 1,
      }),
      runNonce: runtimeRunNonce as string,
      deadlineDurationMs: 300_000,
      observedProcessDurationMs: sample,
      timeoutKind: null as TimedRuntimeSample["timeoutKind"],
      lifecycleState: "terminal-completed" as "terminal-completed" | "terminal-timeout",
      transitions: completedTransitions(sample),
    }; });
    attempt.samplesMs = Array.from({ length: runtime.samplesPerAttempt }, () => sample);
    attempt.summaryMs = {
      count: runtime.samplesPerAttempt,
      median: sample,
      p95: sample,
      max: sample,
    };
    attempt.ratiosToStage00 = {
      median: stage01Ratio(sample, runtime.baselineMs.median),
      p95: stage01Ratio(sample, runtime.baselineMs.p95),
      max: stage01Ratio(sample, runtime.baselineMs.max),
    };
    attempt.contentionTelemetry.elapsedMs = sample;
  }
  runtime.samplesMs = runtime.attempts.flatMap((attempt) => attempt.samplesMs);
  runtime.summaryMs = {
    count: runtime.samplesMs.length,
    median: sample,
    p95: sample,
    max: sample,
  };
  runtime.ratiosToStage00 = {
    median: stage01Ratio(sample, runtime.baselineMs.median),
    p95: stage01Ratio(sample, runtime.baselineMs.p95),
    max: stage01Ratio(sample, runtime.baselineMs.max),
  };
}

function memorySample(
  enabled: boolean,
  options: {
    peakDeltaRssBytes?: number;
    retainedRssPerIteration?: number;
    retainedHeapPerIteration?: number;
    retainedExternalPerIteration?: number;
  } = {},
): Stage01MemorySample {
  const before = { rssBytes: 100_000_000, heapUsedBytes: 20_000_000, externalBytes: 2_000_000 };
  const series = Array.from({ length: 25 }, (_, index) => ({
    rssBytes: before.rssBytes + index * (options.retainedRssPerIteration ?? 0),
    heapUsedBytes: before.heapUsedBytes + index * (options.retainedHeapPerIteration ?? 0),
    externalBytes: before.externalBytes + index * (options.retainedExternalPerIteration ?? 0),
  }));
  const postGc = series.at(-1)!;
  const coldBefore = { ...before };
  const postWarmupGc = { ...before };
  return {
    enabled,
    warmupIterations: 6,
    measuredIterations: 24,
    gcExposed: true,
    coldBefore,
    warmupPeaks: Array.from({ length: 6 }, () => ({ ...before })),
    postWarmupGc,
    warmupRetainedGrowth: {
      rssBytes: postWarmupGc.rssBytes - coldBefore.rssBytes,
      heapUsedBytes: postWarmupGc.heapUsedBytes - coldBefore.heapUsedBytes,
      externalBytes: postWarmupGc.externalBytes - coldBefore.externalBytes,
    },
    before,
    peak: {
      rssBytes: before.rssBytes + (options.peakDeltaRssBytes ?? 1024 * 1024),
      heapUsedBytes: Math.max(before.heapUsedBytes, postGc.heapUsedBytes),
      externalBytes: Math.max(before.externalBytes, postGc.externalBytes),
    },
    postGc,
    retainedGrowth: {
      rssBytes: postGc.rssBytes - before.rssBytes,
      heapUsedBytes: postGc.heapUsedBytes - before.heapUsedBytes,
      externalBytes: postGc.externalBytes - before.externalBytes,
    },
    retainedSlopeBytesPerIteration: {
      rssBytes: linearSlope(series.map((point) => point.rssBytes)),
      heapUsedBytes: linearSlope(series.map((point) => point.heapUsedBytes)),
      externalBytes: linearSlope(series.map((point) => point.externalBytes)),
    },
    postGcSeries: series,
    temporaryArtifactsCreated: 0,
  };
}

function report() {
  const suites = STAGE01_FROZEN_SUITE_IDS.map((id) => id === STAGE01_EXCLUDED_SUITE_ID
    ? {
        id,
        status: "EXCLUDED",
        reason: "frozen exclusion",
        frozenFileCount: STAGE01_FROZEN_SUITE_COUNTS[id],
        evaluatedFileCount: 0,
        conditionsEvaluated: [],
        normalizedRegressions: [],
      }
    : {
        id,
        status: "COMPLETED",
        reason: "evaluated",
        frozenFileCount: STAGE01_FROZEN_SUITE_COUNTS[id],
        evaluatedFileCount: STAGE01_FROZEN_SUITE_COUNTS[id],
        conditionsEvaluated: [...STAGE01_REQUIRED_CONDITION_IDS],
        normalizedRegressions: [],
      });
  const memoryPairs = [[false, true], [true, false], [false, true]].map(() => {
    const off = memorySample(false);
    const on = memorySample(true);
    return { off, on, ...evaluateStage01MemoryPair(off, on) };
  });
  return {
    schemaVersion: 5,
    phase: "P5.15-01",
    holdoutEvaluated: false,
    frozenBaselineContract: {
      runtimeBaselineSha256: STAGE01_FROZEN_RUNTIME_BASELINE_SHA256,
      case36RuntimeMs: { ...STAGE01_FROZEN_CASE36_BASELINE_MS },
      voicing40TotalMs: STAGE01_FROZEN_VOICING40_TOTAL_MS,
      voicing40OrderedPathHashLengthDigest: STAGE01_FROZEN_VOICING40_SELECTION_DIGEST,
      verifiedBeforeAnalysis: true,
    },
    targeted: {
      clean: { original: 33, effective: 33 },
      duplicate: { original: 66, effective: 33, duplicates: 33 },
      normalizedDeepEqual: true,
      scoreRankConfidenceEqual: true,
      protectedCases: structuredClone(STAGE01_PROTECTED_CASE_COUNTS),
      modeMatrix: STAGE01_REQUIRED_CONDITION_IDS.map((condition) => ({
        condition,
        normalizedDeepEqual: true,
        cleanEffective: 33,
        duplicateEffective: 33,
      })),
    },
    existingCorpora: {
      status: "COMPLETED",
      frozenSafeSuiteCount: 10,
      completedSuiteCount: 10,
      skippedSuiteCount: 0,
      evaluatedFileCount: 317,
      conditions: [...STAGE01_REQUIRED_CONDITION_IDS],
      suites,
      normalizedRegressions: [],
    },
    runtime: {
      protocol: {
        attemptCount: STAGE01_RUNTIME_ATTEMPT_COUNT,
        warmupRunsPerMeasuredSample: 1,
        case36SamplesPerProfilePerAttempt: STAGE01_CASE36_SAMPLES_PER_ATTEMPT,
        voicing40SamplesPerProfilePerAttempt: STAGE01_VOICING40_SAMPLES_PER_ATTEMPT,
        order: "alternating-OFF-ON; odd-pairs-OFF-first; even-pairs-ON-first",
        aggregateRule: STAGE01_RUNTIME_AGGREGATE_RULE,
        rerunReplacementAllowed: false,
      },
      rawFingerprintEvidence: {
        timeoutMs: 300_000,
        analyzerConfigVersionSha256: STAGE01_ANALYZER_CONFIG_SHA256,
        case36InputDigestSha256: STAGE01_CASE36_INPUT_DIGEST_SHA256,
        voicing40InputDigestSha256: STAGE01_VOICING40_INPUT_DIGEST_SHA256,
      },
      stable: {
        threeMinuteCase36: {
          ...measured(STAGE01_CASE36_SAMPLES_PER_ATTEMPT, STAGE01_FROZEN_CASE36_BASELINE_MS, false, 1),
          profile: "Stable",
          featureFlagEnabled: false,
          frozenThreeMinuteTenSecondLimitMs: 10_000,
          frozenStage00RatioLimit: 1.25,
          underTenSeconds: true,
          withinStage00Ratio: true,
          compliancePass: true,
        },
        voicingGoldDevelopment40: {
          status: "COMPLETED",
          ...measured(STAGE01_VOICING40_SAMPLES_PER_ATTEMPT, voicingBaseline, false, 40),
          profile: "Stable",
          featureFlagEnabled: false,
          frozenStage00RatioLimit: 1.25,
          lockedFileCount: 40,
          lockedSelectionDigest: STAGE01_FROZEN_VOICING40_SELECTION_DIGEST,
          lockVerifiedImmediatelyBeforeBenchmark: true,
          compliancePass: true,
        },
        liveMidiConfirmedP50Ms: invariant("NOT_APPLICABLE"),
        liveMidiConfirmedP90Ms: invariant("NOT_APPLICABLE"),
        chordDojoP50MsPerOperation: invariant("UNCHANGED_BY_CONSTRUCTION"),
        chordDojoP95MsPerOperation: invariant("UNCHANGED_BY_CONSTRUCTION"),
      },
      accuracyFirst: {
        threeMinuteCase36: {
          ...measured(STAGE01_CASE36_SAMPLES_PER_ATTEMPT, STAGE01_FROZEN_CASE36_BASELINE_MS, true, 1),
          profile: "Accuracy First",
          featureFlagEnabled: true,
          performanceTier: "UNDER_60_SECONDS",
          tierEligible: true,
          runtimeIncreaseReason: "deterministic extra pass",
          correctnessImprovement,
        },
        voicingGoldDevelopment40: {
          status: "COMPLETED",
          ...measured(STAGE01_VOICING40_SAMPLES_PER_ATTEMPT, voicingBaseline, true, 40),
          profile: "Accuracy First",
          featureFlagEnabled: true,
          lockedFileCount: 40,
          lockedSelectionDigest: STAGE01_FROZEN_VOICING40_SELECTION_DIGEST,
          sameLockedBytesAsStable: true,
          sameInMemoryHandlesAsStable: true,
        },
        uiContract: {
          requirementBasisMaxMs: 1,
          uiThreadNonBlocking: "NOT_REQUIRED_UNDER_ONE_SECOND",
          progressCapability: "NOT_REQUIRED_UNDER_ONE_SECOND",
          cancellationCapability: "NOT_REQUIRED_UNDER_ONE_SECOND",
          doubleStartPrevention: "NOT_REQUIRED_UNDER_ONE_SECOND",
          routeAndExitResourceRelease: "NOT_REQUIRED_UNDER_ONE_SECOND",
          noFabricatedResultBeforeCompletion: true,
          timeoutDistinctFromDetectionFailure: true,
          implementationStatus: "application contract preserved; no new Stage 01 UI",
        },
        performanceEligibility: "ELIGIBLE",
        productConnectionStatus: "CONNECTED",
        performanceEligibilityReason: "under provisional threshold",
        performanceBasisMaxMs: 1,
        inputsOver300Seconds: [] as Array<
          "case36-three-minute" | "voicing-gold-development-40"
        >,
        timeoutCount: 0,
      },
      memory: {
        processModel: "isolated-child",
        order: ["OFF->ON", "ON->OFF", "OFF->ON"],
        pairs: memoryPairs,
        medianPairedRatio: 1,
        accuracyFirstPeakRssBytes: 101_048_576,
        zeroDenominatorPolicy: "off peak delta below 4 MiB uses absolute retained-growth/slope plus 64 MiB transient allowance; significant deltas retain 1.25x ratio",
        threshold: 1.25,
        resourceSafetyPass: true,
        frozenStage00AbsoluteRssReferenceBytes: 642822144,
        referenceOnly: true,
        childContractValid: true,
        childOutputPrivacySafe: true,
        temporaryArtifactsCreated: 0,
        parentTemporaryArtifactsCreated: 0,
      },
      accuracyRuntimeTable: [
        {
          benchmark: "case36-three-minute",
          correctnessImprovement,
          stableRuntimeMs: { count: 14, median: 1, p95: 1, max: 1 },
          accuracyFirstRuntimeMs: { count: 14, median: 1, p95: 1, max: 1 },
          ratiosToStage00: {
            median: stage01Ratio(1, STAGE01_FROZEN_CASE36_BASELINE_MS.median),
            p95: stage01Ratio(1, STAGE01_FROZEN_CASE36_BASELINE_MS.p95),
            max: stage01Ratio(1, STAGE01_FROZEN_CASE36_BASELINE_MS.max),
          },
          timeoutCount: 0,
          effectiveMaxMs: 1,
          performanceTier: "UNDER_60_SECONDS",
          tierEligible: true,
          performanceEligibility: "ELIGIBLE",
        },
        {
          benchmark: "voicing-gold-development-40",
          correctnessImprovement,
          stableRuntimeMs: { count: 10, median: 1, p95: 1, max: 1 },
          accuracyFirstRuntimeMs: { count: 10, median: 1, p95: 1, max: 1 },
          ratiosToStage00: {
            median: stage01Ratio(1, STAGE01_FROZEN_VOICING40_TOTAL_MS),
            p95: stage01Ratio(1, STAGE01_FROZEN_VOICING40_TOTAL_MS),
            max: stage01Ratio(1, STAGE01_FROZEN_VOICING40_TOTAL_MS),
          },
          timeoutCount: 0,
          effectiveMaxMs: 1,
          performanceTier: "UNDER_60_SECONDS",
          tierEligible: true,
          performanceEligibility: "ELIGIBLE",
        },
      ],
    },
    correctnessAdoptionGate: {
      pass: true,
      newCorrectnessRegressions: 0,
      targetedImprovementCount: 1,
      invariantPairsPass: true,
      deterministic: true,
      rollbackAvailable: true,
      issues: [],
    },
    stableEligibilityGate: { pass: true, issues: [] },
    accuracyFirstEligibilityGate: {
      pass: true,
      eligibility: "ELIGIBLE",
      runtimeAloneCanFailAdoption: false,
      issues: [],
    },
    resourceGate: { pass: true, issues: [] },
    gates: {
      adoptionPass: true,
      requireStableEligibilityPass: true,
      issues: [],
    },
  };
}

describe("Stage 01 note-evidence diagnostics capability guard", () => {
  const validDiagnostics = () => ({
    originalNoteCount: 4,
    effectiveNoteCount: 2,
    duplicateCount: 2,
    groups: [{
      representativeId: "evidence-000001",
      duplicateCount: 2,
      duplicateIds: ["evidence-000002", "evidence-000003"],
      reason: "exact-note-evidence" as const,
    }],
  });

  it("accepts globally unique grouped evidence plus an implicit singleton", () => {
    expect(isStrictStage01NoteEvidenceDedupDiagnostics(validDiagnostics())).toBe(true);
    expect(isStrictStage01NoteEvidenceDedupDiagnostics({
      originalNoteCount: 3,
      effectiveNoteCount: 3,
      duplicateCount: 0,
      groups: [],
    })).toBe(true);
  });

  it.each([
    ["repeated duplicate in one group", () => {
      const value = validDiagnostics();
      value.groups[0]!.duplicateIds[1] = value.groups[0]!.duplicateIds[0]!;
      return value;
    }],
    ["cross-group evidence reuse", () => ({
      originalNoteCount: 4,
      effectiveNoteCount: 2,
      duplicateCount: 2,
      groups: [
        {
          representativeId: "evidence-000001",
          duplicateCount: 1,
          duplicateIds: ["evidence-000002"],
          reason: "exact-note-evidence" as const,
        },
        {
          representativeId: "evidence-000003",
          duplicateCount: 1,
          duplicateIds: ["evidence-000002"],
          reason: "exact-note-evidence" as const,
        },
      ],
    })],
    ["representative repeated as its duplicate", () => ({
      originalNoteCount: 2,
      effectiveNoteCount: 1,
      duplicateCount: 1,
      groups: [{
        representativeId: "evidence-000001",
        duplicateCount: 1,
        duplicateIds: ["evidence-000001"],
        reason: "exact-note-evidence" as const,
      }],
    })],
    ["inconsistent aggregate arithmetic", () => ({
      ...validDiagnostics(),
      duplicateCount: 3,
      effectiveNoteCount: 1,
    })],
  ] as const)("rejects %s", (_name, forge) => {
    expect(isStrictStage01NoteEvidenceDedupDiagnostics(forge())).toBe(false);
  });
});

describe("stage01ReportSchema independent fail-closed contract", () => {
  it("accepts the exact frozen non-Holdout report", () => {
    expect(stage01ReportSchema.parse(report()).holdoutEvaluated).toBe(false);
  });

  it("rejects replacing every raw input digest with another valid 64-hex value", () => {
    const value = report();
    const replacement = "f".repeat(64);
    const attempts = [
      ...value.runtime.stable.threeMinuteCase36.attempts,
      ...value.runtime.accuracyFirst.threeMinuteCase36.attempts,
      ...(value.runtime.stable.voicingGoldDevelopment40.status === "COMPLETED"
        ? value.runtime.stable.voicingGoldDevelopment40.attempts : []),
      ...(value.runtime.accuracyFirst.voicingGoldDevelopment40.status === "COMPLETED"
        ? value.runtime.accuracyFirst.voicingGoldDevelopment40.attempts : []),
    ];
    for (const attempt of attempts) {
      for (const sample of attempt.rawSamples) {
        Reflect.set(sample, "inputDigestSha256", replacement);
      }
    }
    expect(() => stage01ReportSchema.parse(value)).toThrow(/fixed benchmark input\/config/u);
  });

  it.each([
    ["target deep equal", (value: ReturnType<typeof report>) => { value.targeted.normalizedDeepEqual = false; }],
    ["score/rank", (value: ReturnType<typeof report>) => { value.targeted.scoreRankConfidenceEqual = false; }],
    ["target count", (value: ReturnType<typeof report>) => { value.targeted.clean.effective = 32; }],
    ["duplicate arithmetic", (value: ReturnType<typeof report>) => { value.targeted.duplicate.duplicates = 32; }],
    ["protected fixed count", (value: ReturnType<typeof report>) => {
      (value.targeted.protectedCases as Record<string, { original: number; effective: number }>)["12"]!.effective = 8;
    }],
    ["mode deep equal", (value: ReturnType<typeof report>) => { value.targeted.modeMatrix[0].normalizedDeepEqual = false; }],
    ["mode order", (value: ReturnType<typeof report>) => { [value.targeted.modeMatrix[0], value.targeted.modeMatrix[1]] = [value.targeted.modeMatrix[1], value.targeted.modeMatrix[0]]; }],
    ["suite frozen count", (value: ReturnType<typeof report>) => {
      (value.existingCorpora.suites[0] as { frozenFileCount: number }).frozenFileCount = 2;
    }],
    ["safe total 317", (value: ReturnType<typeof report>) => { value.existingCorpora.evaluatedFileCount = 316; }],
    ["runtime summary", (value: ReturnType<typeof report>) => { value.runtime.accuracyFirst.threeMinuteCase36.summaryMs.max = 2; }],
    ["runtime ratio", (value: ReturnType<typeof report>) => { value.runtime.accuracyFirst.threeMinuteCase36.ratiosToStage00.max = 2; }],
    ["memory pair ratio", (value: ReturnType<typeof report>) => { value.runtime.memory.pairs[0].peakDeltaRatio = 2; }],
    ["memory median", (value: ReturnType<typeof report>) => { value.runtime.memory.medianPairedRatio = 2; }],
    ["construction literal", (value: ReturnType<typeof report>) => { value.runtime.stable.liveMidiConfirmedP50Ms.status = "UNCHANGED_BY_CONSTRUCTION"; }],
    ["frozen baseline SHA", (value: ReturnType<typeof report>) => { value.frozenBaselineContract.runtimeBaselineSha256 = "bad" as typeof value.frozenBaselineContract.runtimeBaselineSha256; }],
    ["frozen case36 constant", (value: ReturnType<typeof report>) => { (value.frozenBaselineContract.case36RuntimeMs as { median: number }).median = 1; }],
    ["case36 denominator", (value: ReturnType<typeof report>) => { value.runtime.stable.threeMinuteCase36.baselineMs.median = 1; }],
    ["Voicing40 denominator", (value: ReturnType<typeof report>) => { value.runtime.accuracyFirst.voicingGoldDevelopment40.baselineMs.max = 1; }],
    ["Voicing40 selection digest", (value: ReturnType<typeof report>) => { value.runtime.stable.voicingGoldDevelopment40.lockedSelectionDigest = "bad" as typeof value.runtime.stable.voicingGoldDevelopment40.lockedSelectionDigest; }],
    ["attempt deletion", (value: ReturnType<typeof report>) => { value.runtime.stable.threeMinuteCase36.attempts.pop(); }],
    ["attempt telemetry", (value: ReturnType<typeof report>) => { value.runtime.stable.threeMinuteCase36.attempts[0].contentionTelemetry.elapsedMs = 0; }],
    ["same handles", (value: ReturnType<typeof report>) => { value.runtime.accuracyFirst.voicingGoldDevelopment40.sameInMemoryHandlesAsStable = false; }],
    ["gate subpass", (value: ReturnType<typeof report>) => { value.correctnessAdoptionGate.pass = false; }],
    ["gate issues", (value: ReturnType<typeof report>) => { (value.gates.issues as string[]).push("invented"); }],
  ])("rejects mutated %s", (_name, mutate) => {
    const value = report();
    mutate(value);
    expect(() => stage01ReportSchema.parse(value)).toThrow();
  });

  it("does not fail Accuracy First adoption solely for runtime increase", () => {
    const value = report();
    const runtime = value.runtime.accuracyFirst.threeMinuteCase36;
    setMeasured(runtime, 100_000);
    runtime.performanceTier = "60_TO_180_SECONDS";
    value.runtime.accuracyFirst.uiContract.requirementBasisMaxMs = 100_000;
    value.runtime.accuracyFirst.uiContract.uiThreadNonBlocking = "APPLICATION_CONTRACT_PRESERVED";
    value.runtime.accuracyFirst.uiContract.progressCapability = "APPLICATION_CONTRACT_PRESERVED";
    value.runtime.accuracyFirst.uiContract.cancellationCapability = "APPLICATION_CONTRACT_PRESERVED";
    value.runtime.accuracyFirst.uiContract.doubleStartPrevention = "APPLICATION_CONTRACT_PRESERVED";
    value.runtime.accuracyFirst.uiContract.routeAndExitResourceRelease = "APPLICATION_CONTRACT_PRESERVED";
    value.runtime.accuracyFirst.performanceBasisMaxMs = 100_000;
    value.runtime.accuracyRuntimeTable[0].accuracyFirstRuntimeMs = { ...runtime.summaryMs };
    value.runtime.accuracyRuntimeTable[0].ratiosToStage00 = { ...runtime.ratiosToStage00 };
    value.runtime.accuracyRuntimeTable[0].effectiveMaxMs = 100_000;
    value.runtime.accuracyRuntimeTable[0].performanceTier = "60_TO_180_SECONDS";
    expect(stage01ReportSchema.parse(value).gates.adoptionPass).toBe(true);
  });

  it("rejects a completed sample beyond the fixed timeout boundary", () => {
    const value = report();
    const runtime = value.runtime.accuracyFirst.threeMinuteCase36;
    runtime.attempts[1].samplesMs[runtime.samplesPerAttempt - 1] = 310_000;
    runtime.attempts[1].rawSamples[runtime.samplesPerAttempt - 1] = {
      ...runtime.attempts[1].rawSamples[runtime.samplesPerAttempt - 1]!,
      status: "completed",
      elapsedMs: 310_000,
    };
    expect(() => stage01ReportSchema.parse(value)).toThrow(/timeout boundary/u);
  });

  it("rejects stale attempt IDs and terminal-to-running lifecycle evidence", () => {
    const stale = report();
    stale.runtime.accuracyFirst.threeMinuteCase36.attempts[0].rawSamples[0].attemptId = "0".repeat(64);
    expect(() => stage01ReportSchema.parse(stale)).toThrow(/independently recomputed/u);

    const reopened = report();
    reopened.runtime.accuracyFirst.threeMinuteCase36.attempts[0].rawSamples[0].transitions = [
      ...completedTransitions(1),
      { state: "running", monotonicDurationMs: 1 },
    ];
    expect(() => stage01ReportSchema.parse(reopened)).toThrow(/lifecycle transition/u);

    const duplicateTerminal = report();
    duplicateTerminal.runtime.accuracyFirst.threeMinuteCase36.attempts[0]
      .rawSamples[0].transitions = [
        ...completedTransitions(1),
        { state: "terminal-completed", monotonicDurationMs: 1 },
      ];
    expect(() => stage01ReportSchema.parse(duplicateTerminal)).toThrow(/lifecycle transition/u);
  });

  it("rejects evidence recomputed for a different run nonce", () => {
    const value = report();
    const sample = value.runtime.accuracyFirst.threeMinuteCase36.attempts[0].rawSamples[0];
    const foreignNonce = "22222222-2222-4222-8222-222222222222";
    sample.runNonce = foreignNonce;
    sample.attemptId = stage01RuntimeAttemptId({
      runNonce: foreignNonce,
      benchmarkId: sample.benchmarkId,
      protocolAttempt: sample.protocolAttempt,
      featureFlagEnabled: sample.featureFlagEnabled,
      plannedSampleIndex: sample.plannedSampleIndex,
      measurementKind: sample.measurementKind,
      generation: sample.generation,
    });
    expect(() => stage01ReportSchema.parse(value)).toThrow(/mixes more than one run nonce/u);
  });

  it("rejects internally valid Stable/Accuracy evidence mixed across runs", () => {
    const value = report();
    const foreignNonce = "22222222-2222-4222-8222-222222222222";
    for (const attempt of value.runtime.accuracyFirst.threeMinuteCase36.attempts) {
      for (const sample of attempt.rawSamples) {
        sample.runNonce = foreignNonce;
        sample.attemptId = stage01RuntimeAttemptId({
          runNonce: foreignNonce,
          benchmarkId: sample.benchmarkId,
          protocolAttempt: sample.protocolAttempt,
          featureFlagEnabled: sample.featureFlagEnabled,
          plannedSampleIndex: sample.plannedSampleIndex,
          measurementKind: sample.measurementKind,
          generation: sample.generation,
        });
      }
    }
    expect(() => stage01ReportSchema.parse(value)).toThrow(/must share one run nonce/u);
  });

  it("binds external contention CLI evidence to an exact privacy-safe enum", () => {
    expect(stage01ExternalContentionState(["node", "evaluate-stage01.ts"]))
      .toBe("NO_EXTERNAL_CPU_CONTENTION_DECLARED");
    expect(stage01ExternalContentionState([
      "node", "evaluate-stage01.ts", "--external-cpu-contention-observed",
    ])).toBe("EXTERNAL_CPU_CONTENTION_OBSERVED");
    const mismatched = report();
    mismatched.runtime.stable.threeMinuteCase36.attempts[0].contentionTelemetry.contentionObserved = true;
    expect(() => stage01ReportSchema.parse(mismatched)).toThrow(/contention boolean and enum/iu);
  });

  it("rejects an internally valid Voicing40 pair from another evaluation invocation", () => {
    const value = report();
    const foreignNonce = "22222222-2222-4222-8222-222222222222";
    for (const profile of [value.runtime.stable, value.runtime.accuracyFirst]) {
      const voicing = profile.voicingGoldDevelopment40;
      if (voicing.status !== "COMPLETED") throw new Error("fixture must contain completed Voicing40 evidence");
      for (const attempt of voicing.attempts) {
        for (const sample of attempt.rawSamples) {
          sample.runNonce = foreignNonce;
          sample.attemptId = stage01RuntimeAttemptId({
            runNonce: foreignNonce,
            benchmarkId: sample.benchmarkId,
            protocolAttempt: sample.protocolAttempt,
            featureFlagEnabled: sample.featureFlagEnabled,
            plannedSampleIndex: sample.plannedSampleIndex,
            measurementKind: sample.measurementKind,
            generation: sample.generation,
          });
        }
      }
    }
    expect(() => stage01ReportSchema.parse(value)).toThrow(/composite report mixes evaluation invocation nonces/u);
  });

  it("classifies an observed deadline race without shortening duration", () => {
    expect(classifyRuntimeTerminal(300_000, 300_000)).toBe("completed");
    expect(classifyRuntimeTerminal(300_000.001, 300_000)).toBe("timeout");
    const value = report();
    const sample = value.runtime.accuracyFirst.threeMinuteCase36.attempts[0].rawSamples[0];
    sample.observedProcessDurationMs = 300_000.001;
    sample.transitions = completedTransitions(300_000.001);
    expect(() => stage01ReportSchema.parse(value)).toThrow(/lifecycle transition/u);
  });

  it("rejects samples after the retry budget has terminated an attempt", () => {
    // Fault hypothesis: consistent aggregate arithmetic could conceal planned
    // samples appended after the second timeout. Result: transition replay rejects it.
    const value = report();
    const runtime = value.runtime.accuracyFirst.threeMinuteCase36;
    const attempt = runtime.attempts[0];
    const plannedOne = {
      ...attempt.rawSamples[0]!, status: "timeout" as const, elapsedMs: 300_000,
      observedProcessDurationMs: 300_000,
      timeoutKind: "spawn-terminated" as const,
      lifecycleState: "terminal-timeout" as const, transitions: timeoutTransitions(),
    };
    const retryOne = {
      ...attempt.rawSamples[0]!, measurementKind: "timeout-retry" as const,
      generation: 2, attemptId: stage01RuntimeAttemptId({
        runNonce: plannedOne.runNonce,
        benchmarkId: plannedOne.benchmarkId, protocolAttempt: attempt.attempt,
        featureFlagEnabled: plannedOne.featureFlagEnabled, plannedSampleIndex: 1,
        measurementKind: "timeout-retry", generation: 2,
      }),
    };
    const plannedTwo = {
      ...attempt.rawSamples[1]!, status: "timeout" as const, elapsedMs: 300_000,
      observedProcessDurationMs: 300_000,
      timeoutKind: "spawn-terminated" as const,
      lifecycleState: "terminal-timeout" as const, transitions: timeoutTransitions(),
    };
    attempt.rawSamples = [plannedOne, retryOne, plannedTwo, ...attempt.rawSamples.slice(2)];
    attempt.warmupRuns = 8;
    attempt.measuredSampleCount = 8;
    attempt.retryCount = 1;
    attempt.timeoutCount = 2;
    attempt.samplesMs = attempt.rawSamples.filter((sample) => sample.status === "completed")
      .map((sample) => sample.elapsedMs);
    attempt.summaryMs = { count: 6, median: 1, p95: 1, max: 1 };
    runtime.samplesMs = runtime.attempts.flatMap((item) => item.samplesMs);
    runtime.summaryMs = { count: runtime.samplesMs.length, median: 1, p95: 1, max: 1 };
    runtime.timeoutCount = 2;
    const result = stage01ReportSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /Runtime attempt 1/u.test(issue.message))).toBe(true);
    }
  });

  it("round-trips deterministic runtime evidence without changing serialization", () => {
    const value = report();
    const once = JSON.stringify(stage01ReportSchema.parse(value));
    const twice = JSON.stringify(stage01ReportSchema.parse(JSON.parse(once)));
    expect(twice).toBe(once);
    const sample = value.runtime.accuracyFirst.threeMinuteCase36.attempts[0].rawSamples[0];
    expect(stage01RuntimeAttemptId({
      runNonce: sample.runNonce,
      benchmarkId: sample.benchmarkId,
      protocolAttempt: sample.protocolAttempt,
      featureFlagEnabled: sample.featureFlagEnabled,
      plannedSampleIndex: sample.plannedSampleIndex,
      measurementKind: sample.measurementKind,
      generation: sample.generation,
    })).toBe(sample.attemptId);
  });

  it("keeps a raw Accuracy First timeout experiment-only without failing adoption", () => {
    const value = report();
    const runtime = value.runtime.accuracyFirst.threeMinuteCase36;
    const attempt = runtime.attempts[0];
    const timedOut = {
      ...attempt.rawSamples[0]!,
      status: "timeout" as const,
      elapsedMs: 300_000,
      observedProcessDurationMs: 300_000,
      timeoutKind: "spawn-terminated" as const,
      lifecycleState: "terminal-timeout" as const,
      transitions: timeoutTransitions(),
    };
    const retry = {
      ...attempt.rawSamples[0]!,
      measurementKind: "timeout-retry" as const,
      plannedSampleIndex: 1,
      generation: 2,
      attemptId: stage01RuntimeAttemptId({
        runNonce: attempt.rawSamples[0]!.runNonce,
        benchmarkId: attempt.rawSamples[0]!.benchmarkId,
        protocolAttempt: attempt.attempt,
        featureFlagEnabled: attempt.rawSamples[0]!.featureFlagEnabled,
        plannedSampleIndex: 1,
        measurementKind: "timeout-retry",
        generation: 2,
      }),
    };
    attempt.rawSamples.splice(0, 1, timedOut, retry);
    attempt.warmupRuns = runtime.samplesPerAttempt + 1;
    attempt.measuredSampleCount = runtime.samplesPerAttempt + 1;
    attempt.retryCount = 1;
    attempt.samplesMs = attempt.rawSamples
      .filter((sample) => sample.status === "completed")
      .map((sample) => sample.elapsedMs);
    attempt.timeoutCount = 1;
    attempt.summaryMs.count = attempt.samplesMs.length;
    runtime.samplesMs = runtime.attempts.flatMap((item) => item.samplesMs);
    runtime.summaryMs.count = runtime.samplesMs.length;
    runtime.timeoutCount = 1;
    runtime.performanceTier = "180_TO_300_SECONDS";
    runtime.tierEligible = false;
    value.runtime.accuracyFirst.performanceEligibility = "EXPERIMENT_ONLY";
    value.runtime.accuracyFirst.productConnectionStatus = "NOT_CONNECTED";
    value.runtime.accuracyFirst.performanceEligibilityReason = "normal-input timeout";
    value.runtime.accuracyFirst.inputsOver300Seconds = ["case36-three-minute"];
    value.runtime.accuracyFirst.timeoutCount = 1;
    value.runtime.accuracyFirst.performanceBasisMaxMs = 300_000;
    value.runtime.accuracyFirst.uiContract.requirementBasisMaxMs = 300_000;
    value.runtime.accuracyFirst.uiContract.uiThreadNonBlocking = "REQUIRED";
    value.runtime.accuracyFirst.uiContract.progressCapability = "REQUIRED";
    value.runtime.accuracyFirst.uiContract.cancellationCapability = "REQUIRED";
    value.runtime.accuracyFirst.uiContract.doubleStartPrevention = "REQUIRED";
    value.runtime.accuracyFirst.uiContract.routeAndExitResourceRelease = "REQUIRED";
    value.runtime.accuracyFirst.uiContract.implementationStatus =
      "async progress cancellation and resource release required before product connection";
    value.runtime.accuracyRuntimeTable[0].accuracyFirstRuntimeMs = { ...runtime.summaryMs };
    value.runtime.accuracyRuntimeTable[0].timeoutCount = 1;
    value.runtime.accuracyRuntimeTable[0].effectiveMaxMs = 300_000;
    value.runtime.accuracyRuntimeTable[0].performanceTier = "180_TO_300_SECONDS";
    value.runtime.accuracyRuntimeTable[0].tierEligible = false;
    value.runtime.accuracyRuntimeTable[0].performanceEligibility = "EXPERIMENT_ONLY";
    value.accuracyFirstEligibilityGate.eligibility = "EXPERIMENT_ONLY";

    const parsed = stage01ReportSchema.parse(value);
    expect(parsed.runtime.accuracyFirst.timeoutCount).toBe(1);
    expect(parsed.runtime.accuracyFirst.threeMinuteCase36.attempts[0].samplesMs[0])
      .toBe(retry.elapsedMs);
    expect(parsed.runtime.accuracyFirst.performanceEligibility).toBe("EXPERIMENT_ONLY");
    expect(parsed.gates.adoptionPass).toBe(true);
  });

  it("accepts an all-timeout benchmark with zero-count stats and a 300-second lower bound", () => {
    const value = report();
    const runtime = value.runtime.accuracyFirst.threeMinuteCase36;
    for (const attempt of runtime.attempts) {
      const planned = {
        ...attempt.rawSamples[0]!,
        status: "timeout" as const,
        elapsedMs: 300_000,
        observedProcessDurationMs: 300_000,
        timeoutKind: "spawn-terminated" as const,
        lifecycleState: "terminal-timeout" as const,
        transitions: timeoutTransitions(),
      };
      attempt.rawSamples = [{ ...planned }, {
        ...planned,
        measurementKind: "timeout-retry",
        generation: 2,
        attemptId: stage01RuntimeAttemptId({
          runNonce: planned.runNonce,
          benchmarkId: planned.benchmarkId,
          protocolAttempt: attempt.attempt,
          featureFlagEnabled: planned.featureFlagEnabled,
          plannedSampleIndex: planned.plannedSampleIndex,
          measurementKind: "timeout-retry",
          generation: 2,
        }),
      }];
      attempt.warmupRuns = 2;
      attempt.measuredSampleCount = 2;
      attempt.skippedSampleCount = runtime.samplesPerAttempt - 1;
      attempt.retryCount = 1;
      attempt.terminatedAfterTimeoutLimit = true;
      attempt.samplesMs = [];
      attempt.timeoutCount = 2;
      attempt.summaryMs = { count: 0, median: 0, p95: 0, max: 0 };
      attempt.ratiosToStage00 = {
        median: stage01Ratio(0, runtime.baselineMs.median),
        p95: stage01Ratio(0, runtime.baselineMs.p95),
        max: stage01Ratio(0, runtime.baselineMs.max),
      };
    }
    runtime.samplesMs = [];
    runtime.summaryMs = { count: 0, median: 0, p95: 0, max: 0 };
    runtime.ratiosToStage00 = {
      median: stage01Ratio(0, runtime.baselineMs.median),
      p95: stage01Ratio(0, runtime.baselineMs.p95),
      max: stage01Ratio(0, runtime.baselineMs.max),
    };
    runtime.timeoutCount = STAGE01_RUNTIME_ATTEMPT_COUNT * 2;
    runtime.performanceTier = "180_TO_300_SECONDS";
    runtime.tierEligible = false;
    value.runtime.accuracyFirst.performanceEligibility = "EXPERIMENT_ONLY";
    value.runtime.accuracyFirst.productConnectionStatus = "NOT_CONNECTED";
    value.runtime.accuracyFirst.performanceEligibilityReason = "all samples timed out";
    value.runtime.accuracyFirst.performanceBasisMaxMs = 300_000;
    value.runtime.accuracyFirst.inputsOver300Seconds = ["case36-three-minute"];
    value.runtime.accuracyFirst.timeoutCount = runtime.timeoutCount;
    const ui = value.runtime.accuracyFirst.uiContract;
    ui.requirementBasisMaxMs = 300_000;
    ui.uiThreadNonBlocking = "REQUIRED";
    ui.progressCapability = "REQUIRED";
    ui.cancellationCapability = "REQUIRED";
    ui.doubleStartPrevention = "REQUIRED";
    ui.routeAndExitResourceRelease = "REQUIRED";
    ui.implementationStatus =
      "async progress cancellation and resource release required before product connection";
    value.runtime.accuracyRuntimeTable[0].accuracyFirstRuntimeMs = { ...runtime.summaryMs };
    value.runtime.accuracyRuntimeTable[0].ratiosToStage00 = { ...runtime.ratiosToStage00 };
    value.runtime.accuracyRuntimeTable[0].timeoutCount = runtime.timeoutCount;
    value.runtime.accuracyRuntimeTable[0].effectiveMaxMs = 300_000;
    value.runtime.accuracyRuntimeTable[0].performanceTier = "180_TO_300_SECONDS";
    value.runtime.accuracyRuntimeTable[0].tierEligible = false;
    value.runtime.accuracyRuntimeTable[0].performanceEligibility = "EXPERIMENT_ONLY";
    value.accuracyFirstEligibilityGate.eligibility = "EXPERIMENT_ONLY";

    const parsed = stage01ReportSchema.parse(value);
    expect(parsed.runtime.accuracyFirst.threeMinuteCase36.summaryMs.count).toBe(0);
    expect(parsed.runtime.accuracyFirst.performanceBasisMaxMs).toBe(300_000);
  });

  it("separates a Stable performance failure from correctness adoption", () => {
    const value = report();
    const runtime = value.runtime.stable.threeMinuteCase36;
    setMeasured(runtime, 11_000);
    runtime.underTenSeconds = false;
    runtime.withinStage00Ratio = false;
    runtime.compliancePass = false;
    value.runtime.accuracyRuntimeTable[0].stableRuntimeMs = { ...runtime.summaryMs };
    value.stableEligibilityGate.pass = false;
    (value.stableEligibilityGate.issues as string[]).push(
      "Stable default-OFF runtime contract failed.",
    );
    value.gates.requireStableEligibilityPass = false;
    const parsed = stage01ReportSchema.parse(value);
    expect(parsed.gates.adoptionPass).toBe(true);
    expect(stage01ExitCode(parsed)).toBe(0);
    expect(stage01ExitCode(parsed, true)).toBe(1);
  });

  it("requires every long-running UI capability above one second", () => {
    const value = report();
    const runtime = value.runtime.accuracyFirst.threeMinuteCase36;
    setMeasured(runtime, 1_001);
    value.runtime.accuracyFirst.uiContract.requirementBasisMaxMs = 1_001;
    value.runtime.accuracyFirst.performanceBasisMaxMs = 1_001;
    value.runtime.accuracyRuntimeTable[0].accuracyFirstRuntimeMs = { ...runtime.summaryMs };
    value.runtime.accuracyRuntimeTable[0].ratiosToStage00 = { ...runtime.ratiosToStage00 };
    value.runtime.accuracyRuntimeTable[0].effectiveMaxMs = 1_001;
    expect(() => stage01ReportSchema.parse(value)).toThrow(/UI capability/u);
  });

  it("keeps the 180-300 second product tier conditional and not connected", () => {
    const value = report();
    const runtime = value.runtime.accuracyFirst.threeMinuteCase36;
    setMeasured(runtime, 200_000);
    runtime.performanceTier = "180_TO_300_SECONDS";
    value.runtime.accuracyFirst.performanceEligibility = "CONDITIONAL";
    value.runtime.accuracyFirst.productConnectionStatus = "NOT_CONNECTED";
    value.runtime.accuracyFirst.uiContract.requirementBasisMaxMs = 200_000;
    value.runtime.accuracyFirst.uiContract.uiThreadNonBlocking = "REQUIRED";
    value.runtime.accuracyFirst.uiContract.progressCapability = "REQUIRED";
    value.runtime.accuracyFirst.uiContract.cancellationCapability = "REQUIRED";
    value.runtime.accuracyFirst.uiContract.doubleStartPrevention = "REQUIRED";
    value.runtime.accuracyFirst.uiContract.routeAndExitResourceRelease = "REQUIRED";
    value.runtime.accuracyFirst.uiContract.implementationStatus =
      "async progress cancellation and resource release required before product connection";
    value.runtime.accuracyFirst.performanceBasisMaxMs = 200_000;
    value.runtime.accuracyRuntimeTable[0].accuracyFirstRuntimeMs = { ...runtime.summaryMs };
    value.runtime.accuracyRuntimeTable[0].ratiosToStage00 = { ...runtime.ratiosToStage00 };
    value.runtime.accuracyRuntimeTable[0].effectiveMaxMs = 200_000;
    value.runtime.accuracyRuntimeTable[0].performanceTier = "180_TO_300_SECONDS";
    value.runtime.accuracyRuntimeTable[0].tierEligible = true;
    value.runtime.accuracyRuntimeTable[0].performanceEligibility = "CONDITIONAL";
    value.accuracyFirstEligibilityGate.eligibility = "CONDITIONAL";
    const parsed = stage01ReportSchema.parse(value);
    expect(parsed.runtime.accuracyFirst.productConnectionStatus).toBe("NOT_CONNECTED");
    expect(parsed.gates.adoptionPass).toBe(true);
  });

  it("stage01 construction-invariant dependency test", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const source = ["src/liveMidi", "src/domain/liveMidi", "src/domain/practice"]
      .map((path) => readTypeScriptTree(resolve(repositoryRoot, path)))
      .join("\n");
    expect(source).not.toMatch(/enableExactNoteEvidenceDedup|exactNoteEvidenceDedup|domain\/midi\/analysis/u);
  });
});

describe("isolated memory child contract", () => {
  const sample = JSON.stringify(memorySample(true));

  it("accepts one strict privacy-safe JSON value", () => {
    expect(parseMemoryChildOutput(sample, "", true)).toMatchObject({
      contractValid: true,
      privacySafe: true,
    });
  });

  it.each([
    [`${sample}\nnoise`, "parse noise"],
    [JSON.stringify({ ...JSON.parse(sample), unknown: true }), "unknown field"],
    [JSON.stringify({ ...JSON.parse(sample), temporaryArtifactsCreated: 1 }), "temp delta"],
  ])("makes %s non-passing", (raw, description) => {
    const result = parseMemoryChildOutput(raw, "", true);
    if (description === "temp delta") expect(result.sample.temporaryArtifactsCreated).toBe(1);
    else expect(result.contractValid).toBe(false);
  });

  it("rejects a path before parsing, even inside malformed output", () => {
    const raw = `{not-json:"C:/Users/example/private.mid"}`;
    expect(isMemoryChildOutputPrivacySafe(raw)).toBe(false);
    expect(parseMemoryChildOutput(raw, "", true)).toMatchObject({ privacySafe: false, contractValid: false });
  });

  it("treats EACCES/EPERM entries as opaque and rejects unrelated snapshot errors", () => {
    expect(isSnapshotEntryInaccessible({ code: "EACCES" })).toBe(true);
    expect(isSnapshotEntryInaccessible({ code: "EPERM" })).toBe(true);
    expect(isSnapshotEntryInaccessible({ code: "EIO" })).toBe(false);
  });

  it("uses absolute retained evidence when the OFF peak denominator is near zero", () => {
    const off = memorySample(false, { peakDeltaRssBytes: 0 });
    const on = memorySample(true, { peakDeltaRssBytes: 3 * 1024 * 1024 });
    const decision = evaluateStage01MemoryPair(off, on);
    expect(decision).toMatchObject({
      peakDeltaRatio: null,
      comparisonMode: "ABSOLUTE_RETAINED_SLOPE_NEAR_ZERO",
      pairPass: true,
    });
  });

  it("fails a true repeated-analysis retained leak", () => {
    const off = memorySample(false);
    const on = memorySample(true, { retainedHeapPerIteration: 1024 * 1024 });
    expect(memorySampleRetainedPass(on)).toBe(false);
    expect(evaluateStage01MemoryPair(off, on).pairPass).toBe(false);
  });

  it("allows a bounded transient peak when post-GC retained evidence is flat", () => {
    const off = memorySample(false, { peakDeltaRssBytes: 1024 * 1024 });
    const on = memorySample(true, { peakDeltaRssBytes: 50 * 1024 * 1024 });
    expect(evaluateStage01MemoryPair(off, on)).toMatchObject({
      comparisonMode: "ABSOLUTE_RETAINED_SLOPE_NEAR_ZERO",
      onRetainedPass: true,
      transientPass: true,
      pairPass: true,
    });
  });

  it("rejects raw post-GC arithmetic that does not reproduce growth and slope", () => {
    const sampleValue = memorySample(true);
    sampleValue.retainedGrowth.heapUsedBytes += 1;
    expect(memorySampleArithmeticValid(sampleValue)).toBe(false);
    expect(memorySampleRetainedPass(sampleValue)).toBe(false);
  });
});

describe("timed runtime child contract", () => {
  const strictChildRequest = (overrides: Record<string, unknown> = {}) => {
    const request = {
      schemaVersion: 2,
      enabled: true,
      warmupRuns: 1,
      config: { mode: "phase4-v1", enableExactNoteEvidenceDedup: true },
      inputDigestSha256: STAGE01_CASE36_INPUT_DIGEST_SHA256,
      analyzerConfigVersionSha256: STAGE01_ANALYZER_CONFIG_SHA256,
      measurementKind: "planned",
      plannedSampleIndex: 1,
      benchmarkId: "case36-three-minute",
      runNonce: runtimeRunNonce,
      protocolAttempt: 1,
      generation: 1,
      deadlineDurationMs: 300_000,
      inputsBase64: ["AA=="],
      ...overrides,
    };
    return {
      ...request,
      attemptId: stage01RuntimeAttemptId({
        runNonce: String(request.runNonce),
        benchmarkId: request.benchmarkId as "case36-three-minute" | "voicing-gold-development-40",
        protocolAttempt: Number(request.protocolAttempt),
        featureFlagEnabled: Boolean(request.enabled),
        plannedSampleIndex: Number(request.plannedSampleIndex),
        measurementKind: request.measurementKind as "planned" | "timeout-retry",
        generation: Number(request.generation),
      }),
      ...(Object.hasOwn(overrides, "attemptId") ? { attemptId: overrides.attemptId } : {}),
    };
  };
  const invokeStrictChild = (request: unknown) => spawnSync(process.execPath, [
    runtimeChildBundlePath,
  ], {
    cwd: resolve(import.meta.dirname, "../.."),
    input: `${JSON.stringify(request)}\n`,
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });

  it("rejects unknown request keys, non-canonical base64, and non-frozen input evidence", () => {
    expect(invokeStrictChild({ ...strictChildRequest(), unknown: true }).status).not.toBe(0);
    expect(invokeStrictChild(strictChildRequest({ inputsBase64: ["AA==\n"] })).status).not.toBe(0);
    expect(invokeStrictChild(strictChildRequest()).status).not.toBe(0);
  });

  it("rejects out-of-plan indexes and generation relations before Analyzer execution", () => {
    expect(invokeStrictChild(strictChildRequest({ plannedSampleIndex: 8 })).status).not.toBe(0);
    expect(invokeStrictChild(strictChildRequest({
      benchmarkId: "voicing-gold-development-40",
      inputDigestSha256: STAGE01_VOICING40_INPUT_DIGEST_SHA256,
      plannedSampleIndex: 6,
    })).status).not.toBe(0);
    expect(invokeStrictChild(strictChildRequest({ generation: 2 })).status).not.toBe(0);
    expect(invokeStrictChild(strictChildRequest({ measurementKind: "timeout-retry" })).status).not.toBe(0);
  });

  it("scavenges only strict stale runtime bundle fixtures after simulated SIGKILL", () => {
    const parent = runtimeChildBundleParentRoot();
    mkdirSync(parent, { recursive: true });
    const suffix = randomUUID().replace(/-/gu, "").slice(0, 6).toLowerCase();
    const liveSuffix = `${suffix.startsWith("z") ? "y" : "z"}${suffix.slice(1)}`;
    const stale = resolve(parent, `p515-runtime-child-${suffix}`);
    const live = resolve(parent, `p515-runtime-child-${liveSuffix}`);
    const unknown = resolve(parent, `unrelated-${suffix}`);
    mkdirSync(stale);
    mkdirSync(live);
    mkdirSync(unknown);
    writeFileSync(resolve(stale, "owner.json"), `${JSON.stringify({ schemaVersion: 1, pid: 2147483647 })}\n`);
    writeFileSync(resolve(live, "owner.json"), `${JSON.stringify({ schemaVersion: 1, pid: process.pid })}\n`);
    try {
      expect(scavengeRuntimeChildBundles()).toBeGreaterThanOrEqual(1);
      expect(() => readFileSync(resolve(stale, "owner.json"), "utf8")).toThrow();
      expect(readFileSync(resolve(live, "owner.json"), "utf8")).toContain(String(process.pid));
      expect(readdirSync(unknown)).toEqual([]);
    } finally {
      rmSync(live, { recursive: true, force: true });
      rmSync(unknown, { recursive: true, force: true });
      rmSync(stale, { recursive: true, force: true });
    }
  });

  it("records deadline-after-exit without fabricating terminate-requested", () => {
    const transitions = runtimeTransitions("deadline-exceeded-after-exit", 300_001);
    expect(transitions.map((item) => item.state)).toEqual([
      "started", "running", "child-exited", "deadline-exceeded-after-exit",
    ]);
    expect(transitions.some((item) => item.state === "terminate-requested")).toBe(false);
  });

  it("asynchronously terminates one owned CPU-bound child tree at a short deadline", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "p515-async-timeout-"));
    const descendantPidPath = resolve(root, "descendant.pid");
    const script = `
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const descendant = spawn(process.execPath, ["-e", "while (true) {}"], { stdio: "ignore", windowsHide: true });
writeFileSync(${JSON.stringify(descendantPidPath)}, String(descendant.pid));
while (true) {}
`;
    try {
      const started = performance.now();
      const sample = await runTimedChildProcessAsync(
        process.execPath,
        ["-e", script],
        "",
        300_000,
        strictRuntimeFingerprint(),
        100,
      );
      expect(performance.now() - started).toBeLessThan(5_000);
      expect(sample).toMatchObject({ status: "timeout", timeoutKind: "spawn-terminated" });
      const descendantPid = Number(readFileSync(descendantPidPath, "utf8"));
      expect(() => process.kill(descendantPid, 0)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);

  it("cleans its async timer/listeners on normal success and rejects nonzero exit", async () => {
    const fingerprint = strictRuntimeFingerprint();
    const stdout = JSON.stringify({ schemaVersion: 2, status: "completed", elapsedMs: 1, ...fingerprint });
    const completed = await runTimedChildProcessAsync(
      process.execPath,
      ["-e", `process.stdout.write(${JSON.stringify(stdout)})`],
      "",
      300_000,
      fingerprint,
      1_000,
    );
    expect(completed).toMatchObject({ status: "completed", timeoutKind: null });
    await expect(runTimedChildProcessAsync(
      process.execPath,
      ["-e", `process.stdout.write(${JSON.stringify(stdout)}); process.exit(7)`],
      "",
      300_000,
      fingerprint,
      1_000,
    )).rejects.toThrow(/failed independently of timeout/u);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  });

  it.each([7, null] as const)("rejects a %s over-deadline exit before classifying timeout evidence", (status) => {
    const fingerprint = strictRuntimeFingerprint();
    const stdout = JSON.stringify({ schemaVersion: 2, status: "completed", elapsedMs: 1, ...fingerprint });
    expect(() => interpretTimedChildProcessResult(
      { status, stdout, stderr: "" },
      300_001,
      300_000,
      fingerprint,
    )).toThrow(/failed independently of timeout/u);
  });

  it("classifies only a valid normal over-deadline exit without a kill transition", () => {
    const fingerprint = strictRuntimeFingerprint();
    const stdout = JSON.stringify({ schemaVersion: 2, status: "completed", elapsedMs: 1, ...fingerprint });
    const sample = interpretTimedChildProcessResult(
      { status: 0, stdout, stderr: "" },
      300_001,
      300_000,
      fingerprint,
    );
    expect(sample).toMatchObject({
      status: "timeout",
      timeoutKind: "deadline-exceeded-after-exit",
      lifecycleState: "deadline-exceeded-after-exit",
      observedProcessDurationMs: 300_001,
    });
    expect(sample.transitions.map((item) => item.state)).toEqual([
      "started", "running", "child-exited", "deadline-exceeded-after-exit",
    ]);
  });

  it("uses the effective wall deadline when the parent timer is delivered late", () => {
    const fingerprint = strictRuntimeFingerprint();
    const stdout = JSON.stringify({ schemaVersion: 2, status: "completed", elapsedMs: 1, ...fingerprint });
    const sample = interpretTimedChildProcessResult(
      { status: 0, stdout, stderr: "" },
      101,
      300_000,
      fingerprint,
      100,
    );
    expect(classifyRuntimeTerminal(101, 100)).toBe("timeout");
    expect(sample).toMatchObject({
      status: "timeout",
      timeoutKind: "deadline-exceeded-after-exit",
      observedProcessDurationMs: 300_000,
    });
    expect(() => interpretTimedChildProcessResult(
      { status: 7, stdout: "partial", stderr: "" },
      101,
      300_000,
      fingerprint,
      100,
    )).toThrow(/failed independently of timeout/u);
    expect(() => interpretTimedChildProcessResult(
      { status: 0, stdout: "partial", stderr: "" },
      101,
      300_000,
      fingerprint,
      100,
    )).toThrow(/late or partial evidence/u);
  });
  it("retries the first timeout once, then skips the remaining planned samples", () => {
    const attempts = measurePairedProtocol(
      (enabled, plannedSampleIndex, measurementKind, protocolAttempt, generation, runNonce) => ({
        status: "timeout",
        elapsedMs: 300_000,
        timeoutMs: 300_000,
        warmupRuns: 1,
        warmupAnalysisCount: 1,
        config: { mode: "phase4-v1", enableExactNoteEvidenceDedup: enabled },
        inputDigestSha256: STAGE01_CASE36_INPUT_DIGEST_SHA256,
        analyzerConfigVersionSha256: STAGE01_ANALYZER_CONFIG_SHA256,
        featureFlagEnabled: enabled,
        analysisCount: 1,
        measurementKind,
        plannedSampleIndex,
        benchmarkId: "case36-three-minute",
        protocolAttempt,
        generation,
        attemptId: stage01RuntimeAttemptId({
          runNonce,
          benchmarkId: "case36-three-minute", protocolAttempt,
          featureFlagEnabled: enabled, plannedSampleIndex, measurementKind, generation,
        }),
        runNonce,
        deadlineDurationMs: 300_000,
        observedProcessDurationMs: 300_000,
        timeoutKind: "spawn-terminated",
        lifecycleState: "terminal-timeout",
        transitions: timeoutTransitions(),
      }),
      STAGE01_CASE36_SAMPLES_PER_ATTEMPT,
      STAGE01_FROZEN_CASE36_BASELINE_MS,
      "fake timeout schedule",
    );
    for (const attempt of [...attempts.stable, ...attempts.accuracyFirst]) {
      expect(attempt).toMatchObject({
        plannedSampleCount: 7,
        measuredSampleCount: 2,
        skippedSampleCount: 6,
        retryCount: 1,
        timeoutCount: 2,
        terminatedAfterTimeoutLimit: true,
        timeoutTargetMs: 300_000,
      });
    }
  });

  it("returns timeout as raw evidence instead of a detection failure", () => {
    const fingerprint = {
      warmupRuns: 1 as const,
      warmupAnalysisCount: 1,
      config: { mode: "phase4-v1" as const, enableExactNoteEvidenceDedup: true },
      inputDigestSha256: STAGE01_CASE36_INPUT_DIGEST_SHA256,
      analyzerConfigVersionSha256: STAGE01_ANALYZER_CONFIG_SHA256,
      featureFlagEnabled: true,
      analysisCount: 1,
      measurementKind: "planned" as const,
      plannedSampleIndex: 1,
      benchmarkId: "case36-three-minute" as const,
      protocolAttempt: 1,
      generation: 1,
      attemptId: stage01RuntimeAttemptId({
        runNonce: runtimeRunNonce,
        benchmarkId: "case36-three-minute", protocolAttempt: 1,
        featureFlagEnabled: true, plannedSampleIndex: 1,
        measurementKind: "planned", generation: 1,
      }),
      runNonce: runtimeRunNonce,
      deadlineDurationMs: 300_000 as const,
    };
    expect(runTimedChildProcess(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      "",
      300_000,
      fingerprint,
      25,
    )).toEqual({
      status: "timeout", elapsedMs: 300_000, timeoutMs: 300_000, ...fingerprint,
      observedProcessDurationMs: 300_000,
      timeoutKind: "spawn-terminated",
      lifecycleState: "terminal-timeout",
      transitions: timeoutTransitions(),
    });
  });

  it("rejects completed child output whose fingerprint differs from the parent expectation", () => {
    const fingerprint = {
      warmupRuns: 1 as const,
      warmupAnalysisCount: 1,
      config: { mode: "phase4-v1" as const, enableExactNoteEvidenceDedup: true },
      inputDigestSha256: STAGE01_CASE36_INPUT_DIGEST_SHA256,
      analyzerConfigVersionSha256: STAGE01_ANALYZER_CONFIG_SHA256,
      featureFlagEnabled: true,
      analysisCount: 1,
      measurementKind: "planned" as const,
      plannedSampleIndex: 1,
      benchmarkId: "case36-three-minute" as const,
      protocolAttempt: 1,
      generation: 1,
      attemptId: stage01RuntimeAttemptId({
        runNonce: runtimeRunNonce,
        benchmarkId: "case36-three-minute", protocolAttempt: 1,
        featureFlagEnabled: true, plannedSampleIndex: 1,
        measurementKind: "planned", generation: 1,
      }),
      runNonce: runtimeRunNonce,
      deadlineDurationMs: 300_000 as const,
    };
    const mismatched = {
      schemaVersion: 2,
      status: "completed",
      elapsedMs: 1,
      ...fingerprint,
      featureFlagEnabled: false,
    };
    expect(() => runTimedChildProcess(
      process.execPath,
      ["-e", `process.stdout.write(${JSON.stringify(JSON.stringify(mismatched))})`],
      "",
      300_000,
      fingerprint,
    )).toThrow(/output contract/u);
  });

  it("rejects partial stdout retained by a child that later times out", async () => {
    const benchmarkId = "case36-three-minute" as const;
    const fingerprint = {
      warmupRuns: 1 as const,
      warmupAnalysisCount: 1,
      config: { mode: "phase4-v1" as const, enableExactNoteEvidenceDedup: true },
      inputDigestSha256: STAGE01_CASE36_INPUT_DIGEST_SHA256,
      analyzerConfigVersionSha256: STAGE01_ANALYZER_CONFIG_SHA256,
      featureFlagEnabled: true,
      analysisCount: 1,
      measurementKind: "planned" as const,
      plannedSampleIndex: 1,
      benchmarkId,
      protocolAttempt: 1,
      generation: 1,
      attemptId: stage01RuntimeAttemptId({
        runNonce: runtimeRunNonce,
        benchmarkId, protocolAttempt: 1, featureFlagEnabled: true,
        plannedSampleIndex: 1, measurementKind: "planned", generation: 1,
      }),
      runNonce: runtimeRunNonce,
      deadlineDurationMs: 300_000 as const,
    };
    await expect(runTimedChildProcessAsync(
      process.execPath,
      ["-e", "require('node:fs').writeSync(1, 'partial'); setInterval(() => {}, 1000)"],
      "",
      300_000,
      fingerprint,
      1_000,
    )).rejects.toThrow(/late or partial evidence/u);
  }, 10_000);
});

function readTypeScriptTree(root: string): string {
  return readdirSync(root, { withFileTypes: true }).map((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return readTypeScriptTree(path);
    return /\.[cm]?tsx?$/u.test(entry.name) ? readFileSync(path, "utf8") : "";
  }).join("\n");
}
