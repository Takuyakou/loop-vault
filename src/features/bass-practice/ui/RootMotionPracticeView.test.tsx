// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RootMotionPracticeView, type RootMotionPlayback } from "./RootMotionPracticeView";

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
    const playback: RootMotionPlayback = async (_notes, _bpm, callbacks) => { callbacks.onEnded("completed"); };
    const initialSettings = { version: 1 as const, singEnabled: true, singingReferenceMode: "auto" as const, stringCount: 4 as const, handedness: "right" as const, fretRange: { min: 0, max: 12 }, sessionTargetCount: 8 };
    await act(async () => root?.render(<RootMotionPracticeView initialSettings={initialSettings} playback={playback} onHistoryRecorded={onHistoryRecorded} />));
    await act(async () => button(container, "お手本を聴く").click());
    await act(async () => button(container, "同じ").click());
    await act(async () => button(container, "回答を確定").click());
    expect(container.querySelector("[data-testid='root-motion-first-answer']")).not.toBeNull();
    await act(async () => button(container, "歌って演奏へ").click());
    await act(async () => button(container, "演奏を終えてレビューへ").click());
    expect(container.querySelector("[data-testid='root-motion-fretboard']")).not.toBeNull();
    await act(async () => button(container, "good").click());
    expect(onHistoryRecorded).toHaveBeenCalledTimes(1);
    expect(button(container, "別の開始音で移調")).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector("[aria-current='step']")?.textContent).toBe("移調");
    await act(async () => root?.render(<RootMotionPracticeView initialSettings={{ ...initialSettings, fretRange: { min: 0, max: 12 } }} playback={playback} onHistoryRecorded={onHistoryRecorded} />));
    expect(button(container, "別の開始音で移調")).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector("[aria-current='step']")?.textContent).toBe("移調");
    expect(JSON.stringify(recordedEntries[0])).not.toMatch(/path|device|audio|rawMidi/i);
  });

  test("uses Japanese phase labels and supports an explicit playback stop", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<RootMotionPracticeView playback={async () => undefined} />));
    expect(container.querySelector("[aria-label='Root Motion Echo\u306e\u9032\u884c']")?.textContent).toContain("\u8074\u304f");
    expect(container.querySelector("label[for='root-motion-note-count']")?.textContent).toBe("\u97f3\u6570");
    await act(async () => button(container, "\u304a\u624b\u672c\u3092\u8074\u304f").click());
    expect(container.textContent).toContain("\u518d\u751f\u4e2d");
    await act(async () => button(container, "\u505c\u6b62").click());
    expect(container.textContent).toContain("\u304a\u624b\u672c\u3092\u8074\u304f");
  });
});
test("lets the player select and persist an eight-note root chain", async () => {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const onNoteCountChange = vi.fn(async () => undefined);
  const playback: RootMotionPlayback = async (notes, _bpm, callbacks) => { callbacks.onEnded("completed"); };
  const initialSettings = { version: 1 as const, singEnabled: true, singingReferenceMode: "auto" as const, stringCount: 4 as const, handedness: "right" as const, fretRange: { min: 0, max: 12 }, sessionTargetCount: 8, rootMotionNoteCount: 2 as const };
  await act(async () => root?.render(<RootMotionPracticeView initialSettings={initialSettings} playback={playback} onNoteCountChange={onNoteCountChange} />));

  const noteCount = container.querySelector("[data-testid='root-motion-note-count']") as HTMLSelectElement;
  expect(noteCount.value).toBe("2");
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setValue?.call(noteCount, "8");
    noteCount.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(noteCount.value).toBe("8");
  expect(onNoteCountChange).toHaveBeenCalledWith(8);

  const captured: Array<{ readonly durationBeats: number }> = [];
  const eightNotePlayback: RootMotionPlayback = async (notes, _bpm, callbacks) => { captured.push(...notes); callbacks.onEnded("completed"); };
  await act(async () => root?.render(<RootMotionPracticeView initialSettings={{ ...initialSettings, rootMotionNoteCount: 8 }} playback={eightNotePlayback} onNoteCountChange={onNoteCountChange} />));
  await act(async () => button(container, "お手本を聴く").click());
  expect(captured).toHaveLength(8);
  expect(captured.map((note) => note.durationBeats)).toEqual(Array.from({ length: 8 }, () => 2));
  expect((container.querySelector("[data-testid='root-motion-note-count']") as HTMLSelectElement).value).toBe("8");
});
