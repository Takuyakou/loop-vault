// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { buildHistoryEvents, HistoryView } from "./HistoryView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const block: SavedProgressionBlock = {
  id: "history-block",
  summaryText: "Dm7 · G7 · Cmaj7",
  chords: [{
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord: { root: 2, quality: "min7", tensions: [], label: "Dm7" },
    confidence: 1,
    alternatives: [],
    warnings: [],
  }],
  sourceFileName: "history-source.mid",
  tags: [],
  capturedAt: "2026-07-29T10:00:00.000Z",
  analyzerVersion: "test",
  practice: {
    schemaVersion: 1,
    progressionFingerprint: "practice-v1",
    lastPracticedAt: "2026-07-30T11:00:00.000Z",
  },
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("HistoryView", () => {
  it("builds only events supported by persisted timestamps", () => {
    const idea = makeIdea({
      id: "history-idea",
      title: "History Loop",
      progressionBlocks: [block],
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-30T12:00:00.000Z",
      statusHistory: [{ status: "loop", at: "2026-07-30T09:00:00.000Z" }],
    });

    expect(buildHistoryEvents([idea], "en").map((event) => event.type))
      .toEqual(["idea-update", "practice", "status", "capture"]);
  });

  it("filters history and opens the original progression", async () => {
    const idea = makeIdea({
      id: "history-idea",
      title: "History Loop",
      progressionBlocks: [block],
    });
    const openProgression = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(
      <HistoryView
        ideas={[idea]}
        language="en"
        openIdea={vi.fn()}
        openProgression={openProgression}
      />,
    ));

    const search = container.querySelector<HTMLInputElement>("#history-search")!;
    await act(async () => {
      search.value = "history-source.mid";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Captured a progression");

    const filter = container.querySelector<HTMLSelectElement>("#history-filter")!;
    await act(async () => {
      filter.value = "capture";
      filter.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const open = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Open")!;
    await act(async () => open.click());
    expect(openProgression).toHaveBeenCalledWith(idea.id, block.id);

    await act(async () => root.unmount());
  });
});
