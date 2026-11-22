import { describe, expect, it } from "vitest";
import { generateFingeringCandidates, physicalVoicingSignature, rankCyclicFingerings, type FingeringHand, type ProgressionFingeringEvent } from "./progressionFingering";
import { handPositionProxy } from "./handPositionFingering";
import { P21_POLICY, p21ERankerCostModel } from "./p21SingleNoteFingering";
import { eRankerCostModel } from "./eRankerFingering";
import { rankPracticeHandFingerings } from "../voicingPractice/rankPracticeFingerings";
import type { ProgressionVoicingPracticeSnapshot } from "./progressionVoicingPractice";
import type { ProgressionFingeringHandTargets } from "../voicingPractice/fingeringDisplay";

const solve = (hand: FingeringHand, pitches: readonly number[], extra: Partial<ProgressionFingeringEvent> = {}, anchors?: Map<string, { signature: string; fingers: readonly (1 | 2 | 3 | 4 | 5)[] }>) => {
  const events: ProgressionFingeringEvent[] = pitches.map((pitch, index) => ({ id: String(index), hand, midiPitches: [pitch], startSeconds: index, durationSeconds: 1, ...extra }));
  return rankCyclicFingerings(events, { costModel: p21ERankerCostModel(), cyclic: true, ...(anchors ? { anchors } : {}) });
};
const fingersOf = (result: ReturnType<typeof solve>) => result.map((entry) => entry.status === "supported" ? entry.fingers[0]! : undefined);
const positionsOf = (hand: FingeringHand, pitches: readonly number[], result: ReturnType<typeof solve>) => result.map((entry, index) => entry.status === "supported" ? handPositionProxy(hand, [pitches[index]!], entry.fingers) : NaN);
const movesOf = (positions: readonly number[]) => positions.reduce((count, position, index) => count + (Math.abs(position - positions[(index + 1) % positions.length]!) >= 1 ? 1 : 0), 0);
const movementOf = (positions: readonly number[]) => positions.reduce((sum, position, index) => sum + Math.abs(position - positions[(index + 1) % positions.length]!), 0);

