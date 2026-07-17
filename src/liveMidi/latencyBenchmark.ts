import { LIVE_CHORD_TIMING } from "../domain/liveMidi";

export interface LatencyPercentiles {
  p50Ms: number;
  p90Ms: number;
}

export interface LiveMidiLatencyBenchmark {
  model: "deterministic-injected-transport";
  injectedTransportMs: number;
  before: {
    notesAndBass: LatencyPercentiles;
    candidateGenerated: LatencyPercentiles;
    confirmedChord: LatencyPercentiles;
  };
  after: {
    notesAndBass: LatencyPercentiles;
    candidateGenerated: LatencyPercentiles;
    blockChordProvisional: LatencyPercentiles;
    confirmedChord: LatencyPercentiles;
    arpeggioFromLastNote: LatencyPercentiles;
    fullRelease: LatencyPercentiles;
  };
}

const LEGACY_TICK_MS = 40;
const LEGACY_STABLE_MS = 120;

export function benchmarkLiveMidiLatency(injectedTransportMs = 2): LiveMidiLatencyBenchmark {
  const legacyPhases = Array.from({ length: LEGACY_TICK_MS }, (_, phase) => (
    injectedTransportMs
    + Math.ceil((phase + LEGACY_STABLE_MS) / LEGACY_TICK_MS) * LEGACY_TICK_MS
    - phase
  ));
  const compactInputSpans = Array.from({ length: 400 }, (_, index) => index % 31);
  const immediate = summary(Array(400).fill(injectedTransportMs));

  return {
    model: "deterministic-injected-transport",
    injectedTransportMs,
    before: {
      notesAndBass: immediate,
      candidateGenerated: immediate,
      confirmedChord: summary(legacyPhases),
    },
    after: {
      notesAndBass: immediate,
      candidateGenerated: immediate,
      blockChordProvisional: summary(compactInputSpans.map((span) => (
        injectedTransportMs + Math.max(0, LIVE_CHORD_TIMING.gatherMs - span)
      ))),
      confirmedChord: summary(Array(400).fill(injectedTransportMs + LIVE_CHORD_TIMING.stableMs)),
      arpeggioFromLastNote: summary(Array(400).fill(injectedTransportMs + LIVE_CHORD_TIMING.stableMs)),
      fullRelease: summary(Array(400).fill(injectedTransportMs + LIVE_CHORD_TIMING.fullReleaseMs)),
    },
  };
}

function summary(values: readonly number[]): LatencyPercentiles {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50Ms: percentile(sorted, 0.5),
    p90Ms: percentile(sorted, 0.9),
  };
}

function percentile(sorted: readonly number[], quantile: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}
