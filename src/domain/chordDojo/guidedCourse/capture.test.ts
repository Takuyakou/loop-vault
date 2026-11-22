import { describe, expect, it } from "vitest";
import { CaptureHarness, CAPTURE_WINDOW_MS as CONTRACT_WINDOW, RESPONSE_TIMEOUT_MS as CONTRACT_TIMEOUT, SETTLE_MS as CONTRACT_SETTLE, type CaptureEvent } from "../../../courseDesign/inputContract";
import { CAPTURE_WINDOW_MS, RESPONSE_TIMEOUT_MS, SETTLE_MS } from "./bank";
import { CourseCapture, clockJumpDetected, courseAttemptOutcome, hiddenInvalid, pollGapInvalid, withinSpeedLimit, type CourseCaptureEvent } from "./capture";

const on = (note: number, at: number, channel = 0): CourseCaptureEvent => ({ kind: "note-on", channel, note, at });
const off = (note: number, at: number, channel = 0): CourseCaptureEvent => ({ kind: "note-off", channel, note, at });

function both(events: readonly CourseCaptureEvent[], requiredCount = 3) {
  const product = new CourseCapture({ requiredCount });
  const contract = new CaptureHarness({ requiredCount });
  product.arm(0);
  contract.arm(0);
  for (const event of events) {
    product.event(event);
    contract.event(event as CaptureEvent);
  }
  return { product, contract };
}

describe("P23-40 hardens the product capture against the v3 contract", () => {
  it("keeps the frozen values", () => {
    expect(SETTLE_MS).toBe(CONTRACT_SETTLE);
    expect(CAPTURE_WINDOW_MS).toBe(CONTRACT_WINDOW);
    expect(RESPONSE_TIMEOUT_MS).toBe(CONTRACT_TIMEOUT);
  });

  it("seals the same notes, boundary and speed as the contract on injected clocks", () => {
    const cases: { readonly events: readonly CourseCaptureEvent[]; readonly braces: readonly number[] }[] = [
      { events: [on(60, 1000), on(64, 1000), on(67, 1000)], braces: [1059, 1060] },
      { events: [on(60, 2000), on(64, 2000), on(67, 2000)], braces: [2059, 2060] },
      { events: [on(60, 1000), on(64, 1000), on(67, 1000), on(71, 1200)], braces: [5000] },
      { events: [on(60, 1000), on(64, 1000), on(67, 1000), off(60, 1010), off(67, 1020)], braces: [1060] },
    ];
    for (const { events, braces } of cases) {
      const product = new CourseCapture({ requiredCount: 3 });
      const contract = new CaptureHarness({ requiredCount: 3 });
      product.arm(0);
      contract.arm(0);
      for (const event of events) {
        product.event(event);
        contract.event(event as CaptureEvent);
      }
      for (const now of braces) {
        const productSealed = product.advance(now);
        const contractSealed = contract.advance(now);
        expect(productSealed === undefined, JSON.stringify({ events, now })).toBe(contractSealed === undefined);
        if (productSealed !== undefined && contractSealed !== undefined) {
          expect(productSealed.notes).toEqual(contractSealed.notes);
          expect(productSealed.reason).toBe(contractSealed.reason);
          expect(productSealed.sealedAt).toBe(contractSealed.sealedAt);
          expect(productSealed.speedMs).toBe(contractSealed.speedMs);
          expect(withinSpeedLimit(productSealed)).toBe(!contractSealed.noInput && contractSealed.speedMs !== undefined && contractSealed.speedMs <= 3000);
        }
      }
    }
  });

  it("classifies the same attempt categories and never makes a device-invalid out of no input", () => {
    const empty = both([]);
    expect(courseAttemptOutcome(empty.product.advance(10_000), 3)).toBe("no-input");
    const partial = both([on(60, 1000), on(64, 1050)]);
    expect(courseAttemptOutcome(partial.product.advance(2500), 3)).toBe("incomplete");
    const played = both([on(60, 1000), on(64, 1000), on(67, 1000)]);
    expect(courseAttemptOutcome(played.product.advance(1060), 3)).toBe("played");
    expect(courseAttemptOutcome(undefined, 3)).toBe("invalid");
  });

  it("waits for the complete pitch-class set, including a bass added after the first note", () => {
    const capture = new CourseCapture({ requiredCount: 3 });
    capture.arm(0);
    capture.event(on(41, 1000)); // F2 bass first
    expect(capture.advance(1060)).toBeUndefined();
    capture.event(on(56, 1080));
    expect(capture.advance(1140)).toBeUndefined();
    capture.event(on(60, 1160));
    const sealed = capture.advance(1220)!;
    expect(sealed.notes).toEqual([41, 56, 60]);
    expect(sealed.speedMs).toBe(1160);
    expect(courseAttemptOutcome(sealed, 3)).toBe("played");
  });

  it("does not let an octave doubling complete the required pitch classes", () => {
    const capture = new CourseCapture({ requiredCount: 3 });
    capture.arm(0);
    capture.event(on(41, 1000));
    capture.event(on(53, 1010)); // F3, same pitch class
    capture.event(on(56, 1020));
    expect(capture.advance(1100)).toBeUndefined();
    capture.event(on(60, 1200));
    expect(courseAttemptOutcome(capture.advance(1260), 3)).toBe("played");
  });

  it("Lv1/2 can wait for input without a response timeout, then use the capture window", () => {
    const capture = new CourseCapture({ requiredCount: 3, waitForInput: true });
    capture.arm(0);
    expect(capture.advance(60_000)).toBeUndefined();
    capture.event(on(60, 60_500));
    capture.event(on(64, 60_510));
    expect(capture.advance(60_600)).toBeUndefined();
    capture.event(on(67, 60_620));
    expect(capture.advance(60_680)?.notes).toEqual([60, 64, 67]);
  });

  it("freezes the detectable environment rules", () => {
    expect(pollGapInvalid(250)).toBe(false);
    expect(pollGapInvalid(251)).toBe(true);
    expect(clockJumpDetected(100, 100)).toBe(false);
    expect(clockJumpDetected(100, 201)).toBe(true);
    expect(clockJumpDetected(-1, 16)).toBe(true);
    expect(hiddenInvalid("visible")).toBeUndefined();
    expect(hiddenInvalid("hidden")).toBe("hidden");
  });
});
