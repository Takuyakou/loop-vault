import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { buildSync } from "esbuild";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import type { AnalyzeMidiOptions, MidiAnalyzerMode } from "../../src/domain/midi/types";
import { benchmarkLiveMidiLatency } from "../../src/liveMidi/latencyBenchmark";
import { makeChordSymbol } from "../../src/domain/chords";
import {
  buildPracticeChordRequirements,
  matchPerformance,
  type PracticeInputSnapshot,
} from "../../src/domain/practice";
import type { MidiProgressionAnalysis } from "../../src/domain/types";
import {
  renderContractMidi,
  type Phase515CorpusContract,
} from "./corpusContract";
import { readFileExistingWithinRoot } from "./safePath";
import { writeStage01Artifact } from "./stage01ArtifactWriter";
import {
  buildStage01CorpusLockBinding,
  renderStage01CorpusLockBinding,
  STAGE01_ANALYZER_CONFIG_SHA256,
  verifyStage01CorpusLock,
  type Stage01BaselineLock,
  type Stage01RuntimeBaseline,
} from "./stage01CorpusLock";
import {
  evaluateStage01MemoryPair,
  memorySampleArithmeticValid,
  observedPeakRss,
  type Stage01MemorySample,
} from "./stage01MemoryPolicy";
import {
  STAGE01_EXISTING_CORPORA_ISSUE,
  STAGE01_CASE36_SAMPLES_PER_ATTEMPT,
  STAGE01_CASE36_INPUT_DIGEST_SHA256,
  STAGE01_CONTENTION_STATES,
  STAGE01_EXCLUDED_SUITE_ID,
  STAGE01_FROZEN_CASE36_BASELINE_MS,
  STAGE01_FROZEN_RUNTIME_BASELINE_SHA256,
  STAGE01_FROZEN_SUITE_IDS,
  STAGE01_FROZEN_VOICING40_SELECTION_DIGEST,
  STAGE01_FROZEN_VOICING40_TOTAL_MS,
  STAGE01_PROTECTED_CASE_IDS,
  STAGE01_RESOURCE_ISSUE,
  STAGE01_RUNTIME_AGGREGATE_RULE,
  STAGE01_RUNTIME_ATTEMPT_COUNT,
  STAGE01_VOICING40_SAMPLES_PER_ATTEMPT,
  STAGE01_VOICING40_INPUT_DIGEST_SHA256,
  isStrictStage01NoteEvidenceDedupDiagnostics,
  stage01RuntimeAttemptId,
  stage01Ratio,
  stage01ReportSchema,
  type Stage01NoteEvidenceDedupDiagnostics,
  type Stage01RuntimeBenchmarkId,
} from "./stage01ReportSchema";

interface LockedFile { path: string; sha256: string; byteLength: number }
interface LockedSuite {
  id: string;
  repositoryLocation: string;
  files: LockedFile[];
}

type RuntimeBaseline = Stage01RuntimeBaseline;

type SuiteStatus = "COMPLETED" | "SKIPPED" | "EXCLUDED" | "FAILED";

interface Condition {
  id: string;
  mode: MidiAnalyzerMode;
  accuracyFirst?: AnalyzeMidiOptions["accuracyFirst"];
}

interface SuiteEvaluation {
  id: string;
  status: SuiteStatus;
  reason: string;
  frozenFileCount: number;
  evaluatedFileCount: number;
  conditionsEvaluated: string[];
  normalizedRegressions: string[];
}

interface ConstructionInvariant {
  status: "NOT_APPLICABLE" | "UNCHANGED_BY_CONSTRUCTION";
  currentReference: number;
  dependencyProof: "exact-note dedup is confined to offline MIDI analysis";
  verificationTest: "stage01 construction-invariant dependency test";
  constructionInvariant: true;
}

interface MemoryChildResult {
  sample: Stage01MemorySample;
  contractValid: boolean;
  privacySafe: boolean;
}

interface RuntimeAttemptMeasurement {
  attempt: number;
  warmupRuns: number;
  plannedSampleCount: number;
  measuredSampleCount: number;
  skippedSampleCount: number;
  retryCount: number;
  terminatedAfterTimeoutLimit: boolean;
  timeoutTargetMs: 300_000;
  measurementOrder: "alternating-OFF-ON; odd-pairs-OFF-first; even-pairs-ON-first";
  rawSamples: TimedRuntimeSample[];
  samplesMs: number[];
  timeoutCount: number;
  summaryMs: { count: number; median: number; p95: number; max: number };
  baselineMs: { median: number; p95: number; max: number };
  ratiosToStage00: { median: number | null; p95: number | null; max: number | null };
  contentionTelemetry: {
    elapsedMs: number;
    cpuUserMicros: number;
    cpuSystemMicros: number;
    contentionObserved: boolean;
    reason: (typeof STAGE01_CONTENTION_STATES)[number];
  };
  reason: string;
}

export interface TimedRuntimeSample {
  status: "completed" | "timeout";
  elapsedMs: number;
  timeoutMs: 300_000;
  warmupRuns: 1;
  warmupAnalysisCount: number;
  config: {
    mode: "phase4-v1";
    enableExactNoteEvidenceDedup: boolean;
  };
  inputDigestSha256: typeof STAGE01_CASE36_INPUT_DIGEST_SHA256
    | typeof STAGE01_VOICING40_INPUT_DIGEST_SHA256;
  analyzerConfigVersionSha256: typeof STAGE01_ANALYZER_CONFIG_SHA256;
  featureFlagEnabled: boolean;
  analysisCount: number;
  measurementKind: "planned" | "timeout-retry";
  plannedSampleIndex: number;
  benchmarkId: Stage01RuntimeBenchmarkId;
  attemptId: string;
  runNonce: string;
  protocolAttempt: number;
  generation: number;
  deadlineDurationMs: 300_000;
  observedProcessDurationMs: number;
  timeoutKind: null | "spawn-terminated" | "deadline-exceeded-after-exit";
  lifecycleState: "terminal-completed" | "terminal-timeout" | "deadline-exceeded-after-exit";
  transitions: Array<{
    state: "started" | "running" | "terminate-requested" | "child-exited"
      | "terminal-completed" | "terminal-timeout" | "deadline-exceeded-after-exit";
    monotonicDurationMs: number;
  }>;
}

type TimedRuntimeFingerprint = Omit<
  TimedRuntimeSample,
  "status" | "elapsedMs" | "timeoutMs" | "lifecycleState" | "transitions"
  | "observedProcessDurationMs" | "timeoutKind"
>;

export type Stage01Report = z.infer<typeof stage01ReportSchema>;

const repositoryRoot = resolve(import.meta.dirname, "../..");
const contractPath = resolve(repositoryRoot, "scripts/phase515/fixtures/manifest-v2.json");
const threshold = 1.25 as const;

function validateFrozenStage00Contracts(
  baseline: RuntimeBaseline,
  lock: Stage01BaselineLock,
): RuntimeBaseline {
  const case36 = {
    median: baseline.threeMinute.runtimeMs.median,
    p95: baseline.threeMinute.runtimeMs.p95,
    max: baseline.threeMinute.runtimeMs.max,
  };
  if (stableJson(case36) !== stableJson(STAGE01_FROZEN_CASE36_BASELINE_MS)
    || baseline.fortyFileBatch.totalMs !== STAGE01_FROZEN_VOICING40_TOTAL_MS) {
    throw new Error("P5.15-00 runtime baseline constants changed.");
  }
  const suite = lock.externalSuites.find((item) => item.id === "voicing-gold-40-file-selection");
  if (!suite || suite.files.length !== 40
    || sha256(new TextEncoder().encode(stableJson(suite.files)))
      !== STAGE01_FROZEN_VOICING40_SELECTION_DIGEST) {
    throw new Error("P5.15-00 ordered Voicing40 path/hash/byteLength digest changed.");
  }
  return baseline;
}

const frozenBaselineContractReport = (): Stage01Report["frozenBaselineContract"] => ({
  runtimeBaselineSha256: STAGE01_FROZEN_RUNTIME_BASELINE_SHA256,
  case36RuntimeMs: STAGE01_FROZEN_CASE36_BASELINE_MS,
  voicing40TotalMs: STAGE01_FROZEN_VOICING40_TOTAL_MS,
  voicing40OrderedPathHashLengthDigest: STAGE01_FROZEN_VOICING40_SELECTION_DIGEST,
  verifiedBeforeAnalysis: true,
});

/** Frozen Accuracy-First conditions plus the required analyzer x Union matrix. */
export const evaluationConditions: readonly Condition[] = [
  { id: "phase4-v1", mode: "phase4-v1" },
  {
    id: "phase4-v1+R1+E1",
    mode: "phase4-v1",
    accuracyFirst: {
      bassCompanionCandidates: true,
      enableObservedFlatNineDominantCandidate: true,
      enableAccuracyCandidateUnion: false,
    },
  },
  {
    id: "phase4-v1+R1+E1+Union",
    mode: "phase4-v1",
    accuracyFirst: {
      bassCompanionCandidates: true,
      enableObservedFlatNineDominantCandidate: true,
      enableAccuracyCandidateUnion: true,
    },
  },
  ...(["phase4-v1", "legacy-boundary-rerank", "hybrid-v1", "voice-aware-rerank-v1"] as const)
    .flatMap((mode) => [false, true].map((union) => ({
      id: `${mode}+Union-${union ? "ON" : "OFF"}`,
      mode,
      accuracyFirst: { enableAccuracyCandidateUnion: union },
    }))),
];

const excludedSuiteIds = new Set<string>([STAGE01_EXCLUDED_SUITE_ID]);

interface Stage01AnalyzerOptionsCapability {
  phase515: { enableExactNoteEvidenceDedup: boolean };
}

type Stage01AnalysisResult = MidiProgressionAnalysis & {
  noteEvidenceDedup?: Stage01NoteEvidenceDedupDiagnostics;
};

