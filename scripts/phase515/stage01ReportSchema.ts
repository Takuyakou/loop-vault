import { createHash } from "node:crypto";
import { z } from "zod";
import { STAGE01_ANALYZER_CONFIG_SHA256 } from "./stage01CorpusLock";
import {
  evaluateStage01MemoryPair,
  memorySampleArithmeticValid,
  observedPeakRss,
  type Stage01MemorySample,
} from "./stage01MemoryPolicy";

export const STAGE01_REQUIRED_CONDITION_IDS = [
  "phase4-v1",
  "phase4-v1+R1+E1",
  "phase4-v1+R1+E1+Union",
  "phase4-v1+Union-OFF",
  "phase4-v1+Union-ON",
  "legacy-boundary-rerank+Union-OFF",
  "legacy-boundary-rerank+Union-ON",
  "hybrid-v1+Union-OFF",
  "hybrid-v1+Union-ON",
  "voice-aware-rerank-v1+Union-OFF",
  "voice-aware-rerank-v1+Union-ON",
] as const;

export const STAGE01_FROZEN_SUITE_COUNTS = {
  "all-instruments": 1,
  chapter3: 100,
  "chord-drip-100": 100,
  endless: 1,
  "phase4.7-development": 12,
  "phase4.7-validation": 12,
  suran: 1,
  "voicing-gold-40-file-selection": 40,
  "voicing-gold-burned-holdout-diagnostic-only": 10,
  "voicing-gold-development": 40,
  "voicing-gold-validation": 10,
} as const;

export const STAGE01_FROZEN_SUITE_IDS = Object.keys(
  STAGE01_FROZEN_SUITE_COUNTS,
) as Array<keyof typeof STAGE01_FROZEN_SUITE_COUNTS>;

export const STAGE01_EXCLUDED_SUITE_ID =
  "voicing-gold-burned-holdout-diagnostic-only" as const;
export const STAGE01_FROZEN_SAFE_FILE_COUNT = 317 as const;
export const STAGE01_CASE36_INPUT_DIGEST_SHA256 =
  "b53e984a4ef28f91d79bded98dc0468ceca19599d52aceab0f31a66d4eabe189" as const;
export const STAGE01_VOICING40_INPUT_DIGEST_SHA256 =
  "ca3470620f7352989b81640c7bdcffca89b21ac67a2899bd9cf3ae711daecdf2" as const;

export const STAGE01_RUNTIME_BENCHMARK_IDS = [
  "case36-three-minute",
  "voicing-gold-development-40",
] as const;
export const STAGE01_CONTENTION_STATES = [
  "NO_EXTERNAL_CPU_CONTENTION_DECLARED",
  "EXTERNAL_CPU_CONTENTION_OBSERVED",
] as const;
export type Stage01RuntimeBenchmarkId = (typeof STAGE01_RUNTIME_BENCHMARK_IDS)[number];

export interface Stage01NoteEvidenceDuplicateGroup {
  representativeId: string;
  duplicateCount: number;
  duplicateIds: string[];
  reason: "exact-note-evidence";
}

export interface Stage01NoteEvidenceDedupDiagnostics {
  originalNoteCount: number;
  effectiveNoteCount: number;
  duplicateCount: number;
  groups: Stage01NoteEvidenceDuplicateGroup[];
}

/** Fail-closed structural boundary for the product-owned Stage 01 diagnostics. */
export function isStrictStage01NoteEvidenceDedupDiagnostics(
  value: unknown,
): value is Stage01NoteEvidenceDedupDiagnostics {
  if (!isStage01UnknownRecord(value)
    || !stage01ExactObjectKeys(value, ["duplicateCount", "effectiveNoteCount", "groups", "originalNoteCount"])
    || !isStage01NonNegativeInteger(value.originalNoteCount)
    || !isStage01NonNegativeInteger(value.effectiveNoteCount)
    || !isStage01NonNegativeInteger(value.duplicateCount)
    || value.originalNoteCount - value.effectiveNoteCount !== value.duplicateCount
    || !Array.isArray(value.groups)) {
    return false;
  }

  const globallySeenEvidenceIds = new Set<string>();
  let groupedDuplicateCount = 0;
  let groupedOriginalCount = 0;
  for (const group of value.groups) {
    if (!isStage01UnknownRecord(group)
      || !stage01ExactObjectKeys(group, ["duplicateCount", "duplicateIds", "reason", "representativeId"])
      || typeof group.representativeId !== "string"
      || !/^evidence-[0-9]{6}$/u.test(group.representativeId)
      || !isStage01NonNegativeInteger(group.duplicateCount)
      || group.duplicateCount === 0
      || !Array.isArray(group.duplicateIds)
      || group.duplicateIds.length !== group.duplicateCount
      || group.duplicateIds.some((id) => typeof id !== "string" || !/^evidence-[0-9]{6}$/u.test(id))
      || group.reason !== "exact-note-evidence") {
      return false;
    }
    const groupEvidenceIds = [group.representativeId, ...group.duplicateIds];
    if (new Set(groupEvidenceIds).size !== groupEvidenceIds.length
      || group.duplicateIds.includes(group.representativeId)
      || groupEvidenceIds.some((id) => globallySeenEvidenceIds.has(id))) {
      return false;
    }
    groupEvidenceIds.forEach((id) => globallySeenEvidenceIds.add(id));
    groupedDuplicateCount += group.duplicateCount;
    groupedOriginalCount += groupEvidenceIds.length;
  }

  const ungroupedOriginalCount = value.originalNoteCount - groupedOriginalCount;
  const ungroupedEffectiveCount = value.effectiveNoteCount - value.groups.length;
  const accountedDistinctEvidenceCount = globallySeenEvidenceIds.size + ungroupedEffectiveCount;
  return groupedDuplicateCount === value.duplicateCount
    && ungroupedOriginalCount >= 0
    && ungroupedEffectiveCount >= 0
    && ungroupedOriginalCount === ungroupedEffectiveCount
    && accountedDistinctEvidenceCount === value.originalNoteCount;
}

function isStage01UnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stage01ExactObjectKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function isStage01NonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function stage01RuntimeAttemptId(value: {
  runNonce: string;
  benchmarkId: Stage01RuntimeBenchmarkId;
  protocolAttempt: number;
  featureFlagEnabled: boolean;
  plannedSampleIndex: number;
  measurementKind: "planned" | "timeout-retry";
  generation: number;
}): string {
  return createHash("sha256").update(JSON.stringify([
    "p515-stage01-runtime-v2",
    value.runNonce,
    value.benchmarkId,
    value.protocolAttempt,
    value.featureFlagEnabled,
    value.plannedSampleIndex,
    value.measurementKind,
    value.generation,
  ])).digest("hex");
}

export const STAGE01_PROTECTED_CASE_COUNTS = {
  "02": { original: 33, effective: 33 },
  "03": { original: 66, effective: 33 },
  "12": { original: 9, effective: 9 },
  "15": { original: 8, effective: 8 },
  "32": { original: 18, effective: 18 },
} as const;
export const STAGE01_PROTECTED_CASE_IDS = Object.keys(
  STAGE01_PROTECTED_CASE_COUNTS,
) as Array<keyof typeof STAGE01_PROTECTED_CASE_COUNTS>;

export const STAGE01_CORRECTNESS_ISSUE =
  "Exact-note evidence correctness contract failed." as const;
export const STAGE01_EXISTING_CORPORA_ISSUE =
  "Frozen safe existing-corpus regression contract failed." as const;
export const STAGE01_RESOURCE_ISSUE =
  "Isolated-child resource-safety contract failed." as const;

/**
 * These are copied from the immutable P5.15-00 artifacts on purpose.  Stage 01
 * must fail closed when either the artifact bytes or their parsed values drift;
 * deriving these values from the file under test would make the lock circular.
 */
export const STAGE01_FROZEN_RUNTIME_BASELINE_SHA256 =
  "38256b5bfac5e244264f497ed7250842c7d33c39973f3e280a486dc6edf0aa46" as const;
