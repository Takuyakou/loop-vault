import { describe, expect, it } from "vitest";
import { createLiveNoteState } from "./noteState";
import { reduceLiveNoteState } from "./noteStateReducer";
import { detectLiveChord } from "./liveChordDetector";

function detect(notes: number[]) {
  const state = notes.reduce((current, note, index) => reduceLiveNoteState(current, {
    timestampMs: index * 10, status: 0x90, channel: 0, data1: note, data2: 100,
  }), createLiveNoteState());
  return detectLiveChord(state);
}

describe("detectLiveChord", () => {
  it.each([
    [[60, 64, 67], "C"],
    [[60, 63, 67], "Cm"],
    [[60, 64, 67, 70], "C7"],
    [[60, 64, 67, 71], "Cmaj7"],
    [[60, 63, 67, 70], "Cm7"],
    [[60, 65, 67], "Csus4"],
    [[60, 64, 67, 62], "Cadd9"],
  ])("detects %s as %s", (notes, label) => {
    expect(detect(notes as number[]).label).toBe(label);
  });

  it("adds a slash bass for an inversion", () => {
    expect(detect([52, 60, 67]).label).toBe("C/E");
  });

  it("shows note names instead of inventing a chord for two notes", () => {
    const result = detect([60, 67]);
    expect(result.kind).toBe("notes");
    expect(result.label).toBe("C · G");
  });

  it("returns an empty marker for no notes", () => {
    expect(detect([])).toMatchObject({ kind: "empty", label: "—" });
  });
});
