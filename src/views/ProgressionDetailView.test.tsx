// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { appCopy, progressionDetailCopy } from "../i18n";
import { ProgressionDetailView } from "./ProgressionDetailView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const block: SavedProgressionBlock = {
  id: "block-1",
  summaryText: "Cmaj7 turnaround",
  chords: [{
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
    confidence: 0.82,
    alternatives: [{
      chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
      confidence: 0.74,
    }],
    warnings: [],
  }],
  detectedKey: "C major",
  bpm: 92,
  lengthBars: 4,
  sourceFileName: "turnaround.mid",
  tags: ["turnaround"],
  capturedAt: "2026-07-18T00:00:00.000Z",
  analyzerVersion: "test",
};

afterEach(() => {
  playbackController.stop();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("ProgressionDetailView", () => {
  it("keeps the progression, playback metadata, parent Idea, and saved/editing labels in the first view", async () => {
    const idea = makeIdea({ id: "idea-1", title: "Night Loop", progressionBlocks: [block] });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProgressionDetailView
          idea={idea}
          block={block}
          updateProgressionBlock={vi.fn(() => true)}
          duplicateProgressionBlock={vi.fn()}
          openProgression={vi.fn()}
          openIdea={vi.fn()}
          openVault={vi.fn()}
          requestDelete={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          language="ja"
        />,
      );
    });

    expect(container.textContent).toContain(block.summaryText);
    expect(container.textContent).toContain("Cmaj7");
    expect(container.textContent).toContain("Key");
    expect(container.textContent).toContain("92");
    expect(container.textContent).toContain("4小節");
    expect(container.textContent).toContain("Night Loop");
    expect(container.textContent).toContain(progressionDetailCopy.ja.savedChord);
    expect(container.textContent).toContain(progressionDetailCopy.ja.editingChord);
    expect(container.textContent).toContain(appCopy.ja.capture.piano);

    await act(async () => root.unmount());
  });

  it("applies an alternative and saves the edited block through the supplied store action", async () => {
    const idea = makeIdea({ id: "idea-1", progressionBlocks: [block] });
    const updateProgressionBlock = vi.fn(() => true);
    const setToast = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProgressionDetailView
          idea={idea}
          block={block}
          updateProgressionBlock={updateProgressionBlock}
          duplicateProgressionBlock={vi.fn()}
          openProgression={vi.fn()}
          openIdea={vi.fn()}
          openVault={vi.fn()}
          requestDelete={vi.fn()}
          setToast={setToast}
          copy={appCopy.en}
          language="en"
        />,
      );
    });

    const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("button")];
    const save = buttons().find((button) => button.textContent?.trim() === progressionDetailCopy.en.saveChanges)!;
    expect(save.disabled).toBe(true);

    await act(async () => {
      buttons().find((button) => button.textContent?.trim().startsWith("G7"))?.click();
    });
    await act(async () => {
      buttons().find((button) => button.textContent?.trim() === "Apply")?.click();
    });
    expect(save.disabled).toBe(false);

    await act(async () => save.click());
    expect(updateProgressionBlock).toHaveBeenCalledWith(
      idea.id,
      block.id,
      expect.objectContaining({
        id: block.id,
        summaryText: "G7",
        userEdited: true,
        chords: [expect.objectContaining({ chord: expect.objectContaining({ label: "G7" }) })],
      }),
    );
    expect(setToast).toHaveBeenLastCalledWith(progressionDetailCopy.en.savedToast);
    expect(save.disabled).toBe(true);

    await act(async () => root.unmount());
  });
});
