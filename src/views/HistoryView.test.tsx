// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import type { ChordContextHistoryEntry } from "../features/bass-practice/domain";
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


  it("shows factual Chord Context History without resolving a current Vault source", async () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    const entry: ChordContextHistoryEntry = {
      id: "chord-context-history-1",
      version: 1,
      completedAt: "2026-08-02T10:00:00.000Z",
      source: { kind: "vault", safeLabel: "Archived progression", reference: { ideaId: "removed-idea", blockId: "removed-block" } },
      snapshotSignature: "b".repeat(64),
      section: { id: "section-1", startBar: 3, endBar: 4, lengthBeats: 8 },
      originalBpm: 96,
      effectiveBpm: 100,
      listenMode: "bass-and-chords",
      playMode: "chords-and-metronome",
      metronomeUsed: true,
      recordCompareUsed: true,
      retainedTakeReference: "take-opaque-1",
    };
    await act(async () => root.render(
      <HistoryView ideas={[]} language="en" openIdea={vi.fn()} openProgression={vi.fn()} chordContextHistory={[entry]} />,
    ));

    const section = container.querySelector("[data-testid='chord-context-history']");
    expect(section?.textContent).toContain("Archived progression");
    expect(section?.textContent).toContain("bars 3 to 4");
    expect(section?.textContent).toContain("Original 96 BPM - session 100 BPM");
    expect(section?.textContent).toContain("Metronome: used");
    expect(section?.textContent).toContain("Retained take reference: take-opaque-1");
    expect(section?.textContent).not.toMatch(/score|accuracy|audio/i);
    await act(async () => root.unmount());
  });

  it("shows persisted Practice summaries as self-rated facts without a fake score", async () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    await act(async () => root.render(<HistoryView ideas={[]} language="en" openIdea={vi.fn()} openProgression={vi.fn()} practiceHistory={[{
      id: "practice-session", at: "2026-08-02T10:00:00.000Z", completedCount: 8, targetCount: 10,
      ratingCounts: { again: 1, hard: 1, good: 4, easy: 2 }, goodOrEasyCount: 6,
      independentSuccessCount: 4, averageListenCount: 1.6, transferCount: 1, nextFocus: "recall",
    }]} />));
    expect(container.textContent).toContain("8 / 10 completed");
    expect(container.textContent).toContain("Self-rated Good or Easy: 6");
    expect(container.textContent).toContain("Self-rated independent: 4");
    expect(container.textContent).not.toMatch(/accuracy|score|confidence/i);
    expect(container.textContent).not.toContain("No history yet");
    expect(container.textContent).toContain("1 events");
    expect(container.textContent).not.toContain("0 events");
    await act(async () => root.unmount());
  });
});
