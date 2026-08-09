// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { buildVaultChordContextSnapshot } from "../domain/chordContextSnapshot";
import type { SavedProgressionBlock } from "../../../domain/types";
import { RootMotionPracticeView } from "./RootMotionPracticeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });

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
  await act(async () => root?.render(<RootMotionPracticeView vaultSnapshots={[safeSnapshot()]} playback={async (_notes, _bpm, callbacks) => { callbacks.onEnded(); }} />));
  const source = container.querySelector("[data-testid='root-motion-source']") as HTMLSelectElement;
  await act(async () => { source.value = "vault-root-path"; source.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.textContent).toContain("Vault-derived root path — not an original bassline.");
  await act(async () => button(container, "Listen to example").click());
  await act(async () => button(container, "Down").click());
  await act(async () => button(container, "Record answer").click());
  expect(container.querySelector("[data-testid='root-motion-first-answer']")).not.toBeNull();
  expect(container.textContent).not.toContain("safe");
});