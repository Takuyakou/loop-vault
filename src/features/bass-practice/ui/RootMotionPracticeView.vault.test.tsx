// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { buildVaultChordContextSnapshot } from "../domain/chordContextSnapshot";
import type { SavedProgressionBlock } from "../../../domain/types";
import { RootMotionPracticeView, type RootMotionPlayback } from "./RootMotionPracticeView";

const previewAudio = vi.hoisted(() => ({ stopPreview: vi.fn(), previewMidiNotes: vi.fn() }));
vi.mock("../../../audio/chordPreview", () => ({
  previewMidiNotes: previewAudio.previewMidiNotes,
  stopPreview: previewAudio.stopPreview,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); previewAudio.stopPreview.mockClear(); previewAudio.previewMidiNotes.mockClear(); });

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const element = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === text);
  if (!element) throw new Error(`Missing button ${text}`);
  return element;
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
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root?.render(<RootMotionPracticeView vaultSnapshots={[safeSnapshot()]} playback={async (_notes, _bpm, callbacks) => { callbacks.onEnded("completed"); }} />));
  const source = container.querySelector("[data-testid='root-motion-source']") as HTMLSelectElement;
  await act(async () => { source.value = "vault-root-path"; source.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.textContent).toContain("Vault-derived root path with 4 available roots; not an original bassline.");
  await act(async () => button(container, "Listen to example").click());
  await act(async () => button(container, "Down").click());
  await act(async () => button(container, "Record answer").click());
  expect(container.querySelector("[data-testid='root-motion-first-answer']")).not.toBeNull();
  expect(container.textContent).not.toContain("safe");
});
test("releases a listening preview when its Vault source is switched or removed", async () => {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root?.render(<RootMotionPracticeView vaultSnapshots={[safeSnapshot()]} playback={async () => new Promise<void>(() => undefined)} />));
  await act(async () => button(container, "Listen to example").click());
  expect(container.textContent).toContain("Playing");

  const source = container.querySelector("[data-testid='root-motion-source']") as HTMLSelectElement;
  await act(async () => { source.value = "vault-root-path"; source.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(previewAudio.stopPreview).toHaveBeenCalled();

  await act(async () => root?.render(<RootMotionPracticeView vaultSnapshots={[]} playback={async () => undefined} />));
  await act(async () => undefined);
  expect((container.querySelector("[data-testid='root-motion-source']") as HTMLSelectElement).value).toBe("generated");
});
test("keeps the source and note-count controls available when a Vault path is too short", async () => {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const initialSettings = { version: 1 as const, singEnabled: true, singingReferenceMode: "auto" as const, stringCount: 4 as const, handedness: "right" as const, fretRange: { min: 0, max: 12 }, sessionTargetCount: 8, rootMotionNoteCount: 8 as const };
  await act(async () => root?.render(<RootMotionPracticeView initialSettings={initialSettings} vaultSnapshots={[safeSnapshot()]} playback={async (_notes, _bpm, callbacks) => { callbacks.onEnded("completed"); }} />));

  const source = container.querySelector("[data-testid='root-motion-source']") as HTMLSelectElement;
  await act(async () => { source.value = "vault-root-path"; source.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.textContent).toContain("does not have enough chord roots");
  const noteCount = container.querySelector("[data-testid='root-motion-note-count']") as HTMLSelectElement;
  expect(noteCount.value).toBe("8");
  expect((noteCount.querySelector("option[value='8']") as HTMLOptionElement).disabled).toBe(true);

  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setValue?.call(noteCount, "2");
    noteCount.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(noteCount.value).toBe("2");
  expect(button(container, "Listen to example")).toBeInstanceOf(HTMLButtonElement);
});
test("releases active playback before applying a different note count", async () => {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root?.render(<RootMotionPracticeView playback={async () => new Promise<void>(() => undefined)} />));
  await act(async () => button(container, "Listen to example").click());
  expect(container.textContent).toContain("Playing");

  const noteCount = container.querySelector("[data-testid='root-motion-note-count']") as HTMLSelectElement;
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setValue?.call(noteCount, "8");
    noteCount.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(previewAudio.stopPreview).toHaveBeenCalled();
  expect(noteCount.value).toBe("8");
});
test("does not advance to Identify when Stop ends playback synchronously", async () => {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  let callbacks: Parameters<RootMotionPlayback>[2] | undefined;
  const playback: RootMotionPlayback = async (_notes, _bpm, lifecycle) => { callbacks = lifecycle; };
  await act(async () => root?.render(<RootMotionPracticeView playback={playback} />));
  await act(async () => button(container, "Listen to example").click());
  previewAudio.stopPreview.mockImplementationOnce(() => callbacks?.onEnded("stopped"));
  await act(async () => button(container, "Stop").click());
  expect(button(container, "Listen to example")).toBeInstanceOf(HTMLButtonElement);
  expect(container.querySelector("fieldset")).toBeNull();
});
