// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RecordCompareSection } from "./RecordCompareSection";
import { setRecordChannel } from "../application/recordChannelStore";
import { RecordingSessionController } from "../application/recordingSessionController";
import {
  FakeCaptureDeviceRepository,
  FakePracticeRecorder,
  FakeRecordingCapability,
  InMemoryRecordingTakeRepository,
} from "../application/fakes";
import { FakePlayer } from "../application/playback";
import type { KeepContext, RecordingTake } from "../application/ports";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function fakeController(
  devices = new FakeCaptureDeviceRepository(),
  recorder = new FakePracticeRecorder(),
  takes = new InMemoryRecordingTakeRepository(),
) {
  return new RecordingSessionController(
    { capability: FakeRecordingCapability.available(), devices, recorder, takes },
    "mono-sum",
  );
}

class CapturingTakeRepository extends InMemoryRecordingTakeRepository {
  lastKeepContext?: KeepContext;
  override async keep(take: RecordingTake, context?: KeepContext): Promise<string> {
    this.lastKeepContext = context;
    return super.keep(take);
  }
}

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return { container, root };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function click(container: HTMLElement, testId: string) {
  const button = container.querySelector(`[data-testid=${testId}]`) as HTMLButtonElement | null;
  await act(async () => {
    button?.click();
    await flush();
  });
}