export const STAGE01_FROZEN_CASE36_BASELINE_MS = {
  median: 69.4042,
  p95: 74.1853,
  max: 74.1853,
} as const;
export const STAGE01_FROZEN_VOICING40_TOTAL_MS = 290.8063 as const;
export const STAGE01_FROZEN_VOICING40_SELECTION_DIGEST =
  "4727a3fcfa693814c9191b958aa739e211823d30a7ddbcbefc127f4321e5e9fc" as const;
export const STAGE01_RUNTIME_ATTEMPT_COUNT = 2 as const;
export const STAGE01_CASE36_SAMPLES_PER_ATTEMPT = 7 as const;
export const STAGE01_VOICING40_SAMPLES_PER_ATTEMPT = 5 as const;
export const STAGE01_RUNTIME_AGGREGATE_RULE =
  "retain-all-attempts-and-aggregate-all-samples-in-attempt-order; stable-requires-every-attempt" as const;

const exactOrderedStrings = (
  actual: readonly string[],
  expected: readonly string[],
): boolean => actual.length === expected.length
  && actual.every((item, index) => item === expected[index]);

const round = (value: number): number => Number(value.toFixed(6));

export function stage01Ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return numerator === 0 ? 1 : null;
  return round(numerator / denominator);
}

function percentile(values: readonly number[], quantile: number): number | null {
  const ordered = [...values].sort((left, right) => left - right);
  if (ordered.length === 0) return null;
  return round(ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * quantile) - 1)]!);
}

const countSchema = z.object({
  original: z.number().int().nonnegative(),
  effective: z.number().int().nonnegative(),
}).strict();

const protectedCasesSchema = z.record(z.string(), countSchema).superRefine((value, context) => {
  const ids = Object.keys(value);
  if (!exactOrderedStrings(ids, STAGE01_PROTECTED_CASE_IDS)) {
    context.addIssue({ code: "custom", message: "Protected case IDs/order differ from the frozen contract." });
    return;
  }
  for (const id of STAGE01_PROTECTED_CASE_IDS) {
    const actual = value[id];
    const expected = STAGE01_PROTECTED_CASE_COUNTS[id];
    if (!actual || actual.original !== expected.original || actual.effective !== expected.effective) {
      context.addIssue({ code: "custom", message: `Protected case ${id} counts differ from the frozen contract.` });
    }
  }
});

const modeRowSchema = z.object({
  condition: z.string().min(1),
  normalizedDeepEqual: z.boolean(),
  cleanEffective: z.number().int().nonnegative(),
  duplicateEffective: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (!value.normalizedDeepEqual || value.cleanEffective !== 33 || value.duplicateEffective !== 33) {
    context.addIssue({ code: "custom", message: "Mode row did not preserve exact targeted equivalence." });
  }
});

const suiteSchema = z.object({
  id: z.enum(STAGE01_FROZEN_SUITE_IDS as [string, ...string[]]),
  status: z.enum(["COMPLETED", "SKIPPED", "EXCLUDED", "FAILED"]),
  reason: z.string().min(1),
  frozenFileCount: z.number().int().nonnegative(),
  evaluatedFileCount: z.number().int().nonnegative(),
  conditionsEvaluated: z.array(z.string().min(1)),
  normalizedRegressions: z.array(z.string().min(1)),
}).strict().superRefine((value, context) => {
  const id = value.id as keyof typeof STAGE01_FROZEN_SUITE_COUNTS;
  const expectedCount = STAGE01_FROZEN_SUITE_COUNTS[id];
  if (value.frozenFileCount !== expectedCount) {
    context.addIssue({ code: "custom", message: `${id} frozen count differs from Stage 00.` });
  }
  const excluded = id === STAGE01_EXCLUDED_SUITE_ID;
  if (excluded !== (value.status === "EXCLUDED")) {
    context.addIssue({ code: "custom", message: "Only the frozen burned suite may be EXCLUDED." });
  }
  if (value.status === "COMPLETED") {
    if (value.evaluatedFileCount !== expectedCount
      || !exactOrderedStrings(value.conditionsEvaluated, STAGE01_REQUIRED_CONDITION_IDS)
      || value.normalizedRegressions.length !== 0) {
      context.addIssue({ code: "custom", message: `${id} COMPLETED row is incomplete.` });
    }
  } else if (value.status === "FAILED") {
    if (!exactOrderedStrings(value.conditionsEvaluated, STAGE01_REQUIRED_CONDITION_IDS)
      || value.normalizedRegressions.length === 0) {
      context.addIssue({ code: "custom", message: `${id} FAILED row lacks exact diagnostics.` });
    }
  } else if (value.evaluatedFileCount !== 0
    || value.conditionsEvaluated.length !== 0
    || value.normalizedRegressions.length !== 0) {
    context.addIssue({ code: "custom", message: `${id} unevaluated row contains results.` });
  }
});

const runtimeStatsSchema = z.object({
  count: z.number().int().nonnegative(),
  median: z.number().nonnegative().finite(),
  p95: z.number().nonnegative().finite(),
  max: z.number().nonnegative().finite(),
}).strict().superRefine((value, context) => {
  if (value.median > value.p95 || value.p95 > value.max) {
    context.addIssue({ code: "custom", message: "Runtime summary ordering is invalid." });
  }
  if (value.count === 0 && (value.median !== 0 || value.p95 !== 0 || value.max !== 0)) {
    context.addIssue({ code: "custom", message: "Zero-count runtime summary must use zero-safe statistics." });
  }
});

const baselineRuntimeSchema = z.object({
  median: z.number().nonnegative().finite(),
  p95: z.number().nonnegative().finite(),
  max: z.number().nonnegative().finite(),
}).strict();

const runtimeRatioSchema = z.object({
  median: z.number().nonnegative().finite().nullable(),
  p95: z.number().nonnegative().finite().nullable(),
  max: z.number().nonnegative().finite().nullable(),
}).strict();

const contentionTelemetrySchema = z.object({
  elapsedMs: z.number().nonnegative().finite(),
  cpuUserMicros: z.number().int().nonnegative(),
  cpuSystemMicros: z.number().int().nonnegative(),
  contentionObserved: z.boolean(),
  reason: z.enum(STAGE01_CONTENTION_STATES),
}).strict().superRefine((value, context) => {
  if (value.contentionObserved !== (value.reason === "EXTERNAL_CPU_CONTENTION_OBSERVED")) {
    context.addIssue({ code: "custom", message: "Contention boolean and enum evidence disagree." });
  }
});

const runtimeLifecycleTransitionSchema = z.object({
  state: z.enum([
    "started", "running", "terminate-requested", "child-exited",
    "terminal-completed", "terminal-timeout", "deadline-exceeded-after-exit",
  ]),
  monotonicDurationMs: z.number().nonnegative().finite(),
}).strict();

