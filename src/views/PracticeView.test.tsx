// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
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
  window.localStorage.clear();
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
    expect(container.querySelector('[data-testid="practice-layout"]')?.className)
      .toContain("lg:overflow-hidden");
    expect(container.querySelector('[data-testid="practice-queue-scroll"]')?.className)
      .toContain("overflow-y-auto");
    expect(container.querySelector('[data-testid="practice-queue-scroll"]')?.className)
      .toContain("lg:overscroll-contain");
    expect(container.querySelector('[data-testid="practice-workspace-scroll"]')?.className)
      .toContain("lg:overflow-y-auto");
    expect(container.querySelector('[data-testid="practice-workspace-scroll"]')?.className)
      .toContain("lg:overscroll-contain");
    const progressionOverview = container.querySelector(
      '[data-testid="practice-progression-overview"]',
    );
    expect(progressionOverview).not.toBeNull();
    expect(progressionOverview?.querySelectorAll("[data-progression-index]")).toHaveLength(4);
    expect(progressionOverview?.querySelector('[aria-current="step"]')?.textContent)
      .toContain(block.chords[0].chord.label);
    block.chords.forEach((event) => {
      expect(progressionOverview?.textContent).toContain(event.chord.label);
    });
    const progressionBar = progressionOverview?.querySelector('[role="progressbar"]');
    expect(progressionBar?.getAttribute("aria-valuenow")).toBe("1");
    expect(progressionBar?.getAttribute("aria-valuemax")).toBe("4");

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

  it("uses resolved voicing by default and renders left/right guides for style practice", async () => {
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000096",
      title: "Style Guide",
      progressionBlocks: [block],
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

    const selector = container.querySelector<HTMLSelectElement>(
      '[data-testid="practice-target-source"]',
    );
    expect(selector?.value).toBe("resolved-voicing");
    await act(async () => {
      if (!selector) return;
      selector.value = "shell-17";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="voicing-practice-controls"]')
      ?.getAttribute("data-style-practice")).toBe("true");
    expect(container.textContent).toContain("スタイル練習");
    expect(container.textContent).toContain("段位対象外");
    expect(container.querySelector('[data-testid="practice-left-hand-guide"]')?.textContent)
      .toContain("左手の目安");
    expect(container.querySelector('[data-testid="practice-right-hand-guide"]')?.textContent)
      .toContain("右手の目安");
    expect(container.querySelectorAll('[data-guide-hand="left"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-guide-hand="right"]').length).toBeGreaterThan(0);

    const l2 = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "L2 名前で弾く");
    await act(async () => l2?.click());
    expect(container.querySelector('[data-testid="practice-left-hand-guide"]')).toBeNull();
    expect(container.querySelector('[data-testid="practice-right-hand-guide"]')).toBeNull();
    expect(container.textContent).toContain("音の形");

    await act(async () => root.unmount());
  });

  it("shows the progression key beside the current chord in degree mode", async () => {
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000104",
      title: "Degree Context",
      progressionBlocks: [block],
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="en"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));

    const degreeMode = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "L3 Play by degree");
    await act(async () => degreeMode?.click());

    expect(container.querySelector('[data-testid="practice-current-chord"]')?.textContent)
      .toContain("I");
    expect(container.querySelector('[data-testid="practice-degree-key"]')?.textContent)
      .toBe("Key C major");

    await act(async () => root.unmount());
  });

  it("never writes practice progress for a style session, including close preparation", async () => {
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000097",
      title: "Unranked Style",
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
    const selector = container.querySelector<HTMLSelectElement>(
      '[data-testid="practice-target-source"]',
    );
    await act(async () => {
      if (!selector) return;
      selector.value = "generated-close";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const start = container.querySelector<HTMLButtonElement>('[data-testid="practice-start"]');
    expect(start?.disabled).toBe(false);
    await act(async () => start?.click());

    act(() => runClosePreparations());
    await act(async () => root.unmount());

    expect(updateProgressionBlock).not.toHaveBeenCalled();
  });

  it("returns to resolved voicing when another progression is selected", async () => {
    const secondBlock: SavedProgressionBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000098",
      summaryText: "Second progression",
      pinned: true,
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000099",
      title: "Target Reset",
      progressionBlocks: [block, secondBlock],
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        initialTarget={{ ideaId: idea.id, blockId: block.id }}
        language="en"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));
    const selector = container.querySelector<HTMLSelectElement>(
      '[data-testid="practice-target-source"]',
    );
    await act(async () => {
      if (!selector) return;
      selector.value = "open-17";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(selector?.value).toBe("open-17");

    const second = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="practice-queue-scroll"] button',
      ),
    ].find((button) => button.className.includes("hover:bg-[var(--lv-surface-raised)]"));
    expect(second).toBeDefined();
    await act(async () => second?.click());

    expect(selector?.value).toBe("resolved-voicing");
    await act(async () => root.unmount());
  });

  it("blocks unsupported style practice until the user explicitly enables fallback", async () => {
    const triadBlock: SavedProgressionBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000100",
      chords: [makeChordSymbol(0, "maj")].map((chord, index) => ({
        ...block.chords[index],
        eventId: `unsupported-event-${index}`,
        chord,
      })),
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000101",
      title: "Unsupported Style",
      progressionBlocks: [triadBlock],
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="en"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));
    const selector = container.querySelector<HTMLSelectElement>(
      '[data-testid="practice-target-source"]',
    );
    await act(async () => {
      if (!selector) return;
      selector.value = "rootless-ab";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("unsupported by the selected style");
    expect(container.querySelector<HTMLButtonElement>('[data-testid="practice-start"]')?.disabled)
      .toBe(true);
    const fallback = container.querySelector<HTMLInputElement>(
      '[data-testid="practice-unsupported-fallback"]',
    );
    await act(async () => fallback?.click());

    expect(container.querySelector<HTMLButtonElement>('[data-testid="practice-start"]')?.disabled)
      .toBe(false);
    expect(container.textContent).toContain("Automatic");
    await act(async () => root.unmount());
  });

  it("previews the selected style with explicit generated MIDI notes", async () => {
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000102",
      title: "Style Preview",
      progressionBlocks: [block],
    });
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="en"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));
    const selector = container.querySelector<HTMLSelectElement>(
      '[data-testid="practice-target-source"]',
    );
    await act(async () => {
      if (!selector) return;
      selector.value = "open-17";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const electricPiano = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Electric piano");
    await act(async () => electricPiano?.click());
    const preview = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Preview progression"));
    await act(async () => preview?.click());

    expect(toggle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "practice" }),
      expect.objectContaining({
        type: "timeline",
        sound: "electric-piano",
        explicitMidiNotesByEventId: expect.objectContaining({
          "dojo-event-0": expect.any(Array),
        }),
      }),
    );
    await act(async () => root.unmount());
  });

  it("previews a clicked progression card and links its voicing to the piano guide", async () => {
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000103",
      title: "Chord Card Preview",
      progressionBlocks: [block],
    });
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
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
    const selector = container.querySelector<HTMLSelectElement>(
      '[data-testid="practice-target-source"]',
    );
    await act(async () => {
      if (!selector) return;
      selector.value = "open-17";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const secondCard = container.querySelector<HTMLButtonElement>(
      '[data-progression-index="1"]',
    );
    await act(async () => secondCard?.click());

    expect(secondCard?.getAttribute("aria-current")).toBe("step");
    expect(container.querySelector('[data-testid="practice-current-chord"]')?.textContent)
      .toContain(block.chords[1].chord.label);
    const visibleGuideNotes = [
      ...container.querySelectorAll<SVGGElement>("[data-guide-hand]"),
    ]
      .map((key) => Number(key.getAttribute("data-midi-note")))
      .sort((left, right) => left - right);
    const request = toggle.mock.calls[toggle.mock.calls.length - 1]?.[1];
    expect(request).toEqual(expect.objectContaining({
      type: "chord",
      chord: block.chords[1].chord,
      sound: "piano",
      explicitMidiNotes: visibleGuideNotes,
    }));

    await act(async () => root.unmount());
  });
});
