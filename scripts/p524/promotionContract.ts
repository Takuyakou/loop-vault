import {
  aggregateP524Metrics,
  type P524AggregateMetrics,
  type P524FixtureMetrics,
} from "./harmonicFragmentMetrics";

export const p524PromotionContractVersion = "p524-harmonic-fragment-promotion-v1";
export const p524FeatureFlagName = "enableHarmonicStateConsolidation";
export const p524FeatureFlagDefault = false;
export const p524BenchmarkProvenance = "p524-dense-synthetic-E-x128-v1";
export const p524BenchmarkExpectedNoteCount = 3_072;

export const p524OfficialBaseline = Object.freeze({
  rootAt1: 0.581897,
  qualityAt1: 0.610453,
  exactAt1: 0.136853,
  boundaryPrecision: 0.765475,
  boundaryRecall: 0.900864,
});

export const p524PromotionThresholds = Object.freeze({
  maximumFalseMergeRate: 0,
  maximumIdentityErrorRate: 0,
  maximumBassLaneFailureFixtures: 0,
  maximumBassLaneSafetyViolations: 0,
  minimumChangeRecall: 1,
  minimumChangePrecision: 1,
  maximumImprovementFixtureFragmentationRatio: 1,
  maximumImprovementFixtureOverSegmentationRate: 0,
  maximumOfficialExactAtOneDecline: 0.0025,
  maximumBenchmarkMedianRatio: 2,
  maximumBenchmarkSampleMs: 2_000,
  benchmarkTimeoutMs: 10_000,
  benchmarkWarmups: 3,
  benchmarkSamples: 7,
});

export interface P524OfficialMetrics {
  readonly rootAt1: number;
  readonly qualityAt1: number;
  readonly exactAt1: number;
  readonly boundaryPrecision: number;
  readonly boundaryRecall: number;
}


export interface P524PromotionInput {
  readonly aggregate: P524AggregateMetrics;
  readonly fixtures: readonly P524FixtureMetrics[];
  readonly harmonicRhythmByFixture: Readonly<Record<string, 1 | 2 | 4 | 8 | "unknown">>;
  readonly legacyFallbackFixtures: readonly string[];
  readonly deterministic: boolean;
  readonly rawMidiUnchanged: boolean;
  readonly productionOutputsUnchanged: boolean;
  readonly officialCandidate: P524OfficialMetrics;
  readonly benchmark: {
    readonly medianRatio: number;
    readonly maximumSampleMs: number;
    readonly timedOut: boolean;
    readonly measured: boolean;
    readonly warmupCount: number;
    readonly sampleCount: number;
    readonly warmupDurationsMs: readonly number[];
    readonly sampleDurationsMs: readonly number[];
    readonly sampleRatios: readonly number[];
    readonly timeoutMs: number;
    readonly timeoutEnforced: boolean;
    readonly provenance: string;
    readonly sourceFixture: string;
    readonly repetitions: number;
    readonly noteCount: number;
  };
}


export interface P524PromotionDecision {
  readonly status: "pass-to-integration" | "fail-stop-promotion";
  readonly reasons: readonly string[];
}