const timedRuntimeSampleSchema = z.object({
  status: z.enum(["completed", "timeout"]),
  elapsedMs: z.number().nonnegative().finite(),
  timeoutMs: z.literal(300_000),
  warmupRuns: z.literal(1),
  warmupAnalysisCount: z.number().int().positive(),
  config: z.object({
    mode: z.literal("phase4-v1"),
    enableExactNoteEvidenceDedup: z.boolean(),
  }).strict(),
  inputDigestSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  analyzerConfigVersionSha256: z.literal(STAGE01_ANALYZER_CONFIG_SHA256),
  featureFlagEnabled: z.boolean(),
  analysisCount: z.number().int().positive(),
  measurementKind: z.enum(["planned", "timeout-retry"]),
  plannedSampleIndex: z.number().int().positive(),
  benchmarkId: z.enum(STAGE01_RUNTIME_BENCHMARK_IDS),
  attemptId: z.string().regex(/^[a-f0-9]{64}$/u),
  runNonce: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u),
  protocolAttempt: z.number().int().min(1).max(STAGE01_RUNTIME_ATTEMPT_COUNT),
  generation: z.number().int().min(1).max(2),
  deadlineDurationMs: z.literal(300_000),
  observedProcessDurationMs: z.number().nonnegative().finite(),
  timeoutKind: z.enum(["spawn-terminated", "deadline-exceeded-after-exit"]).nullable(),
  lifecycleState: z.enum(["terminal-completed", "terminal-timeout", "deadline-exceeded-after-exit"]),
  transitions: z.array(runtimeLifecycleTransitionSchema).min(4).max(5),
}).strict().superRefine((value, context) => {
  if (value.status === "timeout" && value.elapsedMs !== value.timeoutMs) {
    context.addIssue({ code: "custom", message: "Timed-out runtime sample must retain its timeout boundary." });
  }
  if (value.status === "completed" && value.elapsedMs > value.timeoutMs) {
    context.addIssue({ code: "custom", message: "Completed runtime sample exceeds its timeout boundary." });
  }
  if (value.warmupAnalysisCount !== value.analysisCount
    || value.config.enableExactNoteEvidenceDedup !== value.featureFlagEnabled) {
    context.addIssue({ code: "custom", message: "Runtime child fingerprint is internally inconsistent." });
  }
  const plannedLimit = value.benchmarkId === "case36-three-minute" ? 7 : 5;
  if (value.plannedSampleIndex > plannedLimit) {
    context.addIssue({ code: "custom", message: "Runtime planned sample index exceeds its frozen benchmark limit." });
  }
  const expectedStates = value.status === "completed"
    ? ["started", "running", "child-exited", "terminal-completed"]
    : value.timeoutKind === "spawn-terminated"
      ? ["started", "running", "terminate-requested", "child-exited", "terminal-timeout"]
      : ["started", "running", "child-exited", "deadline-exceeded-after-exit"];
  const actualStates = value.transitions.map((item) => item.state);
  const durations = value.transitions.map((item) => item.monotonicDurationMs);
  const expectedLifecycle = value.status === "completed" ? "terminal-completed"
    : value.timeoutKind === "spawn-terminated" ? "terminal-timeout"
      : "deadline-exceeded-after-exit";
  if (value.timeoutKind !== (value.status === "completed" ? null : value.timeoutKind)
    || (value.status === "timeout" && value.timeoutKind === null)
    || value.lifecycleState !== expectedLifecycle
    || JSON.stringify(actualStates) !== JSON.stringify(expectedStates)
    || durations.some((duration, index) => index > 0 && duration < durations[index - 1]!)
    || durations[0] !== 0
    || durations.at(-1) !== value.observedProcessDurationMs
    || value.observedProcessDurationMs < value.elapsedMs
    || (value.status === "completed" && value.observedProcessDurationMs > value.deadlineDurationMs)
    || (value.status === "timeout" && value.observedProcessDurationMs < value.deadlineDurationMs)
    || (value.timeoutKind === "spawn-terminated" && durations[2] !== value.deadlineDurationMs)
    || (value.timeoutKind === "deadline-exceeded-after-exit"
      && value.observedProcessDurationMs <= value.deadlineDurationMs)) {
    context.addIssue({ code: "custom", message: "Runtime lifecycle transition evidence is invalid." });
  }
});

const runtimeAttemptSchema = (sampleCount: number) => z.object({
  attempt: z.number().int().min(1).max(STAGE01_RUNTIME_ATTEMPT_COUNT),
  warmupRuns: z.number().int().min(1).max(sampleCount + 1),
  plannedSampleCount: z.literal(sampleCount),
  measuredSampleCount: z.number().int().min(1).max(sampleCount + 1),
  skippedSampleCount: z.number().int().min(0).max(sampleCount),
  retryCount: z.number().int().min(0).max(1),
  terminatedAfterTimeoutLimit: z.boolean(),
  timeoutTargetMs: z.literal(300_000),
  measurementOrder: z.literal("alternating-OFF-ON; odd-pairs-OFF-first; even-pairs-ON-first"),
  rawSamples: z.array(timedRuntimeSampleSchema).min(1).max(sampleCount + 1),
  samplesMs: z.array(z.number().nonnegative().finite()).max(sampleCount + 1),
  timeoutCount: z.number().int().nonnegative(),
  summaryMs: runtimeStatsSchema,
  baselineMs: baselineRuntimeSchema,
  ratiosToStage00: runtimeRatioSchema,
  contentionTelemetry: contentionTelemetrySchema,
  reason: z.string().min(1),
}).strict();

const measuredRuntimeFields = (samplesPerAttempt: number) => ({
  protocolAttemptCount: z.literal(STAGE01_RUNTIME_ATTEMPT_COUNT),
  samplesPerAttempt: z.literal(samplesPerAttempt),
  aggregateRule: z.literal(STAGE01_RUNTIME_AGGREGATE_RULE),
  attempts: z.array(runtimeAttemptSchema(samplesPerAttempt)).length(STAGE01_RUNTIME_ATTEMPT_COUNT),
  samplesMs: z.array(z.number().nonnegative().finite())
    .max(STAGE01_RUNTIME_ATTEMPT_COUNT * (samplesPerAttempt + 1)),
  summaryMs: runtimeStatsSchema,
  baselineMs: baselineRuntimeSchema,
  ratiosToStage00: runtimeRatioSchema,
  outlierNote: z.string().min(1),
  timeoutCount: z.number().int().nonnegative(),
}) as const;

type MeasuredRuntime = {
  protocolAttemptCount: number;
  samplesPerAttempt: number;
  aggregateRule: string;
  attempts: Array<{
    attempt: number;
    warmupRuns: number;
    plannedSampleCount: number;
    measuredSampleCount: number;
    skippedSampleCount: number;
    retryCount: number;
    terminatedAfterTimeoutLimit: boolean;
    timeoutTargetMs: number;
    rawSamples: Array<z.infer<typeof timedRuntimeSampleSchema>>;
    samplesMs: number[];
    timeoutCount: number;
    summaryMs: { count: number; median: number; p95: number; max: number };
    baselineMs: { median: number; p95: number; max: number };
    ratiosToStage00: { median: number | null; p95: number | null; max: number | null };
    contentionTelemetry: {
      elapsedMs: number; cpuUserMicros: number; cpuSystemMicros: number;
      contentionObserved: boolean; reason: string;
    };
    reason: string;
  }>;
  samplesMs: number[];
  summaryMs: { count: number; median: number; p95: number; max: number };
  baselineMs: { median: number; p95: number; max: number };
  ratiosToStage00: { median: number | null; p95: number | null; max: number | null };
  timeoutCount: number;
};

