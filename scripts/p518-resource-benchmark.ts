import { createHash } from "node:crypto";
import { cpus, release, type as osType } from "node:os";
import { performance } from "node:perf_hooks";
import {
  buildChordContextPlaybackPlan,
  createChordContextPlaybackEngine,
  type ChordContextListenInput,
  type ChordContextPlaybackDriver,
  type ChordContextPlaybackInput,
  type ChordContextPlayer,
} from "../src/features/bass-practice/application/chordContextPlayback";

const WARMUP_RUNS = 100;
const PLAN_COUNT = 1_000;
const PLAN_RUNS = 7;
const RESOURCE_REPLAYS = 20;
const RESOURCE_RUNS = 5;

interface RuntimeSummary {
  readonly rawMs: readonly number[];
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly timeoutCount: 0;
}

interface ActiveHandleProcess extends NodeJS.Process {
  _getActiveHandles?(): readonly unknown[];
}

interface PlayerProbe {
  scheduled: number;
  stopCount: number;
  disposeCount: number;
}

const fixedInput: ChordContextListenInput = Object.freeze({
  mode: "listen",
  listenMode: "bass-chords-and-metronome",
  bpm: 96,
  meter: Object.freeze({ numerator: 4, denominator: 4 }),
  countInBeats: 4,
  chordEvents: Object.freeze([
    Object.freeze({ id: "chord:0", chord: Object.freeze({ root: 2, quality: "min7" as const, tensions: Object.freeze([]) }), startBeat: 0, durationBeats: 2 }),
    Object.freeze({ id: "chord:1", chord: Object.freeze({ root: 7, quality: "dom7" as const, tensions: Object.freeze([]) }), startBeat: 2, durationBeats: 2 }),
    Object.freeze({ id: "chord:2", chord: Object.freeze({ root: 0, quality: "maj7" as const, tensions: Object.freeze([]) }), startBeat: 4, durationBeats: 4 }),
  ]),
  bassEvents: Object.freeze([
    Object.freeze({ id: "bass:0", pitch: 38, startBeat: 0, durationBeats: 1, velocity: 0.8 }),
    Object.freeze({ id: "bass:1", pitch: 43, startBeat: 2, durationBeats: 1, velocity: 0.8 }),
    Object.freeze({ id: "bass:2", pitch: 36, startBeat: 4, durationBeats: 1, velocity: 0.8 }),
  ]),
});

for (let run = 0; run < WARMUP_RUNS; run += 1) requirePlan(fixedInput);

const planRaw: number[] = [];
const orderedSequenceHashes: string[] = [];
for (let run = 0; run < PLAN_RUNS; run += 1) {
  const sequenceHash = createHash("sha256");
  const startedAt = performance.now();
  for (let index = 0; index < PLAN_COUNT; index += 1) {
    const plan = requirePlan({ ...fixedInput, bpm: 80 + (index % 81) });
    sequenceHash.update(JSON.stringify(plan));
    sequenceHash.update(String.fromCharCode(10));
  }
  planRaw.push(performance.now() - startedAt);
  orderedSequenceHashes.push(sequenceHash.digest("hex"));
}

const resourceSamples: Array<{
  readonly heapDeltaBytes: number;
  readonly rssDeltaBytes: number;
  readonly activeHandleDelta: number;
  readonly createdPlayers: number;
  readonly retainedPlayers: number;
  readonly stopCount: number;
  readonly disposeCount: number;
}> = [];

for (let run = 0; run < RESOURCE_RUNS; run += 1) {
  forceGc();
  const before = process.memoryUsage();
  const handlesBefore = activeHandleCount();
  const probes = runResourceLifecycle();
  forceGc();
  const after = process.memoryUsage();
  const retainedPlayers = probes.filter((probe) => probe.stopCount !== 1 || probe.disposeCount !== 1).length;
  const stopCount = probes.reduce((total, probe) => total + probe.stopCount, 0);
  const disposeCount = probes.reduce((total, probe) => total + probe.disposeCount, 0);
  if (retainedPlayers !== 0 || stopCount !== probes.length || disposeCount !== probes.length) {
    throw new Error(`Chord Context resource lifecycle failed: retained=${retainedPlayers}, stopped=${stopCount}, disposed=${disposeCount}, created=${probes.length}`);
  }
  resourceSamples.push({
    heapDeltaBytes: after.heapUsed - before.heapUsed,
    rssDeltaBytes: after.rss - before.rss,
    activeHandleDelta: activeHandleCount() - handlesBefore,
    createdPlayers: probes.length,
    retainedPlayers,
    stopCount,
    disposeCount,
  });
}

const deterministic = new Set(orderedSequenceHashes).size === 1;
if (!deterministic) throw new Error("Chord Context playback plan is not deterministic.");
if (resourceSamples.some((sample) => sample.activeHandleDelta !== 0)) {
  throw new Error("Chord Context resource benchmark retained an active Node handle.");
}

