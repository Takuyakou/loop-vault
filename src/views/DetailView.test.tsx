// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import { progressionFingerprint } from "../domain/practice";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { appCopy } from "../i18n";
import { DetailView } from "./DetailView";

const tauriMocks = vi.hoisted(() => ({
  openPath: vi.fn(),
  revealItemInDir: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => tauriMocks);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("DetailView status reasons", () => {
  it("routes block deletion through the shared undo queue", async () => {
    const block = {
      id: "block-2",
      summaryText: "Saved block",
      chords: [],
      tags: [],
      capturedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const idea = makeIdea({
      id: "idea-1",
      progressionBlocks: [block],
    });
    const removeProgressionBlock = vi.fn(() => true);
    const enqueueUndo = vi.fn((request: { payload: unknown; undo(): boolean | void; commit?(): boolean | void }) => {
      void request;
      return "undo-id";
    });
    const getState = vi.spyOn(playbackController, "getState").mockReturnValue({
      status: "playing",
      source: { kind: "detail", id: "idea:idea-1:block:block-2" },
      startedAt: 0,
    });
    const stop = vi.spyOn(playbackController, "stop").mockImplementation(() => undefined);
    const mounted = await renderDetail(idea, {
      removeProgressionBlock,
      enqueueUndo,
      vaultEpoch: 7,
      copy: appCopy.en,
      language: "en",
    });

    const deleteButtons = [...mounted.container.querySelectorAll("button")]
      .filter((button) => button.textContent === "Delete");
    expect(deleteButtons).toHaveLength(2);
    await act(async () => deleteButtons[1]?.click());

    expect(stop).toHaveBeenCalledTimes(1);
    expect(enqueueUndo.mock.calls.map(([request]) => request.payload)).toEqual([
      expect.objectContaining({ kind: "progressionBlock", vaultEpoch: 7 }),
    ]);
    for (const [request] of enqueueUndo.mock.calls) expect(request.undo()).toBe(true);
    expect(removeProgressionBlock).not.toHaveBeenCalled();

    for (const [request] of enqueueUndo.mock.calls) request.commit?.();
    expect(removeProgressionBlock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "progressionBlock", vaultEpoch: 7 }),
    );

    await mounted.unmount();
    getState.mockRestore();
    stop.mockRestore();
  });

  it("switches field placeholders and section labels with the selected language", async () => {
    const japanese = await renderDetail(makeIdea());
    expect(japanese.container.querySelector<HTMLInputElement>(`input[placeholder="${appCopy.ja.detail.placeholders.genre}"]`)).not.toBeNull();
    expect(japanese.container.querySelector<HTMLInputElement>(`input[placeholder="${appCopy.ja.detail.placeholders.mood}"]`)).not.toBeNull();
    expect(japanese.container.textContent).not.toContain(appCopy.ja.detail.assets);
    expect(japanese.container.textContent).not.toContain(appCopy.ja.detail.references);
    expect(japanese.container.querySelector(`textarea[aria-label="${appCopy.ja.detail.fields.nextAction}"]`)).toBeNull();
    await japanese.unmount();

    const english = await renderDetail(makeIdea(), { copy: appCopy.en, language: "en" });
    expect(english.container.querySelector<HTMLInputElement>(`input[placeholder="${appCopy.en.detail.placeholders.genre}"]`)).not.toBeNull();
    expect(english.container.querySelector<HTMLInputElement>(`input[placeholder="${appCopy.en.detail.placeholders.mood}"]`)).not.toBeNull();
    await english.unmount();
  });

  it("localizes the saved MIDI fallback and clipboard-unavailable toast", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const block = {
      id: "localized-block",
      summaryText: "Test progression",
      chords: [],
      tags: [],
      capturedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
      startBar: 2,
      endBar: 5,
    };
    const idea = makeIdea({ progressionBlocks: [block] });
    const setToast = vi.fn();
    const japanese = await renderDetail(idea, { setToast });
    expect(japanese.container.textContent).toContain("採集したMIDI · 2–5小節");
    await clickButton(japanese.container, appCopy.ja.capture.copyProgression);
    expect(setToast).toHaveBeenLastCalledWith(appCopy.ja.detail.copyFailed);
    await japanese.unmount();

    const english = await renderDetail(idea, { copy: appCopy.en, language: "en" });
    expect(english.container.textContent).toContain("Captured MIDI · Bars 2–5");
    await english.unmount();
  });

  it("uses the Idea fallback key for progression practice state", async () => {
    const source: SavedProgressionBlock = {
      id: "effective-key-block",
      summaryText: "Fallback key practice",
      chords: [],
      tags: [],
      capturedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const practiced: SavedProgressionBlock = {
      ...source,
      practice: {
        schemaVersion: 1,
        progressionFingerprint: progressionFingerprint(source, "C major"),
        confirmedLevel: 3,
      },
    };
    const mounted = await renderDetail(makeIdea({
      key: "C major",
      progressionBlocks: [practiced],
    }), {
      copy: appCopy.en,
      language: "en",
    });

    const badge = mounted.container.querySelector<HTMLElement>(
      "[data-practice-state]",
    );
    expect(badge?.getAttribute("data-practice-state")).toBe("confirmed");
    expect(badge?.textContent).toContain("L3");
    await mounted.unmount();
  });
});

async function renderDetail(
  idea: ReturnType<typeof makeIdea>,
  overrides: Partial<React.ComponentProps<typeof DetailView>> = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DetailView
        idea={idea}
        updateIdea={vi.fn()}
        removeProgressionBlock={vi.fn()}
        requestDelete={vi.fn()}
        setToast={vi.fn()}
        copy={appCopy.ja}
        language="ja"
        {...overrides}
      />,
    );
  });
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function clickButton(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll("button")]
    .find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button?.click());
}
