import type { RhythmPracticeExercise } from "../domain";

export interface RhythmScheduledEvent { readonly kind: "count-in" | "click" | "target"; readonly beat: number; readonly index?: number; readonly accent: boolean; }
export interface RhythmPlaybackPlan { readonly countInBeats: number; readonly phraseBeats: number; readonly totalBeats: number; readonly events: readonly RhythmScheduledEvent[]; }

export function buildRhythmPlaybackPlan(exercise: RhythmPracticeExercise, options: { readonly metronomeEnabled: boolean }): RhythmPlaybackPlan {
  const beatsPerBar = exercise.meter.numerator;
  const countInBeats = exercise.generatorSnapshot.countInBars * beatsPerBar;
  const phraseBeats = exercise.generatorSnapshot.phraseBars * beatsPerBar;
  const events: RhythmScheduledEvent[] = [];
  for (let beat = 0; beat < countInBeats; beat += 1) events.push(Object.freeze({ kind: "count-in", beat, accent: beat % beatsPerBar === 0 }));
  if (options.metronomeEnabled) for (let beat = 0; beat < phraseBeats; beat += 1) events.push(Object.freeze({ kind: "click", beat: countInBeats + beat, accent: beat % beatsPerBar === 0 }));
  for (const target of exercise.targetEvents) events.push(Object.freeze({ kind: "target", beat: countInBeats + target.startBeat, index: target.index, accent: target.accent }));
  return Object.freeze({ countInBeats, phraseBeats, totalBeats: countInBeats + phraseBeats, events: Object.freeze(events.sort((left, right) => left.beat - right.beat || kindOrder(left.kind) - kindOrder(right.kind) || (left.index ?? -1) - (right.index ?? -1))) });
}

function kindOrder(kind: RhythmScheduledEvent["kind"]): number { return kind === "count-in" ? 0 : kind === "click" ? 1 : 2; }
