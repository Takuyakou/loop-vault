import { describe, expect, it } from "vitest";
import { createLiveNoteState } from "./noteState";
import { reduceLiveNoteState } from "./noteStateReducer";
import { detectLiveChord } from "./liveChordDetector";
import { provisionalChordReadyAt } from "./provisionalChord";
import type { LiveMidiDomainEvent, LiveNoteState } from "./types";

function noteOn(note: number, timestampMs: number): LiveMidiDomainEvent {
  return { timestampMs, status: 0x90, channel: 0, data1: note, data2: 100 };
}

function buildState(notes: readonly (readonly [number, number])[]): LiveNoteState {
  return notes.reduce(
    (state, [note, timestampMs]) => reduceLiveNoteState(state, noteOn(note, timestampMs)),
    createLiveNoteState(),
  );
}

describe("provisionalChordReadyAt", () => {
  it.each([
    [[[60, 0], [64, 0], [67, 0]], 40],
    [[[60, 0], [64, 5], [67, 10], [71, 15]], 40],
    [[[60, 0], [64, 15], [67, 30]], 40],
  ] as const)("accepts compact block input %j", (notes, readyAtMs) => {
    const state = buildState(notes);
    const detection = detectLiveChord(state);

    expect(detection.kind).toBe("chord");
    expect(detection.scoreMargin).toBeGreaterThanOrEqual(0.03);
    expect(provisionalChordReadyAt(state, detection)).toBe(readyAtMs);
  });

  it("does not fast-show an 80ms arpeggio", () => {
    const state = buildState([[60, 0], [64, 40], [67, 80]]);
    expect(provisionalChordReadyAt(state, detectLiveChord(state))).toBeUndefined();
  });

  it("requires a sufficient Top-1 score margin", () => {
    const state = buildState([[60, 0], [64, 0], [67, 0]]);
    const detection = { ...detectLiveChord(state), scoreMargin: 0.029 };
    expect(provisionalChordReadyAt(state, detection)).toBeUndefined();
  });

  it("avoids fast display while sustained notes extend the held set", () => {
    let state = buildState([[60, 0], [64, 0], [67, 0]]);
    state = reduceLiveNoteState(state, { timestampMs: 10, status: 0xb0, channel: 0, data1: 64, data2: 127 });
    state = reduceLiveNoteState(state, { timestampMs: 20, status: 0x80, channel: 0, data1: 67, data2: 0 });

    expect(provisionalChordReadyAt(state, detectLiveChord(state))).toBeUndefined();
  });
});
