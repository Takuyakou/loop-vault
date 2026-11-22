// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { StageToolsSlot } from "../stage/Stage";
import { RootMotionPracticeView, type RootMotionPlayback } from "./RootMotionPracticeView";

// P23-62: the stage owns every control; only the headless recorder needs the browser (and jsdom has no
// microphone, which would otherwise open the practice on 弾く with 「うまく録れませんでした」).
vi.mock("../recording/ui/RecordCompareSection", () => ({
  RecordCompareSection: ({ midiRecording }: { midiRecording?: { commands: { current: unknown } } }) => {
    if (midiRecording) midiRecording.commands.current = { start: () => {}, stop: () => {}, playTake: () => {}, playOverlay: () => {}, keep: () => {} };
    return null;
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });

/** The visible label of a StageButton: the key hint (<kbd>) is not part of the label. */
function buttonLabel(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("kbd").forEach((hint) => hint.remove());
  return clone.textContent ?? "";
}
function button(container: HTMLElement, text: string): HTMLButtonElement {
  const element = Array.from(container.querySelectorAll("button")).find((candidate) => buttonLabel(candidate) === text);
  if (!element) throw new Error(`Missing button ${text}`);
  return element;
}
function playButton(container: HTMLElement): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>("[data-testid='root-motion-listen']");
  if (!element) throw new Error("Missing listen button");
  return element;
}
function submitButton(container: HTMLElement): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>("[data-testid='root-motion-submit']");
  if (!element) throw new Error("Missing answer submit button");
  return element;
}
function select(container: HTMLElement, testId: string): HTMLSelectElement {
  const element = container.querySelector<HTMLSelectElement>(`[data-testid='${testId}']`);
  if (!element) throw new Error(`Missing select ${testId}`);
  return element;
}
function changeSelect(element: HTMLSelectElement, value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setValue?.call(element, value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
/**
 * P23-62: the 条件 controls are drawn through StageTools into the stage's top-band slot. The app shell owns
 * that slot, so this harness provides one, as the practice always shows its controls inside it.
 */
async function mountView(element: ReactNode) {
  const container = document.createElement("div"); document.body.append(container);
  const tools = document.createElement("div"); container.append(tools);
  const app = document.createElement("div"); container.append(app);
  root = createRoot(app);
  const rerender = async (next: ReactNode) => { await act(async () => root?.render(<StageToolsSlot value={tools}>{next}</StageToolsSlot>)); };
  await rerender(element);
  return { container, tools, rerender };
}
/** The 条件 popover only renders its controls while it is open. */
async function openConditions(container: HTMLElement): Promise<void> {
  const chip = container.querySelector<HTMLButtonElement>("[data-testid='root-motion-conditions']");
  if (!chip) throw new Error("Missing conditions chip");
  await act(async () => chip.click());
}
async function ensureConditionsOpen(container: HTMLElement): Promise<void> {
  if (!container.querySelector("[data-testid='root-motion-source']")) await openConditions(container);
}
function practiceState(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>("[data-testid='root-motion-echo-view']")?.dataset.practiceState;
}
function stageStep(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>("[data-testid='root-motion-echo-view']")?.dataset.stageStep;
}

describe("Root Motion Practice view", () => {
  test("records an objective first answer, persists factual history, and reveals the physical shape for review", async () => {
    const recordedEntries: unknown[] = [];
    const onHistoryRecorded = vi.fn(async (entry: unknown) => { recordedEntries.push(entry); });
    const playback: RootMotionPlayback = async (_notes, _bpm, callbacks) => { callbacks.onEnded("completed"); };
    const initialSettings = { version: 1 as const, singEnabled: true, singingReferenceMode: "auto" as const, stringCount: 4 as const, handedness: "right" as const, fretRange: { min: 0, max: 12 }, sessionTargetCount: 8 };
    const view = await mountView(<RootMotionPracticeView initialSettings={initialSettings} playback={playback} onHistoryRecorded={onHistoryRecorded} />);
    const { container } = view;
    expect(stageStep(container)).toBe("0");
    await act(async () => playButton(container).click());
    await act(async () => button(container, "同じ").click());
    await act(async () => submitButton(container).click());
    expect(container.querySelector("[data-testid='root-motion-first-answer']")).not.toBeNull();
    expect(practiceState(container)).toBe("sing");

    // P23-62: once answered, the phrase can still be heard, and listening ends back in sing (not identify).
    await act(async () => playButton(container).click());
    expect(practiceState(container)).toBe("sing");
    expect(container.textContent).toContain("2 回聴いた");
    expect(container.querySelector("[data-testid='root-motion-first-answer']")).not.toBeNull();

    // 2 弾く: the self-rated path replaces the old 「歌って演奏へ」/「演奏を終えてレビューへ」 steps.
    await act(async () => button(container, "録らずに弾く").click());
    expect(stageStep(container)).toBe("1");
    await act(async () => button(container, "弾けた・答えを見る").click());
    expect(stageStep(container)).toBe("2");
    expect(container.querySelector("[data-testid='bp-fretboard']")).not.toBeNull();

    // The rating is chosen on the stage and saved when the result is committed (「別の音から」 commits it).
    const good = container.querySelector<HTMLButtonElement>("[data-review-rating='good']");
    expect(good).not.toBeNull();
    await act(async () => good!.click());
    await act(async () => button(container, "別の音から").click());
    expect(onHistoryRecorded).toHaveBeenCalledTimes(1);
    const saved = recordedEntries[0] as { readonly firstAnswer?: { readonly directionCorrect?: boolean } };
    expect(typeof saved.firstAnswer?.directionCorrect).toBe("boolean");
    expect(container.textContent).toContain("別の音から：同じ動きを");
    expect(container.querySelector("[data-testid='root-motion-transfer']")).toBeNull();

    // The transfer is a fresh problem starting again at 1 聴く (the old 移調 step no longer exists).
    expect(stageStep(container)).toBe("0");
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("聴く");

    // Equal settings must not reset the transfer problem.
    await view.rerender(<RootMotionPracticeView initialSettings={{ ...initialSettings, fretRange: { min: 0, max: 12 } }} playback={playback} onHistoryRecorded={onHistoryRecorded} />);
    expect(container.textContent).toContain("別の音から：同じ動きを");
    expect(stageStep(container)).toBe("0");
    expect(JSON.stringify(recordedEntries[0])).not.toMatch(/path|device|audio|rawMidi/i);
  });

  test("uses Japanese phase labels and supports an explicit playback stop", async () => {
    const { container } = await mountView(<RootMotionPracticeView playback={async () => undefined} />);
    const steps = container.querySelector("[aria-label='練習の段階']");
    expect(steps?.textContent).toContain("聴く");
    expect(steps?.textContent).toContain("弾く");
    expect(steps?.textContent).toContain("結果");
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("聴く");

    await openConditions(container);
    const noteCount = select(container, "root-motion-note-count");
    expect(noteCount.closest("label")?.textContent).toContain("音の数");

    await act(async () => playButton(container).click());
    expect(practiceState(container)).toBe("listening");
    expect(playButton(container).getAttribute("aria-label")).toBe("止める");
    await act(async () => playButton(container).click());
    expect(practiceState(container)).toBe("ready");
    expect(playButton(container).getAttribute("aria-label")).toBe("お手本を聴く");
  });
});
test("lets the player select and persist an eight-note root chain", async () => {
  const onNoteCountChange = vi.fn(async () => undefined);
  const initialSettings = { version: 1 as const, singEnabled: true, singingReferenceMode: "auto" as const, stringCount: 4 as const, handedness: "right" as const, fretRange: { min: 0, max: 12 }, sessionTargetCount: 8, rootMotionNoteCount: 2 as const };
  const view = await mountView(<RootMotionPracticeView initialSettings={initialSettings} playback={async () => undefined} onNoteCountChange={onNoteCountChange} />);
  const { container } = view;

  // The note count now lives in the 条件 popover.
  await ensureConditionsOpen(container);
  const noteCount = select(container, "root-motion-note-count");
  expect(noteCount.value).toBe("2");
  await act(async () => changeSelect(noteCount, "8"));
  expect(noteCount.value).toBe("8");
  expect(onNoteCountChange).toHaveBeenCalledWith(8);

  const captured: Array<{ readonly durationBeats: number }> = [];
  const eightNotePlayback: RootMotionPlayback = async (notes, _bpm, callbacks) => { captured.push(...notes); callbacks.onEnded("completed"); };
  await view.rerender(<RootMotionPracticeView initialSettings={{ ...initialSettings, rootMotionNoteCount: 8 }} playback={eightNotePlayback} onNoteCountChange={onNoteCountChange} />);
  await ensureConditionsOpen(container);
  await act(async () => playButton(container).click());
  expect(captured).toHaveLength(8);
  expect(captured.map((note) => note.durationBeats)).toEqual(Array.from({ length: 8 }, () => 2));
  expect(select(container, "root-motion-note-count").value).toBe("8");
});
