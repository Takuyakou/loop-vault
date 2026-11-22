// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalBpmProvider, useGlobalBpm } from "../../../components/GlobalBpmProvider";
import type { RhythmPlaybackCallbacks } from "../application/rhythmMetronome";
import { StageToolsSlot } from "../stage/Stage";
import { RhythmPracticeView } from "./RhythmPracticeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const STORAGE_KEY = "loop-vault:global-bpm:v1";

let root: Root | undefined;
/** The app-wide BPM, reachable from the test the way the top bar reaches it. */
const shared = { bpm: 0, setBpm: (_bpm: number) => undefined as void };

function Probe() {
  const { bpm, setBpm } = useGlobalBpm();
  shared.bpm = bpm;
  shared.setBpm = setBpm;
  return <span data-testid="global-bpm-probe">{bpm}</span>;
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, bpm: 96 }));
  // P23-62: the stage mounts a headless take recorder that probes the browser. jsdom has no capture APIs,
  // so give it the shape of a recording-capable machine — otherwise the stage opens on its 「録らずに評価する」
  // fallback instead of 1 聴く. These tests never start a take.
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
  window.localStorage.clear();
  vi.unstubAllGlobals();
  delete (window.navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
});

describe("Rhythm Echo and the app-wide BPM (P23-06b)", () => {
  it("T1 starts at the app-wide BPM", async () => {
    const container = await renderView();
    expect(rhythmView(container).getAttribute("data-practice-state")).toBe("ready");
    expect(rhythmView(container).textContent).toContain("96 BPM");
    expect(shared.bpm).toBe(96);
    // P23-62: the practice's own tempo field is gone; the 条件 panel names the app-wide tempo it plays at.
    expect(container.querySelector("#rhythm-tempo")).toBeNull();
    await openConditions(container);
    expect(conditionsText(container)).toContain("テンポは上の BPM です");
    expect(conditionsText(container)).toContain("いま 96 BPM");
  });

  it("T2 a change in the app-wide BPM changes what the practice plays", async () => {
    const container = await renderView();
    await openConditions(container);
    expect(conditionsText(container)).toContain("いま 96 BPM");
    await act(async () => shared.setBpm(100));
    expect(shared.bpm).toBe(100);
    expect(rhythmView(container).textContent).toContain("100 BPM");
    expect(conditionsText(container)).toContain("いま 100 BPM");
    // The tempo field now lives in the top bar: the practice has no second, competing tempo control.
    expect(container.querySelector("#rhythm-tempo")).toBeNull();
  });

  it("T3 a change from outside reaches the problem that starts next", async () => {
    let callbacks: RhythmPlaybackCallbacks | undefined;
    const controller = playbackPort((options) => { callbacks = options.callbacks; });
    const container = await renderView(controller);
    await act(async () => shared.setBpm(132));
    expect(rhythmView(container).textContent).toContain("132 BPM");
    await act(async () => { listenButton(container)?.click(); await Promise.resolve(); });
    const exercise = (controller.start as ReturnType<typeof vi.fn>).mock.calls[0][0] as { tempo: number };
    expect(exercise.tempo).toBe(132);
    expect(callbacks).toBeDefined();
  });

  it("T4 a problem under way keeps its speed and shows the pending line", async () => {
    let callbacks: RhythmPlaybackCallbacks | undefined;
    const controller = playbackPort((options) => { callbacks = options.callbacks; });
    const container = await renderView(controller);
    await act(async () => shared.setBpm(132));
    await act(async () => { listenButton(container)?.click(); await Promise.resolve(); });
    await act(async () => callbacks?.onEnded?.());
    await act(async () => shared.setBpm(140));
    expect(rhythmView(container).textContent).toContain("132 BPM");
    expect(rhythmView(container).textContent).not.toContain("140 BPM のまま");
    expect(container.querySelector("[data-testid='rhythm-tempo-pending']")).toBeNull();
    // The per-problem tempo is no longer editable in the practice; the 条件 panel carries the pending line.
    expect(container.querySelector("#rhythm-tempo")).toBeNull();
    await openConditions(container);
    expect(conditionsText(container)).toContain("いま 132 BPM");
    expect(conditionsText(container)).toContain("次のリズムから 140 BPM");
  });

  it("T5 the saved attempt keeps the speed the problem was played at", async () => {
    let callbacks: RhythmPlaybackCallbacks | undefined;
    const controller = playbackPort((options) => { callbacks = options.callbacks; });
    const onAttemptCompleted = vi.fn(async () => undefined);
    const container = await renderView(controller, onAttemptCompleted);
    await act(async () => shared.setBpm(132));
    await act(async () => { listenButton(container)?.click(); await Promise.resolve(); });
    await act(async () => callbacks?.onEnded?.());
    await act(async () => shared.setBpm(140));
    await answerWithoutTake(container);
    await act(async () => container.querySelector<HTMLButtonElement>("[data-review-rating='good']")?.click());
    await act(async () => { container.querySelector<HTMLButtonElement>("[data-testid='rhythm-next']")?.click(); await Promise.resolve(); });
    expect(onAttemptCompleted).toHaveBeenCalledTimes(1);
    const attempt = (onAttemptCompleted.mock.calls[0] as unknown as [{ exerciseSnapshot: { tempo: number } }])[0];
    expect(attempt.exerciseSnapshot.tempo).toBe(132);
  });

  it("T6 the next problem takes the new speed and the line goes away", async () => {
    let callbacks: RhythmPlaybackCallbacks | undefined;
    const controller = playbackPort((options) => { callbacks = options.callbacks; });
    const onAttemptCompleted = vi.fn(async () => undefined);
    const container = await renderView(controller, onAttemptCompleted);
    await act(async () => shared.setBpm(132));
    await act(async () => { listenButton(container)?.click(); await Promise.resolve(); });
    await act(async () => callbacks?.onEnded?.());
    await act(async () => shared.setBpm(140));
    await answerWithoutTake(container);
    await act(async () => container.querySelector<HTMLButtonElement>("[data-review-rating='good']")?.click());
    // P23-62: 「次のリズム」 saves the review and opens the next problem in one action (no separate 保存 button).
    await act(async () => { container.querySelector<HTMLButtonElement>("[data-testid='rhythm-next']")?.click(); await Promise.resolve(); });
    expect(rhythmView(container).textContent).toContain("140 BPM");
    expect(rhythmView(container).getAttribute("data-practice-state")).toBe("ready");
    expect(container.querySelector("[data-testid='rhythm-tempo-pending']")).toBeNull();
    expect(container.querySelector("#rhythm-tempo")).toBeNull();
    await openConditions(container);
    expect(conditionsText(container)).toContain("いま 140 BPM");
    expect(conditionsText(container)).not.toContain("次のリズムから");
  });
});

