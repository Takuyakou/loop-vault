import { describe, expect, it } from "vitest";
import {
  BPM_MAX,
  BPM_MIN,
  CLOCK_JUMP_TOLERANCE_MS,
  CaptureHarness,
  CAPTURE_WINDOW_MS,
  POLL_INTERVAL_MS,
  RESPONSE_TIMEOUT_MS,
  SETTLE_MS,
  SPEED_LIMIT_MS,
  STALL_MS,
  classifyAttempt,
  clockJumpDetected,
  hiddenInvalid,
  isWithinSpeedLimit,
  pollGapInvalid,
  type CaptureEvent,
  type InvalidReason,
} from "./inputContract";

/**
 * P23-39 §2.3: the deterministic counterexamples of the input contract (v2). Everything here is a
 * hand-written fixture with injected times; no wall clock, no sleeps, no audio, no product store.
 *
 * The v2 counterexamples the review demanded are marked with `REVIEW` and cover: a correct chord struck
 * after 1.5 s, the 3 s boundary, a partial-but-stable gesture, a delayed poll, and an input at/after the
 * seal boundary.
 */
const on = (note: number, at: number, channel = 0): CaptureEvent => ({ kind: "note-on", channel, note, at });
const off = (note: number, at: number, channel = 0): CaptureEvent => ({ kind: "note-off", channel, note, at });

function harness(requiredCount = 3, settleMs = SETTLE_MS, captureWindowMs = CAPTURE_WINDOW_MS) {
  const capture = new CaptureHarness({ requiredCount, settleMs, captureWindowMs });
  capture.arm(0);
  return capture;
}

