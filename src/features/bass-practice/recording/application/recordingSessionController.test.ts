import { describe, expect, it } from "vitest";
import { RecordingSessionController } from "./recordingSessionController";
import {
  FakeCaptureDeviceRepository,
  FakePracticeRecorder,
  FakeRecordingCapability,
  InMemoryRecordingTakeRepository,
} from "./fakes";

function makeController(overrides?: {
  capability?: FakeRecordingCapability;
  devices?: FakeCaptureDeviceRepository;
  recorder?: FakePracticeRecorder;
  takes?: InMemoryRecordingTakeRepository;
}) {
  const capability = overrides?.capability ?? FakeRecordingCapability.available();
  const devices = overrides?.devices ?? new FakeCaptureDeviceRepository();
  const recorder = overrides?.recorder ?? new FakePracticeRecorder();
  const takes = overrides?.takes ?? new InMemoryRecordingTakeRepository();
  const controller = new RecordingSessionController({ capability, devices, recorder, takes }, "mono-sum");
  return { controller, capability, devices, recorder, takes };
}

async function reachRecording(controller: RecordingSessionController) {
  controller.probe();
  await controller.enableRecording();
  controller.startCountIn();
  await controller.beginRecording({ mimeType: "audio/webm;codecs=opus" });
}

describe("RecordingSessionController", () => {
  it("records, plays back and keeps a take", async () => {
    const { controller, takes } = makeController();
    await reachRecording(controller);
    expect(controller.getState().status).toBe("recording");
    await controller.stop();
    expect(controller.getState().status).toBe("recorded");
    controller.playTake();
    expect(controller.getState().heardTake).toBe(true);
    controller.playbackEnded();
    const { state, id } = await controller.keep();
    expect(state.status).toBe("saved");
    expect(id).toBeDefined();
    expect(takes.size).toBe(1);
  });

  it("marks unavailable when capability is missing", () => {
    const { controller } = makeController({
      capability: FakeRecordingCapability.unavailable(["MediaRecorder"]),
    });
    expect(controller.probe().status).toBe("unavailable");
  });

  it("routes permission denial without abandoning anything", async () => {
    const devices = new FakeCaptureDeviceRepository();
    devices.denyPermission();
    const { controller } = makeController({ devices });
    controller.probe();
    const state = await controller.enableRecording();
    expect(state.status).toBe("permission-denied");
  });

  it("keeps the ephemeral take playable when the save fails (quota/denial)", async () => {
    const takes = new InMemoryRecordingTakeRepository();
    takes.failKeep = true;
    const { controller } = makeController({ takes });
    await reachRecording(controller);
    await controller.stop();
    const { state } = await controller.keep();
    expect(state).toMatchObject({ status: "recorded", saveFailed: true });
    expect(takes.size).toBe(0);
  });

  it("goes to error when the recorder fails to start, and disposes it", async () => {
    const recorder = new FakePracticeRecorder();
    recorder.failStart = true;
    const { controller } = makeController({ recorder });
    controller.probe();
    await controller.enableRecording();
    controller.startCountIn();
    const state = await controller.beginRecording({ mimeType: "audio/webm;codecs=opus" });
    expect(state).toMatchObject({ status: "error", errorCode: "recorder-error" });
    expect(recorder.disposeCount).toBeGreaterThan(0);
    expect(recorder.leaked).toBe(false);
  });

  it("does not leak the recorder across 20 retakes", async () => {
    const recorder = new FakePracticeRecorder();
    const { controller } = makeController({ recorder });
    controller.probe();
    await controller.enableRecording();
    for (let i = 0; i < 20; i += 1) {
      controller.startCountIn();
      await controller.beginRecording({ mimeType: "audio/webm;codecs=opus" });
      await controller.stop();
      controller.retake();
    }
    expect(recorder.leaked).toBe(false);
    expect(recorder.startCount).toBe(20);
    expect(recorder.disposeCount).toBeGreaterThanOrEqual(20);
  });

  it("dispose tears down device listeners and recorder resources", async () => {
    const devices = new FakeCaptureDeviceRepository();
    const recorder = new FakePracticeRecorder();
    const { controller } = makeController({ devices, recorder });
    controller.probe();
    await controller.enableRecording();
    expect(devices.liveListenerCount()).toBe(1);
    controller.dispose();
    expect(devices.liveListenerCount()).toBe(0);
    expect(controller.getState().status).toBe("idle");
    expect(recorder.leaked).toBe(false);
  });

  it("surfaces a device disconnect during recording as an error", async () => {
    const { controller, recorder } = makeController();
    await reachRecording(controller);
    const state = controller.deviceDisconnected();
    expect(state.status).toBe("error");
    expect(recorder.leaked).toBe(false);
  });

  it("notifies subscribers on each transition", async () => {
    const { controller } = makeController();
    const seen: string[] = [];
    const unsubscribe = controller.subscribe((state) => seen.push(state.status));
    controller.probe();
    await controller.enableRecording();
    unsubscribe();
    expect(seen).toContain("requesting-permission");
    expect(seen).toContain("ready");
  });
});
