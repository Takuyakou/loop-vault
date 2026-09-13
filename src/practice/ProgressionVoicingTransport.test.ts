import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ProgressionPracticeVoicingPlan,
  ProgressionVoicingPracticeSnapshot,
} from "../domain/progressionVoicingPractice";
import {
  buildProgressionPracticeClockSchedule,
  PROGRESSION_VOICING_PRACTICE_PPQ,
  progressionPracticeTicksAtBeat,
} from "../domain/progressionVoicingPractice";
import { ProgressionVoicingTransport } from "./ProgressionVoicingTransport";

const toneMock = vi.hoisted(() => {
  const scheduled: Array<{ callback: (time: number) => void; interval: string; start?: string | number }> = [];
  const drawCallbacks: Array<() => void> = [];
  const instruments: PolySynth[] = [];
  const activeScheduleIds = new Set<number>();
  const activeInstruments = new Set<PolySynth>();
  const transport = {
    PPQ: 192,
    ticks: 0,
    getTicksAtTime: vi.fn((_time: number) => 0),
    position: 0 as number | string,
    bpm: { value: 80, rampTo: vi.fn() },
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    clear: vi.fn((id: number) => { activeScheduleIds.delete(id); }),
    scheduleRepeat: vi.fn((callback: (time: number) => void, interval: string, start?: string | number) => {
      scheduled.push({ callback, interval, start });
      const id = scheduled.length;
      activeScheduleIds.add(id);
      return id;
    }),
  };
  class PolySynth {
    volume = { value: 0 };
    triggerAttackRelease = vi.fn();
    triggerAttack = vi.fn();
    releaseAll = vi.fn();
    dispose = vi.fn(() => { activeInstruments.delete(this); });
    constructor() {
      instruments.push(this);
      activeInstruments.add(this);
    }
    toDestination() { return this; }
  }
  class Synth extends PolySynth {}
  return {
    transport,
    scheduled,
    instruments,
    activeScheduleIds,
    activeInstruments,
    PolySynth,
    Synth,
    start: vi.fn(),
    now: vi.fn(() => 1),
    drawCallbacks,
    draw: { schedule: vi.fn((callback: () => void) => { drawCallbacks.push(callback); }) },
  };
});

vi.mock("tone", () => ({
  FMSynth: class FMSynth {},
  PolySynth: toneMock.PolySynth,
  Synth: toneMock.Synth,
  getTransport: () => toneMock.transport,
  getDraw: () => toneMock.draw,
  start: toneMock.start,
  now: toneMock.now,
}));

beforeEach(() => {
  vi.clearAllMocks();
  toneMock.scheduled.length = 0;
  toneMock.drawCallbacks.length = 0;
  toneMock.instruments.length = 0;
  toneMock.activeScheduleIds.clear();
  toneMock.activeInstruments.clear();
  toneMock.transport.PPQ = 192;
  toneMock.transport.ticks = 0;
  toneMock.transport.getTicksAtTime.mockImplementation(() => toneMock.transport.ticks);
  toneMock.start.mockResolvedValue(undefined);
});

