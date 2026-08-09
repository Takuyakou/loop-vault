// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { RootMotionPracticeView } from "./RootMotionPracticeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const element = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === text);
  if (!element) throw new Error(`Missing button ${text}`);
  return element;
}

describe("Root Motion Practice view", () => {
  test("records an objective first answer before self review", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<RootMotionPracticeView playback={async (_notes, _bpm, callbacks) => { callbacks.onEnded(); }} />));
    await act(async () => button(container, "Listen to example").click());
    await act(async () => button(container, "Same").click());
    await act(async () => button(container, "Record answer").click());
    expect(container.querySelector("[data-testid='root-motion-first-answer']")).not.toBeNull();
    expect(container.textContent).toContain("Continue to Play");
    expect(container.textContent).not.toContain("automatic scoring");
  });

  test("shows the Japanese progression and supports an explicit playback stop", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<RootMotionPracticeView language="ja" playback={async () => undefined} />));
    expect(container.querySelector("[aria-label='Root Motion Echoの進行']")?.textContent).toContain("聴く答える歌う演奏レビュー移調");
    await act(async () => button(container, "お手本を聴く").click());
    expect(container.textContent).toContain("再生中");
    await act(async () => button(container, "再生を停止").click());
    expect(container.textContent).toContain("お手本を聴く");
  });
});