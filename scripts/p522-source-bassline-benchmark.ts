import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { extractSourceBasslineSnapshot } from "../src/domain/sourceBassline";
import { buildSourceBasslinePracticeWindow } from "../src/features/bass-practice/domain/sourceBasslinePractice";

const EVENT_COUNT = 2_048;
const WARMUP_ITERATIONS = 2;
const ITERATIONS_PER_RUN = 10;
const RUNS = 5;
const P95_LIMIT_MS = 5_000;
const SOURCE_ID = "synthetic-p522-benchmark";
const VOICE_ID = "synthetic-bass";
const ticksPerQuarter = EVENT_COUNT / 4;

const snapshot = extractSourceBasslineSnapshot({
  selectedSourceId: SOURCE_ID,
  selectedVoiceId: VOICE_ID,
  range: {
    authority: "raw-integer-ticks",
    constantMeterProven: true,
    barAlignmentProven: true,
    sourceId: SOURCE_ID,
    startTick: 0,
    endTick: EVENT_COUNT,
    sourceEndTick: EVENT_COUNT,
    ticksPerQuarter,
    meter: { numerator: 4, denominator: 4 },
  },
  notes: Array.from({ length: EVENT_COUNT }, (_, startTick) => ({
    sourceId: SOURCE_ID,
    voiceId: VOICE_ID,
    pitch: 40 + (startTick % 12),
    velocity: 0.8,
    startTick,
    durationTick: 1,
    ticksPerQuarter,
  })),
  capturedHarmony: {
    authority: "raw-integer-ticks",
    sourceId: SOURCE_ID,
    rangeStartTick: 0,
    rangeEndTick: EVENT_COUNT,
    ticksPerQuarter,
    spans: Array.from({ length: EVENT_COUNT }, (_, startTick) => ({
      sourceId: SOURCE_ID,
      startTick,
      durationTick: 1,
      ticksPerQuarter,
      chord: {
        root: startTick % 12,
        quality: "maj7" as const,
        tensions: [],
        label: "Synthetic chord",
      },
    })),
  },
});
const immutableSnapshot = JSON.stringify(snapshot);

for (let index = 0; index < WARMUP_ITERATIONS; index += 1) requireDenseWindow();

const rawMs: number[] = [];
const hashes: string[] = [];
for (let run = 0; run < RUNS; run += 1) {
  const hash = createHash("sha256");
  const startedAt = performance.now();
  for (let iteration = 0; iteration < ITERATIONS_PER_RUN; iteration += 1) {
    const window = requireDenseWindow();
    hash.update(JSON.stringify({
      range: [window.startBar, window.endBar, window.actualBars],
      facts: [
        window.croppedSourceNoteCount,
        window.boundaryClippedNoteCount,
        window.omittedSimultaneousNoteCount,
        window.overlapClippedNoteCount,
      ],
      level1: window.levels[1],
      level2: window.levels[2],
      level3: window.levels[3],
    }));
    hash.update("\n");
  }
  rawMs.push(performance.now() - startedAt);
  hashes.push(hash.digest("hex"));
}

const sorted = [...rawMs].sort((left, right) => left - right);
const medianMs = sorted[Math.floor(sorted.length / 2)]!;
const p95Ms = sorted[Math.ceil(0.95 * sorted.length) - 1]!;
const deterministic = new Set(hashes).size === 1;
const immutable = JSON.stringify(snapshot) === immutableSnapshot;
if (!deterministic) throw new Error("P5.22 source-bassline projection output changed across identical runs.");
if (!immutable) throw new Error("P5.22 source-bassline benchmark mutated the captured snapshot.");
if (p95Ms > P95_LIMIT_MS) {
  throw new Error(`P5.22 dense projection p95 ${p95Ms.toFixed(2)} ms exceeded ${P95_LIMIT_MS} ms.`);
}

console.log(JSON.stringify({
  schemaVersion: 1,
  command: "npm run benchmark:p522",
  scope: "Privacy-safe synthetic Source Bassline crop/projection and exact-harmony Level 1/2 derivation; no MIDI, audio, path, title, or device data.",
  dataset: {
    sourceNotes: EVENT_COUNT,
    capturedHarmonySpans: EVENT_COUNT,
    windowsPerRun: ITERATIONS_PER_RUN,
    runs: RUNS,
    warmupIterations: WARMUP_ITERATIONS,
  },
  deterministic,
  immutableSnapshot: immutable,
  orderedOutputSha256PerRun: hashes,
  timing: {
    rawMs,
    medianMs,
    p95Ms,
    p95LimitMs: P95_LIMIT_MS,
    timeoutCount: 0,
  },
  gate: "p95 is measured across complete fixed-order runs; no sample is discarded. The threshold is a conservative release guard, not a user-latency claim.",
}, null, 2));

function requireDenseWindow() {
  const result = buildSourceBasslinePracticeWindow(snapshot, 1, 1);
  if (!result.ok) throw new Error(`P5.22 dense synthetic window failed: ${result.reason}`);
  const level1 = result.window.levels[1];
  const level2 = result.window.levels[2];
  if (!level1.available || !level2.available
    || level1.targetEvents.length !== EVENT_COUNT
    || level2.targetEvents.length !== EVENT_COUNT
    || result.window.levels[3].targetEvents.length !== EVENT_COUNT) {
    throw new Error("P5.22 dense synthetic window did not preserve the expected event counts.");
  }
  return result.window;
}