describe("ProgressionVoicingTransport", () => {
  it("schedules voicings, click, and visual projection on one Tone Transport", async () => {
    const onTransportBeat = vi.fn();
    const runtime = new ProgressionVoicingTransport();
    await runtime.start({ snapshot, plan, bpm: 96, countInBars: 1, metronomeEnabled: true, onTransportBeat });

    expect(toneMock.transport.bpm.value).toBe(96);
    expect(toneMock.scheduled.map(({ interval, start }) => [interval, start])).toEqual([
      ["1536i", "768i"],
      ["1536i", "1152i"],
      ["4n", 0],
      ["16n", 0],
    ]);
    expect(toneMock.transport.start).toHaveBeenCalledWith("+0.05");
    expect(onTransportBeat).toHaveBeenCalledWith(0);

    toneMock.transport.getTicksAtTime.mockReturnValueOnce(1152);
    toneMock.scheduled[0]?.callback(1.5);
    expect(toneMock.instruments[0]?.releaseAll).toHaveBeenCalledWith(1.5);
    expect(toneMock.instruments[0]?.triggerAttack).toHaveBeenCalledWith(["D3", "A3", "C4"], 1.5, 0.72);

    toneMock.transport.getTicksAtTime.mockReturnValueOnce(768);
    toneMock.scheduled[2]?.callback(1.75);
    expect(toneMock.instruments[1]?.triggerAttackRelease).toHaveBeenCalledWith("C6", "32n", 1.75);

    toneMock.transport.ticks = 0;
    toneMock.transport.getTicksAtTime.mockReturnValueOnce(960);
    toneMock.scheduled[3]?.callback(2);
    toneMock.drawCallbacks[toneMock.drawCallbacks.length - 1]?.();
    expect(toneMock.transport.getTicksAtTime).toHaveBeenCalledWith(2);
    expect(onTransportBeat).toHaveBeenLastCalledWith(5);
  });

  it("pauses, resumes, restarts without rebuilding, and clears every owned schedule", async () => {
    const runtime = new ProgressionVoicingTransport();
    await runtime.start({ snapshot, plan, bpm: 80, countInBars: 0, metronomeEnabled: false, onTransportBeat: vi.fn() });
    const scheduleCount = toneMock.scheduled.length;
    const boundary = toneMock.scheduled[0]!;
    const originalVoicingSynth = toneMock.instruments[0]!;
    runtime.pause();
    boundary.callback(1);
    expect(originalVoicingSynth.triggerAttack).not.toHaveBeenCalled();
    expect(originalVoicingSynth.dispose).toHaveBeenCalledTimes(1);
    runtime.resume();
    toneMock.instruments[2]?.triggerAttack.mockClear();
    boundary.callback(2);
    expect(toneMock.instruments[2]?.triggerAttack).toHaveBeenCalledTimes(1);
    runtime.restart();
    expect(toneMock.scheduled).toHaveLength(scheduleCount);
    expect(toneMock.transport.pause).toHaveBeenCalledTimes(1);
    expect(toneMock.transport.position).toBe(0);

    runtime.setBpm(122);
    expect(toneMock.transport.bpm.rampTo).toHaveBeenCalledWith(122, 0.1);
    runtime.stop();
    expect(toneMock.transport.clear).toHaveBeenCalledTimes(scheduleCount);
  });

  it("invalidates a pending audio start so it cannot create duplicate schedules", async () => {
    let release!: () => void;
    toneMock.start.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
    const runtime = new ProgressionVoicingTransport();
    const pending = runtime.start({ snapshot, plan, bpm: 80, countInBars: 0, metronomeEnabled: true, onTransportBeat: vi.fn() });
    runtime.stop();
    release();
    await pending;
    expect(toneMock.scheduled).toHaveLength(0);
  });

  it("gives a pending full Start priority over reference audition", async () => {
    let release!: () => void;
    toneMock.start.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
    const runtime = new ProgressionVoicingTransport();
    const pending = runtime.start({ snapshot, plan, bpm: 80, countInBars: 0, metronomeEnabled: true, onTransportBeat: vi.fn() });
    await runtime.audition([60, 64, 67]);
    expect(toneMock.start).toHaveBeenCalledTimes(1);
    expect(toneMock.instruments).toHaveLength(0);
    release();
    await pending;
    expect(toneMock.scheduled).toHaveLength(4);
    expect(toneMock.instruments).toHaveLength(2);
  });

  it("applies the latest BPM and metronome preference when pending Start completes", async () => {
    let release!: () => void;
    toneMock.start.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
    const runtime = new ProgressionVoicingTransport();
    const pending = runtime.start({ snapshot, plan, bpm: 80, countInBars: 0, metronomeEnabled: true, onTransportBeat: vi.fn() });
    runtime.setBpm(132);
    runtime.setMetronomeEnabled(false);
    release();
    await pending;
    expect(toneMock.transport.bpm.value).toBe(132);
    toneMock.scheduled[2]?.callback(1);
    expect(toneMock.instruments[1]?.triggerAttackRelease).not.toHaveBeenCalled();
  });

  it("lets Pause invalidate a pending Tone.start without touching an unowned Transport", async () => {
    let release!: () => void;
    toneMock.start.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
    const runtime = new ProgressionVoicingTransport();
    const pending = runtime.start({ snapshot, plan, bpm: 80, countInBars: 0, metronomeEnabled: true, onTransportBeat: vi.fn() });
    expect(runtime.pause()).toBe(false);
    release();
    await pending;
    expect(toneMock.scheduled).toHaveLength(0);
    expect(toneMock.transport.stop).not.toHaveBeenCalled();
  });

  it("keeps the sounding chord boundary on musical ticks across a mid-chord BPM change", async () => {
    const runtime = new ProgressionVoicingTransport();
    await runtime.start({ snapshot, plan, bpm: 80, countInBars: 0, metronomeEnabled: true, onTransportBeat: vi.fn() });
    const firstBoundary = toneMock.scheduled[0]!;
    firstBoundary.callback(1);
    runtime.setBpm(160);
    const secondBoundary = toneMock.scheduled[1]!;
    toneMock.transport.getTicksAtTime.mockReturnValueOnce(384);
    secondBoundary.callback(1.5);
    expect(firstBoundary.start).toBe("0i");
    expect(secondBoundary.start).toBe("384i");
    expect(toneMock.instruments[0]?.triggerAttackRelease).not.toHaveBeenCalled();
    expect(toneMock.instruments[0]?.releaseAll).toHaveBeenLastCalledWith(1.5);
    expect(toneMock.instruments[0]?.triggerAttack).toHaveBeenLastCalledWith(["D3", "A3", "C4"], 1.5, 0.72);
    expect(toneMock.transport.bpm.rampTo).toHaveBeenCalledWith(160, 0.1);
  });

  it("does not stop or clear a shared Transport it does not own", () => {
    const runtime = new ProgressionVoicingTransport();
    runtime.stop();
    expect(toneMock.transport.stop).not.toHaveBeenCalled();
    expect(toneMock.transport.clear).not.toHaveBeenCalled();
  });

  it("cancels a pending audition before it can create or retain an instrument", async () => {
    let release!: () => void;
    toneMock.start.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
    const runtime = new ProgressionVoicingTransport();
    const pending = runtime.audition([48, 55, 59]);
    runtime.stop();
    release();
    await pending;
    expect(toneMock.instruments).toHaveLength(0);
  });

  it("drops deferred visual callbacks across pause/resume and restart epochs", async () => {
    const onTransportBeat = vi.fn();
    const runtime = new ProgressionVoicingTransport();
    await runtime.start({ snapshot, plan, bpm: 80, countInBars: 0, metronomeEnabled: true, onTransportBeat });
    const visual = toneMock.scheduled[3]!;
    onTransportBeat.mockClear();

    toneMock.transport.getTicksAtTime.mockReturnValueOnce(192);
    visual.callback(1);
    expect(runtime.pause()).toBe(true);
    expect(runtime.resume()).toBe(true);
    toneMock.drawCallbacks.shift()?.();
    expect(onTransportBeat).not.toHaveBeenCalled();

    toneMock.transport.getTicksAtTime.mockReturnValueOnce(384);
    visual.callback(2);
    toneMock.drawCallbacks.shift()?.();
    expect(onTransportBeat).toHaveBeenLastCalledWith(2);

    onTransportBeat.mockClear();
    toneMock.transport.getTicksAtTime.mockReturnValueOnce(576);
    visual.callback(3);
    expect(runtime.restart()).toBe(true);
    toneMock.drawCallbacks.shift()?.();
    expect(onTransportBeat).not.toHaveBeenCalled();

    toneMock.transport.getTicksAtTime.mockReturnValueOnce(192);
    visual.callback(4);
    toneMock.drawCallbacks.shift()?.();
    expect(onTransportBeat).toHaveBeenLastCalledWith(1);
  });

  it("schedules the canonical P5.29 4,2,2,4,4 boundaries from the shared snapshot", async () => {
    const starts = [0, 4, 6, 8, 12] as const;
    const durations = [4, 2, 2, 4, 4] as const;
    const harmonicSnapshot: ProgressionVoicingPracticeSnapshot = {
      ...snapshot,
      fingerprint: "p529-harmonic-rhythm-fixture",
      lengthBeats: 16,
      events: starts.map((startBeat, index) => ({
        ...snapshot.events[index % snapshot.events.length]!,
        id: `p529-${index}`,
        startBeat,
        durationBeats: durations[index]!,
      })),
    };
    const harmonicPlan: ProgressionPracticeVoicingPlan = {
      ...plan,
      snapshotFingerprint: harmonicSnapshot.fingerprint,
      events: harmonicSnapshot.events.map((event, index) => ({
        ...plan.events[index % plan.events.length]!,
        eventId: event.id,
      })),
    };

    const runtime = new ProgressionVoicingTransport();
    await runtime.start({
      snapshot: harmonicSnapshot,
      plan: harmonicPlan,
      bpm: 96,
      countInBars: 1,
      metronomeEnabled: false,
      onTransportBeat: vi.fn(),
    });

    expect(toneMock.scheduled.slice(0, 5).map(({ interval, start }) => [interval, start])).toEqual([
      ["3072i", "768i"],
      ["3072i", "1536i"],
      ["3072i", "1920i"],
      ["3072i", "2304i"],
      ["3072i", "3072i"],
    ]);
  });

  it("schedules canonical fractional loop and event boundaries on the clock grid", async () => {
    const fractionalSnapshot: ProgressionVoicingPracticeSnapshot = {
      ...snapshot,
      fingerprint: "fractional-grid-fixture",
      lengthBeats: 211 / PROGRESSION_VOICING_PRACTICE_PPQ,
      events: [
        { ...snapshot.events[0]!, durationBeats: 77 / PROGRESSION_VOICING_PRACTICE_PPQ },
        {
          ...snapshot.events[1]!,
          startBeat: 77 / PROGRESSION_VOICING_PRACTICE_PPQ,
          durationBeats: 134 / PROGRESSION_VOICING_PRACTICE_PPQ,
        },
      ],
    };
    const fractionalPlan: ProgressionPracticeVoicingPlan = {
      ...plan,
      snapshotFingerprint: fractionalSnapshot.fingerprint,
      events: plan.events.map((item, index) => ({ ...item, eventId: fractionalSnapshot.events[index]!.id })),
    };
    const schedule = buildProgressionPracticeClockSchedule(fractionalSnapshot, 1);
    expect(progressionPracticeTicksAtBeat(schedule.loopBeats)).toBe(211);
    expect(schedule.eventStarts.map(progressionPracticeTicksAtBeat)).toEqual([0, 77]);

    const runtime = new ProgressionVoicingTransport();
    await runtime.start({
      snapshot: fractionalSnapshot,
      plan: fractionalPlan,
      bpm: 80,
      countInBars: 1,
      metronomeEnabled: false,
      onTransportBeat: vi.fn(),
    });
    expect(toneMock.scheduled.slice(0, 2).map(({ interval, start }) => [interval, start]))
      .toEqual([["211i", "768i"], ["211i", "845i"]]);
  });

  it("scales the canonical grid exactly for a compatible higher Tone PPQ", async () => {
    toneMock.transport.PPQ = 384;
    const fractionalSnapshot: ProgressionVoicingPracticeSnapshot = {
      ...snapshot,
      fingerprint: "fractional-grid-384-fixture",
      lengthBeats: 211 / PROGRESSION_VOICING_PRACTICE_PPQ,
      events: [
        { ...snapshot.events[0]!, durationBeats: 77 / PROGRESSION_VOICING_PRACTICE_PPQ },
        {
          ...snapshot.events[1]!,
          startBeat: 77 / PROGRESSION_VOICING_PRACTICE_PPQ,
          durationBeats: 134 / PROGRESSION_VOICING_PRACTICE_PPQ,
        },
      ],
    };
    const runtime = new ProgressionVoicingTransport();
    await runtime.start({
      snapshot: fractionalSnapshot,
      plan: { ...plan, snapshotFingerprint: fractionalSnapshot.fingerprint },
      bpm: 80,
      countInBars: 1,
      metronomeEnabled: false,
      onTransportBeat: vi.fn(),
    });
    expect(toneMock.scheduled.slice(0, 2).map(({ interval, start }) => [interval, start]))
      .toEqual([["422i", "1536i"], ["422i", "1690i"]]);
  });

  it("fails closed without retained resources when Tone PPQ cannot represent the practice grid", async () => {
    toneMock.transport.PPQ = 100;
    const runtime = new ProgressionVoicingTransport();
    await expect(runtime.start({
      snapshot,
      plan,
      bpm: 80,
      countInBars: 0,
      metronomeEnabled: true,
      onTransportBeat: vi.fn(),
    })).rejects.toThrow(/PPQ/);
    expect(toneMock.scheduled).toHaveLength(0);
    expect(toneMock.instruments).toHaveLength(0);
    expect(toneMock.activeScheduleIds.size).toBe(0);
    expect(toneMock.activeInstruments.size).toBe(0);
    runtime.stop();
    expect(toneMock.transport.stop).not.toHaveBeenCalled();
    expect(toneMock.transport.clear).not.toHaveBeenCalled();
  });

  it("clears every active schedule and instrument through 30 musical minutes and rapid lifecycle cycles", async () => {
    const runtime = new ProgressionVoicingTransport();
    const onTransportBeat = vi.fn();
    const cycles = 20;
    const schedulesPerCycle = 4;
    const instrumentsPerCycle = 6;

    for (let cycle = 0; cycle < cycles; cycle += 1) {
      await runtime.start({
        snapshot,
        plan,
        bpm: 80,
        countInBars: 0,
        metronomeEnabled: true,
        onTransportBeat,
      });
      const scheduledBeforeLongProjection = toneMock.scheduled.length;
      const instrumentsBeforeLongProjection = toneMock.instruments.length;
      expect(toneMock.activeScheduleIds.size).toBe(schedulesPerCycle);
      expect(toneMock.activeInstruments.size).toBe(2);
      const visualCallback = toneMock.scheduled[scheduledBeforeLongProjection - 1]!;
      toneMock.transport.getTicksAtTime.mockReturnValueOnce(30 * 80 * toneMock.transport.PPQ);
      visualCallback.callback(1);
      toneMock.drawCallbacks.shift()?.();
      expect(onTransportBeat).toHaveBeenLastCalledWith(2_400);
      expect(toneMock.scheduled).toHaveLength(scheduledBeforeLongProjection);
      expect(toneMock.instruments).toHaveLength(instrumentsBeforeLongProjection);
      expect(toneMock.activeScheduleIds.size).toBe(schedulesPerCycle);
      expect(toneMock.activeInstruments.size).toBe(2);

      expect(runtime.pause()).toBe(true);
      expect(runtime.resume()).toBe(true);
      expect(runtime.restart()).toBe(true);
      runtime.stop();
      expect(toneMock.activeScheduleIds.size).toBe(0);
      expect(toneMock.activeInstruments.size).toBe(0);
    }

    expect(toneMock.scheduled).toHaveLength(cycles * schedulesPerCycle);
    expect(toneMock.transport.clear).toHaveBeenCalledTimes(cycles * schedulesPerCycle);
    expect(toneMock.instruments).toHaveLength(cycles * instrumentsPerCycle);
    expect(toneMock.instruments.every((instrument) => instrument.dispose.mock.calls.length === 1)).toBe(true);
    expect(toneMock.transport.pause).toHaveBeenCalledTimes(cycles);
    expect(toneMock.activeScheduleIds.size).toBe(0);
    expect(toneMock.activeInstruments.size).toBe(0);
  });
});

const snapshot: ProgressionVoicingPracticeSnapshot = {
  version: 1,
  fingerprint: "safe-fixture",
  source: { kind: "vault", reference: { ideaId: "idea", blockId: "block" } },
  selection: "source-midi",
  bpm: 80,
  meter: { numerator: 4, denominator: 4 },
  lengthBeats: 8,
  events: [
    { id: "a", startBeat: 0, durationBeats: 2, chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" }, voicing: { kind: "source-midi", midiNotes: [48, 55, 59] } },
    { id: "b", startBeat: 2, durationBeats: 6, chord: { root: 2, quality: "min7", tensions: [], label: "Dm7" }, voicing: { kind: "source-midi", midiNotes: [50, 57, 60] } },
  ],
};

const plan: ProgressionPracticeVoicingPlan = {
  snapshotFingerprint: snapshot.fingerprint,
  selection: "source-midi",
  events: snapshot.events.map((event) => ({
    eventId: event.id,
    status: "SUPPORTED" as const,
    voicing: {
      origin: "source-midi" as const,
      midiNotes: event.voicing!.midiNotes,
      addedColorDegrees: [],
      notes: event.voicing!.midiNotes.map((midiNote) => ({ midiNote, pitchClass: midiNote % 12, octave: Math.floor(midiNote / 12) - 1, degree: null })),
    },
  })),
};
