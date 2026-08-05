import { describe, expect, it } from "vitest";
import {
  createRecorderState,
  reduceRecorder,
  type RecorderAction,
  type RecorderState,
} from "./recorderStateMachine";
import type { RecordingTakeMetadata } from "./types";

const TAKE: RecordingTakeMetadata = {
  mimeType: "audio/webm;codecs=opus",
  durationMs: 2_000,
  byteSize: 4,
  channelMode: "auto",
  resolvedChannel: "mono-sum",
  startOffsetMs: 0,
};

function apply(state: RecorderState, action: RecorderAction): RecorderState {
  const result = reduceRecorder(state, action);
  if (!result.ok) throw new Error(`${action.type}: ${result.error.message}`);
  return result.state;
}

function reachRecording(): RecorderState {
  let state = createRecorderState("mono-sum");
  state = apply(state, { type: "PROBE", available: true });
  state = apply(state, { type: "REQUEST_PERMISSION" });
  state = apply(state, { type: "PERMISSION_GRANTED", hasDevice: true });
  state = apply(state, { type: "START_COUNT_IN" });
  state = apply(state, { type: "COUNT_IN_ELAPSED" });
  return apply(state, { type: "RECORDER_STARTED" });
}

describe("recorder state machine", () => {
  it("walks the happy path to a recorded, saved take", () => {
    let state = reachRecording();
    expect(state.status).toBe("recording");
    state = apply(state, { type: "STOP" });
    state = apply(state, { type: "RECORDER_STOPPED", take: TAKE });
    expect(state).toMatchObject({ status: "recorded", take: TAKE, heardTake: false });
    state = apply(state, { type: "PLAY_TAKE" });
    expect(state).toMatchObject({ status: "playing-take", heardTake: true });
    state = apply(state, { type: "PLAYBACK_ENDED" });
    state = apply(state, { type: "KEEP" });
    state = apply(state, { type: "SAVED" });
    expect(state.status).toBe("saved");
  });

  it("marks unavailable when the capability probe fails", () => {
    const state = apply(createRecorderState(), { type: "PROBE", available: false });
    expect(state.status).toBe("unavailable");
  });

  it("routes permission denial and allows retry", () => {
    let state = apply(createRecorderState(), { type: "PROBE", available: true });
    state = apply(state, { type: "REQUEST_PERMISSION" });
    state = apply(state, { type: "PERMISSION_DENIED" });
    expect(state.status).toBe("permission-denied");
    state = apply(state, { type: "RETRY_PERMISSION" });
    expect(state.status).toBe("requesting-permission");
  });

  it("goes to device-missing when permission is granted with no device", () => {
    let state = apply(createRecorderState(), { type: "PROBE", available: true });
    state = apply(state, { type: "REQUEST_PERMISSION" });
    state = apply(state, { type: "PERMISSION_GRANTED", hasDevice: false });
    expect(state.status).toBe("device-missing");
    state = apply(state, { type: "DEVICE_AVAILABLE" });
    expect(state.status).toBe("ready");
  });

  it("accepts stop immediately after start and returns to ready with no take", () => {
    let state = createRecorderState();
    state = apply(state, { type: "PROBE", available: true });
    state = apply(state, { type: "REQUEST_PERMISSION" });
    state = apply(state, { type: "PERMISSION_GRANTED", hasDevice: true });
    state = apply(state, { type: "START_COUNT_IN" });
    state = apply(state, { type: "COUNT_IN_ELAPSED" }); // status: starting
    state = apply(state, { type: "STOP" });
    state = apply(state, { type: "RECORDER_STOPPED" }); // no take
    expect(state.status).toBe("ready");
    expect(state.take).toBeUndefined();
  });

  it("cancels a count-in back to ready", () => {
    let state = reachReady();
    state = apply(state, { type: "START_COUNT_IN" });
    state = apply(state, { type: "CANCEL_COUNT_IN" });
    expect(state.status).toBe("ready");
  });

  it("rejects double start, double stop and play while recording", () => {
    const recording = reachRecording();
    expect(reduceRecorder(recording, { type: "START_COUNT_IN" }).ok).toBe(false);
    expect(reduceRecorder(recording, { type: "PLAY_TAKE" }).ok).toBe(false);
    const stopping = apply(recording, { type: "STOP" });
    expect(reduceRecorder(stopping, { type: "STOP" }).ok).toBe(false);
  });

  it("keeps the take playable after a failed save", () => {
    let state = apply(apply(reachRecording(), { type: "STOP" }), {
      type: "RECORDER_STOPPED",
      take: TAKE,
    });
    state = apply(state, { type: "KEEP" });
    state = apply(state, { type: "SAVE_FAILED" });
    expect(state).toMatchObject({ status: "recorded", saveFailed: true, take: TAKE });
  });

  it("retake and discard drop the take and are only valid after recording", () => {
    const recorded = apply(apply(reachRecording(), { type: "STOP" }), {
      type: "RECORDER_STOPPED",
      take: TAKE,
    });
    const retaken = apply(recorded, { type: "RETAKE" });
    expect(retaken.status).toBe("ready");
    expect(retaken.take).toBeUndefined();
    expect(apply(recorded, { type: "DISCARD" }).status).toBe("discarded");
    expect(reduceRecorder(reachReady(), { type: "RETAKE" }).ok).toBe(false);
  });

  it("errors on device disconnect and recorder error only during live capture", () => {
    const recording = reachRecording();
    expect(apply(recording, { type: "DEVICE_DISCONNECTED" })).toMatchObject({
      status: "error",
      errorCode: "device-disconnected",
    });
    expect(apply(recording, { type: "RECORDER_ERROR", errorCode: "blob-error" }).status).toBe("error");
    // idle is not live capture -> recorder error is an invalid transition
    expect(reduceRecorder(createRecorderState(), { type: "RECORDER_ERROR", errorCode: "blob-error" }).ok).toBe(false);
  });

  it("device disconnect while ready moves to device-missing, not error", () => {
    const ready = reachReady();
    expect(apply(ready, { type: "DEVICE_DISCONNECTED" }).status).toBe("device-missing");
  });

  it("RESET always tears down to idle (or stays unavailable)", () => {
    expect(apply(reachRecording(), { type: "RESET" }).status).toBe("idle");
    const unavailable = apply(createRecorderState(), { type: "PROBE", available: false });
    expect(apply(unavailable, { type: "RESET" }).status).toBe("unavailable");
  });

  it("rejects an unknown channel and disallows changing channel while recording", () => {
    const bad = reduceRecorder(createRecorderState(), {
      type: "SET_CHANNEL",
      channelMode: "middle" as never,
    });
    expect(bad).toMatchObject({ ok: false, error: { code: "invalid-channel" } });
    expect(reduceRecorder(reachRecording(), { type: "SET_CHANNEL", channelMode: "left" }).ok).toBe(false);
  });

  it("freezes returned state", () => {
    const state = apply(createRecorderState(), { type: "PROBE", available: true });
    expect(Object.isFrozen(state)).toBe(true);
  });
});

function reachReady(): RecorderState {
  let state = createRecorderState();
  state = apply(state, { type: "PROBE", available: true });
  state = apply(state, { type: "REQUEST_PERMISSION" });
  return apply(state, { type: "PERMISSION_GRANTED", hasDevice: true });
}
