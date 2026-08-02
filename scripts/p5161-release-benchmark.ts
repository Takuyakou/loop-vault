import { performance } from "node:perf_hooks";
import { cpus, release, type as osType } from "node:os";
import { createPlaybackController, type PlaybackAudioDriver } from "../src/audio/playbackController";
import { DegreePracticeSession, type DegreePracticeTimer } from "../src/features/bass-practice/application/degreePracticeSession";
import { derivePracticeHistory } from "../src/features/bass-practice/application/practiceData";
import {
  createCompletedAttempt,
  deriveReviewQueue,
  generateDegreeExercise,
  stableHash,
  type GeneratorSnapshot,
  type PracticeAttempt,
  type PracticeSession,
} from "../src/features/bass-practice/domain";
import { generatorSnapshot } from "../src/features/bass-practice/domain/testFixtures";
import { createEmptyPracticeFile, type PracticeFileV1 } from "../src/features/bass-practice/infra/repository";

const GENERATION_WARMUP = 2_000;
const GENERATION_COUNT = 1_000;
const GENERATION_RUNS = 7;
const DERIVATION_RUNS = 9;
const PLAYBACK_WARMUP = 100;
const PLAYBACK_COUNT = 1_000;
const PLAYBACK_RUNS = 9;
const RESOURCE_COUNT = 1_000;
const RESOURCE_RUNS = 5;
const CLOCK_DATE = "2026-08-02T00:00:00.000Z";

interface RuntimeSummary {
  readonly rawMs: readonly number[];
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly timeoutCount: 0;
}

interface ResourceSample {
  readonly heapDeltaBytes: number;
  readonly rssDeltaBytes: number;
  readonly activeHandleDelta: number;
}

interface ActiveHandleProcess extends NodeJS.Process {
  _getActiveHandles?(): readonly unknown[];
}

const baseSnapshot = generatorSnapshot({
  generatorVersion: "degree-v1",
  seed: generationSeed(0),
  key: "C",
  scale: "major",
  tempo: 88,
  tuning: [28, 33, 38, 43],
  fretRange: { min: 0, max: 12 },
  handedness: "right",
  rhythmPreset: "even",
});

const fixedExercise = requireExercise(baseSnapshot);
const attempts = createAttemptFixture(fixedExercise);
const sessions = createSessionFixture(attempts);
const historyFile = createHistoryFile(attempts, sessions);
let stopCount = 0;

for (let index = 0; index < GENERATION_WARMUP; index += 1) {
  requireExercise({ ...baseSnapshot, seed: generationSeed(index % GENERATION_COUNT) });
}
deriveReviewQueue(attempts, CLOCK_DATE);
derivePracticeHistory(historyFile, 100);
await runPlaybackStarts(PLAYBACK_WARMUP);

const generationRaw: number[] = [];
const generationHashes: string[] = [];
for (let run = 0; run < GENERATION_RUNS; run += 1) {
  const exercises: ReturnType<typeof requireExercise>[] = [];
  const startedAt = performance.now();
  for (let index = 0; index < GENERATION_COUNT; index += 1) {
    exercises.push(requireExercise({ ...baseSnapshot, seed: generationSeed(index) }));
  }
  generationRaw.push(performance.now() - startedAt);
  generationHashes.push(stableHash(exercises));
}

const queue = measureSync(DERIVATION_RUNS, () => deriveReviewQueue(attempts, CLOCK_DATE));
const history = measureSync(DERIVATION_RUNS, () => derivePracticeHistory(historyFile, 100));
const playbackRaw: number[] = [];
for (let run = 0; run < PLAYBACK_RUNS; run += 1) {
  playbackRaw.push(await runPlaybackStarts(PLAYBACK_COUNT));
}

const resources: ResourceSample[] = [];
for (let run = 0; run < RESOURCE_RUNS; run += 1) {
  forceGc();
  const before = process.memoryUsage();
  const handlesBefore = activeHandleCount();
  await runResourceLifecycle(RESOURCE_COUNT);
  forceGc();
  const after = process.memoryUsage();
  resources.push({
    heapDeltaBytes: after.heapUsed - before.heapUsed,
    rssDeltaBytes: after.rss - before.rss,
    activeHandleDelta: activeHandleCount() - handlesBefore,
  });
}