export async function evaluateStage01(): Promise<Stage01Report> {
  // Verify the immutable Stage 00 contract before the first Analyzer call.
  const verifiedCorpus = await verifyStage01CorpusLock(repositoryRoot);
  const runtimeBaseline = validateFrozenStage00Contracts(
    verifiedCorpus.runtimeBaseline,
    verifiedCorpus.baselineLock,
  );
  const contract = JSON.parse(await readFile(contractPath, "utf8")) as Phase515CorpusContract;
  const cleanBytes = fixture(contract, "02_shell_fifths_pickup_irregular");
  const duplicateBytes = fixture(contract, "03_shell_fifths_pickup_irregular_exact_duplicates");
  const clean = analyze(cleanBytes, true);
  const duplicate = analyze(duplicateBytes, true);
  const normalizedDeepEqual = equalNormalized(duplicate, clean);
  const protectedCases = Object.fromEntries([
    "02_shell_fifths_pickup_irregular",
    "03_shell_fifths_pickup_irregular_exact_duplicates",
    "12_split_tracks_harmony_bass",
    "15_rootless_dominant_with_context",
    "32_type0_multichannel",
  ].map((id) => {
    const bytes = fixture(contract, id);
    const result = analyze(bytes, true);
    return [id.slice(0, 2), {
      original: parseMidi(bytes).notes.length,
      effective: result.noteEvidenceDedup?.effectiveNoteCount ?? -1,
    }];
  }));
  if (!exactStringSet(Object.keys(protectedCases), STAGE01_PROTECTED_CASE_IDS)) {
    throw new Error("Targeted protected cases differ from the frozen set.");
  }
  const modeMatrix = evaluationConditions.map((condition) => {
    const cleanResult = analyzeCondition(cleanBytes, condition, true);
    const duplicateResult = analyzeCondition(duplicateBytes, condition, true);
    return {
      condition: condition.id,
      normalizedDeepEqual: equalNormalized(duplicateResult, cleanResult),
      cleanEffective: cleanResult.noteEvidenceDedup?.effectiveNoteCount ?? -1,
      duplicateEffective: duplicateResult.noteEvidenceDedup?.effectiveNoteCount ?? -1,
    };
  });

  const existingCorpora = await evaluateExistingCorpora(verifiedCorpus.baselineLock);
  const runtime = await evaluateRuntime(
    contract,
    runtimeBaseline,
    verifiedCorpus.baselineLock,
  );
  const correctnessIssues: string[] = [];
  if (!normalizedDeepEqual) correctnessIssues.push("Cases 02 and 03 differ after normalization.");
  if (clean.noteEvidenceDedup?.originalNoteCount !== 33
    || clean.noteEvidenceDedup.effectiveNoteCount !== 33) {
    correctnessIssues.push("Case 02 did not remain 33 -> 33.");
  }
  if (duplicate.noteEvidenceDedup?.originalNoteCount !== 66
    || duplicate.noteEvidenceDedup.effectiveNoteCount !== 33) {
    correctnessIssues.push("Case 03 did not become 66 -> 33.");
  }
  for (const [id, counts] of Object.entries(protectedCases)) {
    if (id !== "03" && counts.original !== counts.effective) {
      correctnessIssues.push(`Case ${id} lost voice evidence.`);
    }
  }
  for (const item of modeMatrix) {
    if (!item.normalizedDeepEqual || item.cleanEffective !== 33 || item.duplicateEffective !== 33) {
      correctnessIssues.push(`Targeted mode matrix failed: ${item.condition}.`);
    }
  }
  if (existingCorpora.status !== "COMPLETED") {
    correctnessIssues.push(STAGE01_EXISTING_CORPORA_ISSUE);
  }
  if (existingCorpora.normalizedRegressions.length > 0) {
    if (!correctnessIssues.includes(STAGE01_EXISTING_CORPORA_ISSUE)) {
      correctnessIssues.push(STAGE01_EXISTING_CORPORA_ISSUE);
    }
  }
  const deterministic = equalNormalized(analyze(duplicateBytes, true), duplicate);
  if (!deterministic) correctnessIssues.push("Repeated exact-evidence analysis was not deterministic.");
  // A schema-valid passing report has no targeted diagnostics; collapse any
  // targeted detail to the fixed fail-closed issue vocabulary.
  const normalizedCorrectnessIssues = correctnessIssues.length === 0
    ? []
    : correctnessIssues.every((issue) => issue === STAGE01_EXISTING_CORPORA_ISSUE)
      ? [STAGE01_EXISTING_CORPORA_ISSUE]
      : ["Exact-note evidence correctness contract failed.",
          ...(correctnessIssues.includes(STAGE01_EXISTING_CORPORA_ISSUE)
            ? [STAGE01_EXISTING_CORPORA_ISSUE] : [])];
  const resourceIssues = runtime.memory.resourceSafetyPass ? [] : [STAGE01_RESOURCE_ISSUE];
  const stablePass = runtime.stable.threeMinuteCase36.compliancePass
    && runtime.stable.voicingGoldDevelopment40.status === "COMPLETED"
    && runtime.stable.voicingGoldDevelopment40.compliancePass;
  const stableIssues = stablePass ? [] : ["Stable default-OFF runtime contract failed."];
  const adoptionIssues = [...normalizedCorrectnessIssues, ...resourceIssues];
  return {
    schemaVersion: 5,
    phase: "P5.15-01",
    holdoutEvaluated: false,
    frozenBaselineContract: frozenBaselineContractReport(),
    targeted: {
      clean: {
        original: clean.noteEvidenceDedup?.originalNoteCount ?? -1,
        effective: clean.noteEvidenceDedup?.effectiveNoteCount ?? -1,
      },
      duplicate: {
        original: duplicate.noteEvidenceDedup?.originalNoteCount ?? -1,
        effective: duplicate.noteEvidenceDedup?.effectiveNoteCount ?? -1,
        duplicates: duplicate.noteEvidenceDedup?.duplicateCount ?? -1,
      },
      normalizedDeepEqual,
      scoreRankConfidenceEqual: normalizedDeepEqual,
      protectedCases,
      modeMatrix,
    },
    existingCorpora,
    runtime,
    correctnessAdoptionGate: {
      pass: normalizedCorrectnessIssues.length === 0,
      newCorrectnessRegressions: existingCorpora.normalizedRegressions.length,
      targetedImprovementCount: normalizedDeepEqual && duplicate.noteEvidenceDedup?.duplicateCount === 33 ? 1 : 0,
      invariantPairsPass: modeMatrix.every((item) => item.normalizedDeepEqual),
      deterministic,
      rollbackAvailable: true,
      issues: normalizedCorrectnessIssues,
    },
    stableEligibilityGate: { pass: stablePass, issues: stableIssues },
    accuracyFirstEligibilityGate: {
      pass: normalizedCorrectnessIssues.length === 0,
      eligibility: runtime.accuracyFirst.performanceEligibility,
      runtimeAloneCanFailAdoption: false,
      issues: normalizedCorrectnessIssues,
    },
    resourceGate: { pass: resourceIssues.length === 0, issues: resourceIssues },
    gates: {
      adoptionPass: adoptionIssues.length === 0,
      requireStableEligibilityPass: adoptionIssues.length === 0 && stablePass,
      issues: adoptionIssues,
    },
  };
}

async function evaluateExistingCorpora(
  lock: Stage01BaselineLock,
): Promise<Stage01Report["existingCorpora"]> {
  const lockSuiteIds = lock.externalSuites.map((suite) => suite.id);
  if (!exactOrderedStrings(lockSuiteIds, STAGE01_FROZEN_SUITE_IDS)) {
    throw new Error("Stage 00 external suites differ from the frozen Stage 01 suite set.");
  }
  const suites: SuiteEvaluation[] = [];
  const allRegressions: string[] = [];
  let evaluatedFileCount = 0;

  for (const suite of lock.externalSuites) {
    if (excludedSuiteIds.has(suite.id)) {
      suites.push({
        id: suite.id,
        status: "EXCLUDED",
        reason: "burned diagnostic-only split is outside the frozen safe suite",
        frozenFileCount: suite.files.length,
        evaluatedFileCount: 0,
        conditionsEvaluated: [],
        normalizedRegressions: [],
      });
      continue;
    }
    const resolved = suite.files.map((file) => ({
      file,
      repositoryPath: lockedRepositoryPath(suite, file.path),
    }));
    const availability = await Promise.all(resolved.map(({ repositoryPath }) => exists(repositoryPath)));
    if (availability.every((value) => !value)) {
      suites.push({
        id: suite.id,
        status: "SKIPPED",
        reason: "frozen ignored input is not locally available",
        frozenFileCount: suite.files.length,
        evaluatedFileCount: 0,
        conditionsEvaluated: [],
        normalizedRegressions: [],
      });
      continue;
    }
    if (availability.some((value) => !value)) {
      suites.push({
        id: suite.id,
        status: "FAILED",
        reason: "frozen suite is only partially available",
        frozenFileCount: suite.files.length,
        evaluatedFileCount: 0,
        conditionsEvaluated: [],
        normalizedRegressions: [],
      });
      continue;
    }
    const regressions: string[] = [];
    let completedFiles = 0;
    for (const { file, repositoryPath } of resolved) {
      const relativePath = relative(repositoryRoot, repositoryPath).split(sep).join("/");
      const bytes = await readFileExistingWithinRoot(repositoryRoot, relativePath);
      if (bytes.byteLength !== file.byteLength || sha256(bytes) !== file.sha256) {
        regressions.push(`${suite.id}:fingerprint:${completedFiles + 1}`);
        continue;
      }
      for (const condition of evaluationConditions) {
        const off = analyzeCondition(bytes, condition, false);
        const on = analyzeCondition(bytes, condition, true);
        if (!equalNormalized(off, on)) {
          regressions.push(`${suite.id}:${completedFiles + 1}:${condition.id}`);
        }
      }
      completedFiles += 1;
    }
    const status: SuiteStatus = completedFiles === suite.files.length && regressions.length === 0
      ? "COMPLETED"
      : "FAILED";
    suites.push({
      id: suite.id,
      status,
      reason: status === "COMPLETED"
        ? "all frozen files evaluated under every required OFF/ON condition"
        : "fingerprint or normalized output regression",
      frozenFileCount: suite.files.length,
      evaluatedFileCount: completedFiles,
      conditionsEvaluated: evaluationConditions.map((item) => item.id),
      normalizedRegressions: regressions,
    });
    evaluatedFileCount += completedFiles;
    allRegressions.push(...regressions);
  }

  const safe = suites.filter((item) => item.status !== "EXCLUDED");
  const completedSuiteCount = safe.filter((item) => item.status === "COMPLETED").length;
  const skippedSuiteCount = safe.filter((item) => item.status === "SKIPPED").length;
  const failed = safe.some((item) => item.status === "FAILED");
  const status = failed
    ? "FAILED" as const
    : completedSuiteCount === 0
      ? "SKIPPED" as const
      : skippedSuiteCount > 0
        ? "COMPLETED_WITH_SKIPS" as const
        : "COMPLETED" as const;
  return {
    status,
    frozenSafeSuiteCount: safe.length,
    completedSuiteCount,
    skippedSuiteCount,
    evaluatedFileCount,
    conditions: evaluationConditions.map((item) => item.id),
    suites,
    normalizedRegressions: allRegressions,
  };
}

