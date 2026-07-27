// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import { makeChordSymbol } from "../domain/chords";
import {
  createLiveNoteState,
  reduceLiveNoteState,
} from "../domain/liveMidi";
import { progressionFingerprint } from "../domain/practice";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { normalizedChordKey } from "../domain/voicing";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import type { PracticeClockStartOptions } from "../practice/PracticeClock";
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
  vi.useRealTimers();
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
    expect(container.querySelector(
      '[data-testid="dojo-voicing-source-chip"]',
    )?.getAttribute("data-voicing-source")).toBe("generated");
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

  it("shows the progression key beside the current chord in every level", async () => {
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

    expect(container.querySelector('[data-testid="practice-current-key"]')?.textContent)
      .toBe("Key C major");

    const levels = ["L2 Play by name", "L3 Play by degree"];
    for (const label of levels) {
      const levelButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === label);
      await act(async () => levelButton?.click());
      expect(container.querySelector('[data-testid="practice-current-key"]')?.textContent)
        .toBe("Key C major");
    }

    expect(container.querySelector('[data-testid="practice-current-chord"]')?.textContent)
      .toContain("I");

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

  it("guards L4/L5 when the progression has no supported key and opens details", async () => {
    const unsupported = {
      ...block,
      detectedKey: "D dorian",
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000105",
      title: "Unsupported mode",
      key: undefined,
      progressionBlocks: [unsupported],
    });
    const openProgression = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="en"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={openProgression}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));

    const l4 = findButton(container, "L4 Nearby keys");
    const l5 = findButton(container, "L5 Any key");
    expect(l4?.disabled).toBe(true);
    expect(l5?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "L4/L5 requires a supported major or minor key.",
    );
    await act(async () => findButton(
      container,
      "Set the key in progression details",
    )?.click());
    expect(openProgression).toHaveBeenCalledWith(idea.id, block.id);

    await act(async () => root.unmount());
  });

  it("shows L4 as a six-key degree-only workspace without guide leakage", async () => {
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 42;
      return array;
    });
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000106",
      title: "Transpose safely",
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
    await act(async () => findButton(container, "L4 近くのキーでも")?.click());

    expect(container.querySelectorAll("[data-key-pitch-class]")).toHaveLength(6);
    expect(container.querySelector('[data-testid="transposition-target-key"]'))
      .not.toBeNull();
    expect(container.querySelector('[data-testid="transposition-eligibility"]')?.textContent)
      .toBe("段位対象外");
    expect(container.querySelector('[data-testid="transposition-progress-count"]')?.textContent)
      .toBe("0 / 6");
    expect(container.textContent).toContain("5度圏で近い6キー");
    expect(container.textContent).toContain("フローモードが必要");
    expect(container.textContent).toContain("70 BPM以上");
    expect(container.textContent).toContain("前の段位の確定が必要");
    expect(container.querySelector('[role="radiogroup"][aria-label="レベル"]')).not.toBeNull();
    expect(container.querySelector('[role="radiogroup"][aria-label="モード"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="practice-current-chord"]')?.textContent)
      .toMatch(/^[a-zA-Zb#0-9/()]+$/);
    expect(container.querySelector('[data-testid="practice-current-chord"]')?.className)
      .toContain("break-words");
    expect(container.querySelector('[data-testid="practice-next-chord"]')?.className)
      .toContain("break-words");
    const overview = container.querySelector(
      '[data-testid="practice-progression-overview"]',
    );
    block.chords.forEach((event) => {
      expect(overview?.textContent).not.toContain(event.chord.label);
    });
    expect(container.textContent).not.toContain(block.summaryText);
    expect(container.querySelectorAll("[data-guide-hand]")).toHaveLength(0);
    expect(container.querySelectorAll("svg title")).toHaveLength(0);
    expect(container.querySelectorAll("[data-c-label]").length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="practice-left-hand-guide"]')).toBeNull();
    expect(container.querySelector('[data-testid="practice-right-hand-guide"]')).toBeNull();
    expect(container.querySelector('[data-testid="practice-style-chip"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("shows persisted coverage in the queue and restores fixed confirmation keys", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));
    const practiced: SavedProgressionBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000132",
      practice: {
        schemaVersion: 1,
        progressionFingerprint: progressionFingerprint(block),
        confirmedLevel: 3,
        provisional: {
          level: 4,
          clearedAt: "2026-07-23T12:00:00.000Z",
          clearedOnLocalDate: "2026-07-23",
          targetTempo: 70,
          confirmationPitchClasses: [5, 7],
        },
        transposition: {
          schemaVersion: 1,
          clearedKeyPitchClasses: [2, 3, 5, 7, 9, 10],
          updatedAt: "2026-07-23T12:00:00.000Z",
        },
      },
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000133",
      title: "Confirmation queue",
      progressionBlocks: [practiced],
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

    expect(container.textContent).toContain("Confirm another day · L4 keys 6/6");
    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    expect(container.querySelector(
      '[data-testid="transposition-progress-count"]',
    )?.textContent).toBe("6 / 6");
    expect(container.querySelector(
      '[data-testid="transposition-confirmation-progress"]',
    )?.textContent).toContain("Confirmation");
    expect(container.querySelectorAll(
      '[data-key-state="confirmation"], [data-key-state="current"]',
    )).toHaveLength(2);

    await act(async () => root.unmount());
  });

  it("limits an inherited twelve-key history to L4 6/6 and hides the L1-L3 Clean counter", async () => {
    const practiced: SavedProgressionBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000141",
      practice: {
        schemaVersion: 1,
        progressionFingerprint: progressionFingerprint(block),
        confirmedLevel: 4,
        transposition: {
          schemaVersion: 1,
          clearedKeyPitchClasses: Array.from(
            { length: 12 },
            (_, index) => index,
          ),
        },
      },
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000142",
      title: "Inherited all keys",
      progressionBlocks: [practiced],
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

    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    expect(container.querySelector(
      '[data-testid="transposition-progress-count"]',
    )?.textContent).toBe("6 / 6");
    expect(container.textContent).not.toContain("Clean 0/2");
    await act(async () => root.unmount());
  });

  it("filters partial L4 and L5 coverage without classifying L5 as L4", async () => {
    const l4Source = {
      ...block,
      id: "00000000-0000-4000-8000-000000000143",
    };
    const l5Source = {
      ...block,
      id: "00000000-0000-4000-8000-000000000144",
    };
    const l4: SavedProgressionBlock = {
      ...l4Source,
      practice: {
        schemaVersion: 1,
        progressionFingerprint: progressionFingerprint(l4Source),
        confirmedLevel: 3,
        transposition: {
          schemaVersion: 1,
          clearedKeyPitchClasses: [7],
        },
      },
    };
    const l5: SavedProgressionBlock = {
      ...l5Source,
      practice: {
        schemaVersion: 1,
        progressionFingerprint: progressionFingerprint(l5Source),
        confirmedLevel: 4,
        transposition: {
          schemaVersion: 1,
          clearedKeyPitchClasses: [7],
        },
      },
    };
    const ideas = [
      makeIdea({
        id: "00000000-0000-4000-8000-000000000145",
        title: "Partial L4",
        progressionBlocks: [l4],
      }),
      makeIdea({
        id: "00000000-0000-4000-8000-000000000146",
        title: "Partial L5",
        progressionBlocks: [l5],
      }),
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={ideas}
        language="en"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));
    const filter = container.querySelector<HTMLSelectElement>("aside select");
    const queue = container.querySelector('[data-testid="practice-queue-scroll"]');

    await act(async () => {
      if (!filter) return;
      filter.value = "l4";
      filter.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(queue?.textContent).toContain("Partial L4");
    expect(queue?.textContent).not.toContain("Partial L5");

    await act(async () => {
      if (!filter) return;
      filter.value = "l5";
      filter.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(queue?.textContent).not.toContain("Partial L4");
    expect(queue?.textContent).toContain("Partial L5");
    await act(async () => root.unmount());
  });

  it("rebuilds the L4 rail immediately after a successful stale reset", async () => {
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const stale: SavedProgressionBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000147",
      practice: {
        schemaVersion: 1,
        progressionFingerprint: "practice-v1-stale",
        confirmedLevel: 3,
        transposition: {
          schemaVersion: 1,
          clearedKeyPitchClasses: [2, 3, 5, 7, 9, 10],
        },
      },
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000148",
      title: "Stale transposition",
      progressionBlocks: [stale],
    });
    const updateProgressionBlock = vi.fn(() => true);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="en"
        updateProgressionBlock={updateProgressionBlock}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));

    const queueItem = [...container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="practice-queue-scroll"] button',
    )].find((candidate) => candidate.textContent?.includes("Stale transposition"));
    expect(queueItem?.textContent).not.toContain("6/6");
    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    expect(container.querySelector(
      '[data-testid="transposition-progress-count"]',
    )?.textContent).toBe("0 / 6");
    expect(container.querySelectorAll('[data-key-state="cleared"]')).toHaveLength(0);

    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    expect(updateProgressionBlock).toHaveBeenCalledWith(
      idea.id,
      stale.id,
      {
        practice: expect.not.objectContaining({
          transposition: expect.anything(),
        }),
      },
    );
    expect(container.querySelector(
      '[data-testid="transposition-progress-count"]',
    )?.textContent).toBe("0 / 6");
    expect(container.querySelectorAll('[data-key-state="cleared"]')).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it("renders the L5 rail, allows idle key selection, and locks it while running", async () => {
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 77;
      return array;
    });
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000107",
      title: "All keys",
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
    await act(async () => findButton(container, "L5 Any key")?.click());

    const keys = [
      ...container.querySelectorAll<HTMLButtonElement>("[data-key-pitch-class]"),
    ];
    expect(keys).toHaveLength(12);
    const other = keys.find((button) => !button.hasAttribute("aria-current"));
    await act(async () => other?.click());
    expect(other?.getAttribute("aria-current")).toBe("step");

    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    expect([
      ...container.querySelectorAll<HTMLButtonElement>("[data-key-pitch-class]"),
    ].every((button) => button.disabled)).toBe(true);

    await act(async () => root.unmount());
  });

  it("uses target-key explicit notes for L4 resolved and Style previews", async () => {
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 91;
      return array;
    });
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000108",
      title: "Target preview",
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
    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    const firstCard = container.querySelector<HTMLButtonElement>(
      '[data-progression-index="0"]',
    );
    await act(async () => firstCard?.click());
    const resolvedRequest = toggle.mock.calls[toggle.mock.calls.length - 1]?.[1];
    expect(resolvedRequest).toEqual(expect.objectContaining({
      type: "chord",
      sound: "piano",
      explicitMidiNotes: expect.any(Array),
    }));
    if (resolvedRequest?.type === "chord") {
      expect(resolvedRequest.chord.root).not.toBe(block.chords[0].chord.root);
      expect(resolvedRequest.explicitMidiNotes?.length).toBeGreaterThan(0);
    }

    const selector = container.querySelector<HTMLSelectElement>(
      '[data-testid="practice-target-source"]',
    );
    await act(async () => {
      if (!selector) return;
      selector.value = "open-17";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(selector?.textContent).toContain("Open 1-7");
    expect(container.querySelector('[data-testid="practice-style-chip"]')).toBeNull();
    expect(container.querySelector('[data-testid="practice-current-chord"]')?.textContent)
      .not.toContain(block.chords[0].chord.label);
    await act(async () => firstCard?.click());
    const styleRequest = toggle.mock.calls[toggle.mock.calls.length - 1]?.[1];
    expect(styleRequest).toEqual(expect.objectContaining({
      type: "chord",
      explicitMidiNotes: expect.any(Array),
    }));
    if (styleRequest?.type === "chord") {
      expect(styleRequest.explicitMidiNotes?.length).toBeGreaterThan(0);
    }

    await act(async () => root.unmount());
  });

  it("never persists L4/L5 sessions during close preparation or unmount", async () => {
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 120;
      return array;
    });
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000109",
      title: "No T2 persistence",
      progressionBlocks: [block],
    });
    const updateProgressionBlock = vi.fn(() => true);
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
    await act(async () => findButton(container, "L4 近くのキーでも")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());

    act(() => runClosePreparations());
    await act(async () => root.unmount());
    expect(updateProgressionBlock).not.toHaveBeenCalled();
  });

  it("keeps a clean Step round on the same key and offers the Flow CTA", async () => {
    const oneChordBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000110",
      chords: [block.chords[0]],
    };
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 130;
      return array;
    });
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
    const updateProgressionBlock = vi.fn(() => true);
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000111",
      title: "Step keeps key",
      progressionBlocks: [oneChordBlock],
    });
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
    await act(async () => findButton(container, "L4 近くのキーでも")?.click());
    const targetBefore = container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent;
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-progression-index="0"]',
    )?.click());
    const preview = toggle.mock.calls[toggle.mock.calls.length - 1]?.[1];
    if (!preview || preview.type !== "chord" || !preview.explicitMidiNotes) {
      throw new Error("Expected target-key preview notes.");
    }
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    await playMidiNotes(preview.explicitMidiNotes);

    expect(container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent).toBe(targetBefore);
    expect(container.querySelector(
      '[data-testid="transposition-progress-count"]',
    )?.textContent).toBe("0 / 6");
    expect(container.textContent).toContain("このキーをフローで弾いてみますか？");
    expect(updateProgressionBlock).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="transposition-step-to-flow"]',
    )?.click());
    expect(container.querySelector(
      '[role="radiogroup"][aria-label="モード"] [role="radio"][aria-checked="true"]',
    )?.textContent).toBe("フロー");

    await act(async () => root.unmount());
    expect(updateProgressionBlock).not.toHaveBeenCalled();
  });

  it("persists one eligible clean L4 Flow round through updateProgressionBlock", async () => {
    const source: SavedProgressionBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000130",
      bpm: 80,
      chords: [block.chords[0]],
    };
    const eligibleBlock: SavedProgressionBlock = {
      ...source,
      practice: {
        schemaVersion: 1,
        progressionFingerprint: progressionFingerprint(source),
        confirmedLevel: 3,
      },
    };
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 330;
      return array;
    });
    const starts: PracticeClockStartOptions[] = [];
    const clock = {
      start: vi.fn(async (options: PracticeClockStartOptions) => {
        starts.push(options);
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
    const updateProgressionBlock = vi.fn(() => true);
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000131",
      title: "Eligible coverage",
      progressionBlocks: [eligibleBlock],
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="en"
        updateProgressionBlock={updateProgressionBlock}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
        practiceClock={clock}
      />,
    ));

    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    await act(async () => findButton(container, "Flow")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-progression-index="0"]',
    )?.click());
    const preview = toggle.mock.calls[toggle.mock.calls.length - 1]?.[1];
    if (!preview || preview.type !== "chord" || !preview.explicitMidiNotes) {
      throw new Error("Expected target-key preview notes.");
    }
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    await act(async () => starts[0]?.callbacks.onTargetOpen(0));
    await playMidiNotes(preview.explicitMidiNotes);
    expect(updateProgressionBlock).not.toHaveBeenCalled();
    await act(async () => starts[0]?.callbacks.onRoundCompleted());

    expect(updateProgressionBlock).toHaveBeenCalledOnce();
    expect(updateProgressionBlock).toHaveBeenCalledWith(
      idea.id,
      eligibleBlock.id,
      {
        practice: expect.objectContaining({
          confirmedLevel: 3,
          transposition: expect.objectContaining({
            schemaVersion: 1,
            clearedKeyPitchClasses: expect.any(Array),
          }),
        }),
      },
    );

    act(() => runClosePreparations());
    await act(async () => root.unmount());
    expect(updateProgressionBlock).toHaveBeenCalledOnce();
  });

  it("confirms L4 only after its two fixed keys are clean on another day", async () => {
    const source: SavedProgressionBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000134",
      bpm: 80,
      chords: [{
        ...block.chords[0],
        voicingMemory: {
          sourceVoicing: {
            schemaVersion: 1,
            source: "live-played",
            representation: "simultaneous-voicing",
            midiNotes: [48, 52, 55, 59],
            bassNote: 48,
            capturedForChordKey: normalizedChordKey(block.chords[0].chord),
            confidence: 1,
            userVerified: true,
          },
        },
      }],
    };
    const due: SavedProgressionBlock = {
      ...source,
      practice: {
        schemaVersion: 1,
        progressionFingerprint: progressionFingerprint(source),
        confirmedLevel: 3,
        provisional: {
          level: 4,
          clearedAt: "2000-01-01T12:00:00.000Z",
          clearedOnLocalDate: "2000-01-01",
          targetTempo: 60,
          confirmationPitchClasses: [5, 7],
        },
        transposition: {
          schemaVersion: 1,
          clearedKeyPitchClasses: [2, 4, 5, 7, 9, 11],
          updatedAt: "2000-01-01T12:00:00.000Z",
        },
      },
    };
    const starts: PracticeClockStartOptions[] = [];
    const clock = {
      start: vi.fn(async (options: PracticeClockStartOptions) => {
        starts.push(options);
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const updateProgressionBlock = vi.fn(() => true);
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000135",
      title: "L4 confirmation",
      progressionBlocks: [due],
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="en"
        updateProgressionBlock={updateProgressionBlock}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
        practiceClock={clock}
      />,
    ));

    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    await act(async () => findButton(container, "Flow")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    await act(async () => starts[0]?.callbacks.onTargetOpen(0));
    await playMidiNotes([53, 57, 60, 64]);
    await act(async () => starts[0]?.callbacks.onRoundCompleted());
    await act(async () => Promise.resolve());

    expect(updateProgressionBlock).not.toHaveBeenCalled();
    expect(starts).toHaveLength(2);
    expect(container.querySelector(
      '[data-testid="transposition-confirmation-progress"]',
    )?.textContent).toContain("2 / 2");

    await act(async () => starts[1]?.callbacks.onTargetOpen(0));
    await replaceMidiNotes(
      [53, 57, 60, 64],
      [55, 59, 62, 66],
    );
    await act(async () => starts[1]?.callbacks.onRoundCompleted());

    expect(updateProgressionBlock).toHaveBeenCalledOnce();
    expect(updateProgressionBlock).toHaveBeenCalledWith(
      idea.id,
      due.id,
      {
        practice: expect.objectContaining({
          confirmedLevel: 4,
          provisional: undefined,
          transposition: expect.objectContaining({
            clearedKeyPitchClasses: [2, 4, 5, 7, 9, 11],
          }),
        }),
      },
    );

    await act(async () => root.unmount());
  });

  it("cancels a delayed Flow start when the session is paused or ended", async () => {
    const deferred = createDeferred();
    const clock = {
      start: vi.fn(() => deferred.promise),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const updateProgressionBlock = vi.fn(() => true);
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000121",
      title: "Delayed start",
      progressionBlocks: [block],
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="en"
        updateProgressionBlock={updateProgressionBlock}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "Flow")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    await act(async () => findButton(container, "Pause")?.click());

    expect(clock.pause).toHaveBeenCalled();
    expect(findButton(container, "Resume")?.disabled).toBe(false);
    await act(async () => findButton(container, "End")?.click());
    const stopCountBeforeResolution = clock.stop.mock.calls.length;
    deferred.resolve();
    await act(async () => Promise.resolve());

    expect(clock.stop).toHaveBeenCalledTimes(stopCountBeforeResolution);
    expect(findButton(container, "Resume")).toBeUndefined();
    expect(container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.disabled).toBe(false);

    await act(async () => root.unmount());
  });

  it("does not score MIDI while the initial Flow clock start is pending", async () => {
    const deferred = createDeferred();
    const starts: PracticeClockStartOptions[] = [];
    const clock = {
      start: vi.fn((options: PracticeClockStartOptions) => {
        starts.push(options);
        return deferred.promise;
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000123",
      title: "Pending MIDI gate",
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
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "Flow")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    await act(async () => starts[0]?.callbacks.onTargetOpen(0));
    await playMidiNotes([60, 64, 71]);

    expect(container.textContent).toContain("Ready");
    expect(container.textContent).not.toContain("Matched");
    deferred.resolve();
    await act(async () => Promise.resolve());
    await act(async () => findButton(container, "End")?.click());

    await act(async () => root.unmount());
  });

  it("ignores a late round callback after pausing and does not auto-resume", async () => {
    const oneChordBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000124",
      chords: [block.chords[0]],
    };
    const starts: PracticeClockStartOptions[] = [];
    const clock = {
      start: vi.fn(async (options: PracticeClockStartOptions) => {
        starts.push(options);
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000125",
      title: "Late round callback",
      progressionBlocks: [oneChordBlock],
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
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    await act(async () => findButton(container, "Flow")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    const targetBefore = container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent;
    await act(async () => findButton(container, "Pause")?.click());
    await act(async () => starts[0]?.callbacks.onRoundCompleted());

    expect(starts).toHaveLength(1);
    expect(findButton(container, "Resume")).toBeDefined();
    expect(container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent).toBe(targetBefore);
    expect(container.querySelector(
      '[data-testid="transposition-progress-count"]',
    )?.textContent).toBe("0 / 6");
    await act(async () => root.unmount());
  });

  it("resumes a ready Flow clock in place and requires a fresh attack", async () => {
    const oneChordBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000128",
      chords: [block.chords[0]],
    };
    const starts: PracticeClockStartOptions[] = [];
    const clock = {
      start: vi.fn(async (options: PracticeClockStartOptions) => {
        starts.push(options);
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000129",
      title: "In-place resume",
      progressionBlocks: [oneChordBlock],
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
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "Flow")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    await act(async () => starts[0]?.callbacks.onTargetOpen(0));
    await playMidiNotes([60, 64, 71]);
    await act(async () => starts[0]?.callbacks.onRoundCompleted());
    expect(container.textContent).toContain("Round 2");

    await act(async () => findButton(container, "Pause")?.click());
    await act(async () => starts[0]?.callbacks.onRoundCompleted());
    expect(container.textContent).toContain("Round 2");
    await act(async () => findButton(container, "Resume")?.click());
    await act(async () => Promise.resolve());

    expect(clock.start).toHaveBeenCalledTimes(1);
    expect(clock.resume).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Almost there");
    expect(container.textContent).not.toContain("Matched");

    await reAttackMidiNotes([60, 64, 71]);
    expect(container.textContent).toContain("Matched");

    await act(async () => root.unmount());
  });

  it.each([
    ["resolve", "L4 Nearby keys"],
    ["reject", "L5 Any key"],
  ] as const)(
    "starts a fresh %s Flow after pending pause without letting stale A stop B",
    async (settlement, levelLabel) => {
      const deferred = createDeferred();
      const starts: PracticeClockStartOptions[] = [];
      const setToast = vi.fn();
      const clock = {
        start: vi.fn((options: PracticeClockStartOptions) => {
          starts.push(options);
          return starts.length === 1 ? deferred.promise : Promise.resolve();
        }),
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
      };
      const idea = makeIdea({
        id: settlement === "resolve"
          ? "00000000-0000-4000-8000-000000000130"
          : "00000000-0000-4000-8000-000000000131",
        title: `Stale ${settlement}`,
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
          setToast={setToast}
          practiceClock={clock}
        />,
      ));
      await act(async () => findButton(container, levelLabel)?.click());
      await act(async () => findButton(container, "Flow")?.click());
      await act(async () => container.querySelector<HTMLButtonElement>(
        '[data-testid="practice-start"]',
      )?.click());
      await act(async () => starts[0]?.callbacks.onTargetOpen(2));
      await act(async () => findButton(container, "Pause")?.click());
      await act(async () => findButton(container, "Resume")?.click());
      await act(async () => Promise.resolve());

      expect(starts).toHaveLength(2);
      expect(clock.resume).not.toHaveBeenCalled();
      expect(container.querySelector(
        '[data-progression-index="0"]',
      )?.getAttribute("aria-current")).toBe("step");
      const stopCountAfterB = clock.stop.mock.calls.length;

      if (settlement === "resolve") {
        deferred.resolve();
      } else {
        deferred.reject(new Error("stale A failed"));
      }
      await act(async () => Promise.resolve());

      expect(clock.stop).toHaveBeenCalledTimes(stopCountAfterB);
      expect(setToast).not.toHaveBeenCalled();
      await act(async () => starts[1]?.callbacks.onRoundCompleted());
      expect(container.textContent).toContain("Round 2");

      await act(async () => root.unmount());
    },
  );

  it.each(["resolve", "reject"] as const)(
    "allows an immediate restart after End while stale start A later %ss",
    async (settlement) => {
      const deferred = createDeferred();
      const starts: PracticeClockStartOptions[] = [];
      const setToast = vi.fn();
      const clock = {
        start: vi.fn((options: PracticeClockStartOptions) => {
          starts.push(options);
          return starts.length === 1 ? deferred.promise : Promise.resolve();
        }),
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
      };
      const idea = makeIdea({
        id: settlement === "resolve"
          ? "00000000-0000-4000-8000-000000000132"
          : "00000000-0000-4000-8000-000000000133",
        title: `End pending ${settlement}`,
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
          setToast={setToast}
          practiceClock={clock}
        />,
      ));
      await act(async () => findButton(container, "Flow")?.click());
      await act(async () => container.querySelector<HTMLButtonElement>(
        '[data-testid="practice-start"]',
      )?.click());
      await act(async () => findButton(container, "End")?.click());

      const restart = container.querySelector<HTMLButtonElement>(
        '[data-testid="practice-start"]',
      );
      expect(restart?.disabled).toBe(false);
      await act(async () => restart?.click());
      await act(async () => Promise.resolve());
      expect(starts).toHaveLength(2);
      const stopCountAfterB = clock.stop.mock.calls.length;
      const toastCountAfterB = setToast.mock.calls.length;

      if (settlement === "resolve") {
        deferred.resolve();
      } else {
        deferred.reject(new Error("ended stale A failed"));
      }
      await act(async () => Promise.resolve());

      expect(clock.stop).toHaveBeenCalledTimes(stopCountAfterB);
      expect(setToast).toHaveBeenCalledTimes(toastCountAfterB);
      expect(findButton(container, "Pause")).toBeDefined();
      await act(async () => starts[1]?.callbacks.onRoundCompleted());
      expect(container.textContent).toContain("Round 2");

      await act(async () => root.unmount());
    },
  );

  it("clears pending loading and safely pauses when MIDI disconnects", async () => {
    const deferred = createDeferred();
    const starts: PracticeClockStartOptions[] = [];
    const setToast = vi.fn();
    const clock = {
      start: vi.fn((options: PracticeClockStartOptions) => {
        starts.push(options);
        return starts.length === 1 ? deferred.promise : Promise.resolve();
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000134",
      title: "Disconnect pending",
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
        setToast={setToast}
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "Flow")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    await act(async () => defaultLiveMidiStore.setState({
      status: "disconnected",
    }));

    expect(clock.stop).toHaveBeenCalled();
    expect(findButton(container, "Pause")).toBeUndefined();
    expect(findButton(container, "Resume")?.disabled).toBe(true);
    await act(async () => defaultLiveMidiStore.setState({
      status: "connected",
    }));
    expect(findButton(container, "Resume")?.disabled).toBe(false);
    await act(async () => findButton(container, "Resume")?.click());
    await act(async () => Promise.resolve());
    expect(starts).toHaveLength(2);
    const stopCountAfterB = clock.stop.mock.calls.length;

    deferred.resolve();
    await act(async () => Promise.resolve());
    expect(clock.stop).toHaveBeenCalledTimes(stopCountAfterB);
    expect(setToast).not.toHaveBeenCalled();
    expect(findButton(container, "Pause")).toBeDefined();

    await act(async () => root.unmount());
  });

  it("recovers from a rejected Flow clock start with a safe error", async () => {
    const setToast = vi.fn();
    const clock = {
      start: vi.fn(async () => {
        throw new Error("Audio context failed");
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000126",
      title: "Rejected start",
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
        setToast={setToast}
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "Flow")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    await act(async () => Promise.resolve());

    expect(clock.stop).toHaveBeenCalled();
    expect(setToast).toHaveBeenCalledWith(
      "Flow practice could not start. Check the MIDI connection and audio settings.",
    );
    expect(findButton(container, "Pause")).toBeUndefined();
    expect(findButton(container, "Resume")).toBeDefined();

    await act(async () => root.unmount());
  });

  it("starts Flow normally at L1, L2, and L3", async () => {
    const clock = {
      start: vi.fn(async (_options: PracticeClockStartOptions) => undefined),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000127",
      title: "L1-L3 Flow",
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
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "Flow")?.click());

    for (const [index, label] of [
      "L1 See and play",
      "L2 Play by name",
      "L3 Play by degree",
    ].entries()) {
      if (index > 0) await act(async () => findButton(container, label)?.click());
      await act(async () => container.querySelector<HTMLButtonElement>(
        '[data-testid="practice-start"]',
      )?.click());
      expect(clock.start).toHaveBeenCalledTimes(index + 1);
      await act(async () => findButton(container, "End")?.click());
    }

    await act(async () => root.unmount());
  });

  it("keeps BPM immutable while a paused L1 Flow clock is active", async () => {
    const clock = {
      start: vi.fn(async (_options: PracticeClockStartOptions) => undefined),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000122",
      title: "Paused BPM",
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
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "Flow")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    await act(async () => findButton(container, "Pause")?.click());

    const bpmInput = container.querySelector<HTMLInputElement>('input[type="number"]');
    expect(bpmInput?.value).toBe("60");
    expect(bpmInput?.disabled).toBe(true);
    expect(container.textContent).toContain("BPM 60");

    await act(async () => root.unmount());
  });

  it("retries dirty Flow on the same key and skips only by explicit action", async () => {
    const oneChordBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000112",
      chords: [block.chords[0]],
    };
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 140;
      return array;
    });
    const starts: PracticeClockStartOptions[] = [];
    const clock = {
      start: vi.fn(async (options: PracticeClockStartOptions) => {
        starts.push(options);
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const updateProgressionBlock = vi.fn(() => true);
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000113",
      title: "Dirty retry",
      progressionBlocks: [oneChordBlock],
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={[idea]}
        language="en"
        updateProgressionBlock={updateProgressionBlock}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    await act(async () => findButton(container, "Flow")?.click());
    const targetBefore = container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent;
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    const stopCountBeforeRound = clock.stop.mock.calls.length;
    await act(async () => starts[0]?.callbacks.onRoundCompleted());

    expect(container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent).toBe(targetBefore);
    expect(clock.stop).toHaveBeenCalledTimes(stopCountBeforeRound);
    expect(container.textContent).toContain("Retrying the same key.");
    expect(container.querySelector(
      '[data-testid="transposition-progress-count"]',
    )?.textContent).toBe("0 / 6");
    expect(updateProgressionBlock).not.toHaveBeenCalled();

    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="transposition-skip-key"]',
    )?.click());
    await act(async () => Promise.resolve());
    expect(container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent).not.toBe(targetBefore);
    expect(starts).toHaveLength(2);
    expect(container.querySelector(
      '[data-testid="transposition-progress-count"]',
    )?.textContent).toBe("0 / 6");
    expect(updateProgressionBlock).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("stops the old Flow clock and restarts only after the new target plan is ready", async () => {
    const oneChordBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000114",
      bpm: 80,
      chords: [block.chords[0]],
    };
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 150;
      return array;
    });
    const starts: PracticeClockStartOptions[] = [];
    const restart = createDeferred();
    const clock = {
      start: vi.fn(async (options: PracticeClockStartOptions) => {
        starts.push(options);
        if (starts.length === 2) await restart.promise;
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000115",
      title: "Clock boundary",
      progressionBlocks: [oneChordBlock],
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
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    await act(async () => findButton(container, "Flow")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-progression-index="0"]',
    )?.click());
    const preview = toggle.mock.calls[toggle.mock.calls.length - 1]?.[1];
    if (!preview || preview.type !== "chord" || !preview.explicitMidiNotes) {
      throw new Error("Expected target-key preview notes.");
    }
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    const firstRoot = starts[0]?.events[0]?.chord.root;
    await act(async () => starts[0]?.callbacks.onTargetOpen(0));
    await playMidiNotes(preview.explicitMidiNotes);
    const stopCountBeforeBoundary = clock.stop.mock.calls.length;
    await act(async () => starts[0]?.callbacks.onRoundCompleted());
    await act(async () => Promise.resolve());

    expect(clock.stop.mock.calls.length).toBeGreaterThan(stopCountBeforeBoundary);
    expect(starts).toHaveLength(2);
    expect(starts[1]?.events[0]?.chord.root).not.toBe(firstRoot);
    expect(findButton(container, "Resume")?.disabled).toBe(true);
    await act(async () => starts[1]?.callbacks.onTargetClose(0));
    expect(container.textContent).not.toContain("Retrying the same key.");
    restart.resolve();
    await act(async () => Promise.resolve());
    expect(container.querySelector(
      '[data-testid="transposition-progress-count"]',
    )?.textContent).toBe("0 / 6");
    const targetAfterRestart = container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent;
    await act(async () => starts[0]?.callbacks.onRoundCompleted());
    expect(container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent).toBe(targetAfterRestart);
    expect(container.querySelector(
      '[data-testid="transposition-skip-key"]',
    )).toBeNull();

    await act(async () => root.unmount());
  });

  it("does not rotate a clean Flow key below target tempo", async () => {
    const oneChordBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000116",
      chords: [block.chords[0]],
    };
    const starts: PracticeClockStartOptions[] = [];
    const clock = {
      start: vi.fn(async (options: PracticeClockStartOptions) => {
        starts.push(options);
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000117",
      title: "Below tempo",
      progressionBlocks: [oneChordBlock],
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
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    await act(async () => findButton(container, "Flow")?.click());
    const targetBefore = container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent;
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-progression-index="0"]',
    )?.click());
    const preview = toggle.mock.calls[toggle.mock.calls.length - 1]?.[1];
    if (!preview || preview.type !== "chord" || !preview.explicitMidiNotes) {
      throw new Error("Expected target-key preview notes.");
    }
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());
    await act(async () => starts[0]?.callbacks.onTargetOpen(0));
    await playMidiNotes(preview.explicitMidiNotes);
    await act(async () => starts[0]?.callbacks.onRoundCompleted());

    expect(container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent).toBe(targetBefore);
    expect(starts).toHaveLength(1);
    expect(container.querySelector(
      '[data-testid="transposition-progress-count"]',
    )?.textContent).toBe("0 / 6");
    expect(container.textContent).toContain("at least 70 BPM");

    await act(async () => root.unmount());
  });

  it("resynchronizes with a new seed when the source key changes externally", async () => {
    let seed = 200;
    const seedSpy = vi.spyOn(
      globalThis.crypto,
      "getRandomValues",
    ).mockImplementation((array) => {
      (array as Uint32Array)[0] = seed;
      seed += 1;
      return array;
    });
    const clock = {
      start: vi.fn(async (_options: PracticeClockStartOptions) => undefined),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000118",
      title: "External sync",
      progressionBlocks: [block],
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    const render = (nextIdea: typeof idea) => (
      <PracticeView
        ideas={[nextIdea]}
        language="en"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
        practiceClock={clock}
      />
    );
    await act(async () => root.render(render(idea)));
    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.click());

    const changedBlock = {
      ...block,
      detectedKey: "D major",
    };
    const changedIdea = {
      ...idea,
      progressionBlocks: [changedBlock],
    };
    await act(async () => root.render(render(changedIdea)));

    expect(seedSpy).toHaveBeenCalledTimes(2);
    expect(clock.stop).toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )).not.toBeNull();
    expect(container.querySelector(
      '[data-testid="transposition-target-key"]',
    )?.textContent).toContain("major");

    await act(async () => root.unmount());
  });

  it("shows a safe target-plan range error and disables start and preview", async () => {
    const chord = block.chords[0].chord;
    const rangeBlock: SavedProgressionBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000119",
      chords: [{
        ...block.chords[0],
        voicingMemory: {
          practiceVoicingOverride: {
            schemaVersion: 1,
            source: "live-played",
            representation: "simultaneous-voicing",
            midiNotes: [0, 127],
            capturedForChordKey: normalizedChordKey(chord),
            capturedForChordLabel: chord.label,
            userVerified: true,
          },
        },
      }],
    };
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000120",
      title: "Range error",
      progressionBlocks: [rangeBlock],
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
    await act(async () => findButton(container, "L4 近くのキーでも")?.click());

    expect(container.querySelector(
      '[data-testid="transposition-target-plan-error"]',
    )?.textContent).toContain("鍵盤範囲に収まりません");
    expect(container.querySelector<HTMLButtonElement>(
      '[data-testid="practice-start"]',
    )?.disabled).toBe(true);
    expect(findButton(container, "進行を試聴")?.disabled).toBe(true);

    await act(async () => root.unmount());
  });

  it("selects two to five queue items for Mix with accessible checkboxes", async () => {
    const ideas = Array.from({ length: 6 }, (_, index) => makeIdea({
      id: `00000000-0000-4000-8000-0000000002${index}`,
      title: `Mix item ${index + 1}`,
      progressionBlocks: [{
        ...block,
        id: `00000000-0000-4000-8000-0000000003${index}`,
      }],
    }));
    const setToast = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={ideas}
        language="en"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={setToast}
      />,
    ));

    await act(async () => findButton(container, "Mix selection")?.click());
    const checkboxes = [...container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][aria-label^="Mix item"]',
    )];
    expect(checkboxes).toHaveLength(6);
    for (const checkbox of checkboxes.slice(0, 5)) {
      await act(async () => checkbox.click());
    }
    expect(container.textContent).toContain("5 selected");
    expect(checkboxes[5].disabled).toBe(true);
    expect(container.querySelector('[data-testid="mix-setup"]')).not.toBeNull();

    await act(async () => findButton(container, "Clear selection")?.click());
    expect(container.textContent).toContain("0 selected");
    await act(async () => findButton(container, "Cancel")?.click());
    expect(container.querySelector('[data-testid="mix-setup"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("reports L3 preflight errors without silently excluding a progression", async () => {
    const missingKeyBlock = {
      ...block,
      id: "00000000-0000-4000-8000-000000000401",
      detectedKey: undefined,
    };
    const ideas = [
      makeIdea({
        id: "00000000-0000-4000-8000-000000000402",
        title: "Key present",
        progressionBlocks: [block],
      }),
      makeIdea({
        id: "00000000-0000-4000-8000-000000000403",
        title: "Key missing",
        key: undefined,
        progressionBlocks: [missingKeyBlock],
      }),
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={ideas}
        language="ja"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));

    await act(async () => findButton(container, "ミックス選択")?.click());
    const checkboxes = [...container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )];
    await act(async () => checkboxes[0]?.click());
    await act(async () => checkboxes[1]?.click());
    await act(async () => findButton(container, "L3 度数で弾く")?.click());
    await act(async () => findButton(container, "ミックス練習を開始")?.click());

    const errors = container.querySelector('[data-testid="mix-preflight-errors"]');
    expect(errors?.textContent).toContain("Key missing");
    expect(errors?.textContent).toContain("Keyが設定されていない");
    expect(container.querySelector('[data-testid="mix-session"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("keeps Mix fully non-persistent through close preparation and unmount", async () => {
    const ideas = [
      makeIdea({
        id: "00000000-0000-4000-8000-000000000411",
        title: "No save A",
        progressionBlocks: [block],
      }),
      makeIdea({
        id: "00000000-0000-4000-8000-000000000412",
        title: "No save B",
        progressionBlocks: [{
          ...block,
          id: "00000000-0000-4000-8000-000000000413",
        }],
      }),
    ];
    const before = structuredClone(ideas);
    const updateProgressionBlock = vi.fn(() => true);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={ideas}
        language="ja"
        updateProgressionBlock={updateProgressionBlock}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));
    await act(async () => findButton(container, "ミックス選択")?.click());
    const checkboxes = [...container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )];
    await act(async () => checkboxes[0]?.click());
    await act(async () => checkboxes[1]?.click());
    await act(async () => findButton(container, "ミックス練習を開始")?.click());

    expect(container.querySelector('[data-testid="mix-session"]')).not.toBeNull();
    act(() => runClosePreparations());
    expect(updateProgressionBlock).not.toHaveBeenCalled();
    expect(ideas).toEqual(before);

    await act(async () => root.unmount());
    expect(updateProgressionBlock).not.toHaveBeenCalled();
    expect(ideas).toEqual(before);
  });

  it("uses no count-in for the first Flow item and one bar between progressions", async () => {
    const starts: PracticeClockStartOptions[] = [];
    const clock = {
      start: vi.fn(async (options: PracticeClockStartOptions) => {
        starts.push(options);
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const ideas = [
      makeIdea({
        id: "00000000-0000-4000-8000-000000000421",
        title: "Flow A",
        progressionBlocks: [block],
      }),
      makeIdea({
        id: "00000000-0000-4000-8000-000000000422",
        title: "Flow B",
        progressionBlocks: [{
          ...block,
          id: "00000000-0000-4000-8000-000000000423",
        }],
      }),
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={ideas}
        language="ja"
        updateProgressionBlock={vi.fn(() => true)}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
        practiceClock={clock}
      />,
    ));
    await act(async () => findButton(container, "ミックス選択")?.click());
    const checkboxes = [...container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )];
    await act(async () => checkboxes[0]?.click());
    await act(async () => checkboxes[1]?.click());
    await act(async () => findButton(container, "フロー")?.click());
    await act(async () => findButton(container, "ミックス練習を開始")?.click());
    await act(async () => findButton(container, "この進行を開始")?.click());
    expect(starts[0]?.countInBars).toBe(0);

    await act(async () => starts[0]?.callbacks.onRoundCompleted());
    expect(container.textContent).toContain("次の進行");
    await act(async () => findButton(container, "この進行を開始")?.click());
    expect(starts[1]?.countInBars).toBe(1);
    await act(async () => starts[1]?.callbacks.onCountInBeat?.(1));
    expect(container.textContent).toContain("カウントイン 1");

    await act(async () => root.unmount());
  });

  it("keeps Step completion outside the update and save boundaries", async () => {
    vi.useFakeTimers();
    const ideas = makeMixPersistenceIdeas();
    const before = structuredClone(ideas);
    const save = vi.fn();
    const updateProgressionBlock = vi.fn(() => {
      save();
      return true;
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={ideas}
        language="en"
        updateProgressionBlock={updateProgressionBlock}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));
    await openTwoItemMix(container);

    await act(async () => findButton(container, "Start this progression")?.click());
    await setMidiNotesImmediately([60, 64, 71]);
    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });
    await act(async () => findButton(container, "Start this progression")?.click());
    await reAttackMidiNotesImmediately([60, 64, 71]);
    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="mix-summary"]')).not.toBeNull();
    act(() => runClosePreparations());
    expect(updateProgressionBlock).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(ideas).toEqual(before);
    await act(async () => root.unmount());
    expect(updateProgressionBlock).not.toHaveBeenCalled();
    expect(ideas).toEqual(before);
  });

  it("keeps Flow completion, dirty retry, same-selection retry, and Escape exit non-persistent", async () => {
    const ideas = makeMixPersistenceIdeas();
    const before = structuredClone(ideas);
    const save = vi.fn();
    const updateProgressionBlock = vi.fn(() => {
      save();
      return true;
    });
    const starts: PracticeClockStartOptions[] = [];
    const clock = {
      start: vi.fn(async (options: PracticeClockStartOptions) => {
        starts.push(options);
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={ideas}
        language="en"
        updateProgressionBlock={updateProgressionBlock}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
        practiceClock={clock}
      />,
    ));
    await openTwoItemMix(container, { flow: true });

    for (let round = 0; round < 2; round += 1) {
      await act(async () => findButton(container, "Start this progression")?.click());
      await act(async () => starts[round]?.callbacks.onRoundCompleted());
    }
    expect(container.querySelector('[data-testid="mix-summary"]')).not.toBeNull();
    await act(async () => findButton(
      container,
      "Retry only progressions that were not clean",
    )?.click());

    for (let round = 2; round < 4; round += 1) {
      await act(async () => findButton(container, "Start this progression")?.click());
      await act(async () => starts[round]?.callbacks.onRoundCompleted());
    }
    await act(async () => findButton(container, "Repeat the same selection")?.click());
    expect(findButton(container, "Start this progression")).toBeDefined();
    await act(async () => document.body.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    })));

    expect(updateProgressionBlock).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(ideas).toEqual(before);
    await act(async () => root.unmount());
  });

  it("keeps Style Mix and the explicit End path non-persistent", async () => {
    const ideas = makeMixPersistenceIdeas();
    const before = structuredClone(ideas);
    const save = vi.fn();
    const updateProgressionBlock = vi.fn(() => {
      save();
      return true;
    });
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <PracticeView
        ideas={ideas}
        language="en"
        updateProgressionBlock={updateProgressionBlock}
        openProgression={vi.fn()}
        openSettings={vi.fn()}
        setToast={vi.fn()}
      />,
    ));
    await openTwoItemMix(container, { targetSource: "shell-17" });
    await act(async () => findButton(container, "Start this progression")?.click());
    await act(async () => findButton(container, "End")?.click());

    expect(updateProgressionBlock).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(ideas).toEqual(before);
    await act(async () => root.unmount());
  });

  it.each(["end", "unmount"] as const)(
    "keeps a pending Flow %s outside the update and save boundaries",
    async (operation) => {
      const ideas = makeMixPersistenceIdeas();
      const before = structuredClone(ideas);
      const deferred = createDeferred();
      const save = vi.fn();
      const updateProgressionBlock = vi.fn(() => {
        save();
        return true;
      });
      const clock = {
        start: vi.fn(() => deferred.promise),
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
      };
      vi.spyOn(globalThis, "confirm").mockReturnValue(true);
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(
        <PracticeView
          ideas={ideas}
          language="en"
          updateProgressionBlock={updateProgressionBlock}
          openProgression={vi.fn()}
          openSettings={vi.fn()}
          setToast={vi.fn()}
          practiceClock={clock}
        />,
      ));
      await openTwoItemMix(container, { flow: true });
      await act(async () => findButton(container, "Start this progression")?.click());
      if (operation === "end") {
        await act(async () => findButton(container, "End")?.click());
      } else {
        await act(async () => root.unmount());
      }
      deferred.reject(new Error("late pending failure"));
      await act(async () => Promise.resolve());

      expect(updateProgressionBlock).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(ideas).toEqual(before);
      if (operation === "end") await act(async () => root.unmount());
    },
  );

  it("detects current Vault prop changes, pauses, and reloads without writing", async () => {
    const ideas = makeMixPersistenceIdeas();
    const changedIdeas = structuredClone(ideas);
    const changedProgressions = changedIdeas[0]!.progressionBlocks;
    if (!changedProgressions) throw new Error("Missing progression blocks.");
    const changedBlock = changedProgressions[0]!;
    const changedChord = changedBlock.chords[0]!;
    changedBlock.chords[0] = {
      ...changedChord,
      chord: makeChordSymbol(2, "maj7"),
    };
    const updateProgressionBlock = vi.fn(() => true);
    const clock = {
      start: vi.fn(async (_options: PracticeClockStartOptions) => undefined),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const props = {
      language: "en" as const,
      updateProgressionBlock,
      openProgression: vi.fn(),
      openSettings: vi.fn(),
      setToast: vi.fn(),
      practiceClock: clock,
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<PracticeView ideas={ideas} {...props} />));
    await openTwoItemMix(container, { flow: true });
    await act(async () => findButton(container, "Start this progression")?.click());

    await act(async () => root.render(<PracticeView ideas={changedIdeas} {...props} />));
    expect(container.querySelector('[data-testid="mix-snapshot-drift"]')).not.toBeNull();
    expect(clock.stop).toHaveBeenCalled();
    expect(findButton(container, "Resume")).toBeUndefined();
    await act(async () => findButton(container, "Reload current data")?.click());

    expect(container.querySelector('[data-testid="mix-snapshot-drift"]')).toBeNull();
    expect(findButton(container, "Start this progression")).toBeDefined();
    expect(updateProgressionBlock).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("disables Mix selection while L4 or L5 is selected", async () => {
    const idea = makeIdea({
      id: "00000000-0000-4000-8000-000000000431",
      title: "Transposition only",
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
    await act(async () => findButton(container, "L4 Nearby keys")?.click());
    expect(findButton(container, "Mix selection")?.disabled).toBe(true);

    await act(async () => root.unmount());
  });
});

function findButton(
  container: HTMLElement,
  label: string,
): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.trim() === label);
}

