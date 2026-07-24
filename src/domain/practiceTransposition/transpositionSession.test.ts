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
