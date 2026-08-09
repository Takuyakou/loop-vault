import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { makeChordSymbol } from "../src/domain/chords";
import type { SavedProgressionBlock } from "../src/domain/types";
import {
  buildChordContextPlaybackPlan,
  createChordContextPlaybackEngine,
  type ChordContextListenInput,
  type ChordContextPlaybackDriver,
  type ChordContextPlayer,
} from "../src/features/bass-practice/application/chordContextPlayback";
import {
  BASSLINE_PROGRESSION_PRESETS,
  buildBasslinePresetSnapshot,
} from "../src/features/bass-practice/domain/progressionPresets";
import {
  buildVaultChordContextSnapshot,
  type ChordContextSnapshot,
} from "../src/features/bass-practice/domain/chordContextSnapshot";
import { createChordContextBasslineExercise } from "../src/features/bass-practice/domain/vaultBassline";

const WARMUP_SWITCHES = 200;
const TIMED_SWITCHES = 1_000;
const TIMED_RUNS = 7;
const RESOURCE_SWITCHES = 20;
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
  stopCount: number;
  disposeCount: number;
}

const snapshots = createSnapshots();
const inputs = snapshots.map(createPlaybackInput);

for (let index = 0; index < WARMUP_SWITCHES; index += 1) {
  requireSourceSwitch(index);
}

const rawMs: number[] = [];
const hashes: string[] = [];
for (let run = 0; run < TIMED_RUNS; run += 1) {
  const hash = createHash("sha256");
  const startedAt = performance.now();
  for (let index = 0; index < TIMED_SWITCHES; index += 1) {
    const record = requireSourceSwitch(index);
    hash.update(JSON.stringify(record));
    hash.update("\n");
  }
  rawMs.push(performance.now() - startedAt);
  hashes.push(hash.digest("hex"));
}

const resources = Array.from({ length: RESOURCE_RUNS }, () => runResourceSwitchCycle());
if (new Set(hashes).size !== 1) throw new Error("P5.18.1 source switch sequence is not deterministic.");
if (resources.some((sample) => sample.activeHandleDelta !== 0 || sample.retainedPlayers !== 0)) {
  throw new Error("P5.18.1 source switch benchmark retained resources.");
}

console.log(JSON.stringify({
  schemaVersion: 1,
  command: "npm run benchmark:p5181",
  scope: "Deterministic preset/Vault source derivation plus Chord Context engine replacement using a fake driver. UI source transaction and Tone/Web Audio resource safety are covered separately by production E2E and lifecycle tests.",
  warmup: { sourceSwitches: WARMUP_SWITCHES },
  sourceSet: {
    presetCount: BASSLINE_PROGRESSION_PRESETS.length,
    vaultSection: "bars:1-12",
    sourceCount: snapshots.length,
  },
  deterministic: true,
  orderedSequence: {
    switchesPerRun: TIMED_SWITCHES,
    sha256PerRun: hashes,
  },
  sourceSwitches1000: summarize(rawMs),
  resourceGate: {
    switchCountPerRun: RESOURCE_SWITCHES,
    runs: RESOURCE_RUNS,
    required: ["active-handle delta 0", "each fake player stopped exactly once", "each fake player disposed exactly once"],
    samples: resources,
  },
}, null, 2));

function createSnapshots(): readonly ChordContextSnapshot[] {
  const presets = BASSLINE_PROGRESSION_PRESETS.map((preset) => {
    const result = buildBasslinePresetSnapshot({ presetId: preset.id });
    if (!result.ok) throw new Error(result.error.message);
    return result.snapshot;
  });
  const vault = buildVaultChordContextSnapshot({
    sourceReference: { ideaId: "benchmark-vault-idea", blockId: "benchmark-vault-block" },
    block: completeVaultBlock(),
    sectionId: "bars:1-12",
  });
  if (!vault.ok) throw new Error(vault.error.message);
  return Object.freeze([...presets, vault.snapshot]);
}

