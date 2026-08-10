import { createHash } from "node:crypto";
import { cpus, release, type as osType } from "node:os";
import { performance } from "node:perf_hooks";
import { RootMotionPracticeSession } from "../src/features/bass-practice/application/rootMotionSession";
import { buildVaultChordContextSnapshot } from "../src/features/bass-practice/domain/chordContextSnapshot";
import { STANDARD_BASS_TUNINGS } from "../src/features/bass-practice/domain/constants";
import { ROOT_MOTION_GENERATOR_VERSION, ROOT_MOTION_MAX_ATTEMPTS, generateRootMotionExercise, type RootMotionGeneratorSnapshot } from "../src/features/bass-practice/domain/rootMotion";
import { createVaultRootMotionExercise } from "../src/features/bass-practice/domain/rootMotionVault";
import type { SavedProgressionBlock } from "../src/domain/types";

const WARMUP_RUNS = 100;
const GENERATION_COUNT = 1_000;
const GENERATION_RUNS = 7;
const SESSION_CYCLES = 20;
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

const generatedInput: RootMotionGeneratorSnapshot = Object.freeze({
  generatorVersion: ROOT_MOTION_GENERATOR_VERSION,
  seed: "p519-release-benchmark",
  level: 4,
  noteCount: 3,
  phraseLengthBeats: 6,
  tempo: 96,
  tuning: STANDARD_BASS_TUNINGS[5],
  stringCount: 5,
  fretRange: Object.freeze({ min: 0, max: 12 }),
  pitchSpan: Object.freeze({ minMidi: 23, maxMidi: 55 }),
  handedness: "right",
  maxAttempts: ROOT_MOTION_MAX_ATTEMPTS,
});

const vaultSnapshot = createBenchmarkVaultSnapshot();
for (let index = 0; index < WARMUP_RUNS; index += 1) requireExercise(index);

const generationSamples: number[] = [];
const orderedSequenceHashes: string[] = [];
for (let run = 0; run < GENERATION_RUNS; run += 1) {
  const hash = createHash("sha256");
  const startedAt = performance.now();
  for (let index = 0; index < GENERATION_COUNT; index += 1) {
    const exercise = requireExercise(index);
    hash.update(JSON.stringify(exercise));
    hash.update("\n");
  }
  generationSamples.push(performance.now() - startedAt);
  orderedSequenceHashes.push(hash.digest("hex"));
}

const resourceSamples: Array<{ readonly heapDeltaBytes: number; readonly rssDeltaBytes: number; readonly activeHandleDelta: number; readonly completedSessions: number }> = [];
for (let run = 0; run < RESOURCE_RUNS; run += 1) {
  forceGc();
  const beforeMemory = process.memoryUsage();
  const handlesBefore = activeHandleCount();
  let completedSessions = 0;
  for (let index = 0; index < SESSION_CYCLES; index += 1) {
    const exercise = requireExercise(index);
    const session = new RootMotionPracticeSession(exercise);
    requireOk(session.startListen());
    requireOk(session.completeListen());
    const expected = exercise.motions[0];
    requireOk(session.submitIdentify({ direction: expected.direction, category: expected.category, semitones: expected.semitones }));
    requireOk(session.continueToPlay());
    requireOk(session.completePlay());
    requireOk(session.rate("good"));
    completedSessions += 1;
  }
  forceGc();
  const afterMemory = process.memoryUsage();
  const activeHandleDelta = activeHandleCount() - handlesBefore;
  if (activeHandleDelta !== 0 || completedSessions !== SESSION_CYCLES) throw new Error("Root Motion session lifecycle benchmark did not settle cleanly.");
  resourceSamples.push({ heapDeltaBytes: afterMemory.heapUsed - beforeMemory.heapUsed, rssDeltaBytes: afterMemory.rss - beforeMemory.rss, activeHandleDelta, completedSessions });
}

const deterministic = new Set(orderedSequenceHashes).size === 1;
if (!deterministic) throw new Error("Root Motion generation is not deterministic.");

