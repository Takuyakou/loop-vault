// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { StageToolsSlot } from "../stage/Stage";
import { buildVaultChordContextSnapshot } from "../domain/chordContextSnapshot";
import type { SavedProgressionBlock } from "../../../domain/types";
import { RootMotionPracticeView, type RootMotionPlayback } from "./RootMotionPracticeView";

const previewAudio = vi.hoisted(() => ({ stopPreview: vi.fn(), previewMidiNotes: vi.fn() }));
vi.mock("../../../audio/chordPreview", () => ({
  previewMidiNotes: previewAudio.previewMidiNotes,
  stopPreview: previewAudio.stopPreview,
}));
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
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); previewAudio.stopPreview.mockClear(); previewAudio.previewMidiNotes.mockClear(); });

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
function safeSnapshot() {
  const block: SavedProgressionBlock = {
    id: "block-safe", capturedAt: "2026-08-09T10:00:00.000Z", detectedKey: "C major", bpm: 96, timeSignature: "4/4", summaryText: "safe", tags: [], analyzerVersion: "test",
    chords: [0, 7, 6, 2].map((root, index) => ({ bar: 1, beat: index + 1, durationBeats: 1, confidence: 1, alternatives: [], warnings: [], chord: { root, quality: "maj", tensions: [], label: "C" } })),
  };
  const result = buildVaultChordContextSnapshot({ sourceReference: { ideaId: "idea-safe", blockId: "block-safe" }, block, sectionId: "bars:1-1" });
  if (!result.ok) throw new Error(result.error.message);
  return result.snapshot;
}

test("uses a safe Vault-derived root path without treating it as an original bassline", async () => {
  const { container } = await mountView(<RootMotionPracticeView vaultSnapshots={[safeSnapshot()]} playback={async (_notes, _bpm, callbacks) => { callbacks.onEnded("completed"); }} />);
  await openConditions(container);
  const source = select(container, "root-motion-source");
  await act(async () => changeSelect(source, "vault-root-path"));
  // P23-62: the source explanation moved into the 条件 popover; it still says the Vault roots are not the bassline.
  expect(container.textContent).toContain("Vault の進行のルートを使います。元のベースラインではありません。");
  expect(container.querySelector("[data-testid='root-motion-conditions']")?.textContent).toContain("Vault の進行");
  // The snapshot has 4 roots: 5–8 notes cannot be chosen, 4 can.
  expect((container.querySelector("[data-testid='root-motion-note-count'] option[value='5']") as HTMLOptionElement).disabled).toBe(true);
  expect((container.querySelector("[data-testid='root-motion-note-count'] option[value='4']") as HTMLOptionElement).disabled).toBe(false);

  await act(async () => playButton(container).click());
  await act(async () => button(container, "下がる").click());
  await act(async () => submitButton(container).click());
  expect(container.querySelector("[data-testid='root-motion-first-answer']")).not.toBeNull();
  expect(container.textContent).not.toContain("safe");
});
test("releases a listening preview when its Vault source is switched or removed", async () => {
  const view = await mountView(<RootMotionPracticeView vaultSnapshots={[safeSnapshot()]} playback={async () => new Promise<void>(() => undefined)} />);
  const { container } = view;
  await ensureConditionsOpen(container);
  await act(async () => playButton(container).click());
  expect(practiceState(container)).toBe("listening");
  expect(playButton(container).getAttribute("aria-label")).toBe("止める");

  const source = select(container, "root-motion-source");
  await act(async () => changeSelect(source, "vault-root-path"));
  expect(previewAudio.stopPreview).toHaveBeenCalled();

  await view.rerender(<RootMotionPracticeView vaultSnapshots={[]} playback={async () => undefined} />);
  await act(async () => undefined);
  await ensureConditionsOpen(container);
  expect(select(container, "root-motion-source").value).toBe("generated");
});
test("keeps the source and note-count controls available when a Vault path is too short", async () => {
  const initialSettings = { version: 1 as const, singEnabled: true, singingReferenceMode: "auto" as const, stringCount: 4 as const, handedness: "right" as const, fretRange: { min: 0, max: 12 }, sessionTargetCount: 8, rootMotionNoteCount: 8 as const };
  const { container } = await mountView(<RootMotionPracticeView initialSettings={initialSettings} vaultSnapshots={[safeSnapshot()]} playback={async (_notes, _bpm, callbacks) => { callbacks.onEnded("completed"); }} />);
  await openConditions(container);
  const source = select(container, "root-motion-source");
  await act(async () => changeSelect(source, "vault-root-path"));
  expect(container.textContent).toContain("does not have enough chord roots");
  const noteCount = select(container, "root-motion-note-count");
  expect(noteCount.value).toBe("8");
  expect((noteCount.querySelector("option[value='8']") as HTMLOptionElement).disabled).toBe(true);

  await act(async () => changeSelect(noteCount, "2"));
  expect(noteCount.value).toBe("2");
  expect(playButton(container)).toBeInstanceOf(HTMLButtonElement);
});
test("releases active playback before applying a different note count", async () => {
  const { container } = await mountView(<RootMotionPracticeView playback={async () => new Promise<void>(() => undefined)} />);
  await ensureConditionsOpen(container);
  await act(async () => playButton(container).click());
  expect(practiceState(container)).toBe("listening");

  const noteCount = select(container, "root-motion-note-count");
  await act(async () => changeSelect(noteCount, "8"));
  expect(previewAudio.stopPreview).toHaveBeenCalled();
  expect(noteCount.value).toBe("8");
});
test("does not advance to Identify when Stop ends playback synchronously", async () => {
  let callbacks: Parameters<RootMotionPlayback>[2] | undefined;
  const playback: RootMotionPlayback = async (_notes, _bpm, lifecycle) => { callbacks = lifecycle; };
  const { container } = await mountView(<RootMotionPracticeView playback={playback} />);
  await act(async () => playButton(container).click());
  previewAudio.stopPreview.mockImplementationOnce(() => callbacks?.onEnded("stopped"));
  await act(async () => playButton(container).click());
  expect(playButton(container).getAttribute("aria-label")).toBe("お手本を聴く");
  expect(practiceState(container)).toBe("ready");
  // Identify does not appear: the stage stays at 1 聴く and no answer can be submitted.
  expect(container.querySelector("[data-testid='root-motion-submit']")).toBeNull();
});