async function playMidiNotes(notes: readonly number[]): Promise<void> {
  let state = createLiveNoteState();
  notes.forEach((note, index) => {
    state = reduceLiveNoteState(state, {
      timestampMs: index + 1,
      status: 0x90,
      channel: 0,
      data1: note,
      data2: 100,
    });
  });
  act(() => defaultLiveMidiStore.setState({ notes: state }));
  await act(async () => new Promise((resolve) => globalThis.setTimeout(resolve, 120)));
}

async function reAttackMidiNotes(notes: readonly number[]): Promise<void> {
  let state = defaultLiveMidiStore.getState().notes;
  notes.forEach((note, index) => {
    state = reduceLiveNoteState(state, {
      timestampMs: 100 + index,
      status: 0x80,
      channel: 0,
      data1: note,
      data2: 0,
    });
  });
  notes.forEach((note, index) => {
    state = reduceLiveNoteState(state, {
      timestampMs: 200 + index,
      status: 0x90,
      channel: 0,
      data1: note,
      data2: 100,
    });
  });
  act(() => defaultLiveMidiStore.setState({ notes: state }));
  await act(async () => new Promise((resolve) => globalThis.setTimeout(resolve, 120)));
}

async function setMidiNotesImmediately(notes: readonly number[]): Promise<void> {
  let state = createLiveNoteState();
  notes.forEach((note, index) => {
    state = reduceLiveNoteState(state, {
      timestampMs: index + 1,
      status: 0x90,
      channel: 0,
      data1: note,
      data2: 100,
    });
  });
  act(() => defaultLiveMidiStore.setState({ notes: state }));
  await act(async () => Promise.resolve());
}

