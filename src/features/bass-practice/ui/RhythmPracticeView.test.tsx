// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RhythmPlaybackCallbacks } from "../application/rhythmMetronome";
import { RhythmPracticeView } from "./RhythmPracticeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

// P23-62: the shared stage mounts a headless take recorder that probes the browser. jsdom has no capture APIs,
// so give it the shape of a recording-capable machine — otherwise the stage opens on its 「録らずに評価する」
// fallback and the 1 聴く → 2 弾く → 3 結果 flow under test cannot run. These tests never start a take.
beforeEach(() => {
  Object.defineProperty(window.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [] })),
      enumerateDevices: vi.fn(async () => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  vi.stubGlobal("MediaRecorder", class { static isTypeSupported() { return true; } });
  vi.stubGlobal("AudioContext", class {});
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  delete (window.navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
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
    const view = () => rhythmView(container);

    // P23-62: the 6-stage progress (聴く 歌う 考える 演奏 レビュー 移調) is now the shared 3-step stage.
    expect(view().getAttribute("data-practice-state")).toBe("ready");
    expect(view().getAttribute("data-stage-step")).toBe("0");
    expect(stepNames(container)).toEqual(["聴く", "弾く", "結果"]);
    expect(currentStep(container)).toBe("聴く");
    expect(container.querySelector(".bp-foot")?.textContent).toContain("Space 聴く");
    expect(findButtonByLabel(container, "お手本を聴く")).toBeDefined();
    expect(findButton(container, "● 録って弾く")?.disabled).toBe(true);

    await act(async () => { findButtonByLabel(container, "お手本を聴く")?.click(); await Promise.resolve(); });

    expect(view().getAttribute("data-practice-state")).toBe("listening");
    expect(findButtonByLabel(container, "止める")).toBeDefined();

    await act(async () => callbacks?.onEnded?.());

    // P23-62: 「思い出す」 is now the heard half of 1 聴く; the stage moves to 2 弾く only when a take starts.
    expect(view().getAttribute("data-practice-state")).toBe("heard");
    expect(currentStep(container)).toBe("聴く");
    expect(findButton(container, "● 録って弾く")?.disabled).toBe(false);
    expect(findButton(container, "録らずに弾く")?.disabled).toBe(false);

    await act(async () => findButton(container, "録らずに弾く")?.click());

    expect(view().getAttribute("data-stage-step")).toBe("1");
    expect(currentStep(container)).toBe("弾く");
    expect(findButton(container, "弾けた・答えを見る")).toBeDefined();

    await act(async () => findButton(container, "弾けた・答えを見る")?.click());

    expect(view().getAttribute("data-stage-step")).toBe("2");
    expect(view().getAttribute("data-practice-state")).toBe("review");
    expect(currentStep(container)).toBe("結果");
    expect(container.querySelectorAll("[data-review-rating]")).toHaveLength(4);
    expect(findButton(container, "次のリズム")?.disabled).toBe(true);
  });

  it("ends the listen when stopped during audio preparation and can start again", async () => {
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
    const view = () => rhythmView(container);

    await act(async () => { findButtonByLabel(container, "お手本を聴く")?.click(); await Promise.resolve(); });
    expect(view().getAttribute("data-practice-state")).toBe("listening");
    expect(findButtonByLabel(container, "止める")).toBeDefined();

    await act(async () => { findButtonByLabel(container, "止める")?.click(); await Promise.resolve(); });
    expect(controller?.stop).toHaveBeenCalledTimes(1);
    // P23-62: an opened listen now counts as heard (the 2 弾く actions unlock); it no longer returns to ready.
    expect(view().getAttribute("data-practice-state")).toBe("heard");
    expect(findButtonByLabel(container, "お手本を聴く")).toBeDefined();

    // The stopped start resolving late must not flip the stage back.
    await act(async () => { resolveFirst?.(); await Promise.resolve(); });
    expect(view().getAttribute("data-practice-state")).toBe("heard");

    await act(async () => { findButtonByLabel(container, "お手本を聴く")?.click(); await Promise.resolve(); });
    expect(controller?.start).toHaveBeenCalledTimes(2);
    expect(view().getAttribute("data-practice-state")).toBe("listening");
  });
});

async function renderView(playbackController: Parameters<typeof RhythmPracticeView>[0]["playbackController"]) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<RhythmPracticeView playbackController={playbackController} />));
  return container;
}

function rhythmView(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>("[data-testid='rhythm-echo-view']")!;
}

function stepNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[aria-label='練習の段階'] .bp-step"))
    .map((step) => step.textContent?.replace(/^\d+/, "") ?? "");
}

function currentStep(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>("[aria-current='step']")?.textContent?.replace(/^\d+/, "");
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.includes(text));
}

function findButtonByLabel(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.getAttribute("aria-label") === label);
}