async function evaluateRuntime(
  contract: Phase515CorpusContract,
  runtimeBaseline: RuntimeBaseline,
  baselineLock: Stage01BaselineLock,
): Promise<Stage01Report["runtime"]> {
  const evaluationRunNonce = randomUUID();
  const contentionState = stage01ExternalContentionState(process.argv);
  const externalContentionObserved = contentionState === "EXTERNAL_CPU_CONTENTION_OBSERVED";
  const contentionReason = externalContentionObserved
    ? "external CPU contention was explicitly observed; unrelated processes were not terminated"
    : "OS CPU competition was not attributed automatically";
  const bytes = fixture(contract, "36_long_three_minute_stability");
  const threeMinuteBaseline = {
    median: runtimeBaseline.threeMinute.runtimeMs.median,
    p95: runtimeBaseline.threeMinute.runtimeMs.p95,
    max: runtimeBaseline.threeMinute.runtimeMs.max,
  };
  const case36Attempts = await measurePairedProtocolAsync(
    (enabled, plannedSampleIndex, measurementKind, protocolAttempt, generation, runNonce) =>
      runTimedRuntimeChild(
        [bytes], enabled, plannedSampleIndex, measurementKind,
        protocolAttempt, generation, runNonce, "case36-three-minute",
      ),
    STAGE01_CASE36_SAMPLES_PER_ATTEMPT,
    threeMinuteBaseline,
    `case36 fixed bytes/config; ${contentionReason}`,
    evaluationRunNonce,
    contentionState,
  );
  const stableMeasured = measuredRuntime(case36Attempts.stable, threeMinuteBaseline);
  const stableThree = {
    ...stableMeasured,
    profile: "Stable" as const,
    featureFlagEnabled: false as const,
    frozenThreeMinuteTenSecondLimitMs: 10_000 as const,
    frozenStage00RatioLimit: threshold,
    underTenSeconds: stableMeasured.attempts.every((attempt) =>
      attempt.summaryMs.max <= 10_000),
    withinStage00Ratio: stableMeasured.attempts.every((attempt) =>
      attempt.ratiosToStage00.max !== null && attempt.ratiosToStage00.max <= threshold),
    compliancePass: false,
  };
  stableThree.compliancePass = stableThree.underTenSeconds
    && stableThree.withinStage00Ratio
    && stableMeasured.timeoutCount === 0;
  const accuracySummary = measuredRuntime(case36Attempts.accuracyFirst, threeMinuteBaseline);
  const case36EffectiveMaxMs = Math.max(
    accuracySummary.summaryMs.max,
    accuracySummary.timeoutCount > 0 ? STAGE01_NORMAL_INPUT_TIMEOUT_MS : 0,
  );
  const performanceTier = accuracyTier(case36EffectiveMaxMs);
  const accuracyThree = {
    ...accuracySummary,
    profile: "Accuracy First" as const,
    featureFlagEnabled: true as const,
    performanceTier,
    tierEligible: accuracySummary.timeoutCount === 0 && performanceTier !== "OVER_300_SECONDS",
    runtimeIncreaseReason: "The measured delta is reported alongside correctness; exact-evidence canonicalization is an additional deterministic offline analysis pass.",
    correctnessImprovement: "case 03 exact evidence 66 -> 33; case 02/03 normalized deep equal" as const,
  };

  // Read the Stage 00 lock and verify every ordered path/hash/length into open
  // in-memory handles immediately before timing. Runtime never rereads the
  // mutable corpus manifest and both profiles consume these same verified bytes.
  const lockedForty = await loadLockedVoicing40Bytes(baselineLock);
  const fortyBaseline = {
    median: runtimeBaseline.fortyFileBatch.totalMs,
    p95: runtimeBaseline.fortyFileBatch.totalMs,
    max: runtimeBaseline.fortyFileBatch.totalMs,
  };
  let stableForty: Stage01Report["runtime"]["stable"]["voicingGoldDevelopment40"];
  let accuracyForty: Stage01Report["runtime"]["accuracyFirst"]["voicingGoldDevelopment40"];
  if (lockedForty.status === "SKIPPED") {
    stableForty = {
      status: "SKIPPED",
      profile: "Stable",
      featureFlagEnabled: false,
      reason: lockedForty.reason,
      lockedFileCount: 40,
      lockedSelectionDigest: STAGE01_FROZEN_VOICING40_SELECTION_DIGEST,
      lockVerifiedImmediatelyBeforeBenchmark: false,
      compliancePass: false,
    };
    accuracyForty = {
      status: "SKIPPED",
      profile: "Accuracy First",
      featureFlagEnabled: true,
      reason: lockedForty.reason,
      lockedFileCount: 40,
      lockedSelectionDigest: STAGE01_FROZEN_VOICING40_SELECTION_DIGEST,
      sameLockedBytesAsStable: false,
      sameInMemoryHandlesAsStable: false,
    };
  } else {
    // Warm-up is separated and not included in measured samples.
    const fortyAttempts = await measurePairedProtocolAsync(
      (enabled, plannedSampleIndex, measurementKind, protocolAttempt, generation, runNonce) =>
        runTimedRuntimeChild(
          lockedForty.bytes, enabled, plannedSampleIndex, measurementKind,
          protocolAttempt, generation, runNonce, "voicing-gold-development-40",
        ),
      STAGE01_VOICING40_SAMPLES_PER_ATTEMPT,
      fortyBaseline,
      `Voicing40 same verified in-memory handles/config; ${contentionReason}`,
      evaluationRunNonce,
      contentionState,
    );
    const stableMeasured = measuredRuntime(fortyAttempts.stable, fortyBaseline);
    const stableCompliance = stableMeasured.attempts.every((attempt) =>
      attempt.ratiosToStage00.max !== null && attempt.ratiosToStage00.max <= threshold)
      && stableMeasured.timeoutCount === 0;
    stableForty = {
      status: "COMPLETED",
      ...stableMeasured,
      profile: "Stable",
      featureFlagEnabled: false,
      frozenStage00RatioLimit: threshold,
      lockedFileCount: 40,
      lockedSelectionDigest: STAGE01_FROZEN_VOICING40_SELECTION_DIGEST,
      lockVerifiedImmediatelyBeforeBenchmark: true,
      compliancePass: stableCompliance,
    };
    accuracyForty = {
      status: "COMPLETED",
      ...measuredRuntime(fortyAttempts.accuracyFirst, fortyBaseline),
      profile: "Accuracy First",
      featureFlagEnabled: true,
      lockedFileCount: 40,
      lockedSelectionDigest: STAGE01_FROZEN_VOICING40_SELECTION_DIGEST,
      sameLockedBytesAsStable: true,
      sameInMemoryHandlesAsStable: true,
    };
  }

  // Exact-note evidence dedup is reachable only through offline analyzeMidi.
  // Live MIDI and Chord Dojo do not depend on that path, so a single current
  // reference is reported without pretending to measure an OFF/ON effect.
  const memory = benchmarkMemoryChildren(
    runtimeBaseline.threeMinute.maxObservedPostAnalysisRssBytes,
  );
  const observedAccuracyMaximum = Math.max(
    accuracyThree.summaryMs.max,
    accuracyForty.status === "COMPLETED" ? accuracyForty.summaryMs.max : 0,
  );
  const accuracyTimeoutCount = accuracyThree.timeoutCount
    + (accuracyForty.status === "COMPLETED" ? accuracyForty.timeoutCount : 0);
  const accuracyMaximum = Math.max(
    observedAccuracyMaximum,
    accuracyTimeoutCount > 0 ? STAGE01_NORMAL_INPUT_TIMEOUT_MS : 0,
  );
  const performanceBasisTier = accuracyTier(accuracyMaximum);
  const performanceEligibility = accuracyTimeoutCount > 0
    ? "EXPERIMENT_ONLY" as const
    : performanceBasisTier === "OVER_300_SECONDS"
    ? "EXPERIMENT_ONLY" as const
    : performanceBasisTier === "180_TO_300_SECONDS"
      ? "CONDITIONAL" as const
      : "ELIGIBLE" as const;
  const uiCapability = accuracyTimeoutCount > 0 || performanceBasisTier === "180_TO_300_SECONDS"
    ? "REQUIRED" as const
    : accuracyMaximum <= 1_000
      ? "NOT_REQUIRED_UNDER_ONE_SECOND" as const
      : "APPLICATION_CONTRACT_PRESERVED" as const;
  const liveReference = benchmarkLiveMidiLatency();
  const dojoReference = benchmarkChordDojo();
  const accuracyRuntimeTable: Stage01Report["runtime"]["accuracyRuntimeTable"] = [{
    benchmark: "case36-three-minute",
    correctnessImprovement: accuracyThree.correctnessImprovement,
    stableRuntimeMs: stableThree.summaryMs,
    accuracyFirstRuntimeMs: accuracyThree.summaryMs,
    ratiosToStage00: accuracyThree.ratiosToStage00,
    timeoutCount: accuracyThree.timeoutCount,
    ...runtimeTierFields(accuracyThree.summaryMs.max, accuracyThree.timeoutCount),
  }];
  if (stableForty.status === "COMPLETED" && accuracyForty.status === "COMPLETED") {
    accuracyRuntimeTable.push({
      benchmark: "voicing-gold-development-40",
      correctnessImprovement: accuracyThree.correctnessImprovement,
      stableRuntimeMs: stableForty.summaryMs,
      accuracyFirstRuntimeMs: accuracyForty.summaryMs,
      ratiosToStage00: accuracyForty.ratiosToStage00,
      timeoutCount: accuracyForty.timeoutCount,
      ...runtimeTierFields(accuracyForty.summaryMs.max, accuracyForty.timeoutCount),
    });
  }
  const case36RuntimeFingerprint = stableThree.attempts[0]!.rawSamples[0]!;
  const voicing40RuntimeFingerprint = stableForty.status === "COMPLETED"
    ? stableForty.attempts[0]!.rawSamples[0]!
    : null;
  const case36EvidenceDigest = assertFixedRuntimeDigest(
    case36RuntimeFingerprint.inputDigestSha256,
    STAGE01_CASE36_INPUT_DIGEST_SHA256,
  );
  const voicing40EvidenceDigest = voicing40RuntimeFingerprint
    ? assertFixedRuntimeDigest(
        voicing40RuntimeFingerprint.inputDigestSha256,
        STAGE01_VOICING40_INPUT_DIGEST_SHA256,
      )
    : STAGE01_VOICING40_INPUT_DIGEST_SHA256;
  return {
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
      timeoutMs: case36RuntimeFingerprint.timeoutMs,
      analyzerConfigVersionSha256: case36RuntimeFingerprint.analyzerConfigVersionSha256,
      case36InputDigestSha256: case36EvidenceDigest,
      voicing40InputDigestSha256: voicing40EvidenceDigest,
    },
    stable: {
      threeMinuteCase36: stableThree,
      voicingGoldDevelopment40: stableForty,
      liveMidiConfirmedP50Ms: constructionInvariant(
        "NOT_APPLICABLE", liveReference.after.confirmedChord.p50Ms,
      ),
      liveMidiConfirmedP90Ms: constructionInvariant(
        "NOT_APPLICABLE", liveReference.after.confirmedChord.p90Ms,
      ),
      chordDojoP50MsPerOperation: constructionInvariant(
        "UNCHANGED_BY_CONSTRUCTION", dojoReference.p50,
      ),
      chordDojoP95MsPerOperation: constructionInvariant(
        "UNCHANGED_BY_CONSTRUCTION", dojoReference.p95,
      ),
    },
    accuracyFirst: {
      threeMinuteCase36: accuracyThree,
      voicingGoldDevelopment40: accuracyForty,
      uiContract: {
        requirementBasisMaxMs: accuracyMaximum,
        uiThreadNonBlocking: uiCapability,
        progressCapability: uiCapability,
        cancellationCapability: uiCapability,
        doubleStartPrevention: uiCapability,
        routeAndExitResourceRelease: uiCapability,
        noFabricatedResultBeforeCompletion: true,
        timeoutDistinctFromDetectionFailure: true,
        implementationStatus: accuracyTimeoutCount > 0
          || performanceBasisTier === "180_TO_300_SECONDS"
          ? "async progress cancellation and resource release required before product connection"
          : "application contract preserved; no new Stage 01 UI",
      },
      performanceEligibility,
      productConnectionStatus: performanceEligibility === "ELIGIBLE" ? "CONNECTED" : "NOT_CONNECTED",
      performanceEligibilityReason: performanceEligibility === "ELIGIBLE"
        ? "Every normal-input maximum is within the provisional product-connection tier."
        : performanceEligibility === "CONDITIONAL"
          ? "Progress, cancellation, and non-blocking integration are required before product enablement."
          : accuracyTimeoutCount > 0
            ? "A normal-input timed child reached the 300-second timeout; product connection is fail-closed and experiment-only."
            : "Over 300 seconds remains experiment-only and is not a product default.",
      performanceBasisMaxMs: accuracyMaximum,
      inputsOver300Seconds: [
        ...(accuracyThree.summaryMs.max > 300_000 || accuracyThree.timeoutCount > 0
          ? ["case36-three-minute" as const] : []),
        ...(accuracyForty.status === "COMPLETED"
          && (accuracyForty.summaryMs.max > 300_000 || accuracyForty.timeoutCount > 0)
          ? ["voicing-gold-development-40" as const] : []),
      ],
      timeoutCount: accuracyTimeoutCount,
    },
    memory,
    accuracyRuntimeTable,
  };
}

