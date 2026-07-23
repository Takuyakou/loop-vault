// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeChordSymbol } from "../domain/chords";
import { createLiveNoteState } from "../domain/liveMidi";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { runClosePreparations } from "../store/closePreparation";
import { PracticeView } from "./PracticeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const block: SavedProgressionBlock = {
  id: "00000000-0000-4000-8000-000000000091",
  summaryText: "Cmaj7 · Am7 · Dm7 · G7",
  chords: [
    makeChordSymbol(0, "maj7"),
    makeChordSymbol(9, "min7"),
    makeChordSymbol(2, "min7"),
    makeChordSymbol(7, "dom7"),
  ].map((chord, index) => ({
    eventId: `dojo-event-${index}`,
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord,
    confidence: 1,
    alternatives: [],
    warnings: [],
  })),
  detectedKey: "C major",
  bpm: 100,
  timeSignature: "4/4",
  tags: [],
  capturedAt: "2026-07-20T00:00:00.000Z",
  analyzerVersion: "test",
};

beforeEach(() => {
  defaultLiveMidiStore.setState({
    active: true,
    status: "connected",
    selected: {
      backendId: "test-midi",
      name: "Test Keys",
      index: 0,
    },
    notes: createLiveNoteState(),
    error: undefined,
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("PracticeView", () => {
  it("renders queue, L1-L3, shared MIDI status, and the L1 guide", async () => {
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000092",
      title: "Dojo Loop",
      progressionBlocks: [block],
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="ja"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));

    expect(container.textContent).toContain("練習キュー");
    expect(container.textContent).toContain("Dojo Loop");
    expect(container.textContent).toContain("L1 見て弾く");
    expect(container.textContent).toContain("L2 名前で弾く");
    expect(container.textContent).toContain("L3 度数で弾く");
    expect(container.textContent).toContain("Test Keys");
    expect(container.textContent).toContain("お手本");
    expect(container.textContent).toContain("自動生成");
    expect(container.querySelector('[role="img"][aria-label*="ピアノ鍵盤"]')).not.toBeNull();
    expect(container.textContent).toContain("C5");
    expect(container.textContent).not.toContain("60 ·");

    await act(async () => root.unmount());
  });

  it("disables L3 and Flow when key and 4/4 are unavailable", async () => {
    const unsupported = { ...block, detectedKey: undefined, timeSignature: "3/4" };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000093",
      title: "Odd Meter",
      key: undefined,
      progressionBlocks: [unsupported],
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="ja"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));

    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons.find((button) => button.textContent === "L3 度数で弾く")?.disabled).toBe(true);
    expect(buttons.find((button) => button.textContent === "フロー")?.disabled).toBe(true);
    expect(container.textContent).toContain("フローモードは現在4/4に対応しています");

    await act(async () => root.unmount());
  });

  it("flushes session progress through updateProgressionBlock when leaving the view", async () => {
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000094",
      title: "Exit Flush",
      progressionBlocks: [block],
    });
    const updateProgressionBlock = vi.fn(() => true);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="ja"
        updateProgressionBlock={updateProgressionBlock}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));
    const start = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("練習を開始"));
    expect(start?.disabled).toBe(false);
    await act(async () => start?.click());
    await act(async () => root.unmount());

    expect(updateProgressionBlock).toHaveBeenCalledWith(
      idea.id,
      block.id,
      expect.objectContaining({
        practice: expect.objectContaining({
          schemaVersion: 1,
          lastPracticedAt: expect.any(String),
        }),
      }),
    );
  });

  it("prepares pending practice progress before app close without duplicating it on unmount", async () => {
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000095",
      title: "Close Prepare",
      progressionBlocks: [block],
    });
    const updateProgressionBlock = vi.fn(() => true);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="ja"
        updateProgressionBlock={updateProgressionBlock}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));
    const start = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("練習を開始"));
    await act(async () => start?.click());

    act(() => runClosePreparations());
    expect(updateProgressionBlock).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    expect(updateProgressionBlock).toHaveBeenCalledOnce();
  });
});