function playbackPort(onStart: (options: { callbacks: RhythmPlaybackCallbacks }) => void) {
  return {
    start: vi.fn(async (_exercise: unknown, options: { callbacks: RhythmPlaybackCallbacks }) => { onStart(options); }),
    stop: vi.fn(),
    dispose: vi.fn(),
  };
}

async function renderView(
  playbackController?: ReturnType<typeof playbackPort>,
  onAttemptCompleted?: (attempt: never) => Promise<void>,
) {
  const container = document.createElement("div");
  document.body.append(container);
  // P23-62: in the app the practice's 条件 chip is drawn in the mode bar's tools slot; this is that slot.
  const tools = document.createElement("div");
  container.append(tools);
  const viewHost = document.createElement("div");
  container.append(viewHost);
  root = createRoot(viewHost);
  await act(async () => root?.render(
    <GlobalBpmProvider>
      <Probe />
      <StageToolsSlot value={tools}>
        <RhythmPracticeView
          playbackController={playbackController as never}
          onAttemptCompleted={onAttemptCompleted as never}
        />
      </StageToolsSlot>
    </GlobalBpmProvider>,
  ));
  return container;
}

function rhythmView(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>("[data-testid='rhythm-echo-view']")!;
}

const listenButton = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>("[data-testid='rhythm-listen']");

const conditions = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[role='dialog'][aria-label='リズムの条件']");

const conditionsText = (container: HTMLElement) => conditions(container)?.textContent ?? "";

async function openConditions(container: HTMLElement) {
  if (conditions(container)) return;
  await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='rhythm-conditions']")?.click());
}

/** 2 弾く without a take: the playable path when nothing is recorded. */
async function answerWithoutTake(container: HTMLElement) {
  await act(async () => findButton(container, "録らずに弾く")?.click());
  await act(async () => findButton(container, "弾けた・答えを見る")?.click());
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.includes(text));
}
