// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { appCopy, type AppLanguage } from "../i18n";
import { VaultView } from "./VaultView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const progressionBlock: SavedProgressionBlock = {
  id: "block-1",
  summaryText: "C major loop",
  chords: [{
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord: {
      root: 0,
      quality: "maj7",
      tensions: [],
      label: "Cmaj7",
    },
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  }],
  tags: [],
  capturedAt: "2026-07-15T00:00:00.000Z",
  analyzerVersion: "test",
};

afterEach(() => {
  playbackController.stop();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("VaultView keyboard shortcuts", () => {
  it("pins from the stored block array while another block is pending deletion", async () => {
    const pendingBlock = { ...progressionBlock, id: "pending-block" };
    const visibleBlock = { ...progressionBlock, id: "visible-block", pinned: false };
    const visibleIdea = makeIdea({ progressionBlocks: [visibleBlock] });
    const storedIdea = makeIdea({
      id: visibleIdea.id,
      progressionBlocks: [pendingBlock, visibleBlock],
    });
    const updateIdea = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <VaultView
          ideas={[visibleIdea]}
          storedIdeas={[storedIdea]}
          openDetail={vi.fn()}
          openCreate={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={updateIdea}
          setToast={vi.fn()}
          copy={appCopy.en}
          language="en"
          showRomanNumerals={false}
        />,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Pin"]')?.click();
    });

    expect(updateIdea).toHaveBeenCalledWith(visibleIdea.id, {
      progressionBlocks: [pendingBlock, { ...visibleBlock, pinned: true }],
    });
    await act(async () => root.unmount());
  });

  it("uses the latest language for a Space playback failure", async () => {
    const setToast = vi.fn();
    vi.spyOn(playbackController, "toggle").mockRejectedValue(undefined);
    const idea = makeIdea({ progressionBlocks: [progressionBlock] });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    const render = async (language: AppLanguage) => {
      await act(async () => {
        root.render(
          <VaultView
            ideas={[idea]}
            openDetail={vi.fn()}
            openCreate={vi.fn()}
            openCapture={vi.fn()}
            updateIdea={vi.fn()}
            setToast={setToast}
            copy={appCopy[language]}
            language={language}
            showRomanNumerals={false}
          />,
        );
      });
    };

    await render("ja");
    await render("en");
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });

    expect(setToast).toHaveBeenCalledWith(appCopy.en.toast.chordPreviewFailed);
    expect(setToast).not.toHaveBeenCalledWith(appCopy.ja.toast.chordPreviewFailed);

    await act(async () => root.unmount());
  });
});