export function decideP524Promotion(input: P524PromotionInput): P524PromotionDecision {
  if (!validPromotionInputStructure(input)) {
    return {
      status: "fail-stop-promotion",
      reasons: ["promotion input is structurally invalid"],
    };
  }

  const reasons: string[] = [];
  const thresholds = p524PromotionThresholds;
  const fixture = new Map(input.fixtures.map((entry) => [entry.fixtureId, entry]));
  let derivedAggregate: P524AggregateMetrics | undefined;
  try {
    derivedAggregate = aggregateP524Metrics(input.fixtures);
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : "fixture metrics are invalid");
  }

  if (!derivedAggregate || !sameAggregate(derivedAggregate, input.aggregate)) {
    reasons.push("aggregate metrics do not exactly derive from the complete A-K fixtures");
  }

  if (!validHarmonicRhythmEvidence(input.harmonicRhythmByFixture, input.legacyFallbackFixtures)) {
    reasons.push("Harmonic Rhythm evidence is not the exact safe A-K result");
  }

  const officialMetricsValid = validOfficialMetrics(input.officialCandidate);
  const benchmarkValid = validBenchmark(input.benchmark);
  if (!officialMetricsValid) reasons.push("official metrics are non-finite or out of range");
  if (!benchmarkValid) reasons.push("benchmark metrics are non-finite or out of range");
  if (input.deterministic !== true) reasons.push("shadow evaluation is not deterministic");
  if (input.rawMidiUnchanged !== true) reasons.push("raw/display MIDI changed");
  if (input.productionOutputsUnchanged !== true) reasons.push("shadow stages changed production output");
  if (derivedAggregate) {
    if (derivedAggregate.falseMergeRate > thresholds.maximumFalseMergeRate) {
      reasons.push("false merge rate exceeded the zero-tolerance safety limit");
    }

    if (derivedAggregate.changeRecall < thresholds.minimumChangeRecall) {
      reasons.push("change recall is below the locked floor");
    }

    if (derivedAggregate.changePrecision < thresholds.minimumChangePrecision) {
      reasons.push("change precision is below the locked floor");
    }

    if (derivedAggregate.identityErrorRate > thresholds.maximumIdentityErrorRate) {
      reasons.push("harmonic state identity error exceeded the zero-tolerance safety limit");
    }

    if (derivedAggregate.bassLaneFailureFixtures > thresholds.maximumBassLaneFailureFixtures) {
      reasons.push("Bass Lane result is not equivalent across exact A-K");
    }

    if (derivedAggregate.bassLaneSafetyViolations > thresholds.maximumBassLaneSafetyViolations) {
      reasons.push("Bass Lane safety evidence contains unsupported stable states");
    }

    for (const id of ["C", "D", "I"] as const) {
      if ((fixture.get(id)?.identityErrorRate ?? 1) !== 0) {
        reasons.push(`semantic fixture ${id} has corrupted harmonic identity`);
      }
    }

    for (const id of ["C", "D", "E", "G"] as const) {
      if ((fixture.get(id)?.falseMergeRate ?? 1) !== 0) reasons.push(`hard fixture ${id} lost a true change`);
    }

    if ((fixture.get("J")?.prematureStableChanges ?? 1) !== 0) {
      reasons.push("hard fixture J stabilized before the ground-truth boundary");
    }

    for (const id of ["A", "B", "F", "H", "I"] as const) {
      const metrics = fixture.get(id);
      if (!metrics
        || metrics.fragmentationRatio > thresholds.maximumImprovementFixtureFragmentationRatio
        || metrics.overSegmentationRate > thresholds.maximumImprovementFixtureOverSegmentationRate) {
        reasons.push(`product fixture ${id} remains over-segmented`);
      }
    }
  }

  if (input.harmonicRhythmByFixture.K !== "unknown"
    || !input.legacyFallbackFixtures.includes("K")) {
    reasons.push("mixed-rhythm fixture K did not fail closed to legacy");
  }

  if (officialMetricsValid) {
    if (input.officialCandidate.rootAt1 < p524OfficialBaseline.rootAt1) reasons.push("official Root@1 regressed");
    if (input.officialCandidate.qualityAt1 < p524OfficialBaseline.qualityAt1) reasons.push("official Quality@1 regressed");
    if (input.officialCandidate.boundaryPrecision < p524OfficialBaseline.boundaryPrecision) {
      reasons.push("official boundary precision regressed");
    }

    if (input.officialCandidate.boundaryRecall < p524OfficialBaseline.boundaryRecall) {
      reasons.push("official boundary recall regressed");
    }

    if (input.officialCandidate.exactAt1
      < p524OfficialBaseline.exactAt1 - thresholds.maximumOfficialExactAtOneDecline) {
      reasons.push("official Exact@1 exceeded the locked decline allowance");
    }

  }

  if (input.benchmark.timedOut) reasons.push("benchmark timed out");
  if (benchmarkValid && input.benchmark.medianRatio > thresholds.maximumBenchmarkMedianRatio) {
    reasons.push("benchmark median exceeded the locked ratio");
  }

  if (benchmarkValid && input.benchmark.maximumSampleMs > thresholds.maximumBenchmarkSampleMs) {
    reasons.push("benchmark sample exceeded the locked hard limit");
  }

  return {
    status: reasons.length === 0 ? "pass-to-integration" : "fail-stop-promotion",
    reasons,
  };
}