export function stage01ExternalContentionState(
  argv: readonly string[],
): (typeof STAGE01_CONTENTION_STATES)[number] {
  return argv.includes("--external-cpu-contention-observed")
    ? "EXTERNAL_CPU_CONTENTION_OBSERVED"
    : "NO_EXTERNAL_CPU_CONTENTION_DECLARED";
}

function runtimeTierFields(completedMaxMs: number, timeoutCount: number) {
  const effectiveMaxMs = Math.max(
    completedMaxMs,
    timeoutCount > 0 ? STAGE01_NORMAL_INPUT_TIMEOUT_MS : 0,
  );
  const performanceTier = accuracyTier(effectiveMaxMs);
  const performanceEligibility = timeoutCount > 0 || performanceTier === "OVER_300_SECONDS"
    ? "EXPERIMENT_ONLY" as const
    : performanceTier === "180_TO_300_SECONDS"
      ? "CONDITIONAL" as const
      : "ELIGIBLE" as const;
  return {
    effectiveMaxMs,
    performanceTier,
    tierEligible: timeoutCount === 0 && performanceTier !== "OVER_300_SECONDS",
    performanceEligibility,
  };
}

function assertFixedRuntimeDigest<const Expected extends string>(
  actual: string,
  expected: Expected,
): Expected {
  if (actual !== expected) throw new Error("Runtime fingerprint evidence differs from its frozen digest.");
  return expected;
}

function measuredRuntime(
  attempts: readonly RuntimeAttemptMeasurement[],
  baseline: { median: number; p95: number; max: number },
) {
  const samples = attempts.flatMap((attempt) => attempt.samplesMs);
  const summaryMs = summarizeSamples(samples);
  const ratiosToStage00 = {
    median: stage01Ratio(summaryMs.median, baseline.median),
    p95: stage01Ratio(summaryMs.p95, baseline.p95),
    max: stage01Ratio(summaryMs.max, baseline.max),
  };
  const thresholdOutlier = ratiosToStage00.max !== null
    && ratiosToStage00.max > threshold
    && ratiosToStage00.median !== null
    && ratiosToStage00.median <= threshold;
  return {
    protocolAttemptCount: STAGE01_RUNTIME_ATTEMPT_COUNT,
    samplesPerAttempt: attempts[0]?.plannedSampleCount ?? 0,
    aggregateRule: STAGE01_RUNTIME_AGGREGATE_RULE,
    attempts: [...attempts],
    samplesMs: [...samples],
    summaryMs,
    baselineMs: baseline,
    ratiosToStage00,
    outlierNote: thresholdOutlier
      ? "A max-only threshold outlier occurred under alternating order; external CPU contention telemetry was unavailable, so Stable remains non-passing pending fixed-condition remeasurement."
      : "Alternating OFF/ON order; no max-only Stage00 threshold outlier was observed.",
    timeoutCount: attempts.reduce((total, attempt) => total + attempt.timeoutCount, 0),
  };
}

export function measurePairedProtocol(
  benchmark: (
    enabled: boolean,
    plannedSampleIndex: number,
    measurementKind: TimedRuntimeSample["measurementKind"],
    protocolAttempt: number,
    generation: 1 | 2,
    runNonce: string,
  ) => TimedRuntimeSample,
  samplesPerAttempt: number,
  baseline: { median: number; p95: number; max: number },
  reason: string,
  runNonce: string = randomUUID(),
): { stable: RuntimeAttemptMeasurement[]; accuracyFirst: RuntimeAttemptMeasurement[] } {
  const stable: RuntimeAttemptMeasurement[] = [];
  const accuracyFirst: RuntimeAttemptMeasurement[] = [];
  try {
    for (let attempt = 1; attempt <= STAGE01_RUNTIME_ATTEMPT_COUNT; attempt += 1) {
    const elapsedStarted = performance.now();
    const cpuStarted = process.cpuUsage();
    const offSamples: TimedRuntimeSample[] = [];
    const onSamples: TimedRuntimeSample[] = [];
    const stopped = new Map([[false, false], [true, false]]);
    const retryUsed = new Map([[false, false], [true, false]]);
    for (let pair = 0; pair < samplesPerAttempt; pair += 1) {
      for (const enabled of pair % 2 === 0 ? [false, true] : [true, false]) {
        if (stopped.get(enabled)) continue;
        const samples = enabled ? onSamples : offSamples;
        const planned = benchmark(enabled, pair + 1, "planned", attempt, 1, runNonce);
        samples.push(planned);
        if (planned.status !== "timeout") continue;
        if (retryUsed.get(enabled)) {
          stopped.set(enabled, true);
          continue;
        }
        retryUsed.set(enabled, true);
        const retry = benchmark(enabled, pair + 1, "timeout-retry", attempt, 2, runNonce);
        samples.push(retry);
        if (retry.status === "timeout") stopped.set(enabled, true);
      }
    }
    const elapsedMs = round(performance.now() - elapsedStarted);
    const cpu = process.cpuUsage(cpuStarted);
    const telemetry = {
      elapsedMs,
      cpuUserMicros: cpu.user,
      cpuSystemMicros: cpu.system,
      contentionObserved: false,
      reason: "NO_EXTERNAL_CPU_CONTENTION_DECLARED" as const,
    };
    stable.push(runtimeAttempt(attempt, offSamples, baseline, telemetry, reason));
    accuracyFirst.push(runtimeAttempt(attempt, onSamples, baseline, telemetry, reason));
    }
    return { stable, accuracyFirst };
  } finally {
    cleanupRuntimeChildBundle();
  }
}

async function measurePairedProtocolAsync(
  benchmark: (
    enabled: boolean,
    plannedSampleIndex: number,
    measurementKind: TimedRuntimeSample["measurementKind"],
    protocolAttempt: number,
    generation: 1 | 2,
    runNonce: string,
  ) => Promise<TimedRuntimeSample>,
  samplesPerAttempt: number,
  baseline: { median: number; p95: number; max: number },
  reason: string,
  runNonce: string,
  contentionState: (typeof STAGE01_CONTENTION_STATES)[number],
): Promise<{ stable: RuntimeAttemptMeasurement[]; accuracyFirst: RuntimeAttemptMeasurement[] }> {
  const stable: RuntimeAttemptMeasurement[] = [];
  const accuracyFirst: RuntimeAttemptMeasurement[] = [];
  try {
    for (let attempt = 1; attempt <= STAGE01_RUNTIME_ATTEMPT_COUNT; attempt += 1) {
      const elapsedStarted = performance.now();
      const cpuStarted = process.cpuUsage();
      const offSamples: TimedRuntimeSample[] = [];
      const onSamples: TimedRuntimeSample[] = [];
      const stopped = new Map([[false, false], [true, false]]);
      const retryUsed = new Map([[false, false], [true, false]]);
      for (let pair = 0; pair < samplesPerAttempt; pair += 1) {
        for (const enabled of pair % 2 === 0 ? [false, true] : [true, false]) {
          if (stopped.get(enabled)) continue;
          const samples = enabled ? onSamples : offSamples;
          const planned = await benchmark(enabled, pair + 1, "planned", attempt, 1, runNonce);
          samples.push(planned);
          if (planned.status !== "timeout") continue;
          if (retryUsed.get(enabled)) {
            stopped.set(enabled, true);
            continue;
          }
          retryUsed.set(enabled, true);
          const retry = await benchmark(enabled, pair + 1, "timeout-retry", attempt, 2, runNonce);
          samples.push(retry);
          if (retry.status === "timeout") stopped.set(enabled, true);
        }
      }
      const elapsedMs = round(performance.now() - elapsedStarted);
      const cpu = process.cpuUsage(cpuStarted);
      const telemetry = {
        elapsedMs,
        cpuUserMicros: cpu.user,
        cpuSystemMicros: cpu.system,
        contentionObserved: contentionState === "EXTERNAL_CPU_CONTENTION_OBSERVED",
        reason: contentionState,
      };
      stable.push(runtimeAttempt(attempt, offSamples, baseline, telemetry, reason));
      accuracyFirst.push(runtimeAttempt(attempt, onSamples, baseline, telemetry, reason));
    }
    return { stable, accuracyFirst };
  } finally {
    cleanupRuntimeChildBundle();
  }
}

function runtimeAttempt(
  attempt: number,
  rawSamples: TimedRuntimeSample[],
  baselineMs: { median: number; p95: number; max: number },
  contentionTelemetry: RuntimeAttemptMeasurement["contentionTelemetry"],
  reason: string,
): RuntimeAttemptMeasurement {
  const samplesMs = rawSamples
    .filter((sample) => sample.status === "completed")
    .map((sample) => sample.elapsedMs);
  const summaryMs = summarizeSamples(samplesMs);
  return {
    attempt,
    warmupRuns: rawSamples.reduce((total, sample) => total + sample.warmupRuns, 0),
    plannedSampleCount: baselineSampleCount(rawSamples),
    measuredSampleCount: rawSamples.length,
    skippedSampleCount: Math.max(0, baselineSampleCount(rawSamples) - rawSamples
      .filter((sample) => sample.measurementKind === "planned").length),
    retryCount: rawSamples.filter((sample) => sample.measurementKind === "timeout-retry").length,
    terminatedAfterTimeoutLimit: rawSamples.length > 0
      && rawSamples.at(-1)!.status === "timeout"
      && rawSamples.some((sample) => sample.measurementKind === "timeout-retry"),
    timeoutTargetMs: STAGE01_NORMAL_INPUT_TIMEOUT_MS,
    measurementOrder: "alternating-OFF-ON; odd-pairs-OFF-first; even-pairs-ON-first",
    rawSamples,
    samplesMs,
    timeoutCount: rawSamples.filter((sample) => sample.status === "timeout").length,
    summaryMs,
    baselineMs,
    ratiosToStage00: {
      median: stage01Ratio(summaryMs.median, baselineMs.median),
      p95: stage01Ratio(summaryMs.p95, baselineMs.p95),
      max: stage01Ratio(summaryMs.max, baselineMs.max),
    },
    contentionTelemetry,
    reason,
  };
}

function baselineSampleCount(rawSamples: readonly TimedRuntimeSample[]): number {
  return rawSamples[0]?.analysisCount === 40
    ? STAGE01_VOICING40_SAMPLES_PER_ATTEMPT
    : STAGE01_CASE36_SAMPLES_PER_ATTEMPT;
}

function summarizeSamples(samples: readonly number[]) {
  return {
    count: samples.length,
    median: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: samples.length > 0 ? round(Math.max(...samples)) : 0,
  };
}

function accuracyTier(medianMs: number) {
  if (medianMs <= 60_000) return "UNDER_60_SECONDS" as const;
  if (medianMs <= 180_000) return "60_TO_180_SECONDS" as const;
  if (medianMs <= 300_000) return "180_TO_300_SECONDS" as const;
  return "OVER_300_SECONDS" as const;
}

async function loadLockedVoicing40Bytes(lock: Stage01BaselineLock): Promise<
  { status: "COMPLETED"; bytes: Uint8Array[] } | { status: "SKIPPED"; reason: string }
> {
  const suite = lock.externalSuites.find((item) => item.id === "voicing-gold-40-file-selection");
  if (!suite || suite.files.length !== 40
    || new Set(suite.files.map((file) => file.path)).size !== 40
    || sha256(new TextEncoder().encode(stableJson(suite.files)))
      !== STAGE01_FROZEN_VOICING40_SELECTION_DIGEST) {
    throw new Error("Stage 00 Voicing40 exact ordered lock is invalid.");
  }
  const handles: Uint8Array[] = [];
  for (const [index, file] of suite.files.entries()) {
    const path = lockedRepositoryPath(suite, file.path);
    const relativePath = relative(repositoryRoot, path).split(sep).join("/");
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFileExistingWithinRoot(repositoryRoot, relativePath));
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT" && handles.length === 0) {
        return { status: "SKIPPED", reason: "frozen ignored Voicing40 input is not locally available" };
      }
      throw new Error(`Voicing40 locked file ${index + 1} is unavailable.`, { cause });
    }
    if (bytes.byteLength !== file.byteLength || sha256(bytes) !== file.sha256) {
      throw new Error(`Voicing40 locked file ${index + 1} fingerprint changed.`);
    }
    handles.push(bytes);
  }
  return { status: "COMPLETED", bytes: handles };
}