async function reAttackMidiNotesImmediately(notes: readonly number[]): Promise<void> {
  let state = defaultLiveMidiStore.getState().notes;
  notes.forEach((note, index) => {
    state = reduceLiveNoteState(state, {
      timestampMs: 100 + index,
      status: 0x80,
      channel: 0,
      data1: note,
      data2: 0,
    });
  });
  notes.forEach((note, index) => {
    state = reduceLiveNoteState(state, {
      timestampMs: 200 + index,
      status: 0x90,
      channel: 0,
      data1: note,
      data2: 100,
    });
  });
  act(() => defaultLiveMidiStore.setState({ notes: state }));
  await act(async () => Promise.resolve());
}

async function replaceMidiNotes(
  previousNotes: readonly number[],
  nextNotes: readonly number[],
): Promise<void> {
  let state = defaultLiveMidiStore.getState().notes;
  previousNotes.forEach((note, index) => {
    state = reduceLiveNoteState(state, {
      timestampMs: 300 + index,
      status: 0x80,
      channel: 0,
      data1: note,
      data2: 0,
    });
  });
  nextNotes.forEach((note, index) => {
    state = reduceLiveNoteState(state, {
      timestampMs: 400 + index,
      status: 0x90,
      channel: 0,
      data1: note,
      data2: 100,
    });
  });
  act(() => defaultLiveMidiStore.setState({ notes: state }));
  await act(async () => new Promise((resolve) => globalThis.setTimeout(resolve, 120)));
}

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function makeMixPersistenceIdeas() {
  return [0, 1].map((index) => {
    const source: SavedProgressionBlock = {
      ...block,
      id: `00000000-0000-4000-8000-0000000005${index}`,
      summaryText: `Persistence ${index + 1}`,
      chords: [block.chords[0]],
    };
    const withPractice: SavedProgressionBlock = {
      ...source,
      practice: {
        schemaVersion: 1,
        progressionFingerprint: progressionFingerprint(source, "C major"),
        confirmedLevel: 1,
        provisional: {
          level: 2,
          clearedAt: "2026-07-22T00:00:00.000Z",
          clearedOnLocalDate: "2026-07-22",
          targetTempo: 84,
        },
        transposition: {
          schemaVersion: 1,
          clearedKeyPitchClasses: [0, 5, 7],
          updatedAt: "2026-07-23T00:00:00.000Z",
        },
        lastPracticedAt: "2026-07-23T00:00:00.000Z",
      },
    };
    return makeIdea({
      id: `00000000-0000-4000-8000-0000000006${index}`,
      title: `Persistence idea ${index + 1}`,
      key: "C major",
      progressionBlocks: [withPractice],
    });
  });
}

async function openTwoItemMix(
  container: HTMLElement,
  options: { flow?: boolean; targetSource?: string } = {},
): Promise<void> {
  await act(async () => findButton(container, "Mix selection")?.click());
  const checkboxes = [...container.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  )];
  await act(async () => checkboxes[0]?.click());
  await act(async () => checkboxes[1]?.click());
  if (options.flow) {
    await act(async () => findButton(container, "Flow")?.click());
  }
  if (options.targetSource) {
    const targetSelect = [...container.querySelectorAll<HTMLSelectElement>("select")]
      .find((select) => [...select.options].some(
        (option) => option.value === options.targetSource,
      ));
    if (!targetSelect) throw new Error("Mix target source select not found.");
    await act(async () => {
      targetSelect.value = options.targetSource!;
      targetSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  await act(async () => findButton(container, "Start Mix practice")?.click());
}
