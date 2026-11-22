import { describe, expect, it } from "vitest";
import { createLiveNoteState, heldNotes, reduceLiveNoteState } from "../liveMidi";
import { drillMismatch, type DrillJudgeCard } from "./voicingDrill";
import { drillEvent, prepareDrillRound } from "./voicingDrillSession";

const event = (status: number, channel: number, note: number, velocity = 100, timestampMs = 0) => ({ status, channel, data1: note, data2: velocity, timestampMs });
const held = (events: readonly ReturnType<typeof event>[]) => {
  let state = createLiveNoteState();
  for (const each of events) state = reduceLiveNoteState(state, each);
  return [...new Set(heldNotes(state))].sort((a, b) => a - b);
};
const card: DrillJudgeCard = { rootPitchClass: 0, left: [60], right: [64, 67, 71] };

describe("P19 voicing drill: one channel+note held record", () => {
  it("does not count the same channel+note on twice (one release still leaves it held)", () => {
    expect(held([event(0x90, 0, 60), event(0x90, 0, 60), event(0x80, 0, 60)])).toEqual([60]);
    expect(held([event(0x90, 0, 60), event(0x80, 0, 60)])).toEqual([]);
  });

  it("keeps the same note held on another channel", () => {
    expect(held([event(0x90, 0, 60), event(0x90, 1, 60), event(0x80, 0, 60)])).toEqual([60]);
    expect(held([event(0x90, 0, 60), event(0x90, 1, 60), event(0x80, 0, 60), event(0x80, 1, 60)])).toEqual([]);
  });

  it("does not let a release that arrives first break the next press", () => {
    expect(held([event(0x80, 0, 60), event(0x90, 0, 60)])).toEqual([60]);
  });

  it("passes a card after a duplicate note-on and one release, because the held snapshot still has the key", () => {
    const state = [event(0x90, 0, 60), event(0x90, 0, 60), event(0x80, 0, 60), event(0x90, 0, 64), event(0x90, 0, 67), event(0x90, 0, 71)]
      .reduce((current, each) => reduceLiveNoteState(current, each), createLiveNoteState());
    const keys = [...new Set(heldNotes(state))];
    const result = drillEvent(prepareDrillRound([]), [card], 71, true, 1000, keys);
    expect(result.passed).toBe(true);
    expect(result.round.held).toEqual([60, 64, 67, 71]);
  });
});

describe("P19 voicing drill: the reason a card does not pass", () => {
  it("names the five reasons", () => {
    expect(drillMismatch(card, [60, 64, 67, 71, 74])).toBe("extra");
    expect(drillMismatch(card, [60, 64, 67])).toBe("missing");
    expect(drillMismatch(card, [60, 64, 68, 71])).toBe("right");
    expect(drillMismatch(card, [62, 64, 67, 71])).toBe("left");
    expect(drillMismatch(card, [], [60, 64, 67, 71])).toBe("pedal");
    expect(drillMismatch(card, [60, 64, 67, 71])).toBeUndefined();
  });
});
