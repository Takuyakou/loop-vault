// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RhythmPlaybackCallbacks } from "../application/rhythmMetronome";
import { RhythmPracticeView } from "./RhythmPracticeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("Rhythm Echo product flow", () => {
  it("uses the same visible practice chrome and explicit phase actions as Degree Echo", async () => {
    let callbacks: RhythmPlaybackCallbacks | undefined;
    const controller = {
      start: vi.fn(async (_exercise, options) => { callbacks = options.callbacks; }),
      stop: vi.fn(),
      dispose: vi.fn(),
    } as Parameters<typeof RhythmPracticeView>[0]["playbackController"];
    const container = await renderView(controller);

    expect(container.getAttribute("data-practice-state")).toBe("ready");
    expect(container.querySelector("[aria-label='Rhythm Echoの進行']")?.textContent)
      .toContain("聴く思い出す歌う考える演奏レビュー");
    expect(container.querySelector("[aria-current='step']")?.textContent).toBe("聴く");
    expect(findButton(container, "お手本を聴く")).toBeDefined();

    await act(async () => { findButton(container, "お手本を聴く")?.click(); await Promise.resolve(); });
    await act(async () => callbacks?.onEnded?.());

    expect(container.getAttribute("data-practice-state")).toBe("recall");
    expect(container.querySelector("[aria-current='step']")?.textContent).toBe("思い出す");
    expect(findButton(container, "歌うへ進む")).toBeDefined();
  });

  it("returns to ready when stopped during audio preparation and can start again", async () => {
    let resolveFirst: (() => void) | undefined;
    let starts = 0;
    const controller = {
      start: vi.fn(() => {
        starts += 1;
        if (starts === 1) return new Promise<void>((resolve) => { resolveFirst = resolve; });
        return Promise.resolve();
      }),
      stop: vi.fn(),
      dispose: vi.fn(),
    } as Parameters<typeof RhythmPracticeView>[0]["playbackController"];
    const container = await renderView(controller);

    await act(async () => { findButton(container, "お手本を聴く")?.click(); await Promise.resolve(); });
    expect(container.getAttribute("data-practice-state")).toBe("listening");
    expect(findButton(container, "再生を停止")).toBeDefined();

    await act(async () => { findButton(container, "再生を停止")?.click(); await Promise.resolve(); });
    expect(controller?.stop).toHaveBeenCalledTimes(1);
    expect(container.getAttribute("data-practice-state")).toBe("ready");
    expect(findButton(container, "お手本を聴く")).toBeDefined();

    await act(async () => { resolveFirst?.(); await Promise.resolve(); });
    expect(container.getAttribute("data-practice-state")).toBe("ready");

    await act(async () => { findButton(container, "お手本を聴く")?.click(); await Promise.resolve(); });
    expect(controller?.start).toHaveBeenCalledTimes(2);
    expect(container.getAttribute("data-practice-state")).toBe("listening");
  });
});

async function renderView(playbackController: Parameters<typeof RhythmPracticeView>[0]["playbackController"]) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<RhythmPracticeView language="ja" playbackController={playbackController} />));
  return container.querySelector<HTMLElement>("[data-testid='rhythm-echo-view']")!;
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.includes(text));
}