describe("RecordCompareSection", () => {
  // The channel now comes from the shared store; use a concrete channel so
  // recording resolves without live Auto metering.
  beforeEach(() => setRecordChannel("mono-sum"));
  afterEach(() => { try { localStorage.clear(); } catch { /* jsdom */ } });

  test("renders nothing when the feature flag is off", async () => {
    const { container, root } = mount();
    await act(async () => root.render(<RecordCompareSection mode="degree" enabledOverride={false} />));
    expect(container.textContent).toBe("");
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("is opt-in and only requests permission on enable", async () => {
    const devices = new FakeCaptureDeviceRepository();
    const controller = fakeController(devices);
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection mode="degree" controller={controller} enabledOverride />,
    ));
    // opt-in shown, permission not yet requested
    expect(container.querySelector("[data-record-state=off]")).not.toBeNull();
    expect(devices.permission).toBe("prompt");

    await click(container, "record-compare-enable");
    expect(devices.permission).toBe("granted");
    expect(container.querySelector("[data-testid=record-compare-status]")?.textContent).toContain("録音できます");

    await act(async () => root.unmount());
    expect(controller.getState().status).toBe("idle"); // disposed on unmount
    document.body.replaceChildren();
  });

  test("drives record → listen back → keep, with no scoring language", async () => {
    const controller = fakeController();
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection mode="rhythm" controller={controller} enabledOverride />,
    ));
    await click(container, "record-compare-enable");
    await click(container, "record-start");
    expect(container.querySelector("[data-record-state=recording]")).not.toBeNull();
    await click(container, "record-stop");
    expect(container.querySelector("[data-record-state=recorded]")).not.toBeNull();
    await click(container, "record-keep");
    expect(container.querySelector("[data-record-state=saved]")).not.toBeNull();
    expect(container.textContent).not.toContain("Accuracy");
    expect(container.textContent).not.toContain("Score");
    expect(container.textContent).toContain("自動分析や採点はありません");

    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("permission denial keeps the flow usable without recording", async () => {
    const devices = new FakeCaptureDeviceRepository();
    devices.denyPermission();
    const controller = fakeController(devices);
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection mode="degree" controller={controller} enabledOverride />,
    ));
    await click(container, "record-compare-enable");
    expect(container.querySelector("[data-record-state=permission-denied]")).not.toBeNull();
    expect(container.textContent).toContain("録音せずに続けられます");
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("count-in can be cancelled back to ready", async () => {
    const controller = fakeController();
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection mode="degree" controller={controller} countInMs={10_000} enabledOverride />,
    ));
    await click(container, "record-compare-enable");
    await click(container, "record-start");
    expect(container.querySelector("[data-record-state=counting-in]")).not.toBeNull();
    expect(container.querySelector("[data-testid=record-countin]")).not.toBeNull();
    await click(container, "record-cancel-countin");
    expect(container.querySelector("[data-record-state=ready]")).not.toBeNull();
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("Hear My Take and Hear Target never play at once", async () => {
    const controller = fakeController();
    const onPlaybackStart = vi.fn();
    const takePlayer = new FakePlayer();
    const targetPlayer = new FakePlayer();
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection
        mode="degree"
        controller={controller}
        takePlayer={takePlayer}
        targetPlayer={targetPlayer}
        onPlaybackStart={onPlaybackStart}
        enabledOverride
      />,
    ));
    await click(container, "record-compare-enable");
    await click(container, "record-start");
    await click(container, "record-stop");
    await click(container, "hear-take");
    expect(takePlayer.playing).toBe(true);
    expect(container.querySelector("[data-record-state=playing-take]")).not.toBeNull();
    // switching to Target must stop the take first (mutual exclusion)
    await act(async () => { takePlayer.end(); await flush(); }); // finish take playback -> recorded
    await click(container, "hear-target");
    expect(targetPlayer.playing).toBe(true);
    expect(takePlayer.playing).toBe(false);
    expect(onPlaybackStart).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });


  test("coordinates recording accompaniment and returns only an opaque retained-take reference", async () => {
    const controller = fakeController();
    const onRecordingStart = vi.fn(async () => undefined);
    const onRecordingStop = vi.fn();
    const onTakeKept = vi.fn();
    const onUnkeptTakeChange = vi.fn();
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection
        mode="bassline"
        controller={controller}
        enabledOverride
        onRecordingStart={onRecordingStart}
        onRecordingStop={onRecordingStop}
        onTakeKept={onTakeKept}
        onUnkeptTakeChange={onUnkeptTakeChange}
      />,
    ));

    expect(container.textContent).toContain("Use headphones");
    expect(container.textContent).toContain("never internally mixed");
    await click(container, "record-compare-enable");
    await click(container, "record-start");
    expect(onRecordingStart).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-record-state=recording]")).not.toBeNull();
    await click(container, "record-stop");
    expect(onRecordingStop).toHaveBeenCalled();
    expect(onUnkeptTakeChange).toHaveBeenLastCalledWith(true);
    await click(container, "record-keep");
    expect(onUnkeptTakeChange).toHaveBeenLastCalledWith(false);
    expect(onTakeKept).toHaveBeenCalledTimes(1);
    expect(onTakeKept.mock.calls[0]![0]).toMatch(/^take-/);
    expect(JSON.stringify(onTakeKept.mock.calls[0]![0])).not.toMatch(/device|path|audio/i);

    await act(async () => root.unmount());
    document.body.replaceChildren();
  });


  test("prepares accompaniment before capture and schedules only at the confirmed boundary", async () => {
    const recorder = new FakePracticeRecorder();
    let releasePrepare: ((prepared: boolean) => void) | undefined;
    const order: string[] = [];
    const onRecordingPrepare = vi.fn(() => new Promise<boolean>((resolve) => {
      order.push("prepare");
      releasePrepare = resolve;
    }));
    const onRecordingStart = vi.fn(() => { order.push("schedule"); return true; });
    const onRecordingStop = vi.fn();
    const controller = fakeController(new FakeCaptureDeviceRepository(), recorder);
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection
        mode="bassline"
        controller={controller}
        enabledOverride
        onRecordingPrepare={onRecordingPrepare}
        onRecordingStart={onRecordingStart}
        onRecordingStop={onRecordingStop}
      />,
    ));

    await click(container, "record-compare-enable");
    await click(container, "record-start");
    expect(container.querySelector("[data-record-state=preparing-accompaniment]")).not.toBeNull();
    expect(recorder.active).toBe(false);
    expect(order).toEqual(["prepare"]);

    releasePrepare?.(true);
    await act(async () => { await flush(); await flush(); });
    expect(recorder.active).toBe(true);
    expect(order).toEqual(["prepare", "schedule"]);
    expect(container.querySelector("[data-record-state=recording]")).not.toBeNull();
    await click(container, "record-stop");
    expect(onRecordingStop).toHaveBeenCalled();
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("cancels a slow accompaniment preparation without starting capture or scheduling", async () => {
    const recorder = new FakePracticeRecorder();
    let releasePrepare: ((prepared: boolean) => void) | undefined;
    const onRecordingPrepare = vi.fn(() => new Promise<boolean>((resolve) => { releasePrepare = resolve; }));
    const onRecordingStart = vi.fn();
    const onRecordingStop = vi.fn();
    const activity = vi.fn();
    const controller = fakeController(new FakeCaptureDeviceRepository(), recorder);
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection
        mode="bassline"
        controller={controller}
        enabledOverride
        onRecordingPrepare={onRecordingPrepare}
        onRecordingStart={onRecordingStart}
        onRecordingStop={onRecordingStop}
        onRecordingActivityChange={activity}
      />,
    ));

    await click(container, "record-compare-enable");
    await click(container, "record-start");
    await click(container, "record-stop");
    expect(recorder.active).toBe(false);
    expect(onRecordingStop).toHaveBeenCalled();
    releasePrepare?.(true);
    await act(async () => { await flush(); await flush(); });
    expect(onRecordingStart).not.toHaveBeenCalled();
    expect(recorder.leaked).toBe(false);
    expect(activity).toHaveBeenCalledWith(true);
    expect(activity).toHaveBeenCalledWith(false);
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("cleans prepared accompaniment when capture start fails before scheduling", async () => {
    const recorder = new FakePracticeRecorder();
    recorder.failStart = true;
    const onRecordingPrepare = vi.fn(async () => true);
    const onRecordingStart = vi.fn();
    const onRecordingStop = vi.fn();
    const controller = fakeController(new FakeCaptureDeviceRepository(), recorder);
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection
        mode="bassline"
        controller={controller}
        enabledOverride
        onRecordingPrepare={onRecordingPrepare}
        onRecordingStart={onRecordingStart}
        onRecordingStop={onRecordingStop}
      />,
    ));

    await click(container, "record-compare-enable");
    await click(container, "record-start");
    await act(async () => { await flush(); });
    expect(container.querySelector("[data-record-state=error]")).not.toBeNull();
    expect(onRecordingPrepare).toHaveBeenCalledTimes(1);
    expect(onRecordingStart).not.toHaveBeenCalled();
    expect(onRecordingStop).toHaveBeenCalled();
    expect(recorder.leaked).toBe(false);
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("stops a failed accompaniment start without unlocking the live capture", async () => {
    const recorder = new FakePracticeRecorder();
    const onRecordingStart = vi.fn(async () => { throw new Error("accompaniment unavailable"); });
    const onRecordingStop = vi.fn();
    const activity = vi.fn();
    const controller = fakeController(new FakeCaptureDeviceRepository(), recorder);
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection
        mode="bassline"
        controller={controller}
        enabledOverride
        onRecordingStart={onRecordingStart}
        onRecordingStop={onRecordingStop}
        onRecordingActivityChange={activity}
      />,
    ));

    await click(container, "record-compare-enable");
    await click(container, "record-start");
    await act(async () => { await flush(); });
    expect(container.querySelector("[data-record-state=recording]")).not.toBeNull();
    expect(onRecordingStart).toHaveBeenCalledTimes(1);
    expect(onRecordingStop).toHaveBeenCalled();
    expect(activity).toHaveBeenCalledWith(true);
    expect(activity).not.toHaveBeenCalledWith(false);
    const channelSelect = Array.from(container.querySelectorAll<HTMLSelectElement>("select"))
      .find((candidate) => candidate.hasAttribute("aria-label"));
    expect(channelSelect?.disabled).toBe(true);
    await click(container, "record-stop");
    expect(activity).toHaveBeenCalledWith(false);
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("cancels a delayed capture start without late accompaniment or activity", async () => {
    let releaseStart: (() => void) | undefined;
    const recorder = new FakePracticeRecorder();
    recorder.startGate = new Promise<void>((resolve) => { releaseStart = resolve; });
    const controller = fakeController(new FakeCaptureDeviceRepository(), recorder);
    const onRecordingStart = vi.fn();
    const onRecordingStop = vi.fn();
    const activity = vi.fn();
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection
        mode="bassline"
        controller={controller}
        enabledOverride
        onRecordingStart={onRecordingStart}
        onRecordingStop={onRecordingStop}
        onRecordingActivityChange={activity}
      />,
    ));

    await click(container, "record-compare-enable");
    await click(container, "record-start");
    expect(container.querySelector("[data-record-state=starting]")).not.toBeNull();
    await click(container, "record-stop");
    expect(container.querySelector("[data-record-state=ready]")).not.toBeNull();
    releaseStart?.();
    await act(async () => { await flush(); await flush(); });
    expect(onRecordingStart).not.toHaveBeenCalled();
    expect(onRecordingStop).toHaveBeenCalled();
    expect(activity).toHaveBeenCalledWith(true);
    expect(activity).toHaveBeenCalledWith(false);
    expect(recorder.active).toBe(false);
    expect(recorder.leaked).toBe(false);
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("keeps Bassline metadata under an explicit Bassline session id", async () => {
    const takes = new CapturingTakeRepository();
    const controller = fakeController(new FakeCaptureDeviceRepository(), new FakePracticeRecorder(), takes);
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection
        mode="bassline"
        practiceSessionId="bassline-chord-context-session:test"
        controller={controller}
        enabledOverride
      />,
    ));
    await click(container, "record-compare-enable");
    await click(container, "record-start");
    await click(container, "record-stop");
    await click(container, "record-keep");
    expect(takes.lastKeepContext).toMatchObject({
      practiceSessionId: "bassline-chord-context-session:test",
      mode: "bassline",
    });
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("reaching recorded forces an explicit hear-or-skip choice", async () => {
    const controller = fakeController();
    const takePlayer = new FakePlayer();
    const { container, root } = mount();
    await act(async () => root.render(
      <RecordCompareSection mode="degree" controller={controller} takePlayer={takePlayer} enabledOverride />,
    ));
    await click(container, "record-compare-enable");
    await click(container, "record-start");
    await click(container, "record-stop");
    expect(container.querySelector("[data-testid=listen-choice]")).not.toBeNull();
    await click(container, "listen-choice-skip");
    expect(container.querySelector("[data-testid=listen-choice]")).toBeNull();
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });
});