const validateMeasuredRuntime = (value: MeasuredRuntime, context: z.RefinementCtx) => {
  if (value.protocolAttemptCount !== STAGE01_RUNTIME_ATTEMPT_COUNT
    || value.attempts.length !== STAGE01_RUNTIME_ATTEMPT_COUNT
    || value.aggregateRule !== STAGE01_RUNTIME_AGGREGATE_RULE
    || value.attempts.some((attempt, index) => attempt.attempt !== index + 1
      || attempt.plannedSampleCount !== value.samplesPerAttempt)) {
    context.addIssue({ code: "custom", message: "Runtime attempt protocol differs from the predetermined contract." });
  }
  const seenAttemptIds = new Set<string>();
  const seenRunNonces = new Set<string>();
  for (const attempt of value.attempts) {
    const completed = attempt.rawSamples
      .filter((sample) => sample.status === "completed")
      .map((sample) => sample.elapsedMs);
    const timeoutCount = attempt.rawSamples.filter((sample) => sample.status === "timeout").length;
    const summary = summarizeRuntime(attempt.samplesMs);
    const ratios = runtimeRatios(summary, attempt.baselineMs);
    const planned = attempt.rawSamples.filter((sample) => sample.measurementKind === "planned");
    const retries = attempt.rawSamples.filter((sample) => sample.measurementKind === "timeout-retry");
    let retryUsed = false;
    let pendingRetryIndex: number | null = null;
    let expectedPlannedIndex = 1;
    let terminal = false;
    let transitionSequenceValid = true;
    for (const sample of attempt.rawSamples) {
      if (terminal || seenAttemptIds.has(sample.attemptId)) transitionSequenceValid = false;
      seenAttemptIds.add(sample.attemptId);
      seenRunNonces.add(sample.runNonce);
      const expectedGeneration = sample.measurementKind === "planned" ? 1 : 2;
      const expectedId = stage01RuntimeAttemptId({
        runNonce: sample.runNonce,
        benchmarkId: sample.benchmarkId,
        protocolAttempt: attempt.attempt,
        featureFlagEnabled: sample.featureFlagEnabled,
        plannedSampleIndex: sample.plannedSampleIndex,
        measurementKind: sample.measurementKind,
        generation: expectedGeneration,
      });
      if (sample.generation !== expectedGeneration
        || sample.protocolAttempt !== attempt.attempt
        || sample.attemptId !== expectedId) {
        transitionSequenceValid = false;
      }
      if (pendingRetryIndex !== null) {
        if (sample.measurementKind !== "timeout-retry"
          || sample.plannedSampleIndex !== pendingRetryIndex || retryUsed) {
          transitionSequenceValid = false;
        }
        retryUsed = true;
        pendingRetryIndex = null;
        if (sample.status === "timeout") terminal = true;
        continue;
      }
      if (sample.measurementKind !== "planned"
        || sample.plannedSampleIndex !== expectedPlannedIndex) {
        transitionSequenceValid = false;
        continue;
      }
      expectedPlannedIndex += 1;
      if (sample.status === "timeout") {
        if (retryUsed) terminal = true;
        else pendingRetryIndex = sample.plannedSampleIndex;
      }
    }
    if (pendingRetryIndex !== null) transitionSequenceValid = false;
    const skipped = value.samplesPerAttempt - planned.length;
    const terminated = terminal;
    if (JSON.stringify(attempt.samplesMs) !== JSON.stringify(completed)
      || attempt.timeoutCount !== timeoutCount
      || attempt.warmupRuns !== attempt.rawSamples.length
      || attempt.measuredSampleCount !== attempt.rawSamples.length
      || attempt.skippedSampleCount !== skipped
      || attempt.retryCount !== retries.length
      || attempt.terminatedAfterTimeoutLimit !== terminated
      || attempt.timeoutTargetMs !== 300_000
      || !transitionSequenceValid
      || JSON.stringify(attempt.summaryMs) !== JSON.stringify(summary)
      || JSON.stringify(attempt.ratiosToStage00) !== JSON.stringify(ratios)
      || attempt.contentionTelemetry.elapsedMs < attempt.summaryMs.max) {
      context.addIssue({ code: "custom", message: `Runtime attempt ${attempt.attempt} was not independently recomputed.` });
    }
  }
  if (seenRunNonces.size !== 1) {
    context.addIssue({ code: "custom", message: "Runtime evidence mixes more than one run nonce." });
  }
  const flattened = value.attempts.flatMap((attempt) => attempt.samplesMs);
  if (JSON.stringify(value.samplesMs) !== JSON.stringify(flattened)) {
    context.addIssue({ code: "custom", message: "Aggregate samples do not retain every attempt in order." });
  }
  const expectedSummary = summarizeRuntime(value.samplesMs);
  if (value.summaryMs.count !== expectedSummary.count
    || value.summaryMs.median !== expectedSummary.median
    || value.summaryMs.p95 !== expectedSummary.p95
    || value.summaryMs.max !== expectedSummary.max) {
    context.addIssue({ code: "custom", message: "Runtime summary was not recomputed from samples." });
  }
  const expectedRatios = runtimeRatios(value.summaryMs, value.baselineMs);
  if (JSON.stringify(value.ratiosToStage00) !== JSON.stringify(expectedRatios)) {
    context.addIssue({ code: "custom", message: "Runtime ratios were not recomputed from frozen Stage 00 values." });
  }
  const expectedTimeoutCount = value.attempts.reduce(
    (total, attempt) => total + attempt.timeoutCount,
    0,
  );
  if (value.timeoutCount !== expectedTimeoutCount) {
    context.addIssue({ code: "custom", message: "Runtime timeout count was not recomputed from raw child samples." });
  }
};

const validateRuntimeFingerprints = (
  value: MeasuredRuntime,
  featureFlagEnabled: boolean,
  analysisCount: number,
  inputDigestSha256: string,
  context: z.RefinementCtx,
) => {
  const samples = value.attempts.flatMap((attempt) => attempt.rawSamples);
  const digests = new Set(samples.map((sample) => sample.inputDigestSha256));
  const benchmarkId: Stage01RuntimeBenchmarkId = analysisCount === 1
    ? "case36-three-minute" : "voicing-gold-development-40";
  if (digests.size !== 1 || !digests.has(inputDigestSha256) || samples.some((sample) =>
    sample.analyzerConfigVersionSha256 !== STAGE01_ANALYZER_CONFIG_SHA256
    || sample.featureFlagEnabled !== featureFlagEnabled
    || sample.config.enableExactNoteEvidenceDedup !== featureFlagEnabled
    || sample.analysisCount !== analysisCount
    || sample.warmupAnalysisCount !== analysisCount
    || sample.benchmarkId !== benchmarkId)) {
    context.addIssue({ code: "custom", message: "Runtime child fingerprint differs from the fixed benchmark input/config." });
  }
};

const summarizeRuntime = (samples: readonly number[]) => ({
  count: samples.length,
  median: percentile(samples, 0.5) ?? 0,
  p95: percentile(samples, 0.95) ?? 0,
  max: samples.length > 0 ? round(Math.max(...samples)) : 0,
});

const runtimeRatios = (
  summary: { median: number; p95: number; max: number },
  baseline: { median: number; p95: number; max: number },
) => ({
  median: stage01Ratio(summary.median, baseline.median),
  p95: stage01Ratio(summary.p95, baseline.p95),
  max: stage01Ratio(summary.max, baseline.max),
});

const runtimeTierProjection = (completedMaxMs: number, timeoutCount: number) => {
  const effectiveMaxMs = Math.max(completedMaxMs, timeoutCount > 0 ? 300_000 : 0);
  const performanceTier = effectiveMaxMs <= 60_000 ? "UNDER_60_SECONDS" as const
    : effectiveMaxMs <= 180_000 ? "60_TO_180_SECONDS" as const
      : effectiveMaxMs <= 300_000 ? "180_TO_300_SECONDS" as const
        : "OVER_300_SECONDS" as const;
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
};

const stableThreeMinuteSchema = z.object({ ...measuredRuntimeFields(STAGE01_CASE36_SAMPLES_PER_ATTEMPT),
  profile: z.literal("Stable"),
  featureFlagEnabled: z.literal(false),
  frozenThreeMinuteTenSecondLimitMs: z.literal(10_000),
  frozenStage00RatioLimit: z.literal(1.25),
  underTenSeconds: z.boolean(),
  withinStage00Ratio: z.boolean(),
  compliancePass: z.boolean(),
}).strict().superRefine((value, context) => {
  validateMeasuredRuntime(value, context);
  validateRuntimeFingerprints(value, false, 1, STAGE01_CASE36_INPUT_DIGEST_SHA256, context);
  if (JSON.stringify(value.baselineMs) !== JSON.stringify(STAGE01_FROZEN_CASE36_BASELINE_MS)
    || value.attempts.some((attempt) =>
      JSON.stringify(attempt.baselineMs) !== JSON.stringify(STAGE01_FROZEN_CASE36_BASELINE_MS))) {
    context.addIssue({ code: "custom", message: "Case36 runtime denominator differs from the frozen Stage 00 constants." });
  }
  const underTenSeconds = value.attempts.every((attempt) =>
    attempt.summaryMs.max <= value.frozenThreeMinuteTenSecondLimitMs);
  const withinRatio = value.attempts.every((attempt) =>
    attempt.ratiosToStage00.max !== null
      && attempt.ratiosToStage00.max <= value.frozenStage00RatioLimit);
  if (value.underTenSeconds !== underTenSeconds
    || value.withinStage00Ratio !== withinRatio
    || value.compliancePass !== (underTenSeconds && withinRatio && value.timeoutCount === 0)) {
    context.addIssue({ code: "custom", message: "Stable compliance was not recomputed." });
  }
});

