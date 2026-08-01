import { describe, expect, it } from "vitest";
import {
  createDegreePracticeState,
  reduceDegreePractice,
  restoreDegreePracticeState,
  singingGateDurationMs,
  type DegreePracticeState,
  type PracticeAction,
} from ".";

function transition(
  state: DegreePracticeState,
  action: PracticeAction,
): DegreePracticeState {
  const result = reduceDegreePractice(state, action);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.state;
}

function reachRecall(singEnabled = true, listenLimit = 3): DegreePracticeState {
  let state = createDegreePracticeState({ singEnabled, listenLimit });
  state = transition(state, { type: "CONFIGURE" });
  state = transition(state, { type: "START_LISTEN" });
  return transition(state, { type: "PLAYBACK_ENDED" });
}

describe("Degree Echo state machine", () => {
  it("completes the documented sing and transfer flow without fake completion", () => {
    let state = reachRecall();
    state = transition(state, {
      type: "CONTINUE_RECALL",
      nowMs: 1_000,
      phraseDurationMs: 4_000,
    });
    expect(state.status).toBe("singing");
    expect(reduceDegreePractice(state, { type: "COMPLETE_SING", nowMs: 4_199 }))
      .toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "sing-gate-pending" }),
      }));
    state = transition(state, { type: "COMPLETE_SING", nowMs: 4_200 });
    state = transition(state, { type: "START_PLAY" });
    state = transition(state, { type: "COMPLETE_PLAY" });
    expect(state.status).toBe("review");
    expect(state.rating).toBeUndefined();
    state = transition(state, { type: "RATE", rating: "good" });
    expect(state.status).toBe("transfer-offer");
    state = transition(state, { type: "START_TRANSFER" });
    state = transition(state, { type: "COMPLETE_TRANSFER" });
    state = transition(state, { type: "RATE", rating: "easy" });
    expect(state).toEqual(expect.objectContaining({
      status: "completed",
      rating: "easy",
      singGateCompleted: true,
      transferAttempted: true,
    }));
  });

  it("bypasses singing only when disabled", () => {
    const recall = reachRecall(false);
    const next = transition(recall, {
      type: "CONTINUE_RECALL",
      nowMs: 0,
      phraseDurationMs: 2_000,
    });
    expect(next.status).toBe("thinking");
    expect(next.singSkipped).toBe(false);
    expect(next.singGateCompleted).toBe(false);
  });

  it("records an explicit singing skip without treating it as an error", () => {
    let state = reachRecall();
    state = transition(state, {
      type: "CONTINUE_RECALL",
      nowMs: 0,
      phraseDurationMs: 2_000,
    });
    state = transition(state, { type: "SKIP_SING" });
    expect(state).toEqual(expect.objectContaining({
      status: "thinking",
      singSkipped: true,
      singGateCompleted: false,
    }));
  });

  it("enforces replay limit without mutating state", () => {
    let state = reachRecall(true, 2);
    state = transition(state, { type: "REPLAY" });
    expect(state).toEqual(expect.objectContaining({
      status: "listening",
      playbackReturnStatus: "recall",
    }));
    state = transition(state, { type: "PLAYBACK_ENDED" });
    const snapshot = structuredClone(state);
    const rejected = reduceDegreePractice(state, { type: "REPLAY" });
    expect(rejected).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "replay-limit" }),
    }));
    expect(state).toEqual(snapshot);
  });

  it.each(["recall", "thinking"] as const)(
    "replays through listening and returns only to the typed %s stage",
    (returnStage) => {
      let state = reachRecall(true, 4);
      if (returnStage === "thinking") {
        state = transition(state, {
          type: "CONTINUE_RECALL",
          nowMs: 1_000,
          phraseDurationMs: 2_000,
        });
      }
      if (returnStage === "thinking") {
        state = transition(state, { type: "COMPLETE_SING", nowMs: 2_600 });
      }
      expect(state.status).toBe(returnStage);
      state = transition(state, { type: "REPLAY" });
      expect(state.status).toBe("listening");
      expect(state.playbackReturnStatus).toBe(returnStage);
      expect(reduceDegreePractice(state, { type: "START_PLAY" })).toEqual(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({ code: "invalid-transition" }),
        }),
      );
      state = transition(state, { type: "PLAYBACK_ENDED" });
      expect(state.status).toBe(returnStage);
      expect(state.playbackReturnStatus).toBeUndefined();
    },
  );

  it("does not let Solo Sing replay time satisfy the dwell gate", () => {
    let singing = reachRecall();
    singing = transition(singing, {
      type: "CONTINUE_RECALL",
      nowMs: 1_000,
      phraseDurationMs: 2_000,
    });
    expect(singing.singGateAvailableAtMs).toBe(2_600);
    expect(reduceDegreePractice(singing, { type: "REPLAY" })).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "invalid-transition" }),
      }),
    );
    expect(reduceDegreePractice(singing, { type: "COMPLETE_SING", nowMs: 2_599 }))
      .toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "sing-gate-pending" }),
      }));
  });

  it("rejects workflow advances while replay playback is still active", () => {
    const listening = transition(reachRecall(), { type: "REPLAY" });
    const advances: PracticeAction[] = [
      { type: "CONTINUE_RECALL", nowMs: 0, phraseDurationMs: 2_000 },
      { type: "COMPLETE_SING", nowMs: 2_000 },
      { type: "START_PLAY" },
      { type: "COMPLETE_PLAY" },
      { type: "RATE", rating: "good" },
      { type: "START_TRANSFER" },
    ];
    for (const action of advances) {
      expect(reduceDegreePractice(listening, action)).toEqual(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({ code: "invalid-transition" }),
        }),
      );
    }
  });

  it("reveals hints one level at a time and never skips or exceeds the maximum", () => {
    let state = reachRecall();
    expect(state.hintLevel).toBe(0);
    for (const expected of [1, 2, 3, 4, 4] as const) {
      state = transition(state, { type: "NEXT_HINT" });
      expect(state.hintLevel).toBe(expected);
    }
  });

  it("rejects invalid transitions with a typed error", () => {
    const initial = createDegreePracticeState({ singEnabled: true, listenLimit: 3 });
    expect(reduceDegreePractice(initial, { type: "START_PLAY" })).toEqual({
      ok: false,
      error: {
        code: "invalid-transition",
        message: "Action START_PLAY is invalid while practice is setup.",
      },
    });
    expect(initial.status).toBe("setup");
  });

  it("abandons safely from an active state and cannot abandon completed work", () => {
    const abandoned = transition(reachRecall(), { type: "ABANDON" });
    expect(abandoned.status).toBe("abandoned");

    let completed = reachRecall(false);
    completed = transition(completed, {
      type: "CONTINUE_RECALL",
      nowMs: 0,
      phraseDurationMs: 1_000,
    });
    completed = transition(completed, { type: "START_PLAY" });
    completed = transition(completed, { type: "COMPLETE_PLAY" });
    completed = transition(completed, { type: "RATE", rating: "hard" });
    expect(completed.status).toBe("completed");
    expect(reduceDegreePractice(completed, { type: "ABANDON" }).ok).toBe(false);
  });

  it("restores valid state snapshots and rejects corrupt completion", () => {
    const state = reachRecall();
    expect(restoreDegreePracticeState(structuredClone(state))).toEqual(state);
    expect(() => restoreDegreePracticeState({
      ...state,
      status: "completed",
      rating: undefined,
    })).toThrow("Completed practice requires a self rating");
  });

  it("rejects unreachable cross-field restore snapshots", () => {
    const recall = reachRecall();
    const impossible: Array<[Partial<DegreePracticeState>, string]> = [
      [{ status: "listening", playbackReturnStatus: undefined }, "typed playback return"],
      [{ status: "recall", playbackReturnStatus: "thinking" }, "Only listening"],
      [{ status: "singing", singEnabled: false }, "Sing-disabled"],
      [{ status: "singing", singGateAvailableAtMs: undefined }, "dwell deadline"],
      [{ status: "thinking", singSkipped: false, singGateCompleted: false }, "exactly one"],
      [{ status: "thinking", singSkipped: true, singGateCompleted: true }, "both skipped and completed"],
      [{ status: "transfer-offer", rating: "hard", singGateCompleted: true }, "Good or Easy"],
      [{
        status: "transfer",
        rating: "good",
        transferAttempted: false,
        singGateCompleted: true,
      }, "attempted Good or Easy"],
      [{ status: "ready", listenCount: 1 }, "cannot contain listens"],
      [{ status: "ready", listenCount: 0, hintLevel: 1 }, "Hints cannot be used before"],
      [{ status: "review", rating: "good", singGateCompleted: true }, "Only reviewed states"],
      [{ status: "recall", mainIssue: "pitch" }, "requires a rating"],
    ];
    for (const [overrides, message] of impossible) {
      expect(() => restoreDegreePracticeState({ ...recall, ...overrides }))
        .toThrow(message);
    }
  });

  it.each([
    [0, 1_000],
    [1_000, 1_000],
    [5_000, 4_000],
    [20_000, 8_000],
  ])("clamps singing dwell for %i ms phrases to %i ms", (phrase, expected) => {
    expect(singingGateDurationMs(phrase)).toBe(expected);
  });
});
