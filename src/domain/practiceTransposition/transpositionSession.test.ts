import { describe, expect, it } from "vitest";
import {
  completeTranspositionRound,
  createTranspositionSession,
  evaluateTranspositionEligibility,
  selectTranspositionKey,
  skipTranspositionKey,
} from "./transpositionSession";

describe("transpositionSession", () => {
  const eligible = { eligible: true, reasons: [] };

  it("creates deterministic L4 and L5 sessions from an injected seed", () => {
    const l4 = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 42,
      eligibility: eligible,
    });
    const l5 = createTranspositionSession({
      level: 5,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 42,
      eligibility: {
        eligible: false,
        reasons: ["prerequisite-required"],
      },
    });

    expect(l4.keyPool).toHaveLength(6);
    expect(l4.keyPool).not.toContain(0);
    expect(l5.keyPool).toHaveLength(12);
    expect(l5.keyPool).toContain(0);
    expect(createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 42,
      eligibility: eligible,
    })).toEqual(l4);
  });

  it("limits persisted L5 coverage to the active L4 key pool", () => {
    const state = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 42,
      eligibility: eligible,
      progress: {
        schemaVersion: 1,
        clearedKeyPitchClasses: Array.from({ length: 12 }, (_, index) => index),
      },
    });

    expect(state.sessionClearedPitchClasses).toHaveLength(6);
    expect(state.sessionClearedPitchClasses)
      .toEqual([...state.keyPool].sort((left, right) => left - right));
    expect(state.sessionClearedPitchClasses).not.toContain(0);
  });

  it("keeps Step rounds on the same key without recording coverage", () => {
    const state = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 7,
      eligibility: eligible,
    });
    const dirty = completeTranspositionRound(state, {
      mode: "step",
      clean: false,
      meetsTargetTempo: true,
    });
    expect(dirty.currentTargetKeyPitchClass).toBe(
      state.currentTargetKeyPitchClass,
    );
    expect(dirty.sessionClearedPitchClasses).toEqual([]);

    const clean = completeTranspositionRound(dirty, {
      mode: "step",
      clean: true,
      meetsTargetTempo: true,
    });
    expect(clean.currentTargetKeyPitchClass).toBe(state.currentTargetKeyPitchClass);
    expect(clean.sessionClearedPitchClasses).toEqual([]);
  });

  it("rotates free-practice Flow keys without adding official coverage", () => {
    const state = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 99,
      eligibility: {
        eligible: false,
        reasons: ["prerequisite-required"],
      },
    });
    const next = completeTranspositionRound(state, {
      mode: "flow",
      clean: true,
      meetsTargetTempo: true,
    });
    expect(next.currentTargetKeyPitchClass)
      .not.toBe(state.currentTargetKeyPitchClass);
    expect(next.sessionClearedPitchClasses).toEqual([]);
  });

  it("starts a saved different-day confirmation challenge and keeps its fixed keys", () => {
    const state = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 123,
      eligibility: { eligible: true, reasons: [] },
      progress: {
        schemaVersion: 1,
        clearedKeyPitchClasses: [2, 3, 5, 7, 9, 10],
      },
      provisional: {
        level: 4,
        clearedAt: "2026-07-23T12:00:00.000Z",
        clearedOnLocalDate: "2026-07-23",
        targetTempo: 70,
        confirmationPitchClasses: [7, 5],
      },
      localDate: "2026-07-24",
    });

    expect(state.inConfirmationChallenge).toBe(true);
    expect(state.confirmationPitchClasses).toEqual([7, 5]);
    expect(state.currentTargetKeyPitchClass).toBe(7);
    expect(state.sessionClearedPitchClasses).toEqual([2, 3, 5, 7, 9, 10]);
  });

  it("blocks same-day confirmation", () => {
    const state = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 123,
      eligibility: { eligible: true, reasons: [] },
      provisional: {
        level: 4,
        clearedAt: "2026-07-24T12:00:00.000Z",
        clearedOnLocalDate: "2026-07-24",
        targetTempo: 70,
        confirmationPitchClasses: [7, 5],
      },
      localDate: "2026-07-24",
    });
    expect(state.inConfirmationChallenge).toBe(false);
  });

  it("requires consecutive clean confirmation keys and resets on dirty", () => {
    const initial = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 123,
      eligibility: { eligible: true, reasons: [] },
      provisional: {
        level: 4,
        clearedAt: "2026-07-23T12:00:00.000Z",
        clearedOnLocalDate: "2026-07-23",
        targetTempo: 70,
        confirmationPitchClasses: [7, 5],
      },
      localDate: "2026-07-24",
    });
    const first = completeTranspositionRound(initial, {
      mode: "flow",
      clean: true,
      meetsTargetTempo: true,
    });
    expect(first.confirmationIndex).toBe(1);
    expect(first.currentTargetKeyPitchClass).toBe(5);

    const reset = completeTranspositionRound(first, {
      mode: "flow",
      clean: false,
      meetsTargetTempo: true,
    });
    expect(reset.confirmationIndex).toBe(0);
    expect(reset.currentTargetKeyPitchClass).toBe(7);

    const secondFirst = completeTranspositionRound(reset, {
      mode: "flow",
      clean: true,
      meetsTargetTempo: true,
    });
    const completed = completeTranspositionRound(secondFirst, {
      mode: "flow",
      clean: true,
      meetsTargetTempo: true,
    });
    expect(completed.inConfirmationChallenge).toBe(false);
    expect(completed.confirmationIndex).toBeUndefined();
  });

  it("requires all four saved L5 confirmation keys in order", () => {
    let state = createTranspositionSession({
      level: 5,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 456,
      eligibility: { eligible: true, reasons: [] },
      provisional: {
        level: 5,
        clearedAt: "2026-07-23T12:00:00.000Z",
        clearedOnLocalDate: "2026-07-23",
        targetTempo: 70,
        confirmationPitchClasses: [0, 2, 5, 7],
      },
      localDate: "2026-07-24",
    });
    for (const expectedIndex of [1, 2, 3]) {
      state = completeTranspositionRound(state, {
        mode: "flow",
        clean: true,
        meetsTargetTempo: true,
      });
      expect(state.inConfirmationChallenge).toBe(true);
      expect(state.confirmationIndex).toBe(expectedIndex);
    }
    state = completeTranspositionRound(state, {
      mode: "flow",
      clean: true,
      meetsTargetTempo: true,
    });
    expect(state.inConfirmationChallenge).toBe(false);
  });

  it("retries a dirty Flow key and advances a clean Flow key", () => {
    const state = createTranspositionSession({
      level: 5,
      sourceKeyPitchClass: 9,
      sourceMode: "minor",
      seed: 123,
      eligibility: eligible,
    });
    const dirty = completeTranspositionRound(state, {
      mode: "flow",
      clean: false,
      meetsTargetTempo: true,
    });
    expect(dirty.currentTargetKeyPitchClass).toBe(
      state.currentTargetKeyPitchClass,
    );
    expect(dirty.keyBag).toEqual(state.keyBag);

    const clean = completeTranspositionRound(dirty, {
      mode: "flow",
      clean: true,
      meetsTargetTempo: true,
    });
    expect(clean.currentTargetKeyPitchClass).not.toBe(
      state.currentTargetKeyPitchClass,
    );
    expect(clean.sessionClearedPitchClasses).toContain(
      state.currentTargetKeyPitchClass,
    );
  });

  it("manual selection does not alter the remaining bag order", () => {
    const state = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 5,
      eligibility: eligible,
    });
    const requested = state.keyPool.find(
      (key) => key !== state.currentTargetKeyPitchClass,
    );
    expect(requested).toBeDefined();

    const selected = selectTranspositionKey(state, requested ?? 0);
    expect(selected.currentTargetKeyPitchClass).toBe(requested);
    expect(selected.keyBag).toEqual(state.keyBag);
  });

  it("does not clear or advance a clean Flow round below target tempo", () => {
    const state = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 12,
      eligibility: eligible,
    });
    const result = completeTranspositionRound(state, {
      mode: "flow",
      clean: true,
      meetsTargetTempo: false,
    });
    expect(result.currentTargetKeyPitchClass).toBe(
      state.currentTargetKeyPitchClass,
    );
    expect(result.sessionClearedPitchClasses).toEqual([]);
  });

  it("skips to the next key without marking the current key cleared", () => {
    const state = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 19,
      eligibility: eligible,
    });
    const skipped = skipTranspositionKey(state);
    expect(skipped.currentTargetKeyPitchClass).not.toBe(
      state.currentTargetKeyPitchClass,
    );
    expect(skipped.sessionClearedPitchClasses).toEqual([]);
  });

  it("reports every official-progress eligibility reason", () => {
    expect(evaluateTranspositionEligibility({
      level: 5,
      mode: "step",
      bpm: 80,
      targetTempo: 100,
      targetSource: { type: "style", styleId: "open-17" },
      confirmedLevel: 3,
      stale: true,
    })).toEqual({
      eligible: false,
      reasons: [
        "flow-required",
        "target-tempo-required",
        "resolved-voicing-required",
        "prerequisite-required",
        "progression-stale",
      ],
    });
    expect(evaluateTranspositionEligibility({
      level: 4,
      mode: "flow",
      bpm: 100,
      targetTempo: 100,
      targetSource: { type: "resolved-voicing" },
      confirmedLevel: 3,
      stale: false,
    })).toEqual({ eligible: true, reasons: [] });
  });
});