const stableFortySchema = z.union([
  z.object({ ...measuredRuntimeFields(STAGE01_VOICING40_SAMPLES_PER_ATTEMPT),
    status: z.literal("COMPLETED"),
    profile: z.literal("Stable"),
    featureFlagEnabled: z.literal(false),
    frozenStage00RatioLimit: z.literal(1.25),
    lockedFileCount: z.literal(40),
    lockedSelectionDigest: z.literal(STAGE01_FROZEN_VOICING40_SELECTION_DIGEST),
    lockVerifiedImmediatelyBeforeBenchmark: z.literal(true),
    compliancePass: z.boolean(),
  }).strict().superRefine((value, context) => {
    validateMeasuredRuntime(value, context);
    validateRuntimeFingerprints(value, false, 40, STAGE01_VOICING40_INPUT_DIGEST_SHA256, context);
    const frozen = {
      median: STAGE01_FROZEN_VOICING40_TOTAL_MS,
      p95: STAGE01_FROZEN_VOICING40_TOTAL_MS,
      max: STAGE01_FROZEN_VOICING40_TOTAL_MS,
    };
    if (JSON.stringify(value.baselineMs) !== JSON.stringify(frozen)
      || value.attempts.some((attempt) => JSON.stringify(attempt.baselineMs) !== JSON.stringify(frozen))) {
      context.addIssue({ code: "custom", message: "Voicing40 runtime denominator differs from the frozen Stage 00 constant." });
    }
    const expected = value.attempts.every((attempt) =>
      attempt.ratiosToStage00.max !== null
        && attempt.ratiosToStage00.max <= value.frozenStage00RatioLimit)
      && value.timeoutCount === 0;
    if (value.compliancePass !== expected) {
      context.addIssue({ code: "custom", message: "Stable Voicing40 compliance was not recomputed." });
    }
  }),
  z.object({
    status: z.literal("SKIPPED"),
    profile: z.literal("Stable"),
    featureFlagEnabled: z.literal(false),
    reason: z.string().min(1),
    lockedFileCount: z.literal(40),
    lockedSelectionDigest: z.literal(STAGE01_FROZEN_VOICING40_SELECTION_DIGEST),
    lockVerifiedImmediatelyBeforeBenchmark: z.literal(false),
    compliancePass: z.literal(false),
  }).strict(),
]);

const accuracyThreeMinuteSchema = z.object({ ...measuredRuntimeFields(STAGE01_CASE36_SAMPLES_PER_ATTEMPT),
  profile: z.literal("Accuracy First"),
  featureFlagEnabled: z.literal(true),
  performanceTier: z.enum(["UNDER_60_SECONDS", "60_TO_180_SECONDS", "180_TO_300_SECONDS", "OVER_300_SECONDS"]),
  tierEligible: z.boolean(),
  runtimeIncreaseReason: z.string().min(1),
  correctnessImprovement: z.literal("case 03 exact evidence 66 -> 33; case 02/03 normalized deep equal"),
}).strict().superRefine((value, context) => {
  validateMeasuredRuntime(value, context);
  validateRuntimeFingerprints(value, true, 1, STAGE01_CASE36_INPUT_DIGEST_SHA256, context);
  if (JSON.stringify(value.baselineMs) !== JSON.stringify(STAGE01_FROZEN_CASE36_BASELINE_MS)
    || value.attempts.some((attempt) =>
      JSON.stringify(attempt.baselineMs) !== JSON.stringify(STAGE01_FROZEN_CASE36_BASELINE_MS))) {
    context.addIssue({ code: "custom", message: "Accuracy First case36 denominator differs from Stage 00." });
  }
  const maximum = Math.max(value.summaryMs.max, value.timeoutCount > 0 ? 300_000 : 0);
  const tier = maximum <= 60_000
    ? "UNDER_60_SECONDS"
    : maximum <= 180_000
      ? "60_TO_180_SECONDS"
      : maximum <= 300_000
        ? "180_TO_300_SECONDS"
        : "OVER_300_SECONDS";
  if (value.performanceTier !== tier
    || value.tierEligible !== (value.timeoutCount === 0 && tier !== "OVER_300_SECONDS")) {
    context.addIssue({ code: "custom", message: "Accuracy First tier was not recomputed." });
  }
});

const accuracyFortySchema = z.union([
  z.object({ ...measuredRuntimeFields(STAGE01_VOICING40_SAMPLES_PER_ATTEMPT),
    status: z.literal("COMPLETED"),
    profile: z.literal("Accuracy First"),
    featureFlagEnabled: z.literal(true),
    lockedFileCount: z.literal(40),
    lockedSelectionDigest: z.literal(STAGE01_FROZEN_VOICING40_SELECTION_DIGEST),
    sameLockedBytesAsStable: z.literal(true),
    sameInMemoryHandlesAsStable: z.literal(true),
  }).strict().superRefine((value, context) => {
    validateMeasuredRuntime(value, context);
    validateRuntimeFingerprints(value, true, 40, STAGE01_VOICING40_INPUT_DIGEST_SHA256, context);
    const frozen = {
      median: STAGE01_FROZEN_VOICING40_TOTAL_MS,
      p95: STAGE01_FROZEN_VOICING40_TOTAL_MS,
      max: STAGE01_FROZEN_VOICING40_TOTAL_MS,
    };
    if (JSON.stringify(value.baselineMs) !== JSON.stringify(frozen)
      || value.attempts.some((attempt) => JSON.stringify(attempt.baselineMs) !== JSON.stringify(frozen))) {
      context.addIssue({ code: "custom", message: "Accuracy First Voicing40 denominator differs from Stage 00." });
    }
  }),
  z.object({
    status: z.literal("SKIPPED"),
    profile: z.literal("Accuracy First"),
    featureFlagEnabled: z.literal(true),
    reason: z.string().min(1),
    lockedFileCount: z.literal(40),
    lockedSelectionDigest: z.literal(STAGE01_FROZEN_VOICING40_SELECTION_DIGEST),
    sameLockedBytesAsStable: z.literal(false),
    sameInMemoryHandlesAsStable: z.literal(false),
  }).strict(),
]);

const constructionInvariantSchema = (status: "NOT_APPLICABLE" | "UNCHANGED_BY_CONSTRUCTION") =>
  z.object({
    status: z.literal(status),
    currentReference: z.number().nonnegative(),
    dependencyProof: z.literal("exact-note dedup is confined to offline MIDI analysis"),
    verificationTest: z.literal("stage01 construction-invariant dependency test"),
    constructionInvariant: z.literal(true),
  }).strict();

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
const resourceSampleSchema = z.object({
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
    context.addIssue({ code: "custom", message: "Memory sample raw arithmetic/slope is invalid." });
  }
});

const warmupMetricDecisionSchema = z.object({
  offGrowthBytes: z.number().int().nonnegative(),
  onGrowthBytes: z.number().int().nonnegative(),
  ratio: z.number().nonnegative().finite().nullable(),
  comparisonMode: z.enum(["ABSOLUTE_NEAR_ZERO", "SIGNIFICANT_GROWTH_RATIO"]),
  pass: z.boolean(),
}).strict();

