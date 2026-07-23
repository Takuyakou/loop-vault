import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../domain/chords";
import type { ChordTimelineItem } from "../domain/types";
import {
  buildPracticeClockSchedule,
  PRACTICE_FLOW_EARLY_MS,
  PRACTICE_FLOW_LATE_MS,
} from "./PracticeClock";

describe("PracticeClock schedule", () => {
  it("builds deterministic 4/4 windows and a round boundary", () => {
    const schedule = buildPracticeClockSchedule([
      event(1, 1, 4),
      event(2, 1, 4),
    ], 4, 60);
    expect(schedule.roundBeats).toBe(8);
    expect(schedule.events[0]).toEqual({
      eventIndex: 0,
      targetBeat: 0,
      openBeat: 0,
      closeBeat: PRACTICE_FLOW_LATE_MS / 1000,
    });
    expect(schedule.events[1]?.targetBeat).toBe(4);
    expect(schedule.events[1]?.openBeat).toBe(4 - PRACTICE_FLOW_EARLY_MS / 1000);
  });

  it("preserves source event indexes after chronological sorting", () => {
    const schedule = buildPracticeClockSchedule([
      event(2, 1, 4),
      event(1, 1, 4),
    ], 4, 120);
    expect(schedule.events.map((entry) => entry.eventIndex)).toEqual([1, 0]);
    expect(schedule.roundBeats).toBe(8);
  });
});

function event(bar: number, beat: number, durationBeats: number): ChordTimelineItem {
  return {
    bar,
    beat,
    durationBeats,
    chord: makeChordSymbol(0, "maj7"),
    confidence: 1,
    alternatives: [],
    warnings: [],
  };
}