const STAGE01_NORMAL_INPUT_TIMEOUT_MS = 300_000;
let runtimeChildBundle: { root: string; entry: string; exitHandler: () => void } | null = null;
const RUNTIME_BUNDLE_PARENT_NAME = "loop-vault-p515-runtime-bundles";
const RUNTIME_BUNDLE_PATTERN = /^p515-runtime-child-[A-Za-z0-9_-]{6}$/u;

export function runtimeChildBundleParentRoot(): string {
  return resolve(tmpdir(), RUNTIME_BUNDLE_PARENT_NAME);
}

export function scavengeRuntimeChildBundles(): number {
  const parent = runtimeChildBundleParentRoot();
  mkdirSync(parent, { recursive: true });
  const parentInfo = lstatSync(parent);
  const realParent = realpathSync(parent);
  const sameParent = process.platform === "win32"
    ? realParent.toLowerCase() === parent.toLowerCase() : realParent === parent;
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()
    || !sameParent) {
    throw new Error("Stage 01 runtime bundle root is not the fixed real temporary directory.");
  }
  let removed = 0;
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (!RUNTIME_BUNDLE_PATTERN.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    const directory = resolve(parent, entry.name);
    const ownerPath = resolve(directory, "owner.json");
    let owner: unknown;
    try { owner = JSON.parse(readFileSync(ownerPath, "utf8")); } catch { continue; }
    if (!owner || typeof owner !== "object"
      || JSON.stringify(Object.keys(owner).sort()) !== JSON.stringify(["pid", "schemaVersion"])
      || (owner as { schemaVersion?: unknown }).schemaVersion !== 1
      || !Number.isInteger((owner as { pid?: unknown }).pid)) continue;
    const pid = (owner as { pid: number }).pid;
    if (runtimeProcessAlive(pid)) continue;
    rmSync(directory, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

function runtimeProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === "EPERM";
  }
}

function cleanupRuntimeChildBundle(): void {
  if (!runtimeChildBundle) return;
  const current = runtimeChildBundle;
  runtimeChildBundle = null;
  process.off("exit", current.exitHandler);
  rmSync(assertOwnedRuntimeBundleRoot(current.root), { recursive: true, force: true });
}

function assertOwnedRuntimeBundleRoot(root: string): string {
  const parent = runtimeChildBundleParentRoot();
  const expectedParent = realpathSync(parent);
  const actualParent = realpathSync(resolve(root, ".."));
  const sameParent = process.platform === "win32"
    ? expectedParent.toLowerCase() === actualParent.toLowerCase() : expectedParent === actualParent;
  const info = lstatSync(root);
  if (!sameParent || !RUNTIME_BUNDLE_PATTERN.test(basename(root))
    || !info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("Stage 01 runtime bundle cleanup escaped its fixed allowlisted root.");
  }
  return root;
}