describe("P21 §3 single-note fingering", () => {
  it("left: C2 D2 E2 F2 / reverse keep one hand position", () => {
    const pitches = [36, 38, 40, 41];
    const up = solve("left", pitches), down = solve("left", [...pitches].reverse());
    expect(fingersOf(up)).toEqual([5, 4, 3, 2]);
    expect(fingersOf(down)).toEqual([2, 3, 4, 5]);
    expect(positionsOf("left", pitches, up)).toEqual([21, 21, 21, 21]);
    expect(movesOf(positionsOf("left", pitches, up))).toBe(0);
  });

  it("left: C2 F2 G2 C2 stays at 21", () => {
    const pitches = [36, 41, 43, 36];
    const result = solve("left", pitches);
    expect(fingersOf(result)).toEqual([5, 2, 1, 5]);
    expect(positionsOf("left", pitches, result)).toEqual([21, 21, 21, 21]);
  });

  it("left: C2 A2 D2 G2 moves exactly twice", () => {
    const pitches = [36, 45, 38, 43];
    const result = solve("left", pitches);
    expect(fingersOf(result)).toEqual([5, 1, 5, 2]);
    const positions = positionsOf("left", pitches, result);
    expect(positions).toEqual([21, 22, 22, 22]);
    expect(movesOf(positions)).toBe(2);
    expect(movementOf(positions)).toBe(2);
  });

  it("left: repeated note keeps the same finger; C2 C3 moves out and back", () => {
    expect(fingersOf(solve("left", [36, 36]))).toEqual([5, 5]);
    const result = solve("left", [36, 48]);
    expect(fingersOf(result)).toEqual([5, 1]);
    expect(positionsOf("left", [36, 48], result)).toEqual([21, 24]);
    expect(movesOf(positionsOf("left", [36, 48], result))).toBe(2);
    expect(movementOf(positionsOf("left", [36, 48], result))).toBe(6);
  });

  it("left: black key E♭ moves only 0.5", () => {
    const pitches = [36, 39, 41, 43];
    const result = solve("left", pitches);
    expect(fingersOf(result)).toEqual([5, 4, 2, 1]);
    expect(positionsOf("left", pitches, result)).toEqual([21, 21.5, 21, 21]);
    expect(movesOf(positionsOf("left", pitches, result))).toBe(0);
    expect(movementOf(positionsOf("left", pitches, result))).toBe(1);
  });

  it("left boundary: C2 G2 is one position, C2 A2 is not", () => {
    const within = solve("left", [36, 43]), beyond = solve("left", [36, 45]);
    expect(fingersOf(within)).toEqual([5, 1]);
    expect(movesOf(positionsOf("left", [36, 43], within))).toBe(0);
    expect(fingersOf(beyond)).toEqual([5, 1]);
    expect(movesOf(positionsOf("left", [36, 45], beyond))).toBe(2);
  });

  it("right mirrors the left", () => {
    const r1 = solve("right", [60, 62, 64, 65]);
    expect(fingersOf(r1)).toEqual([1, 2, 3, 4]);
    expect(positionsOf("right", [60, 62, 64, 65], r1)).toEqual([35, 35, 35, 35]);
    const r2 = solve("right", [65, 64, 62, 60]);
    expect(fingersOf(r2)).toEqual([4, 3, 2, 1]);
    expect(fingersOf(solve("right", [60, 65, 67, 60]))).toEqual([1, 4, 5, 1]);
    const r4 = solve("right", [60, 72]);
    expect(fingersOf(r4)).toEqual([1, 5]);
    expect(positionsOf("right", [60, 72], r4)).toEqual([35, 38]);
    expect(movesOf(positionsOf("right", [60, 72], r4))).toBe(2);
    const r5a = solve("right", [60, 67]), r5b = solve("right", [60, 69]);
    expect(movesOf(positionsOf("right", [60, 67], r5a))).toBe(0);
    expect(movesOf(positionsOf("right", [60, 69], r5b))).toBe(2);
    const r6 = solve("right", [60, 63, 65, 67]);
    expect(fingersOf(r6)).toEqual([1, 2, 4, 5]);
    expect(positionsOf("right", [60, 63, 65, 67], r6)).toEqual([35, 35.5, 35, 35]);
    expect(movementOf(positionsOf("right", [60, 63, 65, 67], r6))).toBe(1);
  });

  it("tempo and duration do not change the choice", () => {
    const base = fingersOf(solve("left", [36, 38, 40, 41]));
    for (const [start, duration] of [[0, 4], [0, 0.5], [0, 0.25]]) {
      const events = [36, 38, 40, 41].map((pitch, index) => ({ id: String(index), hand: "left" as const, midiPitches: [pitch], startSeconds: index * start, durationSeconds: duration }));
      expect(rankCyclicFingerings(events, { costModel: p21ERankerCostModel(), cyclic: true }).map((entry) => entry.status === "supported" ? entry.fingers[0] : undefined)).toEqual(base);
    }
  });

  it("an empty hand between cards keeps the same connection", () => {
    const events: ProgressionFingeringEvent[] = [
      { id: "0", hand: "left", midiPitches: [36] }, { id: "rest", hand: "left", midiPitches: [] },
      { id: "1", hand: "left", midiPitches: [38] }, { id: "2", hand: "left", midiPitches: [40] }, { id: "3", hand: "left", midiPitches: [41] },
    ];
    const result = rankCyclicFingerings(events, { costModel: p21ERankerCostModel(), cyclic: true });
    expect(result.map((entry) => entry.status === "supported" ? entry.fingers[0] : undefined)).toEqual([5, undefined, 4, 3, 2]);
  });

  it("an unresolved card separates the segments", () => {
    const events: ProgressionFingeringEvent[] = [36, 38, 40, 41].map((pitch, index) => ({ id: String(index), hand: "left", midiPitches: [pitch], unresolved: index === 1 }));
    const result = rankCyclicFingerings(events, { costModel: p21ERankerCostModel(), cyclic: true });
    expect(result[0]!.status).toBe("supported");
    expect(result[1]!.status).toBe("unavailable");
    expect(fingersOf(result.slice(2))).toEqual([5, 4]);
  });

  it("saved anchors win and move the whole hand with them", () => {
    const signature = (pitch: number) => physicalVoicingSignature("left", [pitch])!;
    const result = solve("left", [36, 38, 40], {}, new Map([
      ["1", { signature: signature(38), fingers: [2] as const }],
    ]));
    expect(fingersOf(result)).toEqual([3, 2, 1]);
    expect(positionsOf("left", [36, 38, 40], result)).toEqual([19, 19, 19]);
    const same = solve("left", [36, 36], {}, new Map([
      ["0", { signature: signature(36), fingers: [5] as const }], ["1", { signature: signature(36), fingers: [4] as const }],
    ]));
    expect(fingersOf(same)).toEqual([5, 4]);
  });
});

describe("P21 mixed hands keep 2+-note cards from E1-T", () => {
  const snapshot = (notes: readonly (readonly number[])[]) => ({
    bpm: 120, lengthBeats: notes.length, selection: "custom",
    events: notes.map((_pitches, index) => ({ id: String(index), startBeat: index, durationBeats: 1 })),
  }) as unknown as ProgressionVoicingPracticeSnapshot;
  const hands = (notes: readonly (readonly number[])[]): ProgressionFingeringHandTargets[] => notes.map((pitches) => ({ left: [...pitches], right: [...pitches] }));
  it("keeps every 2+-note card's fingers and lets the single-note cards follow them", () => {
    const notes = [[36], [36, 43], [38], [38, 45]];
    const old = rankPracticeHandFingerings(snapshot(notes), hands(notes), "custom", "left", undefined, { costModel: eRankerCostModel() });
    const now = rankPracticeHandFingerings(snapshot(notes), hands(notes), "custom", "left", undefined, { costModel: p21ERankerCostModel() });
    expect(now).toHaveLength(notes.length);
    expect(now[1]).toMatchObject({ status: "supported", fingers: old[1]!.status === "supported" ? old[1]!.fingers : [] });
    expect(now[3]).toMatchObject({ status: "supported", fingers: old[3]!.status === "supported" ? old[3]!.fingers : [] });
    expect(now[0]!.status).toBe("supported");
    expect(now[2]!.status).toBe("supported");
  });
});

