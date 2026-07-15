// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  createPlaybackController,
  type PlaybackAudioDriver,
} from "../audio/playbackController";
import type { PreviewLifecycleCallbacks } from "../audio/chordPreview";
import { PlayToggle } from "./PlayToggle";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("PlayToggle", () => {
  it("tracks controller start and natural completion", async () => {
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
    const source = { kind: "capture" as const, id: "candidate:one:slot:one" };
    const request = {
      type: "chord" as const,
      chord: { root: 0, quality: "maj" as const, tensions: [], label: "C" },
    };

    await act(async () => {
      root.render(
        <PlayToggle
          source={source}
          request={request}
          playLabel="Preview"
          stopLabel="Stop"
          controller={controller}
        />,
      );
    });
    const button = container.querySelector("button")!;
    await act(async () => button.click());
    expect(button.getAttribute("aria-busy")).toBe("true");

    await act(async () => callbacks?.onStarted?.());
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toContain("Stop");

    await act(async () => callbacks?.onEnded?.("completed"));
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.textContent).toContain("Preview");
    await act(async () => root.unmount());
  });
});
