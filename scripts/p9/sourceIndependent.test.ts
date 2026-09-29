import { describe, expect, it } from "vitest";
import type { TimedNote } from "../../src/domain/midi/types";
import { selectSourceNotes } from "./sourceIndependent";

const note = (pitch: number, startTick: number, durationTick: number): TimedNote => ({
  pitch, startTick, durationTick, velocity: 80, trackIndex: 0, channel: 0,
});

describe("P9.1 identity-independent source selection", () => {
  it("selects a one-beat passing chord without a global duration cutoff", () => {
    const source = [note(48, 0, 480), note(52, 0, 480), note(55, 0, 480),
      note(50, 480, 240), note(53, 480, 240), note(57, 480, 240)];
    const passing = selectSourceNotes(source, 480, { startBeat: 1, endBeat: 1.5 }, [], "onset-support");
    expect(passing.midiNotes).toEqual([50, 53, 57]);
  });

  it("includes sustained support already sounding at the selected onset", () => {
    const source = [note(36, 0, 960), note(60, 480, 480), note(64, 480, 480)];
    const result = selectSourceNotes(source, 480, { startBeat: 1, endBeat: 2 }, [], "onset-support");
    expect(result.midiNotes).toEqual([36, 60, 64]);
    expect(result.bassNote).toBe(36);
  });

  it("does not accept identity, analyzer candidates, scores, or ranks", () => {
    const source = [note(48, 0, 480), note(52, 0, 480), note(55, 0, 480)];
    expect(selectSourceNotes(source, 480, { startBeat: 0, endBeat: 1 }, [], "densest").midiNotes)
      .toEqual([48, 52, 55]);
  });

  it("ignores percussion and invalid windows", () => {
    const source = [note(48, 0, 480), { ...note(36, 0, 480), channel: 9 }];
    expect(selectSourceNotes(source, 480, { startBeat: 0, endBeat: 1 }, [], "densest").midiNotes)
      .toEqual([]);
    expect(selectSourceNotes(source, 480, { startBeat: 1, endBeat: 1 }, [], "densest").midiNotes)
      .toEqual([]);
  });
});
