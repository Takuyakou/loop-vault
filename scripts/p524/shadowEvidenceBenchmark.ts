import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
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

export interface P524Stage01BenchmarkMeasurement {
  readonly provenance: typeof p524BenchmarkProvenance;
  readonly sourceFixture: "E";
  readonly repetitions: 128;
  readonly noteCount: typeof p524BenchmarkExpectedNoteCount;
  readonly warmupCount: 3;
  readonly sampleCount: 7;
  readonly warmupDurationsMs: readonly number[];
  readonly sampleDurationsMs: readonly number[];
  readonly medianMs: number;
  readonly maximumMs: number;
}

export interface P524Stage01BenchmarkCompleted extends P524Stage01BenchmarkMeasurement {
  readonly status: "completed";
  readonly timeoutMs: number;
  readonly timeoutEnforced: true;
  readonly timedOut: false;
  readonly elapsedMs: number;
}

export interface P524Stage01BenchmarkTimedOut {
  readonly status: "timed-out";
  readonly timeoutMs: number;
  readonly timeoutEnforced: true;
  readonly timedOut: true;
  readonly elapsedMs: number;
}

export type P524Stage01BenchmarkOutcome =
  | P524Stage01BenchmarkCompleted
  | P524Stage01BenchmarkTimedOut;

export interface P524Stage01BenchmarkOptions {
  readonly timeoutMs?: number;
  readonly childDelayMs?: number;
}

const childFlag = "--p524-benchmark-child";
const delayPrefix = "--p524-child-delay-ms=";

export function measureP524Stage01Benchmark(): P524Stage01BenchmarkMeasurement {
  const notes = generateP524DenseBenchmarkNotes(128);
  if (notes.length !== p524BenchmarkExpectedNoteCount) {
    throw new Error("locked P5.24 benchmark note count changed");
  }
  const input: P524ShadowInput = {
    notes: toP524ShadowNotes(notes),
    meter: [4, 4],
    totalBeats: 8 * 128,
  };
  const measure = (): number => {
    const start = performance.now();
    const bassLane = estimateP524BassLane(input);
    const harmonicRhythm = estimateP524HarmonicRhythm(input, bassLane);
    const elapsed = performance.now() - start;
    if (bassLane.status !== "supported"
      || harmonicRhythm.status !== "supported"
      || harmonicRhythm.quarterBeats !== 2) {
      throw new Error("P5.24 Stage01 benchmark did not produce locked shadow evidence");
    }
    return elapsed;
  };
  const warmupDurationsMs = Array.from({ length: 3 }, measure);
  const sampleDurationsMs = Array.from({ length: 7 }, measure);
  const sorted = [...sampleDurationsMs].sort((left, right) => left - right);
  return {
    provenance: p524BenchmarkProvenance,
    sourceFixture: "E",
    repetitions: 128,
    noteCount: p524BenchmarkExpectedNoteCount,
    warmupCount: 3,
    sampleCount: 7,
    warmupDurationsMs,
    sampleDurationsMs,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    maximumMs: maximum(sampleDurationsMs),
  };
}

export function runP524Stage01BenchmarkEnforced(
  options: P524Stage01BenchmarkOptions = {},
): Promise<P524Stage01BenchmarkOutcome> {
  const timeoutMs = options.timeoutMs ?? p524PromotionThresholds.benchmarkTimeoutMs;
  const childDelayMs = options.childDelayMs ?? 0;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > p524PromotionThresholds.benchmarkTimeoutMs
    || !Number.isInteger(childDelayMs) || childDelayMs < 0 || childDelayMs > 10_000) {
    return Promise.reject(new Error("invalid P5.24 benchmark enforcement options"));
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
    let didTimeout = false;
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", () => undefined);
    const timer = setTimeout(() => {
      didTimeout = true;
      child.kill();
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timer);
      rejectOutcome(new Error("P5.24 benchmark child could not start"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      const elapsedMs = performance.now() - started;
      if (didTimeout) {
        resolveOutcome({
          status: "timed-out",
          timeoutMs,
          timeoutEnforced: true,
          timedOut: true,
          elapsedMs,
        });
        return;
      }
      if (code !== 0) {
        rejectOutcome(new Error("P5.24 benchmark child failed"));
        return;
      }
      try {
        const lastLine = stdout.trim().split(/\r?\n/u).at(-1);
        const measurement = JSON.parse(lastLine ?? "") as unknown;
        if (!validMeasurement(measurement)) throw new Error("invalid measurement");
        resolveOutcome({
          status: "completed",
          ...measurement,
          timeoutMs,
          timeoutEnforced: true,
          timedOut: false,
          elapsedMs,
        });
      } catch {
        rejectOutcome(new Error("P5.24 benchmark child returned invalid evidence"));
      }
    });
  });
}

function validMeasurement(value: unknown): value is P524Stage01BenchmarkMeasurement {
  if (!isRecord(value)) return false;
  const warmups = value.warmupDurationsMs;
  const samples = value.sampleDurationsMs;
  return value.provenance === p524BenchmarkProvenance
    && value.sourceFixture === "E"
    && value.repetitions === 128
    && value.noteCount === p524BenchmarkExpectedNoteCount
    && value.warmupCount === 3
    && value.sampleCount === 7
    && densePositiveFiniteArray(warmups, 3)
    && densePositiveFiniteArray(samples, 7)
    && value.medianMs === median(samples as number[])
    && value.maximumMs === maximum(samples as number[]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function densePositiveFiniteArray(value: unknown, expectedLength: number): value is number[] {
  if (!Array.isArray(value) || value.length !== expectedLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index) || !positiveFinite(value[index])) return false;
  }
  return true;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  if (process.argv.includes(childFlag)) {
    const delayArgument = process.argv.find((argument) => argument.startsWith(delayPrefix));
    const delayMs = delayArgument === undefined ? 0 : Number(delayArgument.slice(delayPrefix.length));
    const emitMeasurement = (): void => {
      process.stdout.write(`${JSON.stringify(measureP524Stage01Benchmark())}\n`);
    };
    if (Number.isInteger(delayMs) && delayMs > 0) setTimeout(emitMeasurement, delayMs);
    else emitMeasurement();
  } else {
    void runP524Stage01BenchmarkEnforced().then((outcome) => {
      process.stdout.write(`${JSON.stringify(outcome)}\n`);
    });
  }
}