function directRuntimeChildEntry(): string {
  if (runtimeChildBundle) return runtimeChildBundle.entry;
  const parent = runtimeChildBundleParentRoot();
  scavengeRuntimeChildBundles();
  const root = mkdtempSync(resolve(parent, "p515-runtime-child-"));
  const entry = resolve(root, "stage01RuntimeChild.mjs");
  try {
    writeFileSync(resolve(root, "owner.json"), `${JSON.stringify({ schemaVersion: 1, pid: process.pid })}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    buildSync({
      entryPoints: [resolve(repositoryRoot, "scripts/phase515/stage01RuntimeChild.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      outfile: entry,
      logLevel: "silent",
    });
  } catch (cause) {
    rmSync(assertOwnedRuntimeBundleRoot(root), { recursive: true, force: true });
    throw cause;
  }
  const exitHandler = () => {
    if (runtimeChildBundle?.root === root) cleanupRuntimeChildBundle();
  };
  runtimeChildBundle = { root, entry, exitHandler };
  process.once("exit", exitHandler);
  return entry;
}

async function runTimedRuntimeChild(
  inputs: readonly Uint8Array[],
  enabled: boolean,
  plannedSampleIndex: number,
  measurementKind: TimedRuntimeSample["measurementKind"],
  protocolAttempt: number,
  generation: 1 | 2,
  runNonce: string,
  benchmarkId: Stage01RuntimeBenchmarkId,
): Promise<TimedRuntimeSample> {
  const inputsBase64 = inputs.map((bytes) => Buffer.from(bytes).toString("base64"));
  const inputDigestSha256 = createHash("sha256")
    .update(JSON.stringify(inputsBase64))
    .digest("hex");
  const expectedInputDigest = inputs.length === 1
    ? STAGE01_CASE36_INPUT_DIGEST_SHA256
    : inputs.length === 40
      ? STAGE01_VOICING40_INPUT_DIGEST_SHA256
      : null;
  if (inputDigestSha256 !== expectedInputDigest) {
    throw new Error("Stage 01 runtime input differs from the fixed normal-input fingerprint.");
  }
  const attemptId = stage01RuntimeAttemptId({
    runNonce,
    benchmarkId,
    protocolAttempt,
    featureFlagEnabled: enabled,
    plannedSampleIndex,
    measurementKind,
    generation,
  });
  const fingerprint: TimedRuntimeFingerprint = {
    warmupRuns: 1 as const,
    warmupAnalysisCount: inputs.length,
    config: {
      mode: "phase4-v1" as const,
      enableExactNoteEvidenceDedup: enabled,
    },
    inputDigestSha256: expectedInputDigest,
    analyzerConfigVersionSha256: STAGE01_ANALYZER_CONFIG_SHA256,
    featureFlagEnabled: enabled,
    analysisCount: inputs.length,
    measurementKind,
    plannedSampleIndex,
    benchmarkId,
    attemptId,
    runNonce,
    protocolAttempt,
    generation,
    deadlineDurationMs: STAGE01_NORMAL_INPUT_TIMEOUT_MS,
  };
  const request = `${JSON.stringify({
    schemaVersion: 2,
    enabled,
    warmupRuns: fingerprint.warmupRuns,
    config: fingerprint.config,
    inputDigestSha256: fingerprint.inputDigestSha256,
    analyzerConfigVersionSha256: fingerprint.analyzerConfigVersionSha256,
    measurementKind,
    plannedSampleIndex,
    benchmarkId,
    attemptId,
    runNonce,
    protocolAttempt,
    generation,
    deadlineDurationMs: STAGE01_NORMAL_INPUT_TIMEOUT_MS,
    inputsBase64,
  })}\n`;
  return runTimedChildProcessAsync(
    process.execPath,
    [directRuntimeChildEntry()],
    request,
    STAGE01_NORMAL_INPUT_TIMEOUT_MS,
    fingerprint,
  );
}

export async function runTimedChildProcessAsync(
  command: string,
  args: readonly string[],
  input: string,
  timeoutMs: 300_000,
  expected: TimedRuntimeFingerprint,
  supervisionTimeoutMs: number = timeoutMs,
): Promise<TimedRuntimeSample> {
  if (!Number.isInteger(supervisionTimeoutMs) || supervisionTimeoutMs <= 0
    || supervisionTimeoutMs > timeoutMs) {
    throw new Error("Stage 01 async child supervision timeout is invalid.");
  }
  return new Promise((resolveResult, rejectResult) => {
    const processStarted = performance.now();
    const child = spawn(command, [...args], {
      cwd: repositoryRoot,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let spawnError: Error | undefined;
    let timeoutRequested = false;
    let overflow = false;
    let exited = false;
    let exitObservedDurationMs: number | undefined;
    let closed = false;
    let settled = false;
    let terminationFailure: Error | null = null;
    let killGrace: ReturnType<typeof setTimeout> | undefined;
    const ownedPid = child.pid;
    const complete = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killGrace) clearTimeout(killGrace);
      action();
    };
    const capture = (target: "stdout" | "stderr", chunk: Buffer) => {
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 1024 * 1024) {
        overflow = true;
        terminationFailure ??= terminateTimedChild(child, ownedPid);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));
    child.on("error", (cause) => { spawnError = cause; });
    child.once("exit", () => {
      exited = true;
      exitObservedDurationMs = round(performance.now() - processStarted);
    });
    const timeout = setTimeout(() => {
      if (exited || closed || settled) return;
      timeoutRequested = true;
      terminationFailure = terminateTimedChild(child, ownedPid);
      killGrace = setTimeout(() => {
        if (!closed) {
          complete(() => rejectResult(new Error(
            `Stage 01 timed child ${ownedPid ?? "unknown"} did not exit after its owned deadline termination.`,
          )));
        }
      }, 5_000);
    }, supervisionTimeoutMs);
    child.on("close", (status) => {
      closed = true;
      if (overflow) {
        complete(() => rejectResult(new Error("Stage 01 timed child exceeded its fixed output bound.")));
        return;
      }
      if (terminationFailure) {
        complete(() => rejectResult(new Error("Stage 01 timed child termination failed closed.", {
          cause: terminationFailure,
        })));
        return;
      }
      // `close` can be delivered well after `exit` when the parent event loop is
      // contended or a stdio handle drains slowly.  The process deadline is tied
      // to the observed exit, not to that later stream-cleanup notification.
      const processDurationMs = exitObservedDurationMs
        ?? round(performance.now() - processStarted);
      const error = spawnError ?? (timeoutRequested
        ? Object.assign(new Error("Stage 01 timed child deadline exceeded."), { code: "ETIMEDOUT" })
        : undefined);
      try {
        const result = interpretTimedChildProcessResult(
          { error, status, stdout, stderr },
          processDurationMs,
          timeoutMs,
          expected,
          supervisionTimeoutMs,
        );
        complete(() => resolveResult(result));
      } catch (cause) {
        complete(() => rejectResult(cause));
      }
    });
    child.stdin.on("error", (cause) => { spawnError ??= cause; });
    child.stdin.end(input, "utf8");
  });
}

function terminateTimedChild(
  child: ReturnType<typeof spawn>,
  pid: number | undefined,
): Error | null {
  if (!pid || pid <= 0) return new Error("Stage 01 timed child lacks an owned PID.");
  if (process.platform === "win32") {
    const terminated = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
    });
    if (!terminated.error && terminated.status === 0) return null;
    if (child.kill("SIGKILL")) return null;
    try { process.kill(pid, 0); } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ESRCH") return null;
      return cause as Error;
    }
    return terminated.error ?? new Error(`taskkill exited ${terminated.status}: ${terminated.stderr}`);
  }
  try {
    process.kill(pid, "SIGKILL");
    return null;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ESRCH") return null;
    return cause as Error;
  }
}

/** Execute one raw timed sample. Timeout is data, not a detection failure. */
export function runTimedChildProcess(
  command: string,
  args: readonly string[],
  input: string,
  timeoutMs: 300_000,
  expected: TimedRuntimeFingerprint,
  spawnTimeoutMs: number = timeoutMs,
): TimedRuntimeSample {
  if (timeoutMs !== STAGE01_NORMAL_INPUT_TIMEOUT_MS
    || !Number.isInteger(spawnTimeoutMs) || spawnTimeoutMs <= 0) {
    throw new Error("Stage 01 timed child timeout must be a positive integer.");
  }
  const processStarted = performance.now();
  const child = spawnSync(command, [...args], {
    cwd: repositoryRoot,
    input,
    encoding: "utf8",
    timeout: spawnTimeoutMs,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  const processDurationMs = round(performance.now() - processStarted);
  return interpretTimedChildProcessResult({
    error: child.error,
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
  }, processDurationMs, timeoutMs, expected);
}

export function interpretTimedChildProcessResult(
  child: { error?: Error; status: number | null; stdout: string; stderr: string },
  processDurationMs: number,
  timeoutMs: 300_000,
  expected: TimedRuntimeFingerprint,
  classificationDeadlineMs: number = timeoutMs,
): TimedRuntimeSample {
  if (!Number.isFinite(classificationDeadlineMs) || classificationDeadlineMs <= 0
    || classificationDeadlineMs > timeoutMs) {
    throw new Error("Stage 01 timed child classification deadline is invalid.");
  }
  if ((child.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT") {
    if (child.stdout.trim().length > 0 || child.stderr.trim().length > 0) {
      throw new Error("Stage 01 timed-out child emitted late or partial evidence.");
    }
    return {
      status: "timeout", elapsedMs: timeoutMs, timeoutMs, ...expected,
      observedProcessDurationMs: Math.max(timeoutMs, processDurationMs),
      timeoutKind: "spawn-terminated",
      lifecycleState: "terminal-timeout",
      transitions: runtimeTransitions("spawn-terminated", Math.max(timeoutMs, processDurationMs)),
    };
  }
  if (child.error || child.status !== 0 || child.stderr.trim().length > 0) {
    throw new Error("Stage 01 timed child failed independently of timeout.", {
      cause: child.error ?? new Error(child.stderr || `exit ${child.status}`),
    });
  }
  const terminal = classifyRuntimeTerminal(processDurationMs, classificationDeadlineMs);
  let parsed: unknown;
  try {
    parsed = JSON.parse(child.stdout.trim());
  } catch (cause) {
    if (terminal === "timeout" && child.stdout.trim().length > 0) {
      throw new Error("Stage 01 timed-out child emitted late or partial evidence.", { cause });
    }
    throw new Error("Stage 01 timed child returned malformed output.", { cause });
  }
  const value = parsed as Record<string, unknown>;
  const expectedOutput = { schemaVersion: 2, status: "completed", ...expected };
  if (
    value.schemaVersion !== 2
    || value.status !== "completed"
    || typeof value.elapsedMs !== "number"
    || !Number.isFinite(value.elapsedMs)
    || value.elapsedMs < 0
    || value.elapsedMs > timeoutMs
    || Object.entries(expectedOutput).some(([key, expectedValue]) =>
      JSON.stringify(value[key]) !== JSON.stringify(expectedValue))
    || Object.keys(value).sort().join("\n")
      !== [...Object.keys(expectedOutput), "elapsedMs"].sort().join("\n")
  ) {
    throw new Error("Stage 01 timed child output contract failed.");
  }
  if (terminal === "timeout") {
    const observedProcessDurationMs = Math.max(timeoutMs, processDurationMs);
    return {
      status: "timeout", elapsedMs: timeoutMs, timeoutMs, ...expected,
      observedProcessDurationMs,
      timeoutKind: "deadline-exceeded-after-exit",
      lifecycleState: "deadline-exceeded-after-exit",
      transitions: runtimeTransitions("deadline-exceeded-after-exit", observedProcessDurationMs),
    };
  }
  const observedProcessDurationMs = Math.max(round(value.elapsedMs), processDurationMs);
  return {
    status: "completed",
    elapsedMs: round(value.elapsedMs),
    timeoutMs,
    ...expected,
    observedProcessDurationMs,
    timeoutKind: null,
    lifecycleState: "terminal-completed",
    transitions: runtimeTransitions(
      "completed",
      observedProcessDurationMs,
    ),
  };
}

export function classifyRuntimeTerminal(
  observedProcessDurationMs: number,
  deadlineDurationMs: number,
): "completed" | "timeout" {
  if (!Number.isFinite(observedProcessDurationMs) || observedProcessDurationMs < 0
    || !Number.isFinite(deadlineDurationMs) || deadlineDurationMs <= 0) {
    throw new Error("Runtime terminal classification requires finite positive evidence.");
  }
  return observedProcessDurationMs > deadlineDurationMs ? "timeout" : "completed";
}

export function runtimeTransitions(
  status: "completed" | "spawn-terminated" | "deadline-exceeded-after-exit",
  terminalDurationMs: number,
): TimedRuntimeSample["transitions"] {
  if (status === "completed") return [
    { state: "started", monotonicDurationMs: 0 },
    { state: "running", monotonicDurationMs: 0 },
    { state: "child-exited", monotonicDurationMs: terminalDurationMs },
    { state: "terminal-completed", monotonicDurationMs: terminalDurationMs },
  ];
  if (status === "deadline-exceeded-after-exit") return [
    { state: "started", monotonicDurationMs: 0 },
    { state: "running", monotonicDurationMs: 0 },
    { state: "child-exited", monotonicDurationMs: terminalDurationMs },
    { state: "deadline-exceeded-after-exit", monotonicDurationMs: terminalDurationMs },
  ];
  return [
      { state: "started", monotonicDurationMs: 0 },
      { state: "running", monotonicDurationMs: 0 },
      { state: "terminate-requested", monotonicDurationMs: STAGE01_NORMAL_INPUT_TIMEOUT_MS },
      { state: "child-exited", monotonicDurationMs: terminalDurationMs },
      { state: "terminal-timeout", monotonicDurationMs: terminalDurationMs },
  ];
}

function constructionInvariant(
  status: ConstructionInvariant["status"],
  currentReference: number,
): ConstructionInvariant {
  return {
    status,
    currentReference: round(currentReference),
    dependencyProof: "exact-note dedup is confined to offline MIDI analysis",
    verificationTest: "stage01 construction-invariant dependency test",
    constructionInvariant: true,
  };
}

export function benchmarkMemoryChildren(
  frozenStage00AbsoluteRssReferenceBytes: number,
): Stage01Report["runtime"]["memory"] {
  if (frozenStage00AbsoluteRssReferenceBytes !== 642822144) {
    throw new Error("Stage 00 frozen RSS reference changed.");
  }
  const artifactAuditRoot = mkdtempSync(resolve(tmpdir(), "loop-vault-p51501-"));
  assertDedicatedArtifactRoot(artifactAuditRoot);
  try {
    const parentBeforeArtifacts = snapshotArtifactState(repositoryRoot, artifactAuditRoot);
    const orders = [[false, true], [true, false], [false, true]] as const;
    const pairs = orders.map((order) => {
      const samples = order.map((enabled) => runMemoryChild(enabled, artifactAuditRoot));
      const off = samples.find((item) => !item.sample.enabled)!;
      const on = samples.find((item) => item.sample.enabled)!;
      const decision = evaluateStage01MemoryPair(off.sample, on.sample);
      return {
        off: off.sample,
        on: on.sample,
        ...decision,
        temporaryArtifactsCreated: off.sample.temporaryArtifactsCreated
          + on.sample.temporaryArtifactsCreated,
        childContractValid: off.contractValid && on.contractValid,
        childOutputPrivacySafe: off.privacySafe && on.privacySafe,
      };
    });
    const parentTemporaryArtifactsCreated = countArtifactDelta(
      parentBeforeArtifacts,
      snapshotArtifactState(repositoryRoot, artifactAuditRoot),
    );
    const orderedRatios = pairs.map((item) => item.peakDeltaRatio).sort((left, right) =>
      (left ?? Number.POSITIVE_INFINITY) - (right ?? Number.POSITIVE_INFINITY));
    const medianPairedRatio = orderedRatios[1] ?? null;
    const childContractValid = pairs.every((item) => item.childContractValid);
    const childOutputPrivacySafe = pairs.every((item) => item.childOutputPrivacySafe);
    const temporaryArtifactsCreated = pairs.reduce(
      (total, item) => total + item.temporaryArtifactsCreated,
      0,
    );
    return {
      processModel: "isolated-child",
      order: ["OFF->ON", "ON->OFF", "OFF->ON"],
      pairs: pairs.map((item) => ({
        off: item.off,
        on: item.on,
        offPeakDeltaRssBytes: item.offPeakDeltaRssBytes,
        onPeakDeltaRssBytes: item.onPeakDeltaRssBytes,
        peakDeltaRatio: item.peakDeltaRatio,
        comparisonMode: item.comparisonMode,
        offRetainedPass: item.offRetainedPass,
        onRetainedPass: item.onRetainedPass,
        transientPass: item.transientPass,
        warmupRetainedComparisons: item.warmupRetainedComparisons,
        warmupRetainedPass: item.warmupRetainedPass,
        pairPass: item.pairPass,
      })),
      medianPairedRatio,
      accuracyFirstPeakRssBytes: Math.max(...pairs.map((item) => observedPeakRss(item.on))),
      zeroDenominatorPolicy: "off peak delta below 4 MiB uses absolute retained-growth/slope plus 64 MiB transient allowance; significant deltas retain 1.25x ratio",
      threshold,
      resourceSafetyPass: pairs.every((item) => item.pairPass)
        && childContractValid
        && childOutputPrivacySafe
        && temporaryArtifactsCreated === 0
        && parentTemporaryArtifactsCreated === 0,
      frozenStage00AbsoluteRssReferenceBytes: 642822144,
      referenceOnly: true,
      childContractValid,
      childOutputPrivacySafe,
      temporaryArtifactsCreated,
      parentTemporaryArtifactsCreated,
    };
  } finally {
    assertDedicatedArtifactRoot(artifactAuditRoot);
    rmSync(artifactAuditRoot, { recursive: true, force: true });
  }
}

const memoryPointSchema = z.object({
  rssBytes: z.number().int().positive(),
  heapUsedBytes: z.number().int().positive(),
  externalBytes: z.number().int().nonnegative(),
}).strict();

const memoryVectorSchema = z.object({
  rssBytes: z.number().int(),
  heapUsedBytes: z.number().int(),
  externalBytes: z.number().int(),
}).strict();

const memorySampleSchema = z.object({
  enabled: z.boolean(),
  warmupIterations: z.literal(6),
  measuredIterations: z.literal(24),
  gcExposed: z.literal(true),
  coldBefore: memoryPointSchema,
  warmupPeaks: z.array(memoryPointSchema).length(6),
  postWarmupGc: memoryPointSchema,
  warmupRetainedGrowth: memoryVectorSchema,
  before: memoryPointSchema,
  peak: memoryPointSchema,
  postGc: memoryPointSchema,
  retainedGrowth: memoryVectorSchema,
  retainedSlopeBytesPerIteration: memoryVectorSchema,
  postGcSeries: z.array(memoryPointSchema).length(25),
  temporaryArtifactsCreated: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (!memorySampleArithmeticValid(value)) {
    context.addIssue({ code: "custom", message: "Memory RSS arithmetic is inconsistent." });
  }
});

export function parseMemoryChildOutput(
  rawStdout: string,
  rawStderr: string,
  expectedEnabled: boolean,
): MemoryChildResult {
  // Privacy is deliberately checked on raw bytes before JSON parsing. This
  // catches paths even when the child emits malformed JSON or diagnostic noise.
  const privacySafe = isMemoryChildOutputPrivacySafe(`${rawStdout}\n${rawStderr}`);
  const point = { rssBytes: 1, heapUsedBytes: 1, externalBytes: 0 };
  const fallback: Stage01MemorySample = {
    enabled: expectedEnabled,
    warmupIterations: 6,
    measuredIterations: 24,
    gcExposed: true,
    coldBefore: point,
    warmupPeaks: Array.from({ length: 6 }, () => point),
    postWarmupGc: point,
    warmupRetainedGrowth: { rssBytes: 0, heapUsedBytes: 0, externalBytes: 0 },
    before: point,
    peak: point,
    postGc: point,
    retainedGrowth: { rssBytes: 0, heapUsedBytes: 0, externalBytes: 0 },
    retainedSlopeBytesPerIteration: { rssBytes: 0, heapUsedBytes: 0, externalBytes: 0 },
    postGcSeries: Array.from({ length: 25 }, () => point),
    temporaryArtifactsCreated: 0,
  };
  if (!privacySafe || rawStderr.trim().length > 0) {
    return { sample: fallback, contractValid: false, privacySafe };
  }
  try {
    const parsed = memorySampleSchema.parse(JSON.parse(rawStdout.trim()));
    return {
      sample: parsed,
      contractValid: parsed.enabled === expectedEnabled,
      privacySafe,
    };
  } catch {
    return { sample: fallback, contractValid: false, privacySafe };
  }
}

function runMemoryChild(enabled: boolean, artifactAuditRoot: string): MemoryChildResult {
  const child = spawnSync(process.execPath, [
    "--expose-gc",
    resolve(repositoryRoot, "node_modules/vite-node/vite-node.mjs"),
    resolve(repositoryRoot, "scripts/phase515/stage01MemoryChild.ts"),
    "--artifact-root",
    artifactAuditRoot,
    ...(enabled ? ["--enabled"] : []),
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  const result = parseMemoryChildOutput(child.stdout ?? "", child.stderr ?? "", enabled);
  if (child.error || child.status !== 0) {
    return { ...result, contractValid: false };
  }
  return result;
}

export function isMemoryChildOutputPrivacySafe(rawOutput: string): boolean {
  const normalized = rawOutput.replaceAll("\\", "/");
  return !normalized.includes(repositoryRoot.replaceAll("\\", "/"))
    && !normalized.includes(".local-evaluation")
    && !/(?:^|[\s"'])(?:[A-Za-z]:\/|\/(?:Users|home)\/)/u.test(normalized)
    && !/(?:^|[\s"'])test\//u.test(normalized);
}

function snapshotArtifactState(root: string, artifactAuditRoot: string): ReadonlySet<string> {
  const entries = new Set<string>();
  assertDedicatedArtifactRoot(artifactAuditRoot);
  snapshotArtifactRoot(artifactAuditRoot, true, "temp", entries);
  [
    "docs/phase5.15",
    "dist",
    "target",
    "src-tauri/target",
    "playwright-report",
    "test-results",
    "blob-report",
    "node_modules/.vite",
  ].forEach((path, index) => snapshotArtifactRoot(
    resolve(root, path),
    true,
    `output-${index}`,
    entries,
  ));
  return entries;
}

function assertDedicatedArtifactRoot(path: string): void {
  const relativePath = relative(tmpdir(), path);
  if (relativePath.startsWith("..")
    || resolve(tmpdir(), relativePath) !== resolve(path)
    || !relativePath.startsWith("loop-vault-p51501-")) {
    throw new Error("Memory artifact audit root is outside the dedicated temporary namespace.");
  }
}

function snapshotArtifactRoot(
  rootPath: string,
  recursive: boolean,
  namespace: string,
  entries: Set<string>,
): void {
  let children;
  try {
    children = readdirSync(rootPath, { withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return;
    throw cause;
  }
  for (const child of children) {
    const path = resolve(rootPath, child.name);
    let stat;
    try {
      stat = statSync(path);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (isSnapshotEntryInaccessible(cause)) {
        entries.add(`${namespace}:${child.name}:inaccessible`);
        continue;
      }
      throw cause;
    }
    const key = `${namespace}:${child.name}:${stat.isDirectory() ? "d" : "f"}`;
    entries.add(key);
    if (recursive && child.isDirectory()) {
      snapshotArtifactRoot(path, true, `${namespace}/${child.name}`, entries);
    }
  }
}

export function isSnapshotEntryInaccessible(cause: unknown): boolean {
  const code = (cause as NodeJS.ErrnoException | undefined)?.code;
  return code === "EACCES" || code === "EPERM";
}

function countArtifactDelta(before: ReadonlySet<string>, after: ReadonlySet<string>): number {
  let count = 0;
  for (const item of after) if (!before.has(item)) count += 1;
  return count;
}

function benchmarkChordDojo(): { p50: number; p95: number } {
  const requirements = [
    makeChordSymbol(0, "maj7"),
    makeChordSymbol(2, "min7"),
    makeChordSymbol(7, "dom7", ["b9"]),
    makeChordSymbol(5, "maj9"),
  ].map((chord) => buildPracticeChordRequirements(chord, "normal"));
  const inputs: PracticeInputSnapshot[] = [
    practiceSnapshot([48, 52, 55, 59], 1),
    practiceSnapshot([50, 53, 57, 60], 2),
    practiceSnapshot([43, 47, 50, 53, 56], 3),
    practiceSnapshot([53, 57, 60, 64, 67], 4),
  ];
  for (let index = 0; index < 10_000; index += 1) {
    matchPerformance(requirements[index % requirements.length]!, inputs[index % inputs.length]!);
  }
  const samples: number[] = [];
  for (let batch = 0; batch < 50; batch += 1) {
    const started = performance.now();
    for (let index = 0; index < 1_000; index += 1) {
      const offset = batch * 1_000 + index;
      matchPerformance(requirements[offset % requirements.length]!, inputs[offset % inputs.length]!);
    }
    samples.push((performance.now() - started) / 1_000);
  }
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95) };
}

function practiceSnapshot(heldMidiNotes: number[], attackRevision: number): PracticeInputSnapshot {
  return {
    heldMidiNotes,
    sustainedMidiNotes: [],
    attackRevision,
    timestampMs: attackRevision * 10,
  };
}

function analyzeCondition(
  bytes: Uint8Array,
  condition: Condition,
  enabled: boolean,
): Stage01AnalysisResult {
  const options = stage01AnalyzerOptions({
    mode: condition.mode,
    ...(condition.accuracyFirst ? { accuracyFirst: condition.accuracyFirst } : {}),
  }, enabled);
  return requireStage01AnalyzerCapability(analyzeMidi(bytes, options), enabled);
}

function analyze(bytes: Uint8Array, enabled: boolean): Stage01AnalysisResult {
  const options = stage01AnalyzerOptions({
    mode: "phase4-v1",
  }, enabled);
  return requireStage01AnalyzerCapability(analyzeMidi(bytes, options), enabled);
}

function normalize(result: MidiProgressionAnalysis) {
  const normalized: Partial<MidiProgressionAnalysis> = { ...result };
  delete normalized.sourceFingerprint;
  if (hasStage01DiagnosticsProperty(normalized)) delete normalized.noteEvidenceDedup;
  return normalized;
}

function stage01AnalyzerOptions(
  options: AnalyzeMidiOptions,
  enabled: boolean,
): AnalyzeMidiOptions & Stage01AnalyzerOptionsCapability {
  return {
    ...options,
    phase515: { enableExactNoteEvidenceDedup: enabled },
  };
}

function requireStage01AnalyzerCapability(
  result: MidiProgressionAnalysis,
  enabled: boolean,
): Stage01AnalysisResult {
  if (!enabled) return result;
  if (!hasStrictStage01Diagnostics(result)) {
    throw new Error("Stage 01 exact-note evidence capability unavailable.");
  }
  return result;
}

function hasStrictStage01Diagnostics(
  value: MidiProgressionAnalysis,
): value is MidiProgressionAnalysis & {
  noteEvidenceDedup: Stage01NoteEvidenceDedupDiagnostics;
} {
  return hasStage01DiagnosticsProperty(value)
    && isStrictStage01NoteEvidenceDedupDiagnostics(value.noteEvidenceDedup);
}

function hasStage01DiagnosticsProperty(
  value: unknown,
): value is { noteEvidenceDedup?: unknown } {
  return typeof value === "object" && value !== null && "noteEvidenceDedup" in value;
}

function equalNormalized(left: MidiProgressionAnalysis, right: MidiProgressionAnalysis): boolean {
  return stableJson(normalize(left)) === stableJson(normalize(right));
}

function lockedRepositoryPath(suite: LockedSuite, filePath: string): string {
  if (filePath.startsWith(".local-evaluation/")) return resolve(repositoryRoot, filePath);
  return resolve(repositoryRoot, dirname(suite.repositoryLocation), filePath);
}

function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

function fixture(contract: Phase515CorpusContract, id: string): Uint8Array {
  const item = contract.cases.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing contract fixture ${id}.`);
  return renderContractMidi(item);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactOrderedStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && actual.every((item, index) => item === expected[index]);
}

function exactStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && new Set(actual).size === expected.length
    && expected.every((item) => actual.includes(item));
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function markdown(report: Stage01Report): string {
  const protectedRows = Object.entries(report.targeted.protectedCases)
    .map(([id, counts]) => `| ${id} | ${counts.original} | ${counts.effective} |`)
    .join("\n");
  const modeRows = report.targeted.modeMatrix.map((item) =>
    `| ${item.condition} | ${item.cleanEffective} | ${item.duplicateEffective} | ${item.normalizedDeepEqual ? "PASS" : "FAIL"} |`).join("\n");
  const suiteRows = report.existingCorpora.suites.map((item) =>
    `| ${item.id} | ${item.status} | ${item.evaluatedFileCount}/${item.frozenFileCount} | ${item.conditionsEvaluated.length} | ${item.normalizedRegressions.length} | ${item.reason} |`).join("\n");
  const stableThree = report.runtime.stable.threeMinuteCase36;
  const accuracyThree = report.runtime.accuracyFirst.threeMinuteCase36;
  const attemptRows = [
    ...stableThree.attempts.map((item) => `| case36 | Stable | ${item.attempt} | ${item.samplesMs.join(", ")} | ${item.summaryMs.median} / ${item.summaryMs.p95} / ${item.summaryMs.max} | ${item.ratiosToStage00.max ?? "infinite"}x | ${item.contentionTelemetry.cpuUserMicros} / ${item.contentionTelemetry.cpuSystemMicros} | ${item.contentionTelemetry.contentionObserved ? "observed" : "not-observed"}; ${item.reason} |`),
    ...accuracyThree.attempts.map((item) => `| case36 | Accuracy First | ${item.attempt} | ${item.samplesMs.join(", ")} | ${item.summaryMs.median} / ${item.summaryMs.p95} / ${item.summaryMs.max} | ${item.ratiosToStage00.max ?? "infinite"}x | ${item.contentionTelemetry.cpuUserMicros} / ${item.contentionTelemetry.cpuSystemMicros} | ${item.contentionTelemetry.contentionObserved ? "observed" : "not-observed"}; ${item.reason} |`),
  ].join("\n");
  const runtimeRows = report.runtime.accuracyRuntimeTable.map((item) =>
    `| ${item.benchmark} | ${item.stableRuntimeMs.median} / ${item.stableRuntimeMs.p95} / ${item.stableRuntimeMs.max} | ${item.accuracyFirstRuntimeMs.median} / ${item.accuracyFirstRuntimeMs.p95} / ${item.accuracyFirstRuntimeMs.max} | ${item.ratiosToStage00.median ?? "infinite"} / ${item.ratiosToStage00.p95 ?? "infinite"} / ${item.ratiosToStage00.max ?? "infinite"}x | ${item.timeoutCount} | ${item.correctnessImprovement} |`).join("\n");
  const memoryRows = report.runtime.memory.pairs.map((item, index) =>
    `| ${index + 1} | ${item.comparisonMode} | ${item.offPeakDeltaRssBytes} / ${item.onPeakDeltaRssBytes} | ${item.off.retainedGrowth.rssBytes} / ${item.off.retainedGrowth.heapUsedBytes} / ${item.off.retainedGrowth.externalBytes} | ${item.on.retainedGrowth.rssBytes} / ${item.on.retainedGrowth.heapUsedBytes} / ${item.on.retainedGrowth.externalBytes} | ${item.off.retainedSlopeBytesPerIteration.rssBytes} / ${item.off.retainedSlopeBytesPerIteration.heapUsedBytes} / ${item.off.retainedSlopeBytesPerIteration.externalBytes} | ${item.on.retainedSlopeBytesPerIteration.rssBytes} / ${item.on.retainedSlopeBytesPerIteration.heapUsedBytes} / ${item.on.retainedSlopeBytesPerIteration.externalBytes} | ${item.pairPass ? "PASS" : "FAIL"} |`).join("\n");
  return `# P5.15-01 — Exact Note Evidence Dedup Report

## Decision

**${report.gates.adoptionPass ? "PASS" : "FAIL"}** — the opt-in analysis-evidence pass collapses only exact identities. The feature flag remains OFF by default. Phase 4.7 fresh Holdout was not opened.

- Correctness adoption: ${report.correctnessAdoptionGate.pass ? "PASS" : "FAIL"}
- Stable eligibility: ${report.stableEligibilityGate.pass ? "PASS" : "FAIL"} (separate from Accuracy First adoption)
- Accuracy First eligibility: ${report.accuracyFirstEligibilityGate.pass ? "PASS" : "FAIL"} / ${report.accuracyFirstEligibilityGate.eligibility}
- Resource gate: ${report.resourceGate.pass ? "PASS" : "FAIL"}

## Targeted evidence

| Case | Original notes | Effective notes |
|---|---:|---:|
| 02 clean | ${report.targeted.clean.original} | ${report.targeted.clean.effective} |
| 03 exact duplicates | ${report.targeted.duplicate.original} | ${report.targeted.duplicate.effective} |
${protectedRows}

| Condition | Case 02 effective | Case 03 effective | Normalized deep equal |
|---|---:|---:|---|
${modeRows}

- Score / rank / confidence equal: ${report.targeted.scoreRankConfidenceEqual ? "PASS" : "FAIL"}
- Case 03 duplicates removed: ${report.targeted.duplicate.duplicates}
- Velocity delta required for dedup: exactly 0; different-velocity layers remain separate

## Frozen safe existing corpora

- Status: ${report.existingCorpora.status}
- Frozen safe suites: ${report.existingCorpora.frozenSafeSuiteCount}; completed: ${report.existingCorpora.completedSuiteCount}; skipped: ${report.existingCorpora.skippedSuiteCount}
- Files evaluated: ${report.existingCorpora.evaluatedFileCount}
- Conditions: ${report.existingCorpora.conditions.join(", ")}

| Frozen suite | Status | Files | Conditions | Regressions | Reason |
|---|---|---:|---:|---:|---|
${suiteRows}

\`COMPLETED\`, \`SKIPPED\`, and \`EXCLUDED\` are intentionally distinct. Missing ignored inputs are never reported as a completed PASS. The burned diagnostic-only Voicing Gold holdout is listed but excluded; the fresh Phase 4.7 Holdout is absent from the safe lock and was unopened.

## Stable / Accuracy First runtime contract

- Frozen runtime baseline SHA-256: ${report.frozenBaselineContract.runtimeBaselineSha256}
- Frozen case36 median / p95 / max: ${report.frozenBaselineContract.case36RuntimeMs.median} / ${report.frozenBaselineContract.case36RuntimeMs.p95} / ${report.frozenBaselineContract.case36RuntimeMs.max} ms
- Frozen Voicing40 total: ${report.frozenBaselineContract.voicing40TotalMs} ms
- Frozen ordered Voicing40 path/hash/byteLength digest: ${report.frozenBaselineContract.voicing40OrderedPathHashLengthDigest}
- Protocol: ${report.runtime.protocol.attemptCount} attempts; ${report.runtime.protocol.aggregateRule}; rerun replacement allowed: ${report.runtime.protocol.rerunReplacementAllowed}

| Benchmark | Profile | Attempt | Raw samples (ms) | median / p95 / max | max / Stage00 | CPU user / system (us) | contention telemetry / reason |
|---|---|---:|---|---|---:|---|---|
${attemptRows}

| Benchmark | Stable OFF median / p95 / max (ms) | Accuracy First ON median / p95 / max (ms) | ON / Stage00 median / p95 / max | Timeouts | Correctness improvement |
|---|---:|---:|---:|---:|---|
${runtimeRows}

- Stable case 36 median / p95 / max: ${stableThree.summaryMs.median} / ${stableThree.summaryMs.p95} / ${stableThree.summaryMs.max} ms; 10-second and 1.25x Stage00 gates: ${stableThree.compliancePass ? "PASS" : "FAIL"}
- Accuracy First case 36 median / p95 / max: ${accuracyThree.summaryMs.median} / ${accuracyThree.summaryMs.p95} / ${accuracyThree.summaryMs.max} ms; tier: ${accuracyThree.performanceTier}; eligibility: ${report.runtime.accuracyFirst.performanceEligibility}
- Product-connection basis max: ${report.runtime.accuracyFirst.performanceBasisMaxMs} ms; inputs over 300 seconds: ${report.runtime.accuracyFirst.inputsOver300Seconds.join(", ") || "none"}; timeouts: ${report.runtime.accuracyFirst.timeoutCount}
- Accuracy First runtime reason: ${accuracyThree.runtimeIncreaseReason}
- UI contract: ${report.runtime.accuracyFirst.uiContract.implementationStatus}; basis max ${report.runtime.accuracyFirst.uiContract.requirementBasisMaxMs} ms; non-blocking ${report.runtime.accuracyFirst.uiContract.uiThreadNonBlocking}; progress ${report.runtime.accuracyFirst.uiContract.progressCapability}; cancellation ${report.runtime.accuracyFirst.uiContract.cancellationCapability}

The 10-second and 1.25x gates apply only to Stable/default-OFF. Accuracy First adoption does not fail solely because runtime increased. Live MIDI and Chord Dojo remain construction invariants because exact-note dedup is confined to offline MIDI analysis.

- Memory process model: ${report.runtime.memory.processModel}
- Alternating child order: ${report.runtime.memory.order.join(", ")}
- Peak-delta ratio median (diagnostic only for near-zero denominators): ${report.runtime.memory.medianPairedRatio ?? "infinite"}x
- Accuracy First peak RSS: ${report.runtime.memory.accuracyFirstPeakRssBytes} bytes
- Resource policy: ${report.runtime.memory.zeroDenominatorPolicy}
- P5.15-00 absolute RSS: ${report.runtime.memory.frozenStage00AbsoluteRssReferenceBytes} bytes (reference only; not the denominator)
- Child contract valid: ${report.runtime.memory.childContractValid ? "PASS" : "FAIL"}; child output privacy-safe: ${report.runtime.memory.childOutputPrivacySafe ? "PASS" : "FAIL"}
- Temporary artifact deltas: child ${report.runtime.memory.temporaryArtifactsCreated}; parent residual ${report.runtime.memory.parentTemporaryArtifactsCreated}

| Pair | Comparison | OFF / ON peak delta RSS | OFF retained RSS / heap / external | ON retained RSS / heap / external | OFF slope RSS / heap / external | ON slope RSS / heap / external | Gate |
|---:|---|---:|---:|---:|---:|---:|---|
${memoryRows}

- Resource safety: ${report.runtime.memory.resourceSafetyPass ? "PASS" : "FAIL"}

## Protected contracts

- Raw MIDI bytes, Piano Roll source notes, save/export data: unchanged
- Vault schema and fileVersion: unchanged
- Diagnostics expose deterministic ordinal evidence IDs and counts only; source/voice identifiers and paths are not emitted
- Rollback: set \`enableExactNoteEvidenceDedup\` OFF (the default)

## Issues

${report.gates.issues.length ? report.gates.issues.map((issue) => `- ${issue}`).join("\n") : "- None"}
`;
}

export function stage01ExitCode(
  report: Stage01Report,
  requireStableEligibility = false,
): number {
  if (!report.gates.adoptionPass) return 1;
  if (requireStableEligibility && !report.stableEligibilityGate.pass) return 1;
  return 0;
}

if (!process.env.VITEST) {
  if (process.argv.includes("--write-corpus-lock-binding")) {
    const binding = await buildStage01CorpusLockBinding(repositoryRoot);
    await writeStage01Artifact(
      repositoryRoot,
      "01-corpus-lock-binding.json",
      renderStage01CorpusLockBinding(binding),
    );
    process.stdout.write(`${JSON.stringify({
      status: "WRITTEN",
      logicalEntryCount: binding.normalizedManifest.logicalEntryCount,
      uniquePhysicalFileCount: binding.normalizedManifest.uniquePhysicalFileCount,
      normalizedManifestSha256: binding.normalizedManifest.sha256,
    })}\n`);
  } else if (process.argv.includes("--verify-corpus-lock")) {
    const verified = await verifyStage01CorpusLock(repositoryRoot);
    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      logicalEntryCount: verified.logicalEntryCount,
      uniquePhysicalFileCount: verified.uniquePhysicalFileCount,
      normalizedManifestSha256: verified.normalizedManifestSha256,
    })}\n`);
  } else if (process.argv.includes("--runtime-profile-only")) {
    const contract = JSON.parse(await readFile(contractPath, "utf8")) as Phase515CorpusContract;
    const verifiedCorpus = await verifyStage01CorpusLock(repositoryRoot);
    const runtimeBaseline = validateFrozenStage00Contracts(
      verifiedCorpus.runtimeBaseline,
      verifiedCorpus.baselineLock,
    );
    const runtime = await evaluateRuntime(contract, runtimeBaseline, verifiedCorpus.baselineLock);
    process.stdout.write(`${JSON.stringify(runtime, null, 2)}\n`);
    const stablePass = runtime.stable.threeMinuteCase36.compliancePass
      && runtime.stable.voicingGoldDevelopment40.status === "COMPLETED"
      && runtime.stable.voicingGoldDevelopment40.compliancePass;
    if (!runtime.memory.resourceSafetyPass
      || (process.argv.includes("--require-stable-eligibility") && !stablePass)) process.exitCode = 1;
  } else if (process.argv.includes("--memory-only")) {
    const verifiedCorpus = await verifyStage01CorpusLock(repositoryRoot);
    const runtimeBaseline = validateFrozenStage00Contracts(
      verifiedCorpus.runtimeBaseline,
      verifiedCorpus.baselineLock,
    );
    const memory = benchmarkMemoryChildren(
      runtimeBaseline.threeMinute.maxObservedPostAnalysisRssBytes,
    );
    process.stdout.write(`${JSON.stringify(memory, null, 2)}\n`);
    if (!memory.resourceSafetyPass) process.exitCode = 1;
  } else {
    const report = await evaluateStage01();
    stage01ReportSchema.parse(report);
    if (process.argv.includes("--write-report")) {
      await writeStage01Artifact(
        repositoryRoot,
        "01-evidence-dedup-report.md",
        markdown(report),
      );
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = stage01ExitCode(
      report,
      process.argv.includes("--require-stable-eligibility"),
    );
  }
}
