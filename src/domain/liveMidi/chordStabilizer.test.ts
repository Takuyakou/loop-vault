import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import {
  createLiveChordHistoryState,
  liveChordHistoryDeadline,
  updateLiveChordHistory,
} from "./chordHistory";
import { createLiveChordStabilizerState, stabilizeLiveChord } from "./chordStabilizer";
import { emptyLiveChordDetection } from "./liveChordDetector";
import type { LiveChordDetection } from "./types";

function chord(label: "C" | "Cm", notes: number[]): LiveChordDetection {
  const symbol = makeChordSymbol(0, label === "C" ? "maj" : "min");
  return { kind: "chord", chord: symbol, alternatives: [], label: symbol.label, notes, noteNames: [], bass: notes[0] };
}

describe("stabilizeLiveChord", () => {
  it("shows a high-confidence block chord provisionally, then confirms it", () => {
    const candidate = chord("C", [60, 64, 67]);
    let state = stabilizeLiveChord(createLiveChordStabilizerState(), candidate, 0, 40);
    expect(state.confirmed.kind).toBe("empty");
    expect(state.nextDeadlineMs).toBe(40);
    state = stabilizeLiveChord(state, candidate, 40, 40);
    expect(state.provisional?.label).toBe("C");
    expect(state.confirmed.kind).toBe("empty");
    expect(state.nextDeadlineMs).toBe(50);
    state = stabilizeLiveChord(state, candidate, 50, 40);
    expect(state.provisional).toBeUndefined();
    expect(state.confirmed.label).toBe("C");
  });

  it("gathers an added arpeggio note quickly", () => {
    const partial = chord("C", [60, 64, 67]);
    let state = { confirmed: partial };
    const extended = chord("C", [60, 64, 67, 72]);
    state = stabilizeLiveChord(state, extended, 100);
    state = stabilizeLiveChord(state, extended, 140);
    expect(state.confirmed.notes).toEqual(extended.notes);
  });

  it("confirms an 80ms arpeggio within 50ms of its final note without provisional display", () => {
    const candidate = chord("C", [60, 64, 67]);
    let state = stabilizeLiveChord(createLiveChordStabilizerState(), candidate, 80);
    expect(state.provisional).toBeUndefined();
    expect(state.nextDeadlineMs).toBe(130);
    state = stabilizeLiveChord(state, candidate, 130);
    expect(state.confirmed.label).toBe("C");
  });

  it("does not display a short passing-tone extension", () => {
    const current = chord("C", [60, 64, 67]);
    const passing = chord("C", [60, 62, 64, 67]);
    let state = stabilizeLiveChord({ confirmed: current }, passing, 100);
    expect(state.provisional).toBeUndefined();
    expect(state.nextDeadlineMs).toBe(140);
    state = stabilizeLiveChord(state, current, 120);
    expect(state.confirmed.label).toBe("C");
    expect(state.confirmed.notes).toEqual(current.notes);
    expect(state.nextDeadlineMs).toBeUndefined();
  });

  it("holds a released subset for the release grace period", () => {
    const full = chord("C", [60, 64, 67]);
    const subset: LiveChordDetection = { kind: "notes", alternatives: [], label: "C · E", notes: [60, 64], noteNames: ["C", "E"] };
    let state = stabilizeLiveChord({ confirmed: full }, subset, 0);
    state = stabilizeLiveChord(state, subset, 199);
    expect(state.confirmed.label).toBe("C");
    state = stabilizeLiveChord(state, subset, 200);
    expect(state.confirmed.kind).toBe("notes");
  });

  it("clears within 180ms after full release", () => {
    const full = chord("C", [60, 64, 67]);
    let state = stabilizeLiveChord({ confirmed: full }, emptyLiveChordDetection(), 0);
    state = stabilizeLiveChord(state, emptyLiveChordDetection(), 179);
    expect(state.confirmed.label).toBe("C");
    state = stabilizeLiveChord(state, emptyLiveChordDetection(), 180);
    expect(state.confirmed.kind).toBe("empty");
  });

  it("uses the stable deadline for a root change", () => {
    const current = chord("C", [60, 64, 67]);
    const next = { ...chord("C", [62, 66, 69]), chord: makeChordSymbol(2, "maj"), label: "D" };
    let state = stabilizeLiveChord({ confirmed: current }, next, 100);
    expect(state.nextDeadlineMs).toBe(150);
    state = stabilizeLiveChord(state, next, 150);
    expect(state.confirmed.label).toBe("D");
  });

  it("uses the stable deadline for a bass inversion change", () => {
    const current = chord("C", [60, 64, 67]);
    const inversion: LiveChordDetection = {
      ...current,
      chord: makeChordSymbol(0, "maj", [], 4),
      label: "C/E",
      bass: 64,
    };
    let state = stabilizeLiveChord({ confirmed: current }, inversion, 200);
    state = stabilizeLiveChord(state, inversion, 249);
    expect(state.confirmed.label).toBe("C");
    state = stabilizeLiveChord(state, inversion, 250);
    expect(state.confirmed.label).toBe("C/E");
  });

  it("is deterministic for the same candidate timeline", () => {
    const candidate = chord("C", [60, 64, 67]);
    const run = () => [0, 40, 50].reduce(
      (state, timestamp) => stabilizeLiveChord(state, candidate, timestamp, 40),
      createLiveChordStabilizerState(),
    );
    expect(run()).toEqual(run());
  });
});

describe("live chord history", () => {
  it("commits after 400ms and suppresses adjacent duplicates", () => {
    const displayed = chord("C", [60, 64, 67]);
    let state = updateLiveChordHistory(createLiveChordHistoryState(), displayed, 0, "1");
    expect(liveChordHistoryDeadline(state)).toBe(400);
    state = updateLiveChordHistory(state, displayed, 399, "1");
    expect(state.entries).toHaveLength(0);
    state = updateLiveChordHistory(state, displayed, 400, "1");
    expect(state.entries.map((entry) => entry.label)).toEqual(["C"]);
    expect(liveChordHistoryDeadline(state)).toBeUndefined();
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
