export const LIVE_MIDI_LATENCY_STAGES = [
  "rustMidiReceived",
  "rustBatchEmitted",
  "frontendBatchReceived",
  "noteStateUpdated",
  "provisionalCandidateGenerated",
  "provisionalChordDisplayed",
  "confirmedChordDisplayed",
] as const;

export type LiveMidiLatencyStage = typeof LIVE_MIDI_LATENCY_STAGES[number];

export interface LiveMidiLatencySummary {
  count: number;
  p50Ms?: number;
  p90Ms?: number;
}

export type LiveMidiLatencyReport = Record<LiveMidiLatencyStage, LiveMidiLatencySummary>;

const MAX_SAMPLES_PER_STAGE = 256;

export class LiveMidiLatencyTracker {
  private readonly samples = new Map<LiveMidiLatencyStage, number[]>();

  record(stage: LiveMidiLatencyStage, latencyMs: number): void {
    if (!Number.isFinite(latencyMs)) return;
    const samples = this.samples.get(stage) ?? [];
    samples.push(Math.max(0, latencyMs));
    if (samples.length > MAX_SAMPLES_PER_STAGE) samples.shift();
    this.samples.set(stage, samples);
  }

  report(): LiveMidiLatencyReport {
    return Object.fromEntries(LIVE_MIDI_LATENCY_STAGES.map((stage) => {
      const samples = [...(this.samples.get(stage) ?? [])].sort((left, right) => left - right);
      return [stage, summarize(samples)];
    })) as LiveMidiLatencyReport;
  }

  reset(): void {
    this.samples.clear();
  }
}

function summarize(sorted: readonly number[]): LiveMidiLatencySummary {
  if (sorted.length === 0) return { count: 0 };
  return {
    count: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p90Ms: percentile(sorted, 0.9),
  };
}

function percentile(sorted: readonly number[], quantile: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}