describe("P21 integer tiers stay exact over the 4096-card bound", () => {
  it("L4, L7 and R6 keep the same fingers on every one of 32 repetitions", () => {
    for (const [hand, base, expected] of [
      ["left", [36, 45, 38, 43], [5, 1, 5, 2]],
      ["left", [36, 39, 41, 43], [5, 4, 2, 1]],
      ["right", [60, 63, 65, 67], [1, 2, 4, 5]],
    ] as const) {
      const pitches = Array.from({ length: 32 }, () => base).flat();
      const result = solve(hand, pitches);
      expect(fingersOf(result)).toEqual(Array.from({ length: 32 }, () => expected).flat());
    }
  });

  it("the black-key E♭ still takes L4 (not L5) inside the long L7 line", () => {
    const pitches = Array.from({ length: 32 }, () => [36, 39, 41, 43]).flat();
    const result = solve("left", pitches);
    for (let index = 0; index < 32; index += 1) {
      expect(result[index * 4 + 1]).toMatchObject({ status: "supported", fingers: [4] });
      expect(positionsOf("left", pitches, result)[index * 4 + 1]).toBe(21.5);
    }
  });
});
describe("P21 §3 integer weights and long index", () => {
  it("every local and transition value is an integer for the §3 examples", () => {
    const model = p21ERankerCostModel();
    const groups = [36, 38, 39, 40, 41, 43, 45, 48, 60, 63, 65, 67].map((pitch) => generateFingeringCandidates({ hand: "left", midiPitches: [pitch] }));
    const values: number[] = [];
    for (const group of groups) {
      if (group.status !== "supported") throw new Error("fixture");
      group.candidates.forEach((_candidate, index) => values.push(model.local({ id: "x", hand: "left", midiPitches: [group.pitches[0]!] }, group, index)));
      for (const next of groups) {
        if (next.status !== "supported") continue;
        group.candidates.forEach((_a, i) => next.candidates.forEach((_b, j) => values.push(model.transition(group, i, next, j, 1))));
      }
    }
    expect(values.every(Number.isInteger)).toBe(true);
  });

  it("policy tiers leave room for every lower tier at maxCards", () => {
    expect(4 * P21_POLICY.maxCards).toBeLessThan(P21_POLICY.movementUnit);
    expect(312 * P21_POLICY.maxCards * P21_POLICY.movementUnit).toBeLessThan(P21_POLICY.moveWeight);
    expect(P21_POLICY.maxCards * P21_POLICY.moveWeight + 312 * P21_POLICY.maxCards * P21_POLICY.movementUnit + 4 * P21_POLICY.maxCards).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it("L4 32 times keeps 2 moves per cycle, and L7/R6 keep their cycles", () => {
    const l4 = Array.from({ length: 32 }, () => [36, 45, 38, 43]).flat();
    const r4 = solve("left", l4), positions = positionsOf("left", l4, r4);
    expect(movesOf(positions)).toBe(64);
    expect(fingersOf(r4)).toEqual(Array.from({ length: 32 }, () => [5, 1, 5, 2]).flat());
    const l7 = Array.from({ length: 32 }, () => [36, 39, 41, 43]).flat();
    expect(fingersOf(solve("left", l7))).toEqual(Array.from({ length: 32 }, () => [5, 4, 2, 1]).flat());
    const r6 = Array.from({ length: 32 }, () => [60, 63, 65, 67]).flat();
    expect(fingersOf(solve("right", r6))).toEqual(Array.from({ length: 32 }, () => [1, 2, 4, 5]).flat());
  });

  it("a card with the same pitch twice is a one-note card", () => {
    const duplicate = rankCyclicFingerings([{ id: "0", hand: "left", midiPitches: [36, 36] }], { costModel: p21ERankerCostModel(), cyclic: true });
    const single = rankCyclicFingerings([{ id: "0", hand: "left", midiPitches: [36] }], { costModel: p21ERankerCostModel(), cyclic: true });
    expect(duplicate.map((entry) => entry.status === "supported" ? entry.fingers : undefined)).toEqual(single.map((entry) => entry.status === "supported" ? entry.fingers : undefined));
  });

  it("above maxCards the hand keeps the old E1-T result", () => {
    const pitches = Array.from({ length: P21_POLICY.maxCards + 1 }, () => 36);
    const snapshot = {
      bpm: 120, lengthBeats: pitches.length, selection: "custom",
      events: pitches.map((_pitch, index) => ({ id: String(index), startBeat: index, durationBeats: 1 })),
    } as unknown as ProgressionVoicingPracticeSnapshot;
    const hands = pitches.map((pitch) => ({ left: [pitch], right: [] }));
    const old = rankPracticeHandFingerings(snapshot, hands, "custom", "left", undefined, { costModel: eRankerCostModel() });
    const now = rankPracticeHandFingerings(snapshot, hands, "custom", "left", undefined, { costModel: p21ERankerCostModel() });
    expect(now).toEqual(old);
  }, 30_000);
});