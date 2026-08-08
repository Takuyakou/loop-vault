// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeChordSymbol } from "../domain/chords";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { appCopy } from "../i18n";
import { ProgressionDetailView } from "./ProgressionDetailView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const block: SavedProgressionBlock = {
  id: "progression-context",
  summaryText: "This private title is not handed to Practice",
  sourceAssetId: "private-asset",
  sourceFileName: "private-source.mid",
  detectedKey: "C major",
  bpm: 104,
  timeSignature: "4/4",
  chords: [
    { bar: 1, beat: 1, durationBeats: 4, chord: makeChordSymbol(0, "maj7"), confidence: 1, alternatives: [], warnings: [] },
    { bar: 2, beat: 1, durationBeats: 4, chord: makeChordSymbol(7, "dom7", [], 11), confidence: 1, alternatives: [], warnings: [] },
  ],
  tags: [],
  capturedAt: "2026-01-01T00:00:00.000Z",
  analyzerVersion: "fixture",
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Progression Detail Chord Context handoff", () => {
  it("passes only the selected immutable Vault snapshot to Bass Practice", async () => {
    const idea = makeIdea({ id: "idea-context", progressionBlocks: [block] });
    const openPractice = vi.fn();
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
          openPractice={openPractice}
          setToast={vi.fn()}
          copy={appCopy.en}
          language="en"
        />,
      );
    });

    const select = container.querySelector<HTMLSelectElement>("[data-testid='chord-context-section-select']")!;
    expect([...select.options].map((option) => option.value)).toEqual(["bars:1-1", "bars:1-2", "bars:2-2"]);
    await act(async () => {
      select.value = "bars:1-2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const practice = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Practice")!;
    await act(async () => practice.click());

    expect(openPractice).toHaveBeenCalledOnce();
    const snapshot = openPractice.mock.calls[0]![0];
    expect(snapshot).toMatchObject({
      source: {
        kind: "vault",
        reference: { ideaId: idea.id, blockId: block.id },
      },
      section: { id: "bars:1-2", lengthBeats: 8 },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/private|sourceAsset|sourceFileName/i);
    await act(async () => root.unmount());
  });

  it("does not open generated practice as a substitution when the Vault source has no safe section", async () => {
    const unavailable = { ...block, timeSignature: "3/4" };
    const idea = makeIdea({ id: "idea-unavailable", progressionBlocks: [unavailable] });
    const openPractice = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProgressionDetailView
          idea={idea}
          block={unavailable}
          updateProgressionBlock={vi.fn(() => true)}
          duplicateProgressionBlock={vi.fn()}
          openProgression={vi.fn()}
          openIdea={vi.fn()}
          openVault={vi.fn()}
          requestDelete={vi.fn()}
          openPractice={openPractice}
          setToast={vi.fn()}
          copy={appCopy.en}
          language="en"
        />,
      );
    });
    const practice = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Practice")!;
    expect(practice.disabled).toBe(true);
    expect(openPractice).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
