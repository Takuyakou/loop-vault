import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import { createLiveChordHistoryState, updateLiveChordHistory } from "./chordHistory";
import { createLiveChordStabilizerState, stabilizeLiveChord } from "./chordStabilizer";
import { emptyLiveChordDetection } from "./liveChordDetector";
import type { LiveChordDetection } from "./types";

function chord(label: "C" | "Cm", notes: number[]): LiveChordDetection {
  const symbol = makeChordSymbol(0, label === "C" ? "maj" : "min");
  return { kind: "chord", chord: symbol, alternatives: [], label: symbol.label, notes, noteNames: [], bass: notes[0] };
}

describe("stabilizeLiveChord", () => {
  it("shows a block chord after the stable interval", () => {
    const candidate = chord("C", [60, 64, 67]);
    let state = stabilizeLiveChord(createLiveChordStabilizerState(), candidate, 0);
    expect(state.displayed.kind).toBe("empty");
    state = stabilizeLiveChord(state, candidate, 120);
    expect(state.displayed.label).toBe("C");
  });

  it("gathers an added arpeggio note quickly", () => {
    const partial = chord("C", [60, 64, 67]);
    let state = { displayed: partial };
    const extended = chord("C", [60, 64, 67, 72]);
    state = stabilizeLiveChord(state, extended, 100);
    state = stabilizeLiveChord(state, extended, 180);
    expect(state.displayed.notes).toEqual(extended.notes);
  });

  it("holds a released subset for the release grace period", () => {
    const full = chord("C", [60, 64, 67]);
    const subset: LiveChordDetection = { kind: "notes", alternatives: [], label: "C · E", notes: [60, 64], noteNames: ["C", "E"] };
    let state = stabilizeLiveChord({ displayed: full }, subset, 0);
    state = stabilizeLiveChord(state, subset, 249);
    expect(state.displayed.label).toBe("C");
    state = stabilizeLiveChord(state, subset, 250);
    expect(state.displayed.kind).toBe("notes");
  });

  it("clears within 300ms after full release", () => {
    const full = chord("C", [60, 64, 67]);
    let state = stabilizeLiveChord({ displayed: full }, emptyLiveChordDetection(), 0);
    state = stabilizeLiveChord(state, emptyLiveChordDetection(), 300);
    expect(state.displayed.kind).toBe("empty");
  });
});

describe("live chord history", () => {
  it("commits after 400ms and suppresses adjacent duplicates", () => {
    const displayed = chord("C", [60, 64, 67]);
    let state = updateLiveChordHistory(createLiveChordHistoryState(), displayed, 0, "1");
    state = updateLiveChordHistory(state, displayed, 399, "1");
    expect(state.entries).toHaveLength(0);
    state = updateLiveChordHistory(state, displayed, 400, "1");
    expect(state.entries.map((entry) => entry.label)).toEqual(["C"]);
    state = updateLiveChordHistory(state, displayed, 900, "2");
    expect(state.entries).toHaveLength(1);
  });

  it("keeps only the latest 64 entries", () => {
    let state = createLiveChordHistoryState();
    for (let index = 0; index < 70; index += 1) {
      const displayed = chord(index % 2 === 0 ? "C" : "Cm", [60, index % 2 === 0 ? 64 : 63, 67]);
      state = updateLiveChordHistory(state, displayed, index * 500, `${index}`);
      state = updateLiveChordHistory(state, displayed, index * 500 + 400, `${index}`);
    }
    expect(state.entries).toHaveLength(64);
    expect(state.entries[0].id).toBe("6");
  });
});
