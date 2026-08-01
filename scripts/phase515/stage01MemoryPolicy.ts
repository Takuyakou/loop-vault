/**
 * The failed legacy run produced OFF peak deltas of 0.30-1.21 MiB, where a
 * single allocator page/JIT event amplified ratios up to 299.8x. Four MiB is
 * the deterministic ceiling for that observed near-zero regime. A pair in
 * this regime must still satisfy the independent post-GC growth and slope
 * gates below; the classification never grants a leak exemption.
 */
export const STAGE01_MEMORY_NEAR_ZERO_DENOMINATOR_BYTES = 4 * 1024 * 1024;
/** Bounded transient workspace; it cannot override any retained-growth failure. */
export const STAGE01_MEMORY_TRANSIENT_ALLOWANCE_BYTES = 64 * 1024 * 1024;
/** Post-GC envelopes across 24 repeated analyses, measured independently per child. */
export const STAGE01_MEMORY_RETAINED_RSS_LIMIT_BYTES = 32 * 1024 * 1024;
export const STAGE01_MEMORY_RETAINED_HEAP_LIMIT_BYTES = 8 * 1024 * 1024;
export const STAGE01_MEMORY_RETAINED_EXTERNAL_LIMIT_BYTES = 8 * 1024 * 1024;
export const STAGE01_MEMORY_RSS_SLOPE_LIMIT_BYTES_PER_ITERATION = 1024 * 1024;
export const STAGE01_MEMORY_HEAP_SLOPE_LIMIT_BYTES_PER_ITERATION = 256 * 1024;
export const STAGE01_MEMORY_EXTERNAL_SLOPE_LIMIT_BYTES_PER_ITERATION = 256 * 1024;
export const STAGE01_MEMORY_SIGNIFICANT_DELTA_RATIO_LIMIT = 1.25;
/** Initialization retained-growth uses the same fail-closed relative ceiling. */
export const STAGE01_MEMORY_WARMUP_SIGNIFICANT_GROWTH_RATIO_LIMIT = 1.25;
export const STAGE01_MEMORY_WARMUP_NEAR_ZERO_RSS_BYTES = 4 * 1024 * 1024;
export const STAGE01_MEMORY_WARMUP_NEAR_ZERO_HEAP_BYTES = 1024 * 1024;
export const STAGE01_MEMORY_WARMUP_NEAR_ZERO_EXTERNAL_BYTES = 1024 * 1024;
export const STAGE01_MEMORY_WARMUP_ABSOLUTE_RSS_LIMIT_BYTES = 32 * 1024 * 1024;
export const STAGE01_MEMORY_WARMUP_ABSOLUTE_HEAP_LIMIT_BYTES = 8 * 1024 * 1024;
export const STAGE01_MEMORY_WARMUP_ABSOLUTE_EXTERNAL_LIMIT_BYTES = 8 * 1024 * 1024;

export interface Stage01MemoryPoint {
  rssBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
}

export type Stage01MemoryVector = Stage01MemoryPoint;

export interface Stage01MemorySample {
  enabled: boolean;
  warmupIterations: 6;
  measuredIterations: 24;
  gcExposed: true;
  coldBefore: Stage01MemoryPoint;
  warmupPeaks: Stage01MemoryPoint[];
  postWarmupGc: Stage01MemoryPoint;
  warmupRetainedGrowth: Stage01MemoryVector;
  before: Stage01MemoryPoint;
  peak: Stage01MemoryPoint;
  postGc: Stage01MemoryPoint;
  retainedGrowth: Stage01MemoryVector;
  retainedSlopeBytesPerIteration: Stage01MemoryVector;
  postGcSeries: Stage01MemoryPoint[];
  temporaryArtifactsCreated: number;
}

export interface Stage01MemoryPairDecision {
  offPeakDeltaRssBytes: number;
  onPeakDeltaRssBytes: number;
  peakDeltaRatio: number | null;
  comparisonMode: "ABSOLUTE_RETAINED_SLOPE_NEAR_ZERO" | "SIGNIFICANT_DELTA_RATIO";
  offRetainedPass: boolean;
  onRetainedPass: boolean;
  transientPass: boolean;
  warmupRetainedComparisons: Record<keyof Stage01MemoryVector, Stage01WarmupMetricDecision>;
  warmupRetainedPass: boolean;
  pairPass: boolean;
}

