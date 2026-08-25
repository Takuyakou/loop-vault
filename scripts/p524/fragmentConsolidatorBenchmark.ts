import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { consolidateP524PerformanceFragments } from "./fragmentConsolidator";
import { generateP524DenseBenchmarkNotes } from "./harmonicFragmentFixtures";
import {
  p524BenchmarkExpectedNoteCount,
  p524BenchmarkProvenance,
  p524PromotionThresholds,
} from "./promotionContract";
import {
  estimateP524BassLane,
  estimateP524HarmonicRhythm,
  toP524ShadowNotes,
  type P524ShadowInput,
} from "./shadowEvidence";

export interface P524Stage02BenchmarkMeasurement {
  readonly provenance: typeof p524BenchmarkProvenance;
  readonly sourceFixture: "E";
  readonly repetitions: 128;
  readonly noteCount: typeof p524BenchmarkExpectedNoteCount;
  readonly measured: true;
  readonly warmupCount: 3;
  readonly sampleCount: 7;
  readonly warmupDurationsMs: readonly number[];
  readonly sampleDurationsMs: readonly number[];
  readonly legacySampleDurationsMs: readonly number[];
  readonly sampleRatios: readonly number[];
  readonly medianRatio: number;
  readonly maximumSampleMs: number;
}

export interface P524Stage02BenchmarkCompleted extends P524Stage02BenchmarkMeasurement {
  readonly status: "completed";
  readonly timeoutMs: number;
  readonly timeoutEnforced: true;
  readonly timedOut: false;
  readonly elapsedMs: number;
}

export interface P524Stage02BenchmarkTimedOut {
  readonly status: "timed-out";
  readonly timeoutMs: number;
  readonly timeoutEnforced: true;
  readonly timedOut: true;
  readonly elapsedMs: number;
}

export type P524Stage02BenchmarkOutcome = P524Stage02BenchmarkCompleted | P524Stage02BenchmarkTimedOut;

const childFlag = "--p524-stage02-benchmark-child";
const delayPrefix = "--p524-stage02-child-delay-ms=";

export function measureP524Stage02Benchmark(): P524Stage02BenchmarkMeasurement {
  const notes = generateP524DenseBenchmarkNotes(128);
  if (notes.length !== p524BenchmarkExpectedNoteCount) throw new Error("locked benchmark note count changed");
  const input: P524ShadowInput = {
    notes: toP524ShadowNotes(notes),
    meter: [4, 4],
    totalBeats: 8 * 128,
  };
  const measureLegacy = (): number => {
    const start = performance.now();
    const bassLane = estimateP524BassLane(input);
    const harmonicRhythm = estimateP524HarmonicRhythm(input, bassLane);
    const elapsed = performance.now() - start;
    if (bassLane.status !== "supported" || harmonicRhythm.status !== "supported"
      || harmonicRhythm.quarterBeats !== 2) throw new Error("legacy shadow evidence changed");
    return elapsed;
  };
  const measureCandidate = (): number => {
    const start = performance.now();
    const result = consolidateP524PerformanceFragments(input);
    const elapsed = performance.now() - start;
    if (result.status !== "supported" || result.harmonicRhythm !== 2 || result.states.length === 0) {
      throw new Error("Stage02 candidate did not produce dense shadow states");
    }
    return elapsed;
  };
  const warmupDurationsMs = Array.from({ length: 3 }, () => {
    measureLegacy();
    return measureCandidate();
  });
  const sampleDurationsMs: number[] = [];
  const legacySampleDurationsMs: number[] = [];
  const sampleRatios: number[] = [];
  for (let index = 0; index < 7; index += 1) {
    const legacyMs = measureLegacy();
    const candidateMs = measureCandidate();
    legacySampleDurationsMs.push(legacyMs);
    sampleDurationsMs.push(candidateMs);
    sampleRatios.push(candidateMs / legacyMs);
  }
  return {
    provenance: p524BenchmarkProvenance,
    sourceFixture: "E",
    repetitions: 128,
    noteCount: p524BenchmarkExpectedNoteCount,
    measured: true,
    warmupCount: 3,
    sampleCount: 7,
    warmupDurationsMs,
    sampleDurationsMs,
    legacySampleDurationsMs,
    sampleRatios,
    medianRatio: median(sampleRatios),
    maximumSampleMs: maximum(sampleDurationsMs),
  };
}

