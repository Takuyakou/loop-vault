import { describe, expect, it } from "vitest";
import type { RankedFingering } from "../domain/progressionFingering";
import { computeNextMoves, nextMoveIndex, prioritizedMoves } from "./nextMove";

const hand = (left: number[], right: number[]) => ({ left, right });
const fingering = (id: string, pitches: number[], fingers: (1|2|3|4|5)[]): RankedFingering =>
  ({ id, status: "supported", signature: id, pitches, fingers });

describe("Next Move from resolved playback notes", () => {
  it("keeps formal finger IDs even when another pairing is closer", () => {
    const result = computeNextMoves(hand([], [60, 64]), hand([], [63, 61]),
      { right: fingering("a", [60,64], [1,2]) }, { right: fingering("b", [61,63], [2,1]) });
    expect(result.map((move) => [move.finger, move.from, move.to, move.semitones, move.kind]))
      .toEqual([[1,60,63,3,"MEDIUM"],[2,64,61,-3,"MEDIUM"]]);
    expect(result.every((move) => !move.estimated)).toBe(true);
  });
  it("classifies keep, semitone, whole tone and large movement", () => {
    const result = computeNextMoves(hand([], [60,62,64,67]), hand([], [60,63,66,79]),
      { right: fingering("a", [60,62,64,67], [1,2,3,5]) },
      { right: fingering("b", [60,63,66,79], [1,2,3,5]) });
    expect(result.map((move) => move.kind)).toEqual(["KEEP","SMALL","SMALL","LARGE"]);
    expect(result.map((move) => move.semitones)).toEqual([0,1,2,12]);
  });
  it("shows add and release without dropping notes", () => {
    const result = computeNextMoves(hand([], [60,64]), hand([], [64,67]),
      { right: fingering("a", [60,64], [1,3]) }, { right: fingering("b", [64,67], [3,5]) });
    expect(result.map((move) => move.kind)).toEqual(["RELEASE","KEEP","ADD"]);
  });
  it("handles one-finger and five-finger formal assignments in both hands", () => {
    const result = computeNextMoves(hand([48], [60,64,67,71,74]), hand([47], [60,64,67,71,74]),
      { left: fingering("l1", [48], [5]), right: fingering("r1", [60,64,67,71,74], [1,2,3,4,5]) },
      { left: fingering("l2", [47], [5]), right: fingering("r2", [60,64,67,71,74], [1,2,3,4,5]) });
    expect(result).toHaveLength(6);
    expect(result[0]).toMatchObject({ hand: "left", finger: 5, semitones: -1 });
    expect(result.slice(1).every((move) => move.kind === "KEEP")).toBe(true);
  });
  it("uses non-crossing estimated matching if either fingering is unavailable", () => {
    const result = computeNextMoves(hand([], [60,64,67]), hand([], [61,65,69]));
    expect(result.map((move) => [move.from, move.to])).toEqual([[60,61],[64,65],[67,69]]);
    expect(result.every((move) => move.estimated)).toBe(true);
  });
  it("uses the same source, generated and custom resolved notes without regenerating a chord", () => {
    for (const resolved of [[36,59,62,64,67,72], [48,60,64], [41,53,57]]) {
      const result = computeNextMoves(hand(resolved.slice(0,2), resolved.slice(2)),
        hand(resolved.slice(0,2), resolved.slice(2)));
      expect(result.filter((move) => move.kind === "KEEP")).toHaveLength(resolved.length);
    }
  });
  it("preserves VL-09 redistributed seven-note playback coverage", () => {
    const before = hand([36,48], [60,64,67,71,74]);
    const after = hand([38,50], [62,65,69,72,76]);
    const result = computeNextMoves(before, after);
    expect(result).toHaveLength(7);
    expect(result.filter((move) => move.from !== undefined)).toHaveLength(7);
    expect(result.filter((move) => move.to !== undefined)).toHaveLength(7);
  });
  it("sorts urgent changes ahead of keep and reports overflow", () => {
    const result = computeNextMoves(hand([], [60,64,67]), hand([], [60,65,80]),
      { right: fingering("a", [60,64,67], [1,2,3]) },
      { right: fingering("b", [60,65,80], [1,2,3]) });
    const prioritized = prioritizedMoves(result, 2);
    expect(prioritized.visible[0]?.kind).toBe("LARGE");
    expect(prioritized.omitted).toBe(1);
  });
  it("supports last-to-first loop and a quiet no-next state", () => {
    expect(nextMoveIndex(2,3,true)).toBe(0);
    expect(nextMoveIndex(2,3,false)).toBeUndefined();
    expect(nextMoveIndex(1,3,false)).toBe(2);
  });
});
