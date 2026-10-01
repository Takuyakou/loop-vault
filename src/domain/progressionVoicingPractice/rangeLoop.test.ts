import { describe, expect, it } from "vitest";
import { createProgressionPracticeClockState, projectProgressionPracticeClock, reduceProgressionPracticeClock,
  type ProgressionPracticeClockState } from "./clock";
import type { ProgressionVoicingPracticeSnapshot } from "./types";
import { cancelVoicingLoopRangePending, emptyVoicingLoopRangeSelection,
  rangeBeatBounds, rangeContainsCard, selectVoicingLoopRangeCard } from "./rangeLoop";

describe("Voicing Loop range selection", () => {
  it("keeps the old range until a second right-click atomically replaces it", () => {
    const old = { active: { first: 1, last: 3 } };
    const pending = selectVoicingLoopRangeCard(old, 4, 6);
    expect(pending).toEqual({ ...old, pendingStart: 4 });
    expect(cancelVoicingLoopRangePending(pending)).toEqual(old);
    expect(selectVoicingLoopRangeCard(pending, 2, 6)).toEqual({ active: { first: 2, last: 4 } });
  });

  it("supports one card, reverse order, and invalid indices without event ids", () => {
    const pending = selectVoicingLoopRangeCard(emptyVoicingLoopRangeSelection, 3, 5);
    expect(selectVoicingLoopRangeCard(pending, 3, 5).active).toEqual({ first: 3, last: 3 });
    expect(selectVoicingLoopRangeCard(pending, 1, 5).active).toEqual({ first: 1, last: 3 });
    expect(selectVoicingLoopRangeCard(pending, 4, 5, true).active).toEqual({ first: 4, last: 4 });
    expect(selectVoicingLoopRangeCard(pending, 5, 5)).toBe(pending);
  });

  it("derives original beat bounds without changing card notes or meter phase", () => {
    const events = [{ startBeat: 0, durationBeats: 2 }, { startBeat: 2, durationBeats: 1 },
      { startBeat: 3, durationBeats: 3 }];
    const range = { first: 1, last: 2 };
    expect(rangeBeatBounds(events, range)).toEqual({ startBeat: 2, endBeat: 6 });
    expect(rangeContainsCard(range, 0)).toBe(false);
    expect(rangeContainsCard(range, 1)).toBe(true);
    expect(rangeContainsCard(undefined, 0)).toBe(true);
  });
});


describe("Range clock uses the original meter and full progression", () => {
  it.each([
    [4, 0, 1], [4, 2, 3], [3, 2, 3], [5, 3, 4],
  ] as const)("preserves %i/4 source beat at start %i", (meter, startBeat, expectedBeat) => {
    const rangeLength = 2;
    const lengthBeats = Math.max(10, startBeat + rangeLength + 1);
    const snapshot: ProgressionVoicingPracticeSnapshot = {
      version: 1, fingerprint: "range-clock-synthetic",
      source: { kind: "vault", reference: { ideaId: "synthetic", blockId: "synthetic" } },
      selection: "source-midi", bpm: 120, meter: { numerator: meter, denominator: 4 },
      lengthBeats, practiceGroupBeats: 4,
      events: [{ id: "one", startBeat, durationBeats: rangeLength,
        chord: { root: 0, quality: "maj", tensions: [], label: "C" } }],
      spans: [
        ...(startBeat ? [{ kind: "rest" as const, startBeat: 0, durationBeats: startBeat }] : []),
        { kind: "chord" as const, eventIndex: 0, startBeat, durationBeats: rangeLength },
        { kind: "rest" as const, startBeat: startBeat + rangeLength,
          durationBeats: lengthBeats - startBeat - rangeLength },
      ],
    };
    const bounds = { startBeat, endBeat: startBeat + rangeLength };
    let state: ProgressionPracticeClockState = { ...createProgressionPracticeClockState(snapshot, { countInBars: 1 }),
      loopBounds: bounds, anchorBeat: startBeat };
    state = reduceProgressionPracticeClock(snapshot, state, { type: "START" });
    expect(projectProgressionPracticeClock(snapshot, state)).toMatchObject({
      inCountIn: true, beatInBar: expectedBeat, currentEventIndex: 0,
    });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat: meter });
    expect(projectProgressionPracticeClock(snapshot, state)).toMatchObject({
      progressionBeat: startBeat, beatInBar: expectedBeat, currentEventIndex: 0, loopCount: 0,
    });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat: meter + 2 });
    expect(projectProgressionPracticeClock(snapshot, state)).toMatchObject({
      progressionBeat: startBeat, beatInBar: expectedBeat, currentEventIndex: 0, loopCount: 1,
    });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "STOP_RESET" });
    expect(projectProgressionPracticeClock(snapshot, state).progressionBeat).toBe(startBeat);
  });
});
