// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
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
  test("records an objective first answer, persists factual history, and reveals the physical shape for review", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    const recordedEntries: unknown[] = [];
    const onHistoryRecorded = vi.fn(async (entry: unknown) => { recordedEntries.push(entry); });
    await act(async () => root?.render(<RootMotionPracticeView playback={async (_notes, _bpm, callbacks) => { callbacks.onEnded(); }} onHistoryRecorded={onHistoryRecorded} />));
    await act(async () => button(container, "Listen to example").click());
    await act(async () => button(container, "Same").click());
    await act(async () => button(container, "Record answer").click());
    expect(container.querySelector("[data-testid='root-motion-first-answer']")).not.toBeNull();
    await act(async () => button(container, "Continue to Play").click());
    await act(async () => button(container, "Finish Play and review").click());
    expect(container.querySelector("[data-testid='root-motion-fretboard']")).not.toBeNull();
    await act(async () => button(container, "good").click());
    expect(onHistoryRecorded).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(recordedEntries[0])).not.toMatch(/path|device|audio|rawMidi/i);
  });

  test("uses Japanese phase labels and supports an explicit playback stop", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<RootMotionPracticeView language="ja" playback={async () => undefined} />));
    expect(container.querySelector("[aria-label='Root Motion Echo\u306e\u9032\u884c']")?.textContent).toContain("\u8074\u304f");
    await act(async () => button(container, "\u304a\u624b\u672c\u3092\u8074\u304f").click());
    expect(container.textContent).toContain("\u518d\u751f\u4e2d");
    await act(async () => button(container, "\u505c\u6b62").click());
    expect(container.textContent).toContain("\u304a\u624b\u672c\u3092\u8074\u304f");
  });
});