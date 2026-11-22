import { describe, expect, it } from "vitest";
import {
  beginDrillLap,
  drillCardElapsedMs,
  drillElapsedMs,
  drillEvent,
  drillLapCounts,
  drillTotalMs,
  idleDrillRound,
  markDrillHint,
  prepareDrillRound,
  releaseDrillKeys,
  type DrillRound,
} from "./voicingDrillSession";
import type { DrillJudgeCard } from "./voicingDrill";

const card = (rootPitchClass: number, right: readonly number[]): DrillJudgeCard => ({ rootPitchClass, left: [rootPitchClass + 40], right });
const C = card(0, [64, 67, 71]); // C E G B above the root
const same = card(0, [64, 67, 71]);
const Dm = card(2, [65, 69, 72]);

/** Feeds the events in order and returns the last round. */
function feed(round: DrillRound, cards: readonly DrillJudgeCard[], events: readonly (readonly [number, boolean])[], from = 1000, step = 100) {
  let current = round;
  let passed = 0;
  events.forEach(([pitch, on], index) => {
    const result = drillEvent(current, cards, pitch, on, from + index * step);
    current = result.round;
    if (result.passed) passed += 1;
  });
  return { round: current, passed };
}

describe("P19 voicing drill round", () => {
  it("starts the clock at the first key and times each card from the previous one", () => {
    let { round } = feed(prepareDrillRound([]), [C, Dm], [[60, true]], 1000);
    expect(round.phase).toBe("running");
    expect(round.clock.startedAt).toBe(1000);
    ({ round } = feed(round, [C, Dm], [[64, true], [67, true], [71, true]], 1100, 100));
    expect(round.index).toBe(1);
    expect(round.cardMs).toEqual([300]);
    ({ round } = feed(round, [C, Dm], [[60, false], [64, false], [67, false], [71, false]], 1900, 10));
    ({ round } = feed(round, [C, Dm], [[62, true], [65, true], [69, true], [72, true]], 2000, 100));
    expect(round.phase).toBe("finished");
    expect(round.cardMs).toEqual([300, 1000]);
    expect(drillTotalMs(round)).toBe(1300);
    expect(round.finishedAt).toBe(2300);
  });

  it("waits for every held key to be let go when 始める is pressed while keys are held", () => {
    let round = prepareDrillRound([60, 64]);
    expect(round.phase).toBe("waiting-release");
    ({ round } = feed(round, [C], [[60, false]], 1000));
    expect(round.phase).toBe("waiting-release");
    ({ round } = feed(round, [C], [[64, false]], 1100));
    expect(round.phase).toBe("ready");
    expect(round.clock.startedAt).toBeNull();
    ({ round } = feed(round, [C], [[60, true]], 1200));
    expect(round.clock.startedAt).toBe(1200);
  });

  it("passes when an extra key is let go and the shape is completed", () => {
    let round = prepareDrillRound([]);
    ({ round } = feed(round, [C], [[60, true], [64, true], [67, true], [70, true], [71, true]], 1000, 100));
    expect(round.index).toBe(0);
    const result = drillEvent(round, [C], 70, false, 2000);
    expect(result.passed).toBe(true);
    expect(result.round.cardMs).toEqual([1000]);
  });

  it("does not pass a shape carried from the previous card: a key must be pressed after the card began", () => {
    const { round } = feed(prepareDrillRound([]), [C, same], [[60, true], [64, true], [67, true], [71, true]], 1000, 100);
    expect(round.index).toBe(1);
    const carried = drillEvent(round, [C, same], 71, false, 2000);
    expect(carried.passed).toBe(false);
    const pressed = drillEvent(carried.round, [C, same], 71, true, 2100);
    expect(pressed.passed).toBe(true);
    expect(pressed.round.cardMs).toEqual([300, 800]);
  });

  it("counts a carried key pressed again after the card passed as a new press for the next card", () => {
    const C = card(0, [67, 72, 76]);
    const Am = card(9, [67, 72, 76]);
    const F = card(5, [69, 72, 76]);
    let round = prepareDrillRound([]);
    let at = 1000;
    const send = (pitch: number, on: boolean) => {
      const result = drillEvent(round, [C, Am, F], pitch, on, at);
      round = result.round;
      at += 100;
      return result;
    };
    [48, 67, 72, 76].forEach((pitch) => send(pitch, true));
    expect(round.index).toBe(1);
    send(48, false);
    send(45, true); // the new root completes Am7 while G4/C5/E5 are carried
    expect(round.index).toBe(2);
    // a driver that presses the carried G4 again is pressing it for the F card, which does not contain it
    expect(send(67, true).distracted).toBe(true);
    expect(round.marks).toEqual([2]);
  });

  it("marks nothing when the pianist presses only the keys that are not carried", () => {
    const C = card(0, [67, 72, 76]);
    const Am = card(9, [67, 72, 76]);
    const F = card(5, [69, 72, 76]);
    let round = prepareDrillRound([]);
    let at = 1000;
    const send = (pitch: number, on: boolean) => {
      const result = drillEvent(round, [C, Am, F], pitch, on, at);
      round = result.round;
      at += 100;
      return result;
    };
    [48, 67, 72, 76].forEach((pitch) => send(pitch, true));
    send(48, false);
    send(45, true);
    expect(round.index).toBe(2);
    send(45, false);
    send(67, false);
    send(41, true);
    expect(send(69, true).passed).toBe(true);
    expect(round.marks).toEqual([]);
    expect(round.phase).toBe("finished");
  });

  it("advances at most one card for one MIDI event", () => {
    const { round } = feed(prepareDrillRound([]), [C, same, same], [[60, true], [64, true], [67, true], [71, true]], 1000, 100);
    expect(round.index).toBe(1); // one event passed one card (the next card needs a new event)
    const second = drillEvent(round, [C, same, same], 71, true, 1500);
    expect(second.passed).toBe(true);
    expect(second.round.index).toBe(2);
    const third = drillEvent(second.round, [C, same, same], 71, true, 1600);
    expect(third.passed).toBe(true);
    expect(third.round.phase).toBe("finished");
  });

  it("marks 迷った by pitch class, whatever the octave", () => {
    let round = prepareDrillRound([]);
    ({ round } = feed(round, [C, C], [[60, true], [61, true], [73, true], [61, false], [73, false]], 1000, 50));
    expect(round.marks).toEqual([0]);
    ({ round } = feed(round, [C, C], [[64, true], [67, true], [71, true]], 2000, 100));
    expect(round.index).toBe(1);
    expect(round.marks).toEqual([0]);
    ({ round } = feed(round, [C, C], [[72, true]], 2500));
    expect(round.marks).toEqual([0]); // C at another octave is a note of the card
  });

  it("starts a repeated lap at the instant the previous lap ended", () => {
    let { round } = feed(prepareDrillRound([]), [C], [[60, true], [64, true], [67, true], [71, true]], 1000, 100);
    expect(round.phase).toBe("finished");
    round = beginDrillLap(round, round.finishedAt!);
    expect(round.phase).toBe("running");
    expect(round.index).toBe(0);
    expect(round.clock.startedAt).toBe(1300);
    expect(round.cardMs).toEqual([]);
    expect(round.marks).toEqual([]);
    ({ round } = feed(round, [C], [[60, false], [64, false], [67, false], [71, false]], 1300, 0));
    ({ round } = feed(round, [C], [[60, true], [64, true], [67, true], [71, true]], 1400, 100));
    expect(round.cardMs).toEqual([400]); // the lap began at 1300 (the previous lap's last card), not at 1400
  });

  it("shows the elapsed time of the lap and of the card", () => {
    let round = prepareDrillRound([]);
    expect(drillElapsedMs(round, 5000)).toBe(0);
    ({ round } = feed(round, [C], [[60, true]], 1000));
    expect(drillElapsedMs(round, 2500)).toBe(1500);
    expect(drillCardElapsedMs(round, 2500)).toBe(1500);
    ({ round } = feed(round, [C], [[64, true], [67, true], [71, true]], 1100, 100));
    expect(drillCardElapsedMs(round, 2500)).toBe(1200);
  });

  it("keeps the lap when ヒント was seen but does not count it", () => {
    let round = prepareDrillRound([]);
    round = markDrillHint(round);
    ({ round } = feed(round, [C], [[60, true], [64, true], [67, true], [71, true]], 1000, 100));
    expect(round.phase).toBe("finished");
    expect(round.hinted).toBe(true);
    expect(drillLapCounts(round, "recall", true)).toBe(false);
    expect(drillLapCounts(round, "see", true)).toBe(true);
    expect(drillLapCounts(round, "recall", false)).toBe(false);
    expect(drillLapCounts({ ...round, hinted: false }, "recall", true)).toBe(true);
    expect(drillLapCounts({ ...round, hinted: false }, "see", true)).toBe(true);
  });

  it("ignores presses on a finished round", () => {
    let { round } = feed(prepareDrillRound([]), [C], [[60, true], [64, true], [67, true], [71, true]], 1000, 100);
    const finished = round;
    round = drillEvent(round, [C], 61, true, 5000).round;
    expect(round).toBe(finished);
  });

  it("hands out a fresh idle round", () => {
    const round = idleDrillRound();
    expect(round.phase).toBe("idle");
    expect(round.clock.startedAt).toBeNull();
    expect(releaseDrillKeys(round, [])).toBe(round);
  });
});
