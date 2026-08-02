import { describe, expect, it, vi } from "vitest";
import type { ChordSymbol, ChordTimelineItem } from "../domain/types";
import {
  createPlaybackController,
  type PlaybackAudioDriver,
  type PlayingSource,
} from "./playbackController";
import type { PreviewLifecycleCallbacks } from "./chordPreview";

const chord: ChordSymbol = {
  root: 0,
  quality: "maj7",
  tensions: [],
  label: "Cmaj7",
};
const timeline: ChordTimelineItem[] = [{
  bar: 1,
  beat: 1,
  durationBeats: 4,
  chord,
  confidence: 0.9,
  alternatives: [],
  warnings: [],
}];
const sourceA: PlayingSource = { kind: "home", id: "idea:a:block:one" };
const sourceB: PlayingSource = { kind: "vault", id: "idea:b:block:two" };

function makeDriver() {
  const sessions: PreviewLifecycleCallbacks[] = [];
  const driver: PlaybackAudioDriver = {
    playChord: vi.fn(async (_chord, _sound, callbacks) => {
      sessions.push(callbacks);
    }),
    playTimeline: vi.fn(async (_timeline, _bpm, _sound, callbacks) => {
      sessions.push(callbacks);
    }),
    playNotes: vi.fn(async (_notes, _bpm, _sound, callbacks) => {
      sessions.push(callbacks);
    }),
    stop: vi.fn(),
  };
  return { driver, sessions };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("playbackController", () => {
  it("publishes starting, playing, and natural completion states", async () => {
    const { driver, sessions } = makeDriver();
    const controller = createPlaybackController(driver, () => 125);
    const listener = vi.fn();
    controller.subscribe(listener);

    await controller.play(sourceA, { type: "timeline", timeline, bpm: 100 });
    expect(controller.getState()).toMatchObject({ status: "starting", source: sourceA });
    sessions[0].onStarted?.();
    expect(controller.getState()).toMatchObject({
      status: "playing",
      source: sourceA,
      startedAt: 125,
    });
    sessions[0].onEnded?.("completed");
    expect(controller.getState()).toEqual({ status: "idle" });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("stops the same source and replaces it with a different source", async () => {
    const { driver, sessions } = makeDriver();
    const controller = createPlaybackController(driver);

    await controller.toggle(sourceA, { type: "timeline", timeline });
    sessions[0].onStarted?.();
    await controller.toggle(sourceA, { type: "timeline", timeline });
    expect(controller.getState()).toEqual({ status: "idle" });

    await controller.play(sourceA, { type: "timeline", timeline });
    const firstReplacementSession = sessions[1];
    await controller.play(sourceB, { type: "chord", chord });
    expect(controller.getState()).toMatchObject({ status: "starting", source: sourceB });
    firstReplacementSession.onEnded?.("stopped");
    expect(controller.getState()).toMatchObject({ status: "starting", source: sourceB });
    expect(driver.stop).toHaveBeenCalledTimes(4);
  });

  it("routes chord and timeline requests through their matching driver methods", async () => {
    const { driver } = makeDriver();
    const controller = createPlaybackController(driver);
    await controller.play(sourceA, { type: "chord", chord, sound: "piano" });
    await controller.play(sourceB, {
      type: "timeline",
      timeline,
      bpm: 88,
      sound: "electric-piano",
    });
    expect(driver.playChord).toHaveBeenCalledWith(chord, "piano", expect.any(Object));
    expect(driver.playTimeline).toHaveBeenCalledWith(
      timeline,
      88,
      "electric-piano",
      expect.any(Object),
    );
  });

  it("routes note events and reports natural lifecycle completion", async () => {
    const { driver, sessions } = makeDriver();
    const controller = createPlaybackController(driver);
    const lifecycle = { onStarted: vi.fn(), onEnded: vi.fn() };
    const notes = [{ pitch: 40, startBeat: 0, durationBeats: 1, velocity: 96 }];

    await controller.play(
      { kind: "practice", id: "degree:one" },
      { type: "notes", notes, bpm: 88, sound: "clean-bass" },
      lifecycle,
    );
    expect(driver.playNotes).toHaveBeenCalledWith(
      notes,
      88,
      "clean-bass",
      expect.any(Object),
    );
    sessions[0].onStarted?.();
    sessions[0].onEnded?.("completed");
    expect(lifecycle.onStarted).toHaveBeenCalledOnce();
    expect(lifecycle.onEnded).toHaveBeenCalledWith("completed");
    expect(controller.getState()).toEqual({ status: "idle" });
  });

  it("reports Top Bar stop once and suppresses stale natural completion", async () => {
    const { sessions, driver } = makeDriver();
    const controller = createPlaybackController(driver);
    const lifecycle = { onEnded: vi.fn() };

    await controller.play(sourceA, { type: "timeline", timeline }, lifecycle);
    sessions[0].onStarted?.();
    controller.stop();
    controller.stop();
    sessions[0].onEnded?.("completed");

    expect(lifecycle.onEnded).toHaveBeenCalledTimes(1);
    expect(lifecycle.onEnded).toHaveBeenCalledWith("stopped");
    expect(controller.getState()).toEqual({ status: "idle" });
  });

  it("reports cross-source replacement once and keeps the replacement active", async () => {
    const firstLifecycle = { onEnded: vi.fn() };
    const secondLifecycle = { onEnded: vi.fn() };
    const controlled = makeDriver();
    const replacementController = createPlaybackController(controlled.driver);

    await replacementController.play(
      sourceA,
      { type: "timeline", timeline },
      firstLifecycle,
    );
    await replacementController.play(sourceB, { type: "chord", chord }, secondLifecycle);
    controlled.sessions[0].onEnded?.("completed");

    expect(firstLifecycle.onEnded).toHaveBeenCalledTimes(1);
    expect(firstLifecycle.onEnded).toHaveBeenCalledWith("replaced");
    expect(secondLifecycle.onEnded).not.toHaveBeenCalled();
    expect(replacementController.getState()).toMatchObject({
      status: "starting",
      source: sourceB,
    });
    controlled.sessions[1].onEnded?.("completed");
    expect(secondLifecycle.onEnded).toHaveBeenCalledWith("completed");
    expect(replacementController.getState()).toEqual({ status: "idle" });
  });

  it("ignores a rejected request after a newer request replaces it", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const callbacks: PreviewLifecycleCallbacks[] = [];
    const driver: PlaybackAudioDriver = {
      playChord: vi.fn((_chord, _sound, lifecycle) => {
        callbacks.push(lifecycle);
        return callbacks.length === 1 ? first.promise : second.promise;
      }),
      playTimeline: vi.fn(),
      stop: vi.fn(),
    };
    const controller = createPlaybackController(driver);

    const stalePlay = controller.play(sourceA, { type: "chord", chord });
    const currentPlay = controller.play(sourceB, { type: "chord", chord });
    callbacks[1].onStarted?.();

    first.reject(new Error("stale load failed"));
    await expect(stalePlay).resolves.toBeUndefined();
    expect(controller.getState()).toMatchObject({
      status: "playing",
      source: sourceB,
    });

    second.resolve();
    await currentPlay;
  });

  it("resets state and reports a failure from the current request", async () => {
    const failure = new Error("current load failed");
    const driver: PlaybackAudioDriver = {
      playChord: vi.fn(async () => {
        throw failure;
      }),
      playTimeline: vi.fn(),
      stop: vi.fn(),
    };
    const controller = createPlaybackController(driver);

    await expect(
      controller.play(sourceA, { type: "chord", chord }),
    ).rejects.toBe(failure);
    expect(controller.getState()).toEqual({ status: "idle" });
    expect(driver.stop).toHaveBeenCalledTimes(2);
  });
});
