import { describe, expect, it } from "vitest";
import {
  createKeyBag,
  drawNextKey,
  selectManualKey,
  type KeyBagState,
} from ".";

describe("key shuffle bag", () => {
  it("keeps the seed 0 shuffle order as a golden contract", () => {
    expect(createKeyBag(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      0,
    ).remaining).toEqual([11, 7, 0, 9, 10, 2, 5, 4, 1, 6, 8, 3]);
  });

  it("draws every key exactly once before exhaustion", () => {
    let state = createKeyBag([0, 2, 4, 5, 7, 9], 365);
    const drawn: number[] = [];
    while (state.remaining.length > 0) {
      const result = drawNextKey(state);
      expect(result.keyPitchClass).toBeDefined();
      drawn.push(result.keyPitchClass as number);
      state = result.nextState;
    }
    expect(new Set(drawn).size).toBe(6);
    expect([...drawn].sort((left, right) => left - right)).toEqual([0, 2, 4, 5, 7, 9]);
    expect(drawNextKey(state)).toEqual({
      keyPitchClass: undefined,
      nextState: state,
    });
  });

  it("is deterministic for a fixed seed and differs for another seed", () => {
    const first = createKeyBag([0, 1, 2, 3, 4, 5, 6, 7], 12345);
    expect(createKeyBag([0, 1, 2, 3, 4, 5, 6, 7], 12345)).toEqual(first);
    expect(createKeyBag([0, 1, 2, 3, 4, 5, 6, 7], 54321).remaining)
      .not.toEqual(first.remaining);
  });

  it("normalizes duplicates and supports a one-element pool", () => {
    expect(createKeyBag([0, 12, -12], 1).remaining).toEqual([0]);
    const result = drawNextKey(createKeyBag([14], 1));
    expect(result.keyPitchClass).toBe(2);
    expect(result.nextState).toEqual({
      remaining: [],
      completed: [2],
      seed: 1,
    });
  });

  it("rejects invalid pitch classes in bags and manual selection", () => {
    expect(() => createKeyBag([0, Number.NaN], 1)).toThrow(
      "Pitch class must be a finite integer",
    );
    expect(() => selectManualKey(createKeyBag([0], 1), 1.5)).toThrow(
      "Pitch class must be a finite integer",
    );
  });

  it("manual selection removes only that key without reordering the rest", () => {
    const state = createKeyBag([0, 2, 4, 5, 7, 9], 2026);
    const selected = state.remaining[3];
    const expectedRemaining = state.remaining.filter((value) => value !== selected);
    const result = selectManualKey(state, selected);
    expect(result.keyPitchClass).toBe(selected);
    expect(result.nextState.remaining).toEqual(expectedRemaining);
    expect(result.nextState.completed).toEqual([selected]);
    expect(state.completed).toEqual([]);
    expect(state.remaining).toContain(selected);
  });

  it("does not mutate bag order for completed or out-of-pool manual keys", () => {
    const initial = createKeyBag([0, 2, 4], 9);
    const first = drawNextKey(initial);
    const completed = first.keyPitchClass as number;
    expect(selectManualKey(first.nextState, completed)).toEqual({
      keyPitchClass: completed,
      nextState: first.nextState,
    });
    expect(selectManualKey(first.nextState, 7)).toEqual({
      keyPitchClass: undefined,
      nextState: first.nextState,
    });
  });

  it("restarts as a new deterministic session without persisted state", () => {
    const started = createKeyBag([0, 2, 4, 5], 77);
    const progressed = drawNextKey(started).nextState;
    expect(progressed).not.toEqual(started);
    expect(createKeyBag([0, 2, 4, 5], 77)).toEqual(started);
  });

  it("does not mutate caller-owned state", () => {
    const state: KeyBagState = {
      remaining: [0, 7],
      completed: [],
      seed: 1,
    };
    const snapshot = structuredClone(state);
    drawNextKey(state);
    selectManualKey(state, 7);
    expect(state).toEqual(snapshot);
  });
});
