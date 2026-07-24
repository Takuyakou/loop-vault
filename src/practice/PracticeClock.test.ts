import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeChordSymbol } from "../domain/chords";
import type { ChordTimelineItem } from "../domain/types";
import {
  buildPracticeClockSchedule,
  PracticeClock,
  PRACTICE_FLOW_EARLY_MS,
  PRACTICE_FLOW_LATE_MS,
} from "./PracticeClock";

const toneMock = vi.hoisted(() => {
  const transport = {
    PPQ: 192,
    position: 0 as number | string,
    bpm: {
      value: 60,
      rampTo: vi.fn(),
    },
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    clear: vi.fn(),
    scheduleRepeat: vi.fn(() => 1),
  };
  const draw = {
    schedule: vi.fn((callback: () => void) => callback()),
  };
  class Synth {
    volume = { value: 0 };
    triggerAttackRelease = vi.fn();
    dispose = vi.fn();

    toDestination(): this {
      return this;
    }
  }
  return {
    draw,
    start: vi.fn<() => Promise<void>>(),
    Synth,
    transport,
  };
});

vi.mock("tone", () => ({
  getDraw: () => toneMock.draw,
  getTransport: () => toneMock.transport,
  start: toneMock.start,
  Synth: toneMock.Synth,
}));

beforeEach(() => {
  vi.clearAllMocks();
  toneMock.start.mockResolvedValue();
  toneMock.transport.scheduleRepeat
    .mockImplementation(() => toneMock.transport.scheduleRepeat.mock.calls.length);
});

describe("PracticeClock schedule", () => {
  it("builds deterministic 4/4 windows and a round boundary", () => {
    const schedule = buildPracticeClockSchedule([
      event(1, 1, 4),
      event(2, 1, 4),
    ], 4, 60);
    expect(schedule.roundBeats).toBe(8);
    expect(schedule.events[0]).toEqual({
      eventIndex: 0,
      targetBeat: 0,
      openBeat: 0,
      closeBeat: PRACTICE_FLOW_LATE_MS / 1000,
    });
    expect(schedule.events[1]?.targetBeat).toBe(4);
    expect(schedule.events[1]?.openBeat).toBe(4 - PRACTICE_FLOW_EARLY_MS / 1000);
  });

  it("preserves source event indexes after chronological sorting", () => {
    const schedule = buildPracticeClockSchedule([
      event(2, 1, 4),
      event(1, 1, 4),
    ], 4, 120);
    expect(schedule.events.map((entry) => entry.eventIndex)).toEqual([1, 0]);
    expect(schedule.roundBeats).toBe(8);
  });
});

describe("PracticeClock start generation", () => {
  it("does not start the transport when stop cancels a pending Tone.start", async () => {
    const deferred = createDeferred();
    toneMock.start.mockReturnValueOnce(deferred.promise);
    const clock = new PracticeClock();

    const pending = clock.start(startOptions());
    clock.stop();
    deferred.resolve();
    await pending;

    expect(toneMock.transport.start).not.toHaveBeenCalled();
  });

  it("does not start the transport when pause cancels a pending Tone.start", async () => {
    const deferred = createDeferred();
    toneMock.start.mockReturnValueOnce(deferred.promise);
    const clock = new PracticeClock();

    const pending = clock.start(startOptions());
    clock.pause();
    deferred.resolve();
    await pending;

    expect(toneMock.transport.start).not.toHaveBeenCalled();
  });

  it("allows only the newest start to reach the transport", async () => {
    const deferred = createDeferred();
    toneMock.start
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce();
    const clock = new PracticeClock();

    const staleStart = clock.start(startOptions());
    await clock.start(startOptions());
    deferred.resolve();
    await staleStart;

    expect(toneMock.transport.start).toHaveBeenCalledTimes(1);
  });

  it("pauses and resumes an active transport without rebuilding its schedule", async () => {
    const clock = new PracticeClock();
    await clock.start(startOptions());
    const scheduledCount = toneMock.transport.scheduleRepeat.mock.calls.length;

    clock.pause();
    clock.resume();

    expect(toneMock.transport.pause).toHaveBeenCalledTimes(1);
    expect(toneMock.transport.start).toHaveBeenCalledTimes(2);
    expect(toneMock.transport.scheduleRepeat).toHaveBeenCalledTimes(scheduledCount);
    expect(toneMock.transport.clear).not.toHaveBeenCalled();
  });
});

function event(bar: number, beat: number, durationBeats: number): ChordTimelineItem {
  return {
    bar,
    beat,
    durationBeats,
    chord: makeChordSymbol(0, "maj7"),
    confidence: 1,
    alternatives: [],
    warnings: [],
  };
}

function startOptions() {
  return {
    events: [event(1, 1, 4)],
    bpm: 80,
    beatsPerBar: 4,
    callbacks: {
      onTargetOpen: vi.fn(),
      onTargetClose: vi.fn(),
      onRoundCompleted: vi.fn(),
    },
  };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