function completeVaultBlock(): SavedProgressionBlock {
  return {
    id: "benchmark-vault-block",
    summaryText: "Benchmark progression",
    detectedKey: "C major",
    bpm: 96,
    timeSignature: "4/4",
    chords: Array.from({ length: 12 }, (_, index) => ({
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord: makeChordSymbol(index % 4 === 3 ? 7 : 0, index % 4 === 3 ? "dom7" : "maj7"),
      confidence: 1,
      alternatives: [],
      warnings: [],
    })),
    tags: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    analyzerVersion: "benchmark",
  };
}

function createPlaybackInput(snapshot: ChordContextSnapshot): ChordContextListenInput {
  return Object.freeze({
    mode: "listen",
    listenMode: "bass-and-chords",
    bpm: snapshot.originalBpm,
    meter: snapshot.meter,
    countInBeats: 4,
    chordEvents: Object.freeze(snapshot.section.chords.map((chord) => Object.freeze({
      id: chord.id,
      chord: makeChordSymbol(chord.root, chord.quality, [...chord.tensions], chord.bass),
      startBeat: chord.startBeat,
      durationBeats: chord.durationBeats,
    }))),
    bassEvents: Object.freeze(snapshot.section.chords.map((chord) => Object.freeze({
      id: `bass:${chord.id}`,
      pitch: 36 + (chord.root % 12),
      startBeat: chord.startBeat,
      durationBeats: 1,
      velocity: 0.8,
    }))),
  });
}

function requireSourceSwitch(index: number) {
  const snapshot = snapshots[index % snapshots.length]!;
  const exercise = createChordContextBasslineExercise(snapshot, 2);
  if (!exercise.ok) throw new Error(exercise.error.message);
  const plan = buildChordContextPlaybackPlan(inputs[index % inputs.length]!);
  if (!plan.ok) throw new Error(plan.error.message);
  return {
    signature: snapshot.signature,
    source: snapshot.source.kind,
    exercise: exercise.exercise.generatorSnapshot,
    plan: plan.plan,
  };
}

function runResourceSwitchCycle() {
  forceGc();
  const handlesBefore = activeHandleCount();
  const probes: PlayerProbe[] = [];
  const driver: ChordContextPlaybackDriver = {
    createPlayer(): ChordContextPlayer {
      const probe: PlayerProbe = { stopCount: 0, disposeCount: 0 };
      probes.push(probe);
      return {
        schedule() {},
        stop() { probe.stopCount += 1; },
        dispose() { probe.disposeCount += 1; },
      };
    },
  };
  const engine = createChordContextPlaybackEngine(driver);
  for (let index = 0; index < RESOURCE_SWITCHES; index += 1) {
    const result = engine.start(inputs[index % inputs.length]!);
    if (!result.ok) throw new Error(result.error.message);
  }
  engine.dispose();
  forceGc();
  const retainedPlayers = probes.filter((probe) => probe.stopCount !== 1 || probe.disposeCount !== 1).length;
  if (retainedPlayers !== 0) {
    throw new Error(`P5.18.1 fake-player lifecycle failed: retained=${retainedPlayers}.`);
  }
  return {
    activeHandleDelta: activeHandleCount() - handlesBefore,
    createdPlayers: probes.length,
    retainedPlayers,
    stopCount: probes.reduce((total, probe) => total + probe.stopCount, 0),
    disposeCount: probes.reduce((total, probe) => total + probe.disposeCount, 0),
  };
}

function summarize(values: readonly number[]): RuntimeSummary {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    rawMs: values,
    medianMs: sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!,
    p95Ms: sorted[Math.ceil(0.95 * sorted.length) - 1]!,
    maxMs: sorted[sorted.length - 1]!,
    timeoutCount: 0,
  };
}

function activeHandleCount(): number {
  const getActiveHandles = (process as ActiveHandleProcess)._getActiveHandles;
  if (typeof getActiveHandles !== "function") throw new Error("Active-handle measurement is unavailable.");
  return getActiveHandles.call(process).length;
}

function forceGc(): void {
  if (!globalThis.gc) throw new Error("Run the P5.18.1 benchmark through npm run benchmark:p5181 so --expose-gc is enabled.");
  globalThis.gc();
}