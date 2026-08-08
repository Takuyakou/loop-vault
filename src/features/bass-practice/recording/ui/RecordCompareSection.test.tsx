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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function fakeController(devices = new FakeCaptureDeviceRepository()) {
  return new RecordingSessionController(
    {
      capability: FakeRecordingCapability.available(),
      devices,
      recorder: new FakePracticeRecorder(),
      takes: new InMemoryRecordingTakeRepository(),
    },
    "mono-sum",
  );
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