describe("P23-39 §2.1–2.3 the capture contract", () => {
  it("seals a simultaneous chord once, at the settle deadline, with the completion time at the first Note On", () => {
    const capture = harness();
    for (const note of [60, 64, 67]) capture.event(on(note, 1000));
    expect(capture.advance(1059)).toBeUndefined();
    const sealed = capture.advance(1060)!;
    expect(sealed.notes).toEqual([60, 64, 67]);
    expect(sealed.reason).toBe("settled");
    expect(sealed.firstOnAt).toBe(1000);
    expect(sealed.completionAt).toBe(1000);
    expect(sealed.speedMs).toBe(1000);
    expect(classifyAttempt(sealed, 3)).toBe("played");
  });

  it("lets the natural finger spread settle, and measures the speed to the last Note On", () => {
    const capture = harness();
    capture.event(on(60, 1000));
    capture.event(on(64, 1005));
    capture.event(on(67, 1012));
    expect(capture.advance(1071)).toBeUndefined();
    const sealed = capture.advance(1072)!;
    expect(sealed.notes).toEqual([60, 64, 67]);
    expect(sealed.completionAt).toBe(1012);
    expect(sealed.speedMs).toBe(1012);
  });

  it("REVIEW keeps a correct chord struck at 2 s: the 1.5 s bound starts at the first key, not at arming", () => {
    const capture = harness();
    for (const note of [60, 64, 67]) capture.event(on(note, 2000));
    expect(capture.advance(2059)).toBeUndefined();
    const sealed = capture.advance(2060)!;
    expect(sealed.notes).toEqual([60, 64, 67]);
    expect(sealed.reason).toBe("settled");
    expect(sealed.speedMs).toBe(2000);
    expect(isWithinSpeedLimit(sealed)).toBe(true);
    expect(classifyAttempt(sealed, 3)).toBe("played");
  });

  it("REVIEW settles a partial gesture neutrally at the settle deadline; it is incomplete, not a device failure", () => {
    const capture = harness();
    capture.event(on(60, 1000));
    capture.event(on(64, 1050));
    expect(capture.advance(1109)).toBeUndefined();
    const sealed = capture.advance(1110)!;
    expect(sealed.notes).toEqual([60, 64]);
    expect(sealed.reason).toBe("settled");
    expect(sealed.speedMs).toBeUndefined();
    expect(classifyAttempt(sealed, 3)).toBe("incomplete");
  });

  it("REVIEW closes a gesture that keeps re-arming settle at the capture-window end", () => {
    const capture = harness();
    capture.event(on(60, 1000));
    for (let at = 1040; at <= 2480; at += 40) capture.event(on(60, at));
    expect(capture.advance(2499)).toBeUndefined();
    const sealed = capture.advance(2500)!;
    expect(sealed.notes).toEqual([60]);
    expect(sealed.reason).toBe("capture-window");
    expect(sealed.sealedAt).toBe(2500);
    expect(classifyAttempt(sealed, 3)).toBe("incomplete");
    expect(sealed.speedMs).toBeUndefined();
  });

  it("REVIEW ignores an input at or after the boundary even when no poll has run yet", () => {
    const settled = harness();
    for (const note of [60, 64, 67]) settled.event(on(note, 1000));
    settled.event(on(71, 1200));
    const sealed = settled.advance(5000)!;
    expect(sealed.sealedAt).toBe(1060);
    expect(sealed.notes).toEqual([60, 64, 67]);
    expect(sealed.reason).toBe("settled");

    const atBoundary = harness();
    for (const note of [60, 64, 67]) atBoundary.event(on(note, 1000));
    atBoundary.event(on(71, 1060));
    expect(atBoundary.advance(1060)!.notes).toEqual([60, 64, 67]);
  });

  it("REVIEW records the boundary, not the delayed poll, as sealedAt", () => {
    const capture = harness();
    for (const note of [60, 64, 67]) capture.event(on(note, 1000));
    const sealed = capture.advance(9000)!;
    expect(sealed.sealedAt).toBe(1060);
    expect(capture.advance(12000)).toEqual(sealed);
  });

  it("seals the first complete set and never rewrites it with a later correction", () => {
    const capture = harness();
    capture.event(on(60, 1000));
    capture.event(on(64, 1000));
    capture.event(on(68, 1000)); // a wrong note, but complete
    const sealed = capture.advance(1060)!;
    expect(sealed.notes).toEqual([60, 64, 68]);
    capture.event(off(68, 1100));
    capture.event(on(67, 1200));
    expect(capture.advance(1300)).toEqual(sealed);
    expect(capture.advance(2000)!.notes).toEqual([60, 64, 68]);
  });

  it("keeps an extra note added before the deadline (the pre-release candidate)", () => {
    const capture = harness();
    for (const note of [60, 64, 67]) capture.event(on(note, 1000));
    capture.event(on(71, 1010)); // the deadline moves to 1070
    capture.event(off(71, 1050));
    const sealed = capture.advance(1070)!;
    expect(sealed.notes).toEqual([60, 64, 67, 71]);
    expect(sealed.reason).toBe("settled");
  });

  it("distinct pitches are the answer: a re-strike updates the deadline, a second channel does not double a note", () => {
    const capture = harness();
    capture.event(on(60, 1000));
    capture.event(on(64, 1000));
    capture.event(on(60, 1040)); // same channel re-strike: still 60
    capture.event(on(67, 1040, 1)); // same pitch on another channel: still one 67
    const sealed = capture.advance(1100)!;
    expect(sealed.notes).toEqual([60, 64, 67]);
    expect(sealed.completionAt).toBe(1040);
  });

  it("a release before the deadline does not erase the candidate; the note-off order is irrelevant", () => {
    const capture = harness();
    for (const note of [60, 64, 67]) capture.event(on(note, 1000));
    capture.event(off(60, 1010));
    capture.event(off(67, 1020));
    const sealed = capture.advance(1060)!;
    expect(sealed.notes).toEqual([60, 64, 67]);
  });

  it("pedal (sustain) is not part of the captured answer: a released key is not in the set", () => {
    // The harness has no pedal event by design: the captured answer is pressed keys. A voice held by the
    // pedal keeps *sounding* in the product store, but it is not part of the next captured set.
    const capture = harness(2, SETTLE_MS, 3000);
    capture.event(on(60, 100));
    capture.event(off(60, 120));
    capture.event(on(64, 130));
    capture.event(on(67, 130));
    const sealed = capture.advance(190)!;
    expect(sealed.notes).toEqual([64, 67]);
    expect(sealed.notes).not.toContain(60);
  });

  it("a key held before arming is not the answer until it is released and pressed again", () => {
    const capture = new CaptureHarness({ requiredCount: 3 });
    capture.arm(0, [60]);
    capture.event(on(60, 100)); // still the old hold: ignored
    capture.event(off(60, 200));
    capture.event(on(60, 300));
    capture.event(on(64, 300));
    capture.event(on(67, 300));
    const sealed = capture.advance(360)!;
    expect(sealed.notes).toEqual([60, 64, 67]);
    expect(sealed.completionAt).toBe(300);
  });

  it("ignores events before arming and after the seal (late callbacks)", () => {
    const capture = new CaptureHarness({ requiredCount: 1 });
    capture.event(on(60, -50));
    capture.arm(0);
    capture.event(on(64, 100));
    const sealed = capture.advance(160)!;
    expect(sealed.notes).toEqual([64]);
    capture.event(on(67, 200));
    expect(capture.advance(300)).toEqual(sealed);
  });

  it("an invalid trial never seals and never counts as an answer (device/prepare/clock/stall/hidden)", () => {
    const reasons: InvalidReason[] = ["disconnected", "prepare-failed", "clock-jump", "capability", "stall", "hidden"];
    for (const reason of reasons) {
      const capture = harness();
      capture.event(on(60, 100));
      capture.invalidate(reason);
      expect(capture.current).toEqual({ kind: "invalid", reason });
      expect(capture.advance(RESPONSE_TIMEOUT_MS)).toBeUndefined();
      expect(classifyAttempt(undefined, 3)).toBe("invalid");
    }
    const sealed = harness();
    for (const note of [60, 64, 67]) sealed.event(on(note, 100));
    const done = sealed.advance(160)!;
    sealed.invalidate("disconnected");
    expect(sealed.current).toEqual({ kind: "sealed", sealed: done });
  });

  it("no input within the response timeout is an attempt, never a device-invalid or a wrong answer", () => {
    const capture = harness();
    expect(capture.advance(RESPONSE_TIMEOUT_MS - 1)).toBeUndefined();
    const sealed = capture.advance(RESPONSE_TIMEOUT_MS)!;
    expect(sealed.noInput).toBe(true);
    expect(sealed.reason).toBe("response-timeout");
    expect(sealed.sealedAt).toBe(RESPONSE_TIMEOUT_MS);
    expect(sealed.speedMs).toBeUndefined();
    expect(classifyAttempt(sealed, 3)).toBe("no-input");
    expect(isWithinSpeedLimit(sealed)).toBe(false);
  });

  it("does not apply the response timeout after the first key: a slow but started answer keeps its capture window", () => {
    const capture = harness();
    capture.event(on(60, RESPONSE_TIMEOUT_MS - 100));
    capture.event(on(64, RESPONSE_TIMEOUT_MS - 50));
    capture.event(on(67, RESPONSE_TIMEOUT_MS));
    const sealed = capture.advance(RESPONSE_TIMEOUT_MS + SETTLE_MS)!;
    expect(sealed.notes).toEqual([60, 64, 67]);
    expect(classifyAttempt(sealed, 3)).toBe("played");
    // Slow, but "played": the 3 s condition is the policy's, not the input's.
    expect(isWithinSpeedLimit(sealed)).toBe(false);
  });

  it("the 3 s limit is inclusive: 2999 and 3000 pass, 3001 does not, and only a completed capture has a speed", () => {
    for (const [completion, expected] of [[2999, true], [SPEED_LIMIT_MS, true], [3001, false]] as const) {
      const capture = harness();
      capture.event(on(60, completion - 2));
      capture.event(on(64, completion - 1));
      capture.event(on(67, completion));
      expect(capture.advance(completion + SETTLE_MS - 1)).toBeUndefined();
      const sealed = capture.advance(completion + SETTLE_MS)!;
      expect(sealed.speedMs).toBe(completion);
      expect(isWithinSpeedLimit(sealed), String(completion)).toBe(expected);
    }
  });

  it("REVIEW arms the ear window at the audio-ended callback, and ignores keys before it", () => {
    const capture = new CaptureHarness({ requiredCount: 3 });
    capture.arm(5000); // the audio ended at 5000 ms on the monotonic clock
    capture.event(on(60, 4999)); // still inside the playback: not an answer
    capture.event(on(60, 6800));
    capture.event(on(64, 6800));
    capture.event(on(67, 6800));
    const sealed = capture.advance(6860)!;
    expect(sealed.notes).toEqual([60, 64, 67]);
    expect(sealed.speedMs).toBe(1800);
    expect(isWithinSpeedLimit(sealed)).toBe(true);
  });

  it("freezes the detectable environment rules (stall / clock jump / hidden)", () => {
    expect(pollGapInvalid(STALL_MS)).toBe(false);
    expect(pollGapInvalid(STALL_MS + 1)).toBe(true);
    expect(clockJumpDetected(100, 100)).toBe(false);
    expect(clockJumpDetected(100, 100 + CLOCK_JUMP_TOLERANCE_MS)).toBe(false);
    expect(clockJumpDetected(100, 100 + CLOCK_JUMP_TOLERANCE_MS + 1)).toBe(true);
    expect(clockJumpDetected(-1, 16)).toBe(true);
    expect(hiddenInvalid("visible")).toBeUndefined();
    expect(hiddenInvalid("hidden")).toBe("hidden");
    expect(hiddenInvalid("prerender")).toBe("hidden");
  });

  it("keeps the frozen values explicit", () => {
    expect(SETTLE_MS).toBe(60);
    expect(CAPTURE_WINDOW_MS).toBe(1500);
    expect(RESPONSE_TIMEOUT_MS).toBe(10000);
    expect(SPEED_LIMIT_MS).toBe(3000);
    expect(BPM_MIN).toBe(30);
    expect(BPM_MAX).toBe(240);
    expect(POLL_INTERVAL_MS).toBe(10);
    expect(STALL_MS).toBe(250);
    expect(CLOCK_JUMP_TOLERANCE_MS).toBe(100);
  });
});
