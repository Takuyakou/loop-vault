import { describe, expect, it } from "vitest";
import { detectLiveBass } from "./liveBass";
import { createLiveNoteState, heldNotes, soundingNotes, sustainedNotes } from "./noteState";
import { reduceLiveNoteState } from "./noteStateReducer";
import type { LiveMidiDomainEvent, LiveNoteState } from "./types";

const event = (status: number, channel: number, data1: number, data2: number, timestampMs = 0): LiveMidiDomainEvent => ({
  status, channel, data1, data2, timestampMs,
});
const apply = (state: LiveNoteState, ...events: LiveMidiDomainEvent[]) => events.reduce(reduceLiveNoteState, state);

describe("live MIDI note state", () => {
  it("handles note-on, note-off, and note-on velocity zero", () => {
    let state = apply(createLiveNoteState(), event(0x90, 0, 60, 100));
    expect(soundingNotes(state)).toEqual([60]);
    state = apply(state, event(0x90, 0, 60, 0));
    expect(soundingNotes(state)).toEqual([]);
  });

  it("counts duplicate note-ons before removing a note", () => {
    let state = apply(createLiveNoteState(), event(0x90, 0, 60, 90), event(0x90, 0, 60, 100));
    expect(state.held.get("0:60")?.count).toBe(2);
    state = apply(state, event(0x80, 0, 60, 0));
    expect(state.held.get("0:60")?.count).toBe(1);
  });

  it("keeps channels separate for the same note", () => {
    let state = apply(createLiveNoteState(), event(0x90, 0, 60, 100), event(0x90, 1, 60, 100));
    state = apply(state, event(0x80, 0, 60, 0));
    expect([...state.held.keys()]).toEqual(["1:60"]);
  });

  it("holds released notes with CC64 and clears only that channel", () => {
    let state = apply(
      createLiveNoteState(),
      event(0xb0, 0, 64, 127), event(0xb0, 1, 64, 127),
      event(0x90, 0, 48, 100), event(0x90, 1, 55, 100),
      event(0x80, 0, 48, 0), event(0x80, 1, 55, 0),
    );
    expect(sustainedNotes(state)).toEqual([48, 55]);
    state = apply(state, event(0xb0, 0, 64, 0));
    expect(sustainedNotes(state)).toEqual([55]);
  });

  it("uses the lowest held note before an older sustained bass", () => {
    const state = apply(
      createLiveNoteState(),
      event(0xb0, 0, 64, 127), event(0x90, 0, 36, 100), event(0x80, 0, 36, 0),
      event(0x90, 0, 48, 100), event(0x90, 0, 55, 100), event(0x90, 0, 64, 100),
    );
    expect(heldNotes(state)).toEqual([48, 55, 64]);
    expect(detectLiveBass(state)).toBe(48);
  });
});