const output = {
  schemaVersion: 1,
  command: "node --expose-gc node_modules/vite-node/vite-node.mjs scripts/p5161-release-benchmark.ts",
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    osVersion: `${osType()} ${release()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    logicalProcessorCount: cpus().length,
  },
  fixedInput: {
    clockDate: CLOCK_DATE,
    generatorSnapshot: baseSnapshot,
    generationSeeds: "p5161-fixed-0000..p5161-fixed-0999",
    attemptCount: attempts.length,
    sessionCount: sessions.length,
    historyLimit: 100,
  },
  warmup: {
    generation: GENERATION_WARMUP,
    queue: 1,
    history: 1,
    playbackStarts: PLAYBACK_WARMUP,
  },
  definition: {
    median: "sorted middle; even samples average the two middle values",
    p95: "nearest-rank: sorted[ceil(0.95 * n) - 1]",
    timeout: "no timed operation was discarded; thrown operations fail the command",
  },
  deterministic: new Set(generationHashes).size === 1,
  generation1000: summarize(generationRaw),
  queue1000Attempts: summarize(queue.rawMs),
  history1000Attempts100Sessions: summarize(history.rawMs),
  playbackAdapter1000Starts: summarize(playbackRaw),
  resources: {
    lifecycleCountPerRun: RESOURCE_COUNT,
    runs: RESOURCE_RUNS,
    samples: resources,
    stopCount,
  },
};

console.log(JSON.stringify(output, null, 2));

function generationSeed(index: number): string {
  return `p5161-fixed-${index.toString().padStart(4, "0")}`;
}

function requireExercise(snapshot: GeneratorSnapshot) {
  const result = generateDegreeExercise(snapshot);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.exercise;
}

function createAttemptFixture(exercise: ReturnType<typeof requireExercise>): readonly PracticeAttempt[] {
  const ratings = ["again", "hard", "good", "easy"] as const;
  return Object.freeze(Array.from({ length: 1_000 }, (_, index) => {
    const sessionIndex = Math.floor(index / 10);
    const startedAt = new Date(Date.parse(CLOCK_DATE) + (index * 2_000)).toISOString();
    const completedAt = new Date(Date.parse(startedAt) + 1_000).toISOString();
    return createCompletedAttempt({
      id: `benchmark-attempt-${index.toString().padStart(4, "0")}`,
      sessionId: `benchmark-session-${sessionIndex.toString().padStart(3, "0")}`,
      startedAt,
      completedAt,
      listenCount: 1 + (index % 2),
      hintLevel: (index % 5) as 0 | 1 | 2 | 3 | 4,
      singSkipped: index % 11 === 0,
      singGateCompleted: index % 11 !== 0,
      rating: ratings[index % ratings.length],
      mainIssue: index % 3 === 0 ? "pitch" : index % 3 === 1 ? "rhythm" : "recall",
      exercise,
    });
  }));
}

function createSessionFixture(fixtureAttempts: readonly PracticeAttempt[]): readonly PracticeSession[] {
  return Object.freeze(Array.from({ length: 100 }, (_, index) => {
    const selected = fixtureAttempts.slice(index * 10, (index + 1) * 10);
    return Object.freeze({
      id: `benchmark-session-${index.toString().padStart(3, "0")}`,
      startedAt: selected[0].startedAt,
      completedAt: selected[selected.length - 1].completedAt,
      targetCount: 10,
      completedCount: 10,
      mode: "degree" as const,
      attemptIds: Object.freeze(selected.map(({ id }) => id)),
      abandoned: false,
    });
  }));
}

function createHistoryFile(
  fixtureAttempts: readonly PracticeAttempt[],
  fixtureSessions: readonly PracticeSession[],
): PracticeFileV1 {
  const empty = createEmptyPracticeFile(new Date(CLOCK_DATE));
  return Object.freeze({
    ...empty,
    exercises: Object.freeze([fixedExercise]),
    attempts: fixtureAttempts,
    sessions: fixtureSessions,
  });
}

function measureSync(runs: number, operation: () => unknown): { readonly rawMs: readonly number[] } {
  const rawMs: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    operation();
    rawMs.push(performance.now() - startedAt);
  }
  return { rawMs };
}

async function runPlaybackStarts(count: number): Promise<number> {
  const entries = Array.from({ length: count }, () => createSessionHarness());
  let elapsedMs = 0;
  for (const { session } of entries) {
    const startedAt = performance.now();
    await session.startListen();
    elapsedMs += performance.now() - startedAt;
  }
  for (const { session } of entries) {
    session.handleRouteLeave();
    session.dispose();
  }
  return elapsedMs;
}

async function runResourceLifecycle(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const { session } = createSessionHarness();
    await session.startListen();
    session.handleRouteLeave();
    session.dispose();
  }
}

function createSessionHarness(): { readonly session: DegreePracticeSession } {
  const driver: PlaybackAudioDriver = {
    async playChord() {},
    async playTimeline() {},
    async playNotes() {},
    stop() { stopCount += 1; },
  };
  const timer: DegreePracticeTimer = {
    set: () => 1,
    clear: () => undefined,
  };
  const controller = createPlaybackController(driver, () => 0);
  const session = new DegreePracticeSession({
    exercise: fixedExercise,
    singEnabled: true,
    controller,
    clock: { now: () => 0 },
    timer,
  });
  const configured = session.configure();
  if (!configured.ok) throw new Error(configured.error.message);
  return { session };
}

function summarize(rawMs: readonly number[]): RuntimeSummary {
  const sorted = [...rawMs].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return {
    rawMs,
    medianMs,
    p95Ms: sorted[Math.ceil(0.95 * sorted.length) - 1],
    maxMs: sorted[sorted.length - 1],
    timeoutCount: 0,
  };
}

function activeHandleCount(): number {
  return (process as ActiveHandleProcess)._getActiveHandles?.().length ?? 0;
}

function forceGc(): void {
  if (!globalThis.gc) {
    throw new Error("Run with --expose-gc so resource measurements are explicit.");
  }
  globalThis.gc();
}