console.log(JSON.stringify({
  schemaVersion: 1,
  command: "npm run benchmark:p518",
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    osVersion: `${osType()} ${release()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    logicalProcessorCount: cpus().length,
  },
  fixedInput: {
    bpm: fixedInput.bpm,
    meter: fixedInput.meter,
    countInBeats: fixedInput.countInBeats,
    listenMode: fixedInput.listenMode,
    chordEventCount: fixedInput.chordEvents.length,
    bassEventCount: fixedInput.bassEvents.length,
  },
  warmup: { playbackPlans: WARMUP_RUNS },
  definition: {
    median: "sorted middle; even samples average the two middle values",
    p95: "nearest-rank: sorted[ceil(0.95 * n) - 1]",
    timeout: "no timed operation was discarded; thrown operations fail the command",
  },
  deterministic,
  orderedPlanSequence: {
    planCountPerRun: PLAN_COUNT,
    bpmSequence: "80..160 repeating in stable order",
    sha256PerRun: orderedSequenceHashes,
  },
  playbackPlans1000: summarize(planRaw),
  measurementAvailability: {
    activeHandles: true,
    heapUsed: true,
    rss: true,
  },
  resourceGate: {
    scope: "Chord Context engine-lifecycle microbenchmark with a deterministic fake driver; not a Tone, Web Audio, Tauri, or process-memory leak claim.",
    required: ["active-handle measurement available", "active-handle delta 0", "every created fake player stopped and disposed exactly once", "retained fake players 0"],
    memoryDeltas: "heapDeltaBytes and rssDeltaBytes are descriptive samples only and are not a leak gate.",
  },
  resources: {
    replayCountPerScenario: RESOURCE_REPLAYS,
    scenariosPerRun: 3,
    listenAndPlayModesPerLayerSwitchCycle: 8,
    runs: RESOURCE_RUNS,
    samples: resourceSamples,
  },
}, null, 2));

function requirePlan(input: ChordContextListenInput) {
  const result = buildChordContextPlaybackPlan(input);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.plan;
}

function runResourceLifecycle(): readonly PlayerProbe[] {
  const probes: PlayerProbe[] = [];
  const driver: ChordContextPlaybackDriver = {
    createPlayer(): ChordContextPlayer {
      const probe: PlayerProbe = { scheduled: 0, stopCount: 0, disposeCount: 0 };
      probes.push(probe);
      return {
        schedule() { probe.scheduled += 1; },
        stop() { probe.stopCount += 1; },
        dispose() { probe.disposeCount += 1; },
      };
    },
  };

  const replayEngine = createChordContextPlaybackEngine(driver);
  for (let index = 0; index < RESOURCE_REPLAYS; index += 1) {
    const result = replayEngine.start({ ...fixedInput, bpm: 80 + index });
    if (!result.ok) throw new Error(result.error.message);
  }
  replayEngine.dispose();

  const layerEngine = createChordContextPlaybackEngine(driver);
  const modeInputs = createModeInputs();
  for (let index = 0; index < RESOURCE_REPLAYS; index += 1) {
    const result = layerEngine.start(modeInputs[index % modeInputs.length]);
    if (!result.ok) throw new Error(result.error.message);
  }
  layerEngine.dispose();

  for (let index = 0; index < RESOURCE_REPLAYS; index += 1) {
    const stopEngine = createChordContextPlaybackEngine(driver);
    const result = stopEngine.start(fixedInput);
    if (!result.ok) throw new Error(result.error.message);
    stopEngine.stop();
    stopEngine.dispose();
  }
  return probes;
}

function createModeInputs(): readonly ChordContextPlaybackInput[] {
  const base = {
    bpm: fixedInput.bpm,
    meter: fixedInput.meter,
    countInBeats: fixedInput.countInBeats,
    chordEvents: fixedInput.chordEvents,
    bassEvents: fixedInput.bassEvents,
  };
  return [
    { ...base, mode: "listen", listenMode: "bass-only" },
    { ...base, mode: "listen", listenMode: "chords-only" },
    { ...base, mode: "listen", listenMode: "bass-and-chords" },
    { ...base, mode: "listen", listenMode: "bass-chords-and-metronome" },
    { ...base, mode: "play", playMode: "chords-only" },
    { ...base, mode: "play", playMode: "chords-and-metronome" },
    { ...base, mode: "play", playMode: "metronome-only" },
    { ...base, mode: "play", playMode: "no-accompaniment" },
  ];
}

function summarize(rawMs: readonly number[]): RuntimeSummary {
  const sorted = [...rawMs].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    rawMs,
    medianMs: sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle],
    p95Ms: sorted[Math.ceil(0.95 * sorted.length) - 1],
    maxMs: sorted[sorted.length - 1],
    timeoutCount: 0,
  };
}

function activeHandleCount(): number {
  const getActiveHandles = (process as ActiveHandleProcess)._getActiveHandles;
  if (typeof getActiveHandles !== "function") {
    throw new Error("P5.18 active-handle measurement is unavailable; resource Gate cannot be evaluated.");
  }
  return getActiveHandles.call(process).length;
}

function forceGc(): void {
  if (!globalThis.gc) throw new Error("Run the P5.18 benchmark through npm run benchmark:p518 so --expose-gc is enabled.");
  globalThis.gc();
}
