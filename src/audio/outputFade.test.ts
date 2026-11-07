import { describe, expect, it, vi } from "vitest";
import {
  AUDITION_ATTACK_SECONDS, AUDITION_FADE_SECONDS, AUDITION_RETIRE_MS, MAX_FADING_INSTRUMENTS, PREVIEW_STOP_FADE_SECONDS, PREVIEW_STOP_RETIRE_MS, rampOutputGain,
} from "./outputFade";

const gainOf = (held: number) => ({
  gain: {
    getValueAtTime: vi.fn(() => held),
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  },
}) as never;

describe("output fade tools", () => {
  it("keep the numbers the Voicing Loop's audition has always used (12 ms down, 5 ms up, 24 ms before it is thrown away)", () => {
    expect(AUDITION_FADE_SECONDS).toBe(0.012);
    expect(AUDITION_ATTACK_SECONDS).toBe(0.005);
    expect(AUDITION_RETIRE_MS).toBe(24);
  });

  it("give a stopped preview 15 ms to fade, 40 ms before it is thrown away, and at most two fading at once", () => {
    expect(PREVIEW_STOP_FADE_SECONDS).toBe(0.015);
    expect(PREVIEW_STOP_RETIRE_MS).toBe(40);
    expect(MAX_FADING_INSTRUMENTS).toBe(2);
    // the instrument is thrown away after the fade has finished
    expect(PREVIEW_STOP_RETIRE_MS / 1000).toBeGreaterThan(PREVIEW_STOP_FADE_SECONDS);
  });

  it("rampOutputGain starts from the value the gain has at that moment (never a jump), then ramps to the target", () => {
    const output = gainOf(0.6);
    rampOutputGain(output, 0, 1, 1.015);
    const { gain } = output as unknown as { gain: Record<string, ReturnType<typeof vi.fn>> };
    expect(gain.getValueAtTime).toHaveBeenCalledWith(1);
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.6, 1);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 1.015);
    expect(gain.cancelScheduledValues).not.toHaveBeenCalled();
  });

  it("rampOutputGain forgets what was scheduled from that moment on when asked (a new ramp replaces the old)", () => {
    const output = gainOf(1);
    rampOutputGain(output, 1, 2, 2.005, true);
    const { gain } = output as unknown as { gain: Record<string, ReturnType<typeof vi.fn>> };
    expect(gain.cancelScheduledValues).toHaveBeenCalledWith(2);
    expect(gain.setValueAtTime).toHaveBeenCalledWith(1, 2);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 2.005);
  });
});