export function runP524Stage02BenchmarkEnforced(options: {
  readonly timeoutMs?: number;
  readonly childDelayMs?: number;
} = {}): Promise<P524Stage02BenchmarkOutcome> {
  const timeoutMs = options.timeoutMs ?? p524PromotionThresholds.benchmarkTimeoutMs;
  const childDelayMs = options.childDelayMs ?? 0;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10_000
    || !Number.isInteger(childDelayMs) || childDelayMs < 0 || childDelayMs > 10_000) {
    return Promise.reject(new Error("invalid Stage02 benchmark enforcement options"));
  }
  const started = performance.now();
  const viteNodeCli = fileURLToPath(new URL("../../node_modules/vite-node/vite-node.mjs", import.meta.url));
  const benchmarkFile = fileURLToPath(import.meta.url);
  const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
  const args = [viteNodeCli, "--script", benchmarkFile, childFlag];
  if (childDelayMs > 0) args.push(`${delayPrefix}${childDelayMs}`);
  return new Promise((resolveOutcome, rejectOutcome) => {
    const child = spawn(process.execPath, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let timedOut = false;
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", () => undefined);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timer);
      rejectOutcome(new Error("Stage02 benchmark child could not start"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      const elapsedMs = performance.now() - started;
      if (timedOut) {
        resolveOutcome({ status: "timed-out", timeoutMs, timeoutEnforced: true, timedOut: true, elapsedMs });
        return;
      }
      if (code !== 0) {
        rejectOutcome(new Error("Stage02 benchmark child failed"));
        return;
      }
      try {
        const measurement = JSON.parse(stdout.trim().split(/\r?\n/u).at(-1) ?? "") as unknown;
        if (!validMeasurement(measurement)) throw new Error("invalid Stage02 benchmark measurement");
        resolveOutcome({
          status: "completed",
          ...measurement,
          timeoutMs,
          timeoutEnforced: true,
          timedOut: false,
          elapsedMs,
        });
      } catch {
        rejectOutcome(new Error("Stage02 benchmark child returned invalid evidence"));
      }
    });
  });
}

function validMeasurement(value: unknown): value is P524Stage02BenchmarkMeasurement {
  if (!isRecord(value)) return false;
  return value.provenance === p524BenchmarkProvenance
    && value.sourceFixture === "E"
    && value.repetitions === 128
    && value.noteCount === p524BenchmarkExpectedNoteCount
    && value.measured === true
    && value.warmupCount === 3
    && value.sampleCount === 7
    && densePositiveFiniteArray(value.warmupDurationsMs, 3)
    && densePositiveFiniteArray(value.sampleDurationsMs, 7)
    && densePositiveFiniteArray(value.legacySampleDurationsMs, 7)
    && densePositiveFiniteArray(value.sampleRatios, 7)
    && value.medianRatio === median(value.sampleRatios)
    && value.maximumSampleMs === maximum(value.sampleDurationsMs);
}

function densePositiveFiniteArray(value: unknown, expectedLength: number): value is number[] {
  if (!Array.isArray(value) || value.length !== expectedLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)
      || typeof value[index] !== "number" || !Number.isFinite(value[index]) || value[index] <= 0) return false;
  }
  return true;
}

function maximum(values: readonly number[]): number {
  return values.reduce((result, value) => Math.max(result, value), Number.NEGATIVE_INFINITY);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  if (process.argv.includes(childFlag)) {
    const delayArgument = process.argv.find((argument) => argument.startsWith(delayPrefix));
    const delayMs = delayArgument === undefined ? 0 : Number(delayArgument.slice(delayPrefix.length));
    const emit = (): void => {
      process.stdout.write(`${JSON.stringify(measureP524Stage02Benchmark())}\n`);
    };
    if (Number.isInteger(delayMs) && delayMs > 0) setTimeout(emit, delayMs);
    else emit();
  } else {
    void runP524Stage02BenchmarkEnforced().then((outcome) => {
      process.stdout.write(`${JSON.stringify(outcome)}\n`);
    });
  }
}
