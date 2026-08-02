import { describe, expect, it } from "vitest";
import { generateRhythmExercise, RHYTHM_GENERATOR_VERSION } from "../domain";
import { buildRhythmPlaybackPlan } from "./rhythmPlayback";

function exercise() {
  const result = generateRhythmExercise({ generatorVersion: RHYTHM_GENERATOR_VERSION, seed: "playback", vocabularyId: "offbeat-eighth", tempo: 90, meter: { numerator: 3, denominator: 4 }, phraseBars: 2, startPositionBeats: 1, countInBars: 2, listenLimit: 2 });
  if (!result.ok) throw new Error(result.error.message);
  return result.exercise;
}

describe("Rhythm playback plan", () => {
  it("uses one immutable beat timeline for count-in, click, target and visual playhead", () => {
    const plan = buildRhythmPlaybackPlan(exercise(), { metronomeEnabled: true });
    expect(plan).toMatchObject({ countInBeats: 6, phraseBeats: 6, totalBeats: 12 });
    expect(plan.events.filter((event) => event.kind === "count-in")).toHaveLength(6);
    expect(plan.events.filter((event) => event.kind === "click")).toHaveLength(6);
    expect(plan.events.filter((event) => event.kind === "target").map((event) => event.beat)).toEqual([7, 8.5, 9.5, 10.5]);
    expect(plan.events.every((event, index) => index === 0 || event.beat >= plan.events[index - 1]!.beat)).toBe(true);
  });

  it("keeps count-in audible while disabling only phrase clicks", () => {
    const plan = buildRhythmPlaybackPlan(exercise(), { metronomeEnabled: false });
    expect(plan.events.filter((event) => event.kind === "count-in")).toHaveLength(6);
    expect(plan.events.filter((event) => event.kind === "click")).toHaveLength(0);
  });
});
