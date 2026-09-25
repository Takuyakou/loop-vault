export interface TempoChangePoint {
  readonly tick: number;
  readonly bpm: number;
}

export type SmfTempoProvenance = "SMF_META" | "SMF_DEFAULT";

export interface MidiTempoDiagnostics {
  /** Runtime-only source fact; no Vault v2 field is added for this value. */
  readonly provenance?: SmfTempoProvenance;
  readonly effectiveTempoEventCount: number;
  readonly effectiveTempoSegmentCount: number;
  readonly rawMinBpm?: number;
  readonly rawMaxBpm?: number;
  readonly weightedP05Bpm?: number;
  readonly weightedMedianBpm?: number;
  readonly weightedP95Bpm?: number;
}

export interface MidiTempoAnalysis {
  readonly representativeBpm?: number;
  readonly diagnostics: MidiTempoDiagnostics;
}

interface WeightedTempo {
  readonly bpm: number;
  readonly durationSeconds: number;
}

const MIDI_DEFAULT_BPM = 120;

export function analyzeMidiTempo(input: {
  readonly tempoChanges: readonly TempoChangePoint[];
  readonly ticksPerBeat: number;
  readonly durationTick: number;
}): MidiTempoAnalysis {
  const valid = input.tempoChanges
    .map((change, index) => ({ change, index }))
    .filter(({ change }) => Number.isFinite(change.tick)
      && change.tick >= 0
      && Number.isFinite(change.bpm)
      && change.bpm > 0)
    .sort((left, right) => left.change.tick - right.change.tick || left.index - right.index);
  if (!valid.length) {
    return {
      ...(input.tempoChanges.length === 0 ? { representativeBpm: MIDI_DEFAULT_BPM } : {}),
      diagnostics: {
        provenance: input.tempoChanges.length === 0 ? "SMF_DEFAULT" : "SMF_META",
        effectiveTempoEventCount: 0,
        effectiveTempoSegmentCount: 0,
      },
    };
  }

  let rawMinBpm = Number.POSITIVE_INFINITY;
  let rawMaxBpm = Number.NEGATIVE_INFINITY;
  for (const { change } of valid) {
    if (change.bpm < rawMinBpm) rawMinBpm = change.bpm;
    if (change.bpm > rawMaxBpm) rawMaxBpm = change.bpm;
  }

  const endTick = Math.max(0, input.durationTick);
  const sameTickResolved: TempoChangePoint[] = [];
  for (const { change } of valid) {
    if (change.tick > endTick) continue;
    const last = sameTickResolved[sameTickResolved.length - 1];
    if (last?.tick === change.tick) {
      sameTickResolved[sameTickResolved.length - 1] = change;
    } else {
      sameTickResolved.push(change);
    }
  }
  if (!sameTickResolved.length) {
    return {
      diagnostics: {
        provenance: "SMF_META",
        effectiveTempoEventCount: 0,
        effectiveTempoSegmentCount: 0,
        rawMinBpm,
        rawMaxBpm,
      },
    };
  }

  const effectiveEvents: TempoChangePoint[] = [];
  for (const change of sameTickResolved) {
    if (change.tick >= endTick && endTick > 0) continue;
    const last = effectiveEvents[effectiveEvents.length - 1];
    if (last?.bpm === change.bpm) continue;
    effectiveEvents.push(change);
  }
  if (!effectiveEvents.length) {
    effectiveEvents.push(sameTickResolved[sameTickResolved.length - 1]!);
  }
  if (effectiveEvents.length === 1) {
    const bpm = effectiveEvents[0]!.bpm;
    const hasDuration = Number.isFinite(input.ticksPerBeat)
      && input.ticksPerBeat > 0
      && endTick > effectiveEvents[0]!.tick;
    return {
      representativeBpm: bpm,
      diagnostics: {
        provenance: "SMF_META",
        effectiveTempoEventCount: 1,
        effectiveTempoSegmentCount: hasDuration ? 1 : 0,
        rawMinBpm,
        rawMaxBpm,
        weightedP05Bpm: bpm,
        weightedMedianBpm: bpm,
        weightedP95Bpm: bpm,
      },
    };
  }

  const segmentEvents: TempoChangePoint[] = [];
  if (effectiveEvents[0]!.tick > 0 && endTick > 0) {
    segmentEvents.push({ tick: 0, bpm: MIDI_DEFAULT_BPM });
  }
  for (const event of effectiveEvents) {
    if (segmentEvents[segmentEvents.length - 1]?.bpm !== event.bpm) {
      segmentEvents.push(event);
    }
  }

  const weightedTempos: WeightedTempo[] = [];
  if (Number.isFinite(input.ticksPerBeat) && input.ticksPerBeat > 0 && endTick > 0) {
    for (let index = 0; index < segmentEvents.length; index += 1) {
      const event = segmentEvents[index]!;
      const nextTick = segmentEvents[index + 1]?.tick ?? endTick;
      const deltaTicks = Math.max(0, Math.min(endTick, nextTick) - event.tick);
      if (deltaTicks <= 0) continue;
      weightedTempos.push({
        bpm: event.bpm,
        durationSeconds: deltaTicks / input.ticksPerBeat * 60 / event.bpm,
      });
    }
  }

  const fallbackBpm = effectiveEvents[effectiveEvents.length - 1]!.bpm;
  const weightedP05Bpm = weightedPercentile(weightedTempos, 0.05) ?? fallbackBpm;
  const weightedMedianBpm = weightedPercentile(weightedTempos, 0.5) ?? fallbackBpm;
  const weightedP95Bpm = weightedPercentile(weightedTempos, 0.95) ?? fallbackBpm;
  return {
    representativeBpm: weightedMedianBpm,
    diagnostics: {
      provenance: "SMF_META",
      effectiveTempoEventCount: effectiveEvents.length,
      effectiveTempoSegmentCount: weightedTempos.length,
      rawMinBpm,
      rawMaxBpm,
      weightedP05Bpm,
      weightedMedianBpm,
      weightedP95Bpm,
    },
  };
}

export function hasRobustTempoVariation(
  diagnostics: MidiTempoDiagnostics | undefined,
): boolean {
  const low = diagnostics?.weightedP05Bpm;
  const high = diagnostics?.weightedP95Bpm;
  return low !== undefined
    && high !== undefined
    && low > 0
    && high / low >= 1.2;
}

function weightedPercentile(
  values: readonly WeightedTempo[],
  percentile: number,
): number | undefined {
  const ordered = values
    .filter((value) => Number.isFinite(value.bpm)
      && value.bpm > 0
      && Number.isFinite(value.durationSeconds)
      && value.durationSeconds > 0)
    .sort((left, right) => left.bpm - right.bpm);
  let totalSeconds = 0;
  for (const value of ordered) totalSeconds += value.durationSeconds;
  if (totalSeconds <= 0) return undefined;
  const targetSeconds = Math.min(1, Math.max(0, percentile)) * totalSeconds;
  let elapsedSeconds = 0;
  for (const value of ordered) {
    elapsedSeconds += value.durationSeconds;
    if (elapsedSeconds >= targetSeconds) return value.bpm;
  }
  return ordered[ordered.length - 1]?.bpm;
}
