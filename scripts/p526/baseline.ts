import { analyzeMidi } from "../../src/domain/midi/analysis";
import { runP524ConsolidationPipeline } from "../../src/domain/midi/harmonicState/fragmentConsolidatorCore";
import type { ChordSymbol, ChordTimelineItem } from "../../src/domain/types";
import { buildP526EightBarPreparedData } from "./fixtures";

export interface P526StructuredState {
  readonly bar: number;
  readonly startBeat: number;
  readonly endBeat: number;
  readonly chord: ChordSymbol;
}

export const p526SyntheticMidiHeader = new Uint8Array([0x4d, 0x54, 0x68, 0x64]);

export const p526CurrentStructuredSnapshot: readonly P526StructuredState[] = [
  state(1, 0, 4, chord(4, "sixNine", [], undefined, "E6/9")),
  state(2, 4, 6, chord(8, "dom7", [], undefined, "Ab7")),
  state(2, 6, 8, chord(6, "dim7", [], undefined, "F#dim7")),
  state(3, 8, 10, chord(1, "min9", [], undefined, "C#m9")),
  state(3, 10, 12, chord(0, "maj7", [], undefined, "Cmaj7")),
  state(4, 12, 14, chord(11, "min9", [], undefined, "Bm9")),
  state(4, 14, 16, chord(4, "dom13", [], undefined, "E13")),
  state(5, 16, 18, chord(9, "maj9", [], undefined, "Amaj9")),
  state(5, 18, 20, chord(9, "maj9", [], 8, "Amaj9/Ab")),
  state(6, 20, 22, chord(9, "min6", [], undefined, "Am6")),
  state(6, 22, 24, chord(6, "min7b5", [], undefined, "F#m7b5")),
  state(7, 24, 26, chord(4, "maj", [], 8, "E/Ab")),
  state(7, 26, 28, chord(1, "dom7", [], undefined, "C#7")),
  state(8, 28, 30, chord(6, "min9", [], undefined, "F#m9")),
  state(8, 30, 32, chord(9, "maj9", [], 11, "Amaj9/B")),
] as const;

export function captureP526CurrentActual(): readonly P526StructuredState[] {
  const analysis = analyzeMidi(p526SyntheticMidiHeader, {
    preparedData: buildP526EightBarPreparedData(),
    mode: "phase4-v1",
  });
  return analysis.fullTimeline.map(structuredStateFromTimeline);
}

export function deriveP526FallbackEvidence() {
  const prepared = buildP526EightBarPreparedData();
  const pipeline = runP524ConsolidationPipeline({
    notes: prepared.notes.map((note, index) => ({
      id: `p526-baseline-${String(index + 1).padStart(4, "0")}`,
      pitch: note.pitch,
      startBeat: note.startTick / prepared.ticksPerBeat,
      durationBeats: note.durationTick / prepared.ticksPerBeat,
      velocity: note.velocity,
      rolePrior: note.trackIndex === 0 ? "bass" as const : "upper" as const,
    })),
    meter: [4, 4],
    totalBeats: prepared.totalBars * 4,
  });
  return {
    harmonicRhythmStatus: pipeline.harmonicRhythm?.status,
    harmonicRhythmReason: pipeline.harmonicRhythm?.reason,
    consolidationStatus: pipeline.result.status,
    consolidationReason: pipeline.result.status === "unavailable" ? pipeline.result.reason : undefined,
    legacyFallback: pipeline.result.legacyFallback,
  } as const;
}

export function stateCountsByBar(states: readonly Pick<P526StructuredState, "bar">[], bars = 8): readonly number[] {
  return Array.from({ length: bars }, (_, index) => states.filter((state) => state.bar === index + 1).length);
}

export function buildP526DenseMixedPreparedData(repetitions = 16) {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 32) {
    throw new Error("P5.26 dense repetitions must be 1..32");
  }
  const source = buildP526EightBarPreparedData();
  const ticksPerRepetition = 32 * source.ticksPerBeat;
  return {
    ...source,
    totalBars: source.totalBars * repetitions,
    notes: Array.from({ length: repetitions }, (_, repetition) => source.notes.map((note) => ({
      ...note,
      startTick: note.startTick + repetition * ticksPerRepetition,
    }))).flat(),
  };
}

function structuredStateFromTimeline(item: ChordTimelineItem): P526StructuredState {
  const startBeat = (item.bar - 1) * 4 + item.beat - 1;
  return { bar: item.bar, startBeat, endBeat: startBeat + item.durationBeats, chord: structuredClone(item.chord) };
}

function state(bar: number, startBeat: number, endBeat: number, chordValue: ChordSymbol): P526StructuredState {
  return { bar, startBeat, endBeat, chord: chordValue };
}

function chord(
  root: number,
  quality: ChordSymbol["quality"],
  tensions: ChordSymbol["tensions"],
  bass: number | undefined,
  label: string,
): ChordSymbol {
  return { root, quality, tensions: [...tensions], ...(bass === undefined ? {} : { bass }), label };
}