export interface Stage01WarmupMetricDecision {
  offGrowthBytes: number;
  onGrowthBytes: number;
  ratio: number | null;
  comparisonMode: "ABSOLUTE_NEAR_ZERO" | "SIGNIFICANT_GROWTH_RATIO";
  pass: boolean;
}

export function memorySampleArithmeticValid(sample: Stage01MemorySample): boolean {
  if (sample.warmupPeaks.length !== sample.warmupIterations
    || !samePoint(sample.postWarmupGc, sample.before)
    || !samePoint(subtractPoint(sample.postWarmupGc, sample.coldBefore), sample.warmupRetainedGrowth)
    || !sample.warmupPeaks.every(validPoint)
    || sample.postGcSeries.length !== sample.measuredIterations + 1
    || !samePoint(sample.postGcSeries[0], sample.before)
    || !samePoint(sample.postGcSeries.at(-1), sample.postGc)) return false;
  const growth = subtractPoint(sample.postGc, sample.before);
  const slopes = {
    rssBytes: linearSlope(sample.postGcSeries.map((point) => point.rssBytes)),
    heapUsedBytes: linearSlope(sample.postGcSeries.map((point) => point.heapUsedBytes)),
    externalBytes: linearSlope(sample.postGcSeries.map((point) => point.externalBytes)),
  };
  return samePoint(growth, sample.retainedGrowth)
    && samePoint(slopes, sample.retainedSlopeBytesPerIteration)
    && sample.peak.rssBytes >= sample.before.rssBytes
    && sample.peak.heapUsedBytes >= sample.before.heapUsedBytes
    && sample.peak.externalBytes >= sample.before.externalBytes;
}

export function memorySampleRetainedPass(sample: Stage01MemorySample): boolean {
  if (!memorySampleArithmeticValid(sample) || !sample.gcExposed) return false;
  return sample.retainedGrowth.rssBytes <= STAGE01_MEMORY_RETAINED_RSS_LIMIT_BYTES
    && sample.retainedGrowth.heapUsedBytes <= STAGE01_MEMORY_RETAINED_HEAP_LIMIT_BYTES
    && sample.retainedGrowth.externalBytes <= STAGE01_MEMORY_RETAINED_EXTERNAL_LIMIT_BYTES
    && sample.retainedSlopeBytesPerIteration.rssBytes
      <= STAGE01_MEMORY_RSS_SLOPE_LIMIT_BYTES_PER_ITERATION
    && sample.retainedSlopeBytesPerIteration.heapUsedBytes
      <= STAGE01_MEMORY_HEAP_SLOPE_LIMIT_BYTES_PER_ITERATION
    && sample.retainedSlopeBytesPerIteration.externalBytes
      <= STAGE01_MEMORY_EXTERNAL_SLOPE_LIMIT_BYTES_PER_ITERATION;
}

export function evaluateStage01MemoryPair(
  off: Stage01MemorySample,
  on: Stage01MemorySample,
): Stage01MemoryPairDecision {
  const offPeakDeltaRssBytes = Math.max(0, observedPeakRss(off) - off.coldBefore.rssBytes);
  const onPeakDeltaRssBytes = Math.max(0, observedPeakRss(on) - on.coldBefore.rssBytes);
  const peakDeltaRatio = ratio(onPeakDeltaRssBytes, offPeakDeltaRssBytes);
  const nearZero = offPeakDeltaRssBytes < STAGE01_MEMORY_NEAR_ZERO_DENOMINATOR_BYTES;
  const comparisonMode = nearZero
    ? "ABSOLUTE_RETAINED_SLOPE_NEAR_ZERO" as const
    : "SIGNIFICANT_DELTA_RATIO" as const;
  const offRetainedPass = memorySampleRetainedPass(off);
  const onRetainedPass = memorySampleRetainedPass(on);
  const transientPass = nearZero
    ? onPeakDeltaRssBytes <= offPeakDeltaRssBytes + STAGE01_MEMORY_TRANSIENT_ALLOWANCE_BYTES
    : peakDeltaRatio !== null
      && peakDeltaRatio <= STAGE01_MEMORY_SIGNIFICANT_DELTA_RATIO_LIMIT;
  const warmupRetainedComparisons = {
    rssBytes: compareWarmupGrowth(
      off.warmupRetainedGrowth.rssBytes,
      on.warmupRetainedGrowth.rssBytes,
      STAGE01_MEMORY_WARMUP_NEAR_ZERO_RSS_BYTES,
      STAGE01_MEMORY_WARMUP_ABSOLUTE_RSS_LIMIT_BYTES,
    ),
    heapUsedBytes: compareWarmupGrowth(
      off.warmupRetainedGrowth.heapUsedBytes,
      on.warmupRetainedGrowth.heapUsedBytes,
      STAGE01_MEMORY_WARMUP_NEAR_ZERO_HEAP_BYTES,
      STAGE01_MEMORY_WARMUP_ABSOLUTE_HEAP_LIMIT_BYTES,
    ),
    externalBytes: compareWarmupGrowth(
      off.warmupRetainedGrowth.externalBytes,
      on.warmupRetainedGrowth.externalBytes,
      STAGE01_MEMORY_WARMUP_NEAR_ZERO_EXTERNAL_BYTES,
      STAGE01_MEMORY_WARMUP_ABSOLUTE_EXTERNAL_LIMIT_BYTES,
    ),
  };
  const warmupRetainedPass = Object.values(warmupRetainedComparisons)
    .every((decision) => decision.pass);
  return {
    offPeakDeltaRssBytes,
    onPeakDeltaRssBytes,
    peakDeltaRatio,
    comparisonMode,
    offRetainedPass,
    onRetainedPass,
    transientPass,
    warmupRetainedComparisons,
    warmupRetainedPass,
    pairPass: offRetainedPass && onRetainedPass && transientPass && warmupRetainedPass,
  };
}