const memorySchema = z.object({
  processModel: z.literal("isolated-child"),
  order: z.tuple([z.literal("OFF->ON"), z.literal("ON->OFF"), z.literal("OFF->ON")]),
  pairs: z.array(z.object({
    off: resourceSampleSchema,
    on: resourceSampleSchema,
    offPeakDeltaRssBytes: z.number().int().nonnegative(),
    onPeakDeltaRssBytes: z.number().int().nonnegative(),
    peakDeltaRatio: z.number().nonnegative().finite().nullable(),
    comparisonMode: z.enum(["ABSOLUTE_RETAINED_SLOPE_NEAR_ZERO", "SIGNIFICANT_DELTA_RATIO"]),
    offRetainedPass: z.boolean(),
    onRetainedPass: z.boolean(),
    transientPass: z.boolean(),
    warmupRetainedComparisons: z.object({
      rssBytes: warmupMetricDecisionSchema,
      heapUsedBytes: warmupMetricDecisionSchema,
      externalBytes: warmupMetricDecisionSchema,
    }).strict(),
    warmupRetainedPass: z.boolean(),
    pairPass: z.boolean(),
  }).strict()).length(3),
  medianPairedRatio: z.number().nonnegative().finite().nullable(),
  accuracyFirstPeakRssBytes: z.number().int().positive(),
  zeroDenominatorPolicy: z.literal("off peak delta below 4 MiB uses absolute retained-growth/slope plus 64 MiB transient allowance; significant deltas retain 1.25x ratio"),
  threshold: z.literal(1.25),
  resourceSafetyPass: z.boolean(),
  frozenStage00AbsoluteRssReferenceBytes: z.literal(642822144),
  referenceOnly: z.literal(true),
  childContractValid: z.boolean(),
  childOutputPrivacySafe: z.boolean(),
  temporaryArtifactsCreated: z.number().int().nonnegative(),
  parentTemporaryArtifactsCreated: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  const expectedPairs = value.pairs.map((pair) => evaluateStage01MemoryPair(
    pair.off as Stage01MemorySample,
    pair.on as Stage01MemorySample,
  ));
  if (value.pairs.some((pair, index) => JSON.stringify({
    offPeakDeltaRssBytes: pair.offPeakDeltaRssBytes,
    onPeakDeltaRssBytes: pair.onPeakDeltaRssBytes,
    peakDeltaRatio: pair.peakDeltaRatio,
    comparisonMode: pair.comparisonMode,
    offRetainedPass: pair.offRetainedPass,
    onRetainedPass: pair.onRetainedPass,
    transientPass: pair.transientPass,
    warmupRetainedComparisons: pair.warmupRetainedComparisons,
    warmupRetainedPass: pair.warmupRetainedPass,
    pairPass: pair.pairPass,
  }) !== JSON.stringify(expectedPairs[index]))) {
    context.addIssue({ code: "custom", message: "Memory pair policy was not recomputed from raw evidence." });
  }
  const ordered = expectedPairs.map((pair) => pair.peakDeltaRatio).sort((left, right) =>
    (left ?? Number.POSITIVE_INFINITY) - (right ?? Number.POSITIVE_INFINITY));
  const expectedMedian = ordered[1] ?? null;
  const expectedPeak = Math.max(...value.pairs.map((pair) => observedPeakRss(pair.on)));
  const expectedPass = expectedPairs.every((pair) => pair.pairPass)
    && value.childContractValid
    && value.childOutputPrivacySafe
    && value.temporaryArtifactsCreated === 0
    && value.parentTemporaryArtifactsCreated === 0;
  if (value.medianPairedRatio !== expectedMedian
    || value.accuracyFirstPeakRssBytes !== expectedPeak
    || value.resourceSafetyPass !== expectedPass) {
    context.addIssue({ code: "custom", message: "Memory evidence/resource gate was not recomputed." });
  }
});

