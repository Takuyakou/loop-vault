import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { runP524ConsolidationPipeline } from "../../src/domain/midi/harmonicState/fragmentConsolidatorCore";
import {
  estimateP524BassLane,
  estimateP524HarmonicRhythm,
  type P524ShadowInput,
} from "../../src/domain/midi/harmonicState/shadowEvidence";
import { buildP526EightBarPreparedData } from "./fixtures";
import { p526PerformancePolicy, type P526ExecutedPerformanceGate } from "./promotionContract";

const childFlag = "--p526-stage00-benchmark-child";

export interface P526BenchmarkMeasurement extends P526ExecutedPerformanceGate {
  readonly provenance: "p526-dense-mixed-8bar-x4-v1";
  readonly repetitions: 4;
  readonly warmupDurationsMs: readonly number[];
  readonly sampleDurationsMs: readonly number[];
  readonly legacySampleDurationsMs: readonly number[];
  readonly sampleRatios: readonly number[];
}

export function measureP526DenseMixedBenchmark() {
  const computationStarted = performance.now();
  const input = denseMixedShadowInput(p526PerformancePolicy.denseMixedRepetitions);
  const measureLegacy = (): number => {
    const started = performance.now();
    const bass = estimateP524BassLane(input);
    const rhythm = estimateP524HarmonicRhythm(input, bass);
    const elapsed = performance.now() - started;
    if (bass.status !== "supported" || rhythm.reason !== "mixed-global-periodicity") {
      throw new Error("dense mixed legacy evidence changed");
    }
    return elapsed;
  };
  const measureCandidate = (): number => {
    const started = performance.now();
    const pipeline = runP524ConsolidationPipeline(input);
    const elapsed = performance.now() - started;
    if (pipeline.harmonicRhythm?.reason !== "mixed-global-periodicity"
      || pipeline.result.status !== "unavailable"
      || pipeline.result.reason !== "unsupported-harmonic-identity") {
      throw new Error("dense mixed candidate evidence changed");
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
    provenance: "p526-dense-mixed-8bar-x4-v1",
    repetitions: 4,
    noteCount: input.notes.length,
    warmupCount: 3,
    sampleCount: 7,
    warmupDurationsMs,
    sampleDurationsMs,
    legacySampleDurationsMs,
    sampleRatios,
    medianRatio: median(sampleRatios),
    maximumSampleMs: Math.max(...sampleDurationsMs),
    computationElapsedMs: performance.now() - computationStarted,
  } as const;
}

export function runP526DenseMixedBenchmarkEnforced(): Promise<P526BenchmarkMeasurement> {
  const started = performance.now();
  const viteNodeCli = fileURLToPath(new URL("../../node_modules/vite-node/vite-node.mjs", import.meta.url));
  const benchmarkFile = fileURLToPath(import.meta.url);
  const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [viteNodeCli, "--script", benchmarkFile, childFlag], {
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
    }, p526PerformancePolicy.childProcessWatchdogMs);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("P5.26 benchmark child could not start"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("P5.26 benchmark timed out"));
      if (code !== 0) return reject(new Error("P5.26 benchmark child failed"));
      const measurement = JSON.parse(stdout.trim().split(/\r?\n/u).at(-1) ?? "") as ReturnType<typeof measureP526DenseMixedBenchmark>;
      resolve({
        ...measurement,
        status: "completed",
        benchmarkComputationBudgetMs: p526PerformancePolicy.benchmarkComputationBudgetMs,
        childProcessWatchdogMs: p526PerformancePolicy.childProcessWatchdogMs,
        timeoutEnforced: true,
        timedOut: false,
        outerProcessElapsedMs: performance.now() - started,
      });
    });
  });
}

function denseMixedShadowInput(repetitions: number): P524ShadowInput {
  const prepared = buildP526EightBarPreparedData();
  const beatsPerRepetition = 32;
  return {
    notes: Array.from({ length: repetitions }, (_, repetition) => prepared.notes.map((note, index) => ({
      id: `p526-dense-${repetition}-${index}`,
      pitch: note.pitch,
      startBeat: note.startTick / prepared.ticksPerBeat + repetition * beatsPerRepetition,
      durationBeats: note.durationTick / prepared.ticksPerBeat,
      velocity: note.velocity,
      rolePrior: note.trackIndex === 0 ? "bass" as const : "upper" as const,
    }))).flat(),
    meter: [4, 4],
    totalBeats: beatsPerRepetition * repetitions,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

if (process.argv.includes(childFlag)) {
  process.stdout.write(`${JSON.stringify(measureP526DenseMixedBenchmark())}\n`);
}
