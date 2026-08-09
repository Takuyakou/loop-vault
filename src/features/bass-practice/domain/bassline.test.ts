import { describe, expect, it } from "vitest";
import { BASSLINE_GENERATOR_VERSION, generateBasslineExercise } from "./bassline";

const snapshot = (level: 1 | 2 | 3 = 2) => ({ generatorVersion: BASSLINE_GENERATOR_VERSION, seed: "bassline-test", source: "generated" as const, level, tempo: 100, meter: { numerator: 4 as const, denominator: 4 as const }, key: "C major", chords: [{ root: 2, label: "Dm7", startBeat: 0, durationBeats: 2 }, { root: 7, label: "G7", startBeat: 2, durationBeats: 2 }, { root: 0, bass: 4, label: "C/E", startBeat: 4, durationBeats: 4 }] });

describe("Bassline generator", () => {
  it("is deterministic, monophonic, range-safe, and honours slash bass", () => {
    const first = generateBasslineExercise(snapshot()); const second = generateBasslineExercise(snapshot());
    expect(first).toEqual(second); if (!first.ok) throw new Error(first.error.message);
    expect(first.exercise.targetEvents.every((event) => event.midiNote >= 28 && event.midiNote <= 55)).toBe(true);
    expect(first.exercise.targetEvents.every((event, index, all) => index === 0 || all[index - 1].startBeat + all[index - 1].durationBeats <= event.startBeat)).toBe(true);
    const slash = first.exercise.targetEvents.find((event) => event.chordIndex === 2); expect(slash).toBeDefined(); expect(slash!.midiNote % 12).toBe(4);
  });
  it("varies note vocabulary by level and rejects unsupported phrases", () => {
    const l1 = generateBasslineExercise(snapshot(1)); const l3 = generateBasslineExercise(snapshot(3));
    expect(l1.ok && l3.ok && l1.exercise.targetEvents.map((event) => event.midiNote)).not.toEqual(l3.ok ? l3.exercise.targetEvents.map((event) => event.midiNote) : []);
    expect(generateBasslineExercise({ ...snapshot(), chords: [] }).ok).toBe(false);
    expect(generateBasslineExercise({ ...snapshot(), chords: [{ root: 0, label: "C", startBeat: 0, durationBeats: 49 }] }).ok).toBe(false);
  });
});