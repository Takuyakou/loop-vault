import type { MidiSongData, MidiTempoChange } from "./types";

export function beatsPerBar(timeSignature?: string | readonly [number, number]): number {
  const [numerator, denominator] = typeof timeSignature === "string"
    ? timeSignature.split("/").map(Number)
    : timeSignature ?? [4, 4];
  if (!Number.isFinite(numerator) || numerator <= 0 || !Number.isFinite(denominator) || denominator <= 0) {
    return 4;
  }
  return numerator * 4 / denominator;
}

export function tickToSeconds(
  data: Pick<MidiSongData, "ticksPerBeat" | "tempoChanges">,
  targetTick: number,
): number {
  if (!Number.isFinite(data.ticksPerBeat) || data.ticksPerBeat <= 0) {
    throw new Error("ticksPerBeat must be a positive number");
  }
  const endTick = Math.max(0, targetTick);
  const changes = orderedTempoChanges(data.tempoChanges ?? []);
  let bpm = 120;
  let tick = 0;
  let seconds = 0;

  for (const change of changes) {
    if (change.tick > endTick) {
      break;
    }
    if (change.tick > tick) {
      seconds += ticksToSeconds(change.tick - tick, data.ticksPerBeat, bpm);
      tick = change.tick;
    }
    bpm = change.bpm;
  }

  return seconds + ticksToSeconds(endTick - tick, data.ticksPerBeat, bpm);
}

function orderedTempoChanges(changes: readonly MidiTempoChange[]): MidiTempoChange[] {
  return changes
    .map((change, index) => ({ change, index }))
    .filter(({ change }) => Number.isFinite(change.tick) && change.tick >= 0 && Number.isFinite(change.bpm) && change.bpm > 0)
    .sort((a, b) => a.change.tick - b.change.tick || a.index - b.index)
    .map(({ change }) => change);
}

function ticksToSeconds(ticks: number, ticksPerBeat: number, bpm: number): number {
  return ticks / ticksPerBeat * 60 / bpm;
}