console.log(JSON.stringify({
  schemaVersion: 1,
  command: "npm run benchmark:p519",
  environment: { node: process.version, platform: `${process.platform}-${process.arch}`, osVersion: `${osType()} ${release()}`, cpu: cpus()[0]?.model ?? "unknown", logicalProcessorCount: cpus().length },
  definition: { median: "sorted middle; even samples average the two middle values", p95: "nearest-rank: sorted[ceil(0.95 * n) - 1]", timeout: "no operation was discarded; thrown operations fail the command" },
  deterministic,
  orderedExerciseSequence: { generationCountPerRun: GENERATION_COUNT, inputSequence: "generated L4 seeds p519-release-benchmark:0..96 repeating plus fixed validated Vault L4 root path", sha256PerRun: orderedSequenceHashes },
  generation: summarize(generationSamples),
  measurementAvailability: { activeHandles: true, heapUsed: true, rss: true },
  resourceGate: { scope: "Root Motion domain/session lifecycle microbenchmark. It does not claim Web Audio, Tone, browser microphone, Tauri, or process-memory leak coverage.", required: ["active-handle measurement available", "active-handle delta 0", `completed session cycles ${SESSION_CYCLES}`], memoryDeltas: "heapDeltaBytes and rssDeltaBytes are descriptive samples only and are not a leak gate." },
  resources: { runs: RESOURCE_RUNS, sessionCyclesPerRun: SESSION_CYCLES, samples: resourceSamples },
}, null, 2));

function requireExercise(index: number) {
  const generated = generateRootMotionExercise({ ...generatedInput, seed: `${generatedInput.seed}:${index % 97}` });
  if (!generated.ok) throw new Error(generated.error.message);
  const vault = createVaultRootMotionExercise({ snapshot: vaultSnapshot, level: 4, noteCount: 3, tuning: STANDARD_BASS_TUNINGS[5], stringCount: 5, fretRange: { min: 0, max: 12 }, pitchSpan: { minMidi: 23, maxMidi: 55 }, handedness: "right" });
  if (!vault.ok) throw new Error(vault.error.message);
  return index % 2 === 0 ? generated.exercise : vault.exercise;
}

function createBenchmarkVaultSnapshot() {
  const block: SavedProgressionBlock = {
    id: "benchmark-block", capturedAt: "2026-08-09T00:00:00.000Z", detectedKey: "C major", bpm: 96, timeSignature: "4/4", summaryText: "benchmark", tags: [], analyzerVersion: "p519-benchmark",
    chords: [0, 7, 6, 2].map((root, index) => ({ bar: 1, beat: index + 1, durationBeats: 1, confidence: 1, alternatives: [], warnings: [], chord: { root, quality: "maj" as const, tensions: [], label: "C" } })),
  };
  const result = buildVaultChordContextSnapshot({ sourceReference: { ideaId: "benchmark-idea", blockId: "benchmark-block" }, block, sectionId: "bars:1-1" });
  if (!result.ok) throw new Error(result.error.message);
  return result.snapshot;
}

function requireOk(result: { readonly ok: boolean; readonly message?: string }): void {
  if (!result.ok) throw new Error(result.message ?? "Root Motion session transition failed.");
}

function summarize(rawMs: readonly number[]): RuntimeSummary {
  const sorted = [...rawMs].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return { rawMs, medianMs: sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle], p95Ms: sorted[Math.ceil(0.95 * sorted.length) - 1], maxMs: sorted[sorted.length - 1], timeoutCount: 0 };
}

function activeHandleCount(): number {
  const getActiveHandles = (process as ActiveHandleProcess)._getActiveHandles;
  if (typeof getActiveHandles !== "function") throw new Error("P5.19 active-handle measurement is unavailable; resource Gate cannot be evaluated.");
  return getActiveHandles.call(process).length;
}

function forceGc(): void {
  if (!globalThis.gc) throw new Error("Run P5.19 benchmark through npm run benchmark:p519 so --expose-gc is enabled.");
  globalThis.gc();
}