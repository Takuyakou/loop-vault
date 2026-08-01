import { describe, expect, it, vi } from "vitest";
import {
  createPlaybackController,
  type PlaybackAudioDriver,
  type PlaybackRequest,
} from "../../../audio/playbackController";
import type { PreviewLifecycleCallbacks } from "../../../audio/chordPreview";
import { generatedExercise } from "../domain/testFixtures";
import {
  DegreePracticeSession,
  type DegreePracticeTimer,
} from "./degreePracticeSession";

function harness() {
  const lifecycles: PreviewLifecycleCallbacks[] = [];
  const requests: PlaybackRequest[] = [];
  const driver: PlaybackAudioDriver = {
    playChord: vi.fn(),
    playTimeline: vi.fn(),
    playNotes: vi.fn(async (notes, bpm, sound, lifecycle) => {
      requests.push({ type: "notes", notes, bpm, sound });
      lifecycles.push(lifecycle);
    }),
    stop: vi.fn(),
  };
  let now = 1_000;
  let timerCallback: (() => void) | undefined;
  const timerHandle = Object.freeze({ id: 1 });
  const timer: DegreePracticeTimer = {
    set: vi.fn((callback) => {
      timerCallback = callback;
      return timerHandle;
    }),
    clear: vi.fn(),
  };
  const controller = createPlaybackController(driver, () => now);
  const session = new DegreePracticeSession({
    exercise: generatedExercise({ seed: "session", tempo: 120 }),
    singEnabled: true,
    controller,
    clock: { now: () => now },
    timer,
  });
  return {
    controller,
    driver,
    lifecycles,
    requests,
    session,
    timer,
    timerHandle,
    advance(milliseconds: number) {
      now += milliseconds;
    },
    fireTimer() {
      timerCallback?.();
    },
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function stallNextNoteStartup(
  target: ReturnType<typeof harness>,
  pending: ReturnType<typeof deferred>,
): void {
  vi.mocked(target.driver.playNotes!).mockImplementationOnce(
    (notes, bpm, sound, lifecycle) => {
      target.requests.push({ type: "notes", notes, bpm, sound });
      target.lifecycles.push(lifecycle);
      return pending.promise;
    },
  );
}

describe("DegreePracticeSession", () => {
  it("waits for actual playback completion and enforces the two-listen limit", async () => {
    const { lifecycles, requests, session } = harness();
    session.configure();

    await session.startListen();
    expect(session.getState()).toMatchObject({ status: "listening", listenCount: 1 });
    expect(requests[0]).toMatchObject({ type: "notes", sound: "clean-bass" });
    lifecycles[0].onStarted?.();
    expect(session.getState().status).toBe("listening");
    lifecycles[0].onEnded?.("completed");
    expect(session.getState().status).toBe("recall");

    await session.replay();
    lifecycles[1].onEnded?.("completed");
    expect(session.getState()).toMatchObject({ status: "recall", listenCount: 2 });
    expect(await session.replay()).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "replay-limit" }),
    }));
  });

  it("recovers from public stop and can listen again", async () => {
    const { driver, lifecycles, session } = harness();
    session.configure();
    await session.startListen();
    lifecycles[0].onStarted?.();

    expect(session.stopPlayback()).toEqual(expect.objectContaining({
      ok: true,
      state: expect.objectContaining({ status: "ready", listenCount: 0 }),
    }));
    expect(session.stopPlayback()).toEqual(expect.objectContaining({
      ok: true,
      state: expect.objectContaining({ status: "ready", listenCount: 0 }),
    }));
    lifecycles[0].onEnded?.("completed");
    expect(session.getState()).toMatchObject({ status: "ready", listenCount: 0 });

    await session.startListen();
    lifecycles[1].onEnded?.("completed");
    expect(session.getState()).toMatchObject({ status: "recall", listenCount: 1 });
    expect(driver.stop).toHaveBeenCalledTimes(3);
  });

  it("returns current ready state when stop wins a pending startup", async () => {
    const target = harness();
    const pending = deferred();
    stallNextNoteStartup(target, pending);
    target.session.configure();

    const operation = target.session.startListen();
    target.session.stopPlayback();
    pending.resolve();
    const result = await operation;

    expect(result).toEqual({ ok: true, state: target.session.getState() });
    expect(target.session.getState()).toMatchObject({ status: "ready", listenCount: 0 });
  });

  it("returns current recall state when replacement wins a pending replay", async () => {
    const target = harness();
    target.session.configure();
    await target.session.startListen();
    target.lifecycles[0].onEnded?.("completed");
    const pending = deferred();
    stallNextNoteStartup(target, pending);

    const operation = target.session.replay();
    await target.controller.play(
      { kind: "home", id: "pending-replacement" },
      {
        type: "chord",
        chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
      },
    );
    pending.resolve();
    const result = await operation;

    expect(result).toEqual({ ok: true, state: target.session.getState() });
    expect(target.session.getState()).toMatchObject({ status: "recall", listenCount: 1 });
  });

  it("returns current abandoned state when route leave wins a pending startup", async () => {
    const target = harness();
    const pending = deferred();
    stallNextNoteStartup(target, pending);
    target.session.configure();

    const operation = target.session.startListen();
    target.session.handleRouteLeave();
    pending.resolve();
    const result = await operation;

    expect(result).toEqual({ ok: true, state: target.session.getState() });
    expect(target.session.getState().status).toBe("abandoned");
  });

  it("swallows a stale startup rejection after cancellation without stale state", async () => {
    const target = harness();
    const pending = deferred();
    stallNextNoteStartup(target, pending);
    target.session.configure();

    const operation = target.session.startListen();
    target.session.stopPlayback();
    pending.reject(new Error("stale startup failure"));

    await expect(operation).resolves.toEqual({
      ok: true,
      state: target.session.getState(),
    });
    expect(target.session.getState()).toMatchObject({ status: "ready", listenCount: 0 });
  });

  it("recovers a cancelled replay to recall without consuming the replay", async () => {
    const { lifecycles, session } = harness();
    session.configure();
    await session.startListen();
    lifecycles[0].onEnded?.("completed");
    await session.replay();
    lifecycles[1].onStarted?.();

    session.stopPlayback();
    expect(session.getState()).toMatchObject({ status: "recall", listenCount: 1 });
    await session.replay();
    expect(session.getState()).toMatchObject({ status: "listening", listenCount: 2 });
  });

  it("recovers when another global playback source replaces the exercise", async () => {
    const { controller, lifecycles, session } = harness();
    session.configure();
    await session.startListen();
    lifecycles[0].onStarted?.();

    await controller.play(
      { kind: "home", id: "replacement" },
      {
        type: "chord",
        chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
      },
    );
    expect(session.getState()).toMatchObject({ status: "ready", listenCount: 0 });
  });

  it("uses an injected monotonic clock for dwell and clears the timer on skip", async () => {
    const { advance, lifecycles, session, timer, timerHandle } = harness();
    const listener = vi.fn();
    session.subscribe(listener);
    session.configure();
    await session.startListen();
    lifecycles[0].onEnded?.("completed");

    const singing = session.beginSinging();
    expect(singing).toEqual(expect.objectContaining({
      ok: true,
      state: expect.objectContaining({ status: "singing" }),
    }));
    expect(timer.set).toHaveBeenCalledWith(expect.any(Function), 1_600);
    expect(session.isSingingCompletionAvailable()).toBe(false);
    expect(session.completeSinging()).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "sing-gate-pending" }),
    }));

    advance(1_600);
    expect(session.isSingingCompletionAvailable()).toBe(true);
    expect(session.skipSinging()).toEqual(expect.objectContaining({
      ok: true,
      state: expect.objectContaining({
        status: "thinking",
        singSkipped: true,
        singGateCompleted: false,
      }),
    }));
    expect(timer.clear).toHaveBeenCalledWith(timerHandle);
    expect(listener).toHaveBeenCalled();
  });

  it("enables sing completion only after the clamped dwell deadline", async () => {
    const { advance, fireTimer, lifecycles, session } = harness();
    const listener = vi.fn();
    session.subscribe(listener);
    session.configure();
    await session.startListen();
    lifecycles[0].onEnded?.("completed");
    session.beginSinging();
    listener.mockClear();

    advance(1_600);
    fireTimer();
    expect(listener).toHaveBeenCalledOnce();
    expect(session.completeSinging()).toEqual(expect.objectContaining({
      ok: true,
      state: expect.objectContaining({
        status: "thinking",
        singGateCompleted: true,
        singSkipped: false,
      }),
    }));
  });

  it("plays octave references without changing the answer or workflow state", async () => {
    const { lifecycles, requests, session } = harness();
    const answerBefore = structuredClone(session.getExercise().targetEvents);
    session.configure();
    await session.startListen();
    lifecycles[0].onEnded?.("completed");

    await session.playSingingReference("octave-2");
    const reference = requests[1];
    expect(reference).toMatchObject({ type: "notes", sound: "singing-reference" });
    if (reference.type !== "notes") throw new Error("Expected note request.");
    expect(reference.notes.map((note) => note.pitch)).toEqual(
      answerBefore.map((event) => event.midiNote + 24),
    );
    expect(session.getExercise().targetEvents).toEqual(answerBefore);
    expect(session.getState().status).toBe("recall");
  });

  it("stops an active sing-along reference before the solo singing dwell", async () => {
    const { controller, driver, lifecycles, session } = harness();
    session.configure();
    await session.startListen();
    lifecycles[0].onEnded?.("completed");
    await session.playSingingReference("auto");
    lifecycles[1].onStarted?.();
    expect(controller.getState().status).toBe("playing");

    session.beginSinging();
    expect(controller.getState().status).toBe("idle");
    expect(session.getState().status).toBe("singing");
    expect(driver.stop).toHaveBeenCalledTimes(3);
  });

  it.each(["handleRouteLeave", "handleModeLeave", "handleAppExit"] as const)(
    "%s abandons, stops once, and ignores stale completion",
    async (method) => {
      const { controller, driver, lifecycles, session } = harness();
      session.configure();
      await session.startListen();
      lifecycles[0].onStarted?.();

      session[method]();
      session[method]();
      expect(session.getState().status).toBe("abandoned");
      expect(controller.getState().status).toBe("idle");
      expect(driver.stop).toHaveBeenCalledTimes(2);
      lifecycles[0].onEnded?.("completed");
      expect(session.getState().status).toBe("abandoned");
    },
  );

  it("disposes dwell timers and subscriptions on unmount", async () => {
    const { lifecycles, session, timer, timerHandle } = harness();
    const listener = vi.fn();
    session.subscribe(listener);
    session.configure();
    await session.startListen();
    lifecycles[0].onEnded?.("completed");
    session.beginSinging();
    listener.mockClear();

    session.dispose();
    session.dispose();
    expect(session.getState().status).toBe("abandoned");
    expect(timer.clear).toHaveBeenCalledWith(timerHandle);
    expect(listener).toHaveBeenCalledOnce();
    expect(session.completeSinging()).toEqual(expect.objectContaining({ ok: false }));
  });
});