export function observedPeakRss(sample: Stage01MemorySample): number {
  return Math.max(
    sample.coldBefore.rssBytes,
    ...sample.warmupPeaks.map((point) => point.rssBytes),
    sample.postWarmupGc.rssBytes,
    sample.before.rssBytes,
    sample.peak.rssBytes,
    sample.postGc.rssBytes,
    ...sample.postGcSeries.map((point) => point.rssBytes),
  );
}

function compareWarmupGrowth(
  offRawGrowthBytes: number,
  onRawGrowthBytes: number,
  nearZeroBytes: number,
  absoluteLimitBytes: number,
): Stage01WarmupMetricDecision {
  const offGrowthBytes = Math.max(0, offRawGrowthBytes);
  const onGrowthBytes = Math.max(0, onRawGrowthBytes);
  const nearZero = offGrowthBytes < nearZeroBytes;
  const measuredRatio = ratio(onGrowthBytes, offGrowthBytes);
  return {
    offGrowthBytes,
    onGrowthBytes,
    ratio: measuredRatio,
    comparisonMode: nearZero ? "ABSOLUTE_NEAR_ZERO" : "SIGNIFICANT_GROWTH_RATIO",
    pass: nearZero
      ? onGrowthBytes <= absoluteLimitBytes
      : measuredRatio !== null
        && measuredRatio <= STAGE01_MEMORY_WARMUP_SIGNIFICANT_GROWTH_RATIO_LIMIT,
  };
}

export function linearSlope(values: readonly number[]): number {
  const count = values.length;
  if (count < 2) return 0;
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    const deltaX = index - meanX;
    numerator += deltaX * (values[index]! - meanY);
    denominator += deltaX * deltaX;
  }
  return Math.round(numerator / denominator);
}

function subtractPoint(left: Stage01MemoryPoint, right: Stage01MemoryPoint): Stage01MemoryPoint {
  return {
    rssBytes: left.rssBytes - right.rssBytes,
    heapUsedBytes: left.heapUsedBytes - right.heapUsedBytes,
    externalBytes: left.externalBytes - right.externalBytes,
  };
}

function samePoint(left: Stage01MemoryPoint | undefined, right: Stage01MemoryPoint): boolean {
  return Boolean(left
    && left.rssBytes === right.rssBytes
    && left.heapUsedBytes === right.heapUsedBytes
    && left.externalBytes === right.externalBytes);
}

function validPoint(point: Stage01MemoryPoint): boolean {
  return Number.isSafeInteger(point.rssBytes)
    && Number.isSafeInteger(point.heapUsedBytes)
    && Number.isSafeInteger(point.externalBytes)
    && point.rssBytes >= 0
    && point.heapUsedBytes >= 0
    && point.externalBytes >= 0;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return numerator === 0 ? 1 : null;
  return Number((numerator / denominator).toFixed(6));
}
