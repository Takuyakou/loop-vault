import { describe, expect, it, vi } from "vitest";
import type { OutputTimestampSource } from "../../domain/earPractice";
import { createEarPlayback } from "./earPlayback";

/** A controller that starts at once, and ends when the test says so. */
function fakeController() {
  let lifecycle: { onStarted?: () => void; onEnded?: (reason: "completed" | "stopped" | "replaced") => void } = {};
  return {
    controller: {
      play: vi.fn(async (_source: unknown, _request: unknown, callbacks?: typeof lifecycle) => {
        lifecycle = callbacks ?? {};
        lifecycle.onStarted?.();
      }),
      stop: vi.fn(),
    },
    end: (reason: "completed" | "stopped" | "replaced" = "completed") => lifecycle.onEnded?.(reason),
  };
}

/** An audio context whose clock starts `base` ms before the page's clock, with readings that are off by `jitter`. */
function source(base: number, jitter: number[] = [], outputLatency = 0): OutputTimestampSource {
  let call = 0;
  let context = 100;
  return {
    currentTime: 100,
    outputLatency,
    getOutputTimestamp() {
      context += 0.001;
      const extra = jitter[call++] ?? 0;
      return { contextTime: context, performanceTime: base + context * 1000 + extra };
    },
  };
}

const request = { id: "ear:chord:0", notes: [], bpm: 120, endBeat: 4, sound: "piano" as const };

describe("鳴らし終わる時刻(earPlayback)", () => {
  it("says when the sound ends from the audio time of its start and its length, as a performance time", async () => {
    // 120 bpm: 4 beats = 2 seconds. The sound begins at audio time 100 s.
    const { controller } = fakeController();
    vi.useFakeTimers();
    const playback = createEarPlayback({ controller, contextNow: () => 100, clockSource: () => source(7000) });
    const handle = playback.play(request);
    await vi.advanceTimersByTimeAsync(200);
    const timing = (await handle.started)!;
    vi.useRealTimers();
    expect(Math.abs(timing.startPerfMs - (7000 + 100_000))).toBeLessThanOrEqual(5);
    expect(Math.abs(timing.endPerfMs - (7000 + 102_000))).toBeLessThanOrEqual(5);
  });

  it("is the same wherever the two clocks start, and when one reading is far off (a busy screen)", async () => {
    vi.useFakeTimers();
    for (const base of [0.5, 322, 5000, 900_000]) {
      const { controller } = fakeController();
      const playback = createEarPlayback({ controller, contextNow: () => 100, clockSource: () => source(base, [0, 0, 180, 0, 0]) });
      const handle = playback.play(request);
      await vi.advanceTimersByTimeAsync(200);
      const timing = (await handle.started)!;
      expect(Math.abs(timing.endPerfMs - (base + 102_000)), `base ${base}`).toBeLessThanOrEqual(100);
      // the length of the sound is not touched by the origin
      expect(Math.abs(timing.endPerfMs - timing.startPerfMs - 2000)).toBeLessThanOrEqual(5);
    }
    vi.useRealTimers();
  });

  it("adds the output latency, and does not use the end event of the player", async () => {
    vi.useFakeTimers();
    const { controller, end } = fakeController();
    const playback = createEarPlayback({ controller, contextNow: () => 100, clockSource: () => source(0, [], 0.05) });
    const handle = playback.play(request);
    await vi.advanceTimersByTimeAsync(200);
    const timing = (await handle.started)!;
    // the player's end event comes later (after the release tail): the time above was known before it
    expect(Math.abs(timing.endPerfMs - 102_050)).toBeLessThanOrEqual(5);
    end("completed");
    await expect(handle.ended).resolves.toBe("completed");
    vi.useRealTimers();
  });

  it("gives `undefined` when it was stopped before the sound began", async () => {
    const controller = {
      play: vi.fn(async (_source: unknown, _request: unknown, callbacks?: { onEnded?: (reason: "stopped") => void }) => { callbacks?.onEnded?.("stopped"); }),
      stop: vi.fn(),
    };
    const playback = createEarPlayback({ controller, clockSource: () => source(0) });
    const handle = playback.play(request);
    await expect(handle.started).resolves.toBeUndefined();
    await expect(handle.ended).resolves.toBe("stopped");
    playback.stop();
    expect(controller.stop).toHaveBeenCalled();
  });
});