function validPromotionInputStructure(input: unknown): input is P524PromotionInput {
  if (!isRecord(input)) return false;
  const benchmark = input.benchmark;
  return isRecord(input.aggregate)
    && isRecordArray(input.fixtures)
    && isRecord(input.harmonicRhythmByFixture)
    && Array.isArray(input.legacyFallbackFixtures)
    && isRecord(input.officialCandidate)
    && isRecord(benchmark)
    && Array.isArray(benchmark.warmupDurationsMs)
    && Array.isArray(benchmark.sampleDurationsMs)
    && Array.isArray(benchmark.sampleRatios);
}


function isRecordArray(value: unknown): value is readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) return false;
  for (const entry of value) {
    if (!isRecord(entry)) return false;
  }
  return true;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


function sameAggregate(left: P524AggregateMetrics, right: P524AggregateMetrics): boolean {
  const keys = Object.keys(left) as (keyof P524AggregateMetrics)[];
  return keys.every((key) => Number.isFinite(right[key]) && left[key] === right[key]);
}


function validOfficialMetrics(metrics: P524OfficialMetrics): boolean {
  const values = [
    metrics.rootAt1,
    metrics.qualityAt1,
    metrics.exactAt1,
    metrics.boundaryPrecision,
    metrics.boundaryRecall,
  ];
  return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
}


function validHarmonicRhythmEvidence(
  evidence: P524PromotionInput["harmonicRhythmByFixture"],
  legacyFallbackFixtures: readonly string[],
): boolean {
  const expected = {
    A: 4, B: 4, C: 4, D: 4, E: 2, F: 8,
    G: 4, H: 4, I: 4, J: 4, K: "unknown",
  } as const;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)
    || !Array.isArray(legacyFallbackFixtures)
    || !legacyFallbackFixtures.every((fixtureId) => typeof fixtureId === "string")) {
    return false;
  }

  const expectedIds = Object.keys(expected);
  const actualIds = Object.keys(evidence);
  return actualIds.length === expectedIds.length
    && new Set(actualIds).size === expectedIds.length
    && expectedIds.every((id) => evidence[id] === expected[id as keyof typeof expected])
    && legacyFallbackFixtures.length === 1
    && legacyFallbackFixtures[0] === "K";
}


function validBenchmark(benchmark: P524PromotionInput["benchmark"]): boolean {
  return Number.isFinite(benchmark.medianRatio) && benchmark.medianRatio > 0
    && Number.isFinite(benchmark.maximumSampleMs) && benchmark.maximumSampleMs > 0
    && typeof benchmark.timedOut === "boolean"
    && benchmark.measured === true
    && benchmark.warmupCount === p524PromotionThresholds.benchmarkWarmups
    && benchmark.sampleCount === p524PromotionThresholds.benchmarkSamples
    && benchmark.warmupDurationsMs.length === benchmark.warmupCount
    && benchmark.sampleDurationsMs.length === benchmark.sampleCount
    && benchmark.sampleRatios.length === benchmark.sampleCount
    && [benchmark.warmupDurationsMs, benchmark.sampleDurationsMs, benchmark.sampleRatios]
      .every(positiveFiniteValues)
    && maximum(benchmark.sampleDurationsMs) === benchmark.maximumSampleMs
    && median(benchmark.sampleRatios) === benchmark.medianRatio
    && benchmark.timeoutMs === p524PromotionThresholds.benchmarkTimeoutMs
    && benchmark.timeoutEnforced === true
    && benchmark.provenance === p524BenchmarkProvenance
    && benchmark.sourceFixture === "E"
    && benchmark.repetitions === 128
    && benchmark.noteCount === p524BenchmarkExpectedNoteCount;
}

function positiveFiniteValues(values: readonly unknown[]): boolean {
  for (const value of values) {
    if (!Number.isFinite(value) || (value as number) <= 0) return false;
  }
  return true;
}

function maximum(values: readonly number[]): number {
  let result = Number.NEGATIVE_INFINITY;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}