export const stage01ReportSchema = z.object({
  schemaVersion: z.literal(5),
  phase: z.literal("P5.15-01"),
  holdoutEvaluated: z.literal(false),
  frozenBaselineContract: z.object({
    runtimeBaselineSha256: z.literal(STAGE01_FROZEN_RUNTIME_BASELINE_SHA256),
    case36RuntimeMs: z.object({
      median: z.literal(STAGE01_FROZEN_CASE36_BASELINE_MS.median),
      p95: z.literal(STAGE01_FROZEN_CASE36_BASELINE_MS.p95),
      max: z.literal(STAGE01_FROZEN_CASE36_BASELINE_MS.max),
    }).strict(),
    voicing40TotalMs: z.literal(STAGE01_FROZEN_VOICING40_TOTAL_MS),
    voicing40OrderedPathHashLengthDigest: z.literal(STAGE01_FROZEN_VOICING40_SELECTION_DIGEST),
    verifiedBeforeAnalysis: z.literal(true),
  }).strict(),
  targeted: z.object({
    clean: countSchema,
    duplicate: z.object({
      original: z.number().int().nonnegative(),
      effective: z.number().int().nonnegative(),
      duplicates: z.number().int().nonnegative(),
    }).strict(),
    normalizedDeepEqual: z.boolean(),
    scoreRankConfidenceEqual: z.boolean(),
    protectedCases: protectedCasesSchema,
    modeMatrix: z.array(modeRowSchema).length(STAGE01_REQUIRED_CONDITION_IDS.length),
  }).strict().superRefine((value, context) => {
    if (value.clean.original !== 33 || value.clean.effective !== 33
      || value.duplicate.original !== 66 || value.duplicate.effective !== 33
      || value.duplicate.duplicates !== 33
      || !value.normalizedDeepEqual || !value.scoreRankConfidenceEqual) {
      context.addIssue({ code: "custom", message: "Targeted exact-evidence contract failed." });
    }
    if (value.duplicate.duplicates !== value.duplicate.original - value.duplicate.effective) {
      context.addIssue({ code: "custom", message: "Duplicate arithmetic is inconsistent." });
    }
    if (!exactOrderedStrings(value.modeMatrix.map((item) => item.condition), STAGE01_REQUIRED_CONDITION_IDS)) {
      context.addIssue({ code: "custom", message: "Mode matrix differs from the exact frozen order." });
    }
  }),
  existingCorpora: z.object({
    status: z.enum(["COMPLETED", "COMPLETED_WITH_SKIPS", "SKIPPED", "FAILED"]),
    frozenSafeSuiteCount: z.number().int().nonnegative(),
    completedSuiteCount: z.number().int().nonnegative(),
    skippedSuiteCount: z.number().int().nonnegative(),
    evaluatedFileCount: z.number().int().nonnegative(),
    conditions: z.array(z.string().min(1)),
    suites: z.array(suiteSchema).length(STAGE01_FROZEN_SUITE_IDS.length),
    normalizedRegressions: z.array(z.string().min(1)),
  }).strict().superRefine((value, context) => {
    if (value.frozenSafeSuiteCount !== 10) {
      context.addIssue({ code: "custom", message: "Frozen safe suite count differs from Stage 00." });
    }
    if (!exactOrderedStrings(value.conditions, STAGE01_REQUIRED_CONDITION_IDS)
      || !exactOrderedStrings(value.suites.map((item) => item.id), STAGE01_FROZEN_SUITE_IDS)) {
      context.addIssue({ code: "custom", message: "Existing-corpus matrix differs from the frozen order." });
      return;
    }
    const safe = value.suites.filter((item) => item.id !== STAGE01_EXCLUDED_SUITE_ID);
    const completed = safe.filter((item) => item.status === "COMPLETED").length;
    const skipped = safe.filter((item) => item.status === "SKIPPED").length;
    const failed = safe.some((item) => item.status === "FAILED");
    const status = failed ? "FAILED" : completed === 0 ? "SKIPPED"
      : skipped > 0 ? "COMPLETED_WITH_SKIPS" : completed === safe.length ? "COMPLETED" : "FAILED";
    const evaluated = safe.reduce((total, item) => total + item.evaluatedFileCount, 0);
    const regressions = safe.flatMap((item) => item.normalizedRegressions);
    if (value.completedSuiteCount !== completed
      || value.skippedSuiteCount !== skipped
      || value.status !== status
      || value.evaluatedFileCount !== evaluated
      || !exactOrderedStrings(value.normalizedRegressions, regressions)
      || (value.status === "COMPLETED" && evaluated !== STAGE01_FROZEN_SAFE_FILE_COUNT)) {
      context.addIssue({ code: "custom", message: "Existing-corpus totals were not recomputed." });
    }
  }),
  runtime: z.object({
    protocol: z.object({
      attemptCount: z.literal(STAGE01_RUNTIME_ATTEMPT_COUNT),
      warmupRunsPerMeasuredSample: z.literal(1),
      case36SamplesPerProfilePerAttempt: z.literal(STAGE01_CASE36_SAMPLES_PER_ATTEMPT),
      voicing40SamplesPerProfilePerAttempt: z.literal(STAGE01_VOICING40_SAMPLES_PER_ATTEMPT),
      order: z.literal("alternating-OFF-ON; odd-pairs-OFF-first; even-pairs-ON-first"),
      aggregateRule: z.literal(STAGE01_RUNTIME_AGGREGATE_RULE),
      rerunReplacementAllowed: z.literal(false),
    }).strict(),
    rawFingerprintEvidence: z.object({
      timeoutMs: z.literal(300_000),
      analyzerConfigVersionSha256: z.literal(STAGE01_ANALYZER_CONFIG_SHA256),
      case36InputDigestSha256: z.literal(STAGE01_CASE36_INPUT_DIGEST_SHA256),
      voicing40InputDigestSha256: z.literal(STAGE01_VOICING40_INPUT_DIGEST_SHA256),
    }).strict(),
    stable: z.object({
      threeMinuteCase36: stableThreeMinuteSchema,
      voicingGoldDevelopment40: stableFortySchema,
      liveMidiConfirmedP50Ms: constructionInvariantSchema("NOT_APPLICABLE"),
      liveMidiConfirmedP90Ms: constructionInvariantSchema("NOT_APPLICABLE"),
      chordDojoP50MsPerOperation: constructionInvariantSchema("UNCHANGED_BY_CONSTRUCTION"),
      chordDojoP95MsPerOperation: constructionInvariantSchema("UNCHANGED_BY_CONSTRUCTION"),
    }).strict(),
    accuracyFirst: z.object({
      threeMinuteCase36: accuracyThreeMinuteSchema,
      voicingGoldDevelopment40: accuracyFortySchema,
      uiContract: z.object({
        requirementBasisMaxMs: z.number().nonnegative().finite(),
        uiThreadNonBlocking: z.enum(["NOT_REQUIRED_UNDER_ONE_SECOND", "APPLICATION_CONTRACT_PRESERVED", "IMPLEMENTED_AND_VERIFIED", "REQUIRED"]),
        progressCapability: z.enum(["NOT_REQUIRED_UNDER_ONE_SECOND", "APPLICATION_CONTRACT_PRESERVED", "IMPLEMENTED_AND_VERIFIED", "REQUIRED"]),
        cancellationCapability: z.enum(["NOT_REQUIRED_UNDER_ONE_SECOND", "APPLICATION_CONTRACT_PRESERVED", "IMPLEMENTED_AND_VERIFIED", "REQUIRED"]),
        doubleStartPrevention: z.enum(["NOT_REQUIRED_UNDER_ONE_SECOND", "APPLICATION_CONTRACT_PRESERVED", "IMPLEMENTED_AND_VERIFIED", "REQUIRED"]),
        routeAndExitResourceRelease: z.enum(["NOT_REQUIRED_UNDER_ONE_SECOND", "APPLICATION_CONTRACT_PRESERVED", "IMPLEMENTED_AND_VERIFIED", "REQUIRED"]),
        noFabricatedResultBeforeCompletion: z.literal(true),
        timeoutDistinctFromDetectionFailure: z.literal(true),
        implementationStatus: z.enum([
          "application contract preserved; no new Stage 01 UI",
          "async progress cancellation and resource release required before product connection",
        ]),
      }).strict(),
      performanceEligibility: z.enum(["ELIGIBLE", "CONDITIONAL", "EXPERIMENT_ONLY"]),
      productConnectionStatus: z.enum(["CONNECTED", "NOT_CONNECTED"]),
      performanceEligibilityReason: z.string().min(1),
      performanceBasisMaxMs: z.number().nonnegative().finite(),
      inputsOver300Seconds: z.array(z.enum([
        "case36-three-minute",
        "voicing-gold-development-40",
      ])),
      timeoutCount: z.number().int().nonnegative(),
    }).strict().superRefine((value, context) => {
      const accuracyMax = Math.max(
        value.threeMinuteCase36.summaryMs.max,
        value.voicingGoldDevelopment40.status === "COMPLETED"
          ? value.voicingGoldDevelopment40.summaryMs.max : 0,
      );
      const expectedTimeoutCount = value.threeMinuteCase36.timeoutCount
        + (value.voicingGoldDevelopment40.status === "COMPLETED"
          ? value.voicingGoldDevelopment40.timeoutCount : 0);
      const performanceBasisMaxMs = Math.max(accuracyMax, expectedTimeoutCount > 0 ? 300_000 : 0);
      const tier = performanceBasisMaxMs <= 60_000 ? "UNDER_60_SECONDS"
        : performanceBasisMaxMs <= 180_000 ? "60_TO_180_SECONDS"
          : performanceBasisMaxMs <= 300_000 ? "180_TO_300_SECONDS" : "OVER_300_SECONDS";
      const expected = expectedTimeoutCount > 0 ? "EXPERIMENT_ONLY"
        : tier === "OVER_300_SECONDS" ? "EXPERIMENT_ONLY"
        : tier === "180_TO_300_SECONDS" ? "CONDITIONAL" : "ELIGIBLE";
      if (value.performanceEligibility !== expected) {
        context.addIssue({ code: "custom", message: "Accuracy First performance eligibility disagrees with tier." });
      }
      const inputsOver300Seconds = [
        ...(value.threeMinuteCase36.summaryMs.max > 300_000
          || value.threeMinuteCase36.timeoutCount > 0
          ? ["case36-three-minute" as const] : []),
        ...(value.voicingGoldDevelopment40.status === "COMPLETED"
          && (value.voicingGoldDevelopment40.summaryMs.max > 300_000
            || value.voicingGoldDevelopment40.timeoutCount > 0)
          ? ["voicing-gold-development-40" as const] : []),
      ];
      if (value.performanceBasisMaxMs !== performanceBasisMaxMs
        || JSON.stringify(value.inputsOver300Seconds) !== JSON.stringify(inputsOver300Seconds)
        || value.timeoutCount !== expectedTimeoutCount) {
        context.addIssue({ code: "custom", message: "Accuracy First max/input/timeout basis was not recomputed." });
      }
      const statuses = [
        value.uiContract.uiThreadNonBlocking,
        value.uiContract.progressCapability,
        value.uiContract.cancellationCapability,
        value.uiContract.doubleStartPrevention,
        value.uiContract.routeAndExitResourceRelease,
      ];
      if (value.uiContract.requirementBasisMaxMs !== performanceBasisMaxMs) {
        context.addIssue({ code: "custom", message: "UI requirement basis does not equal the maximum Accuracy First summary." });
      }
      if (expectedTimeoutCount > 0 || tier === "180_TO_300_SECONDS") {
        if (statuses.some((status) => status !== "REQUIRED")
          || value.uiContract.implementationStatus
            !== "async progress cancellation and resource release required before product connection") {
          context.addIssue({ code: "custom", message: "Timeout/conditional runtime requires every asynchronous UI/resource contract." });
        }
      } else if (accuracyMax <= 1_000) {
        if (statuses.some((status) => status !== "NOT_REQUIRED_UNDER_ONE_SECOND")) {
          context.addIssue({ code: "custom", message: "Sub-second Accuracy First runtime must report UI capabilities as not required." });
        }
      } else if (statuses.some((status) => status === "NOT_REQUIRED_UNDER_ONE_SECOND")) {
        context.addIssue({ code: "custom", message: "Runtime over one second requires every long-running UI capability status." });
      }
      if (expectedTimeoutCount === 0 && tier !== "180_TO_300_SECONDS"
        && value.uiContract.implementationStatus !== "application contract preserved; no new Stage 01 UI") {
        context.addIssue({ code: "custom", message: "Non-timeout UI implementation status is inconsistent." });
      }
      const expectedConnection = expected === "ELIGIBLE" ? "CONNECTED" : "NOT_CONNECTED";
      if (value.productConnectionStatus !== expectedConnection) {
        context.addIssue({ code: "custom", message: "Product connection status disagrees with runtime eligibility." });
      }
    }),
    memory: memorySchema,
    accuracyRuntimeTable: z.array(z.object({
      benchmark: z.enum(["case36-three-minute", "voicing-gold-development-40"]),
      correctnessImprovement: z.literal("case 03 exact evidence 66 -> 33; case 02/03 normalized deep equal"),
      stableRuntimeMs: runtimeStatsSchema,
      accuracyFirstRuntimeMs: runtimeStatsSchema,
      ratiosToStage00: runtimeRatioSchema,
      timeoutCount: z.number().int().nonnegative(),
      effectiveMaxMs: z.number().nonnegative().finite(),
      performanceTier: z.enum(["UNDER_60_SECONDS", "60_TO_180_SECONDS", "180_TO_300_SECONDS", "OVER_300_SECONDS"]),
      tierEligible: z.boolean(),
      performanceEligibility: z.enum(["ELIGIBLE", "CONDITIONAL", "EXPERIMENT_ONLY"]),
    }).strict()).length(2),
  }).strict().superRefine((value, context) => {
    const invocationRunNonces = new Set<string>();
    const stableCaseRun = value.stable.threeMinuteCase36.attempts[0]?.rawSamples[0]?.runNonce;
    const accuracyCaseRun = value.accuracyFirst.threeMinuteCase36.attempts[0]?.rawSamples[0]?.runNonce;
    if (stableCaseRun) invocationRunNonces.add(stableCaseRun);
    if (accuracyCaseRun) invocationRunNonces.add(accuracyCaseRun);
    if (!stableCaseRun || stableCaseRun !== accuracyCaseRun) {
      context.addIssue({ code: "custom", message: "Stable and Accuracy First case36 evidence must share one run nonce." });
    }
    const expectedRows = [
      {
        benchmark: "case36-three-minute",
        stableRuntimeMs: value.stable.threeMinuteCase36.summaryMs,
        accuracyFirstRuntimeMs: value.accuracyFirst.threeMinuteCase36.summaryMs,
        ratiosToStage00: value.accuracyFirst.threeMinuteCase36.ratiosToStage00,
        timeoutCount: value.accuracyFirst.threeMinuteCase36.timeoutCount,
        ...runtimeTierProjection(
          value.accuracyFirst.threeMinuteCase36.summaryMs.max,
          value.accuracyFirst.threeMinuteCase36.timeoutCount,
        ),
      },
    ];
    const stableForty = value.stable.voicingGoldDevelopment40;
    const accuracyForty = value.accuracyFirst.voicingGoldDevelopment40;
    if (stableForty.status === "COMPLETED" && accuracyForty.status === "COMPLETED") {
      const stableFortyRun = stableForty.attempts[0]?.rawSamples[0]?.runNonce;
      const accuracyFortyRun = accuracyForty.attempts[0]?.rawSamples[0]?.runNonce;
      if (stableFortyRun) invocationRunNonces.add(stableFortyRun);
      if (accuracyFortyRun) invocationRunNonces.add(accuracyFortyRun);
      if (!stableFortyRun || stableFortyRun !== accuracyFortyRun) {
        context.addIssue({ code: "custom", message: "Stable and Accuracy First Voicing40 evidence must share one run nonce." });
      }
      expectedRows.push({
        benchmark: "voicing-gold-development-40",
        stableRuntimeMs: stableForty.summaryMs,
        accuracyFirstRuntimeMs: accuracyForty.summaryMs,
        ratiosToStage00: accuracyForty.ratiosToStage00,
        timeoutCount: accuracyForty.timeoutCount,
        ...runtimeTierProjection(accuracyForty.summaryMs.max, accuracyForty.timeoutCount),
      });
    }
    if (invocationRunNonces.size !== 1) {
      context.addIssue({ code: "custom", message: "Runtime composite report mixes evaluation invocation nonces." });
    }
    const actual = value.accuracyRuntimeTable.map((item) => ({
      benchmark: item.benchmark,
      stableRuntimeMs: item.stableRuntimeMs,
      accuracyFirstRuntimeMs: item.accuracyFirstRuntimeMs,
      ratiosToStage00: item.ratiosToStage00,
      timeoutCount: item.timeoutCount,
      effectiveMaxMs: item.effectiveMaxMs,
      performanceTier: item.performanceTier,
      tierEligible: item.tierEligible,
      performanceEligibility: item.performanceEligibility,
    }));
    if (JSON.stringify(actual) !== JSON.stringify(expectedRows)) {
      context.addIssue({ code: "custom", message: "Accuracy/runtime combined table is inconsistent." });
    }
  }),
  correctnessAdoptionGate: z.object({
    pass: z.boolean(),
    newCorrectnessRegressions: z.number().int().nonnegative(),
    targetedImprovementCount: z.number().int().nonnegative(),
    invariantPairsPass: z.boolean(),
    deterministic: z.boolean(),
    rollbackAvailable: z.boolean(),
    issues: z.array(z.string()),
  }).strict(),
  stableEligibilityGate: z.object({ pass: z.boolean(), issues: z.array(z.string()) }).strict(),
  accuracyFirstEligibilityGate: z.object({
    pass: z.boolean(),
    eligibility: z.enum(["ELIGIBLE", "CONDITIONAL", "EXPERIMENT_ONLY"]),
    runtimeAloneCanFailAdoption: z.literal(false),
    issues: z.array(z.string()),
  }).strict(),
  resourceGate: z.object({ pass: z.boolean(), issues: z.array(z.string()) }).strict(),
  gates: z.object({
    adoptionPass: z.boolean(),
    requireStableEligibilityPass: z.boolean(),
    issues: z.array(z.string()),
  }).strict(),
}).strict().superRefine((value, context) => {
  const correctnessIssues: string[] = [];
  if (value.existingCorpora.status !== "COMPLETED"
    || value.existingCorpora.evaluatedFileCount !== STAGE01_FROZEN_SAFE_FILE_COUNT
    || value.existingCorpora.normalizedRegressions.length !== 0) {
    correctnessIssues.push(STAGE01_EXISTING_CORPORA_ISSUE);
  }
  const resourceIssues = value.runtime.memory.resourceSafetyPass ? [] : [STAGE01_RESOURCE_ISSUE];
  const stablePass = value.runtime.stable.threeMinuteCase36.compliancePass
    && value.runtime.stable.voicingGoldDevelopment40.status === "COMPLETED"
    && value.runtime.stable.voicingGoldDevelopment40.compliancePass;
  const stableIssues = stablePass ? [] : ["Stable default-OFF runtime contract failed."];
  const targetedContractPass = value.targeted.normalizedDeepEqual
    && value.targeted.scoreRankConfidenceEqual
    && value.targeted.duplicate.duplicates > 0;
  if (!targetedContractPass) correctnessIssues.unshift(STAGE01_CORRECTNESS_ISSUE);
  if (value.correctnessAdoptionGate.newCorrectnessRegressions !== 0
    || value.correctnessAdoptionGate.targetedImprovementCount < 1
    || !value.correctnessAdoptionGate.invariantPairsPass
    || !value.correctnessAdoptionGate.deterministic
    || !value.correctnessAdoptionGate.rollbackAvailable) {
    if (!correctnessIssues.includes(STAGE01_CORRECTNESS_ISSUE)) {
      correctnessIssues.unshift(STAGE01_CORRECTNESS_ISSUE);
    }
  }
  const correctnessPass = correctnessIssues.length === 0
    && value.correctnessAdoptionGate.newCorrectnessRegressions === 0
    && value.correctnessAdoptionGate.targetedImprovementCount >= 1
    && value.correctnessAdoptionGate.invariantPairsPass
    && value.correctnessAdoptionGate.deterministic
    && value.correctnessAdoptionGate.rollbackAvailable;
  const adoptionIssues = [...correctnessIssues, ...resourceIssues];
  const exact = (actual: readonly string[], expected: readonly string[]) =>
    exactOrderedStrings(actual, expected);
  if (value.correctnessAdoptionGate.pass !== correctnessPass
    || !exact(value.correctnessAdoptionGate.issues, correctnessIssues)
    || value.resourceGate.pass !== (resourceIssues.length === 0)
    || !exact(value.resourceGate.issues, resourceIssues)
    || value.stableEligibilityGate.pass !== stablePass
    || !exact(value.stableEligibilityGate.issues, stableIssues)
    || value.accuracyFirstEligibilityGate.pass !== correctnessPass
    || value.accuracyFirstEligibilityGate.eligibility !== value.runtime.accuracyFirst.performanceEligibility
    || !exact(value.accuracyFirstEligibilityGate.issues, correctnessIssues)
    || value.gates.adoptionPass !== (correctnessPass && resourceIssues.length === 0)
    || value.gates.requireStableEligibilityPass !== (correctnessPass && resourceIssues.length === 0 && stablePass)
    || !exact(value.gates.issues, adoptionIssues)) {
    context.addIssue({ code: "custom", message: "Gate subpasses/pass/issues are not exact recomputations." });
  }
});
