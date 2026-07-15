// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  createPlaybackController,
  type PlaybackAudioDriver,
} from "../audio/playbackController";
import type { PreviewLifecycleCallbacks } from "../audio/chordPreview";
import { appCopy } from "../i18n";
import { AppShell } from "./AppShell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("AppShell playback status", () => {
  it("shows the global stop action while another view keeps playing", async () => {
    let callbacks: PreviewLifecycleCallbacks | undefined;
    const driver: PlaybackAudioDriver = {
      playChord: vi.fn(async (_chord, _sound, nextCallbacks) => {
        callbacks = nextCallbacks;
      }),
      playTimeline: vi.fn(async () => undefined),
      stop: vi.fn(),
    };
    const controller = createPlaybackController(driver);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <AppShell
        view="home"
        setView={vi.fn()}
        openCreate={vi.fn()}
        openSettings={vi.fn()}
        copy={appCopy.en}
        saveLabel="Saved"
        controller={controller}
      />,
    ));

    await act(async () => controller.play(
      { kind: "detail", id: "idea:one:block:one" },
      { type: "chord", chord: { root: 0, quality: "maj", tensions: [], label: "C" } },
    ));
    await act(async () => callbacks?.onStarted?.());
    const stopButton = container.querySelector<HTMLButtonElement>('button[aria-label="Stop"]');
    expect(stopButton).not.toBeNull();

    await act(async () => stopButton?.click());
    expect(controller.getState()).toEqual({ status: "idle" });
    expect(container.querySelector('button[aria-label="Stop"]')).toBeNull();
    await act(async () => root.unmount());
  });
});
