// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { appCopy } from "../i18n";
import { labelFromSymbol, makeChordSymbol } from "../domain/chords";
import type { ChordTimelineItem } from "../domain/types";
import type { ManualCandidateDraft } from "../domain/midi/manualDraft";
import { TimelineRangeSelector } from "./TimelineRangeSelector";

/**
 * The selection UI.
 *
 * Both routes are exercised — dragging and typing — because the typed route is
 * the only usable one on a long song where the two ends of the range are nowhere
 * near each other on screen, and the only one that works without a pointer at all.
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function chord(root: number) {
  const symbol = makeChordSymbol(root, "maj7", []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

const TOTAL_BARS = 108;
const fullTimeline: ChordTimelineItem[] = Array.from(
  { length: TOTAL_BARS },
  (_unused, index) => ({
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord: chord((index * 5) % 12),
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  }),
);

interface Harness {
  container: HTMLElement;
  root: Root;
  onCreate: ReturnType<typeof vi.fn>;
}

async function mount(options: {
  timeline?: ChordTimelineItem[];
  totalBars?: number;
} = {}): Promise<Harness> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onCreate = vi.fn();
  await act(async () => root.render(
    <TimelineRangeSelector
      timeline={options.timeline ?? fullTimeline}
      totalBars={options.totalBars ?? TOTAL_BARS}
      beatsPerBar={4}
      copy={appCopy.ja}
      onCreate={onCreate}
      now="2026-07-26T00:00:00.000Z"
    />,
  ));
  return { container, root, onCreate };
}

const barButton = (harness: Harness, bar: number) => harness.container
  .querySelector<HTMLButtonElement>(`button[data-bar="${bar}"]`)!;
const input = (harness: Harness, name: string) => harness.container
  .querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
const panel = (harness: Harness) => harness.container
  .querySelector<HTMLElement>('[data-testid="timeline-range-selector"]')!;
const buttonLabelled = (harness: Harness, label: string) => [
  ...harness.container.querySelectorAll<HTMLButtonElement>("button"),
].find((element) => element.textContent?.trim() === label)!;

async function type(harness: Harness, name: string, value: string) {
  const field = input(harness, name);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value",
    )?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function fire(element: Element, type_: string, init: object = {}) {
  await act(async () => {
    element.dispatchEvent(new (window as unknown as {
      PointerEvent: typeof MouseEvent;
    }).PointerEvent(type_, { bubbles: true, ...init }));
  });
}

async function key(element: Element, init: KeyboardEventInit) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
  });
}

// jsdom has no PointerEvent; the component only reads the standard mouse fields.
if (!("PointerEvent" in window)) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

describe("selecting a range with a pointer", () => {
  it("selects the bars dragged across", async () => {
    const harness = await mount();
    await fire(barButton(harness, 14), "pointerdown");
    await fire(barButton(harness, 32), // React synthesises pointerEnter from pointerover, so that is what a drag
    // across the strip actually dispatches.
    "pointerover");
    await fire(barButton(harness, 32), "pointerup");

    expect(barButton(harness, 14).dataset.selected).toBe("true");
    expect(barButton(harness, 32).dataset.selected).toBe("true");
    expect(barButton(harness, 33).dataset.selected).toBe("false");
    expect(harness.container.textContent).toContain("長さ: 19小節");
  });

  it("does not extend when the pointer is not down", async () => {
    const harness = await mount();
    await fire(barButton(harness, 40), // React synthesises pointerEnter from pointerover, so that is what a drag
    // across the strip actually dispatches.
    "pointerover");

    expect(harness.container.textContent).toContain("まだ範囲を選んでいません");
  });

  it("marks the selection with more than colour", async () => {
    const harness = await mount();
    await fire(barButton(harness, 3), "pointerdown");
    await fire(barButton(harness, 6), // React synthesises pointerEnter from pointerover, so that is what a drag
    // across the strip actually dispatches.
    "pointerover");
    await fire(barButton(harness, 6), "pointerup");

    // aria-pressed and an underline, so the state survives both a screen reader
    // and a reader who does not see the hue.
    expect(barButton(harness, 4).getAttribute("aria-pressed")).toBe("true");
    expect(barButton(harness, 4).className).toContain("underline");
  });
});

describe("selecting a range by typing", () => {
  it("builds the 19-bar range M0 could not reach", async () => {
    const harness = await mount();
    await type(harness, "startBar", "14");
    await type(harness, "endBar", "32");
    await type(harness, "endBeat", "4");

    expect(harness.container.textContent).toContain("長さ: 19小節");
    expect(harness.container.textContent).toContain("コードイベント: 19件");

    await act(async () => buttonLabelled(harness, "この範囲を候補にする").click());

    const draft = harness.onCreate.mock.calls[0][0] as ManualCandidateDraft;
    expect(draft.selectedRange).toEqual({ startBar: 14, startBeat: 1, endBar: 32, endBeat: 4 });
    expect(draft.lengthBars).toBe(19);
    expect(draft.events).toHaveLength(19);
    expect(draft.source).toEqual({ type: "manual-range" });
  });

  it("builds the 22-bar range too", async () => {
    const harness = await mount();
    await type(harness, "startBar", "87");
    await type(harness, "endBar", "108");
    await type(harness, "endBeat", "4");
    await act(async () => buttonLabelled(harness, "この範囲を候補にする").click());

    expect((harness.onCreate.mock.calls[0][0] as ManualCandidateDraft).lengthBars).toBe(22);
  });

  it.each([1, 11, 13, 17, 21, 23, 27])("builds a %i-bar range", async (length) => {
    const harness = await mount();
    await type(harness, "startBar", "5");
    await type(harness, "endBar", String(4 + length));
    await type(harness, "endBeat", "4");
    await act(async () => buttonLabelled(harness, "この範囲を候補にする").click());

    expect((harness.onCreate.mock.calls[0][0] as ManualCandidateDraft).lengthBars).toBe(length);
  });

  it("holds a bar number inside the song", async () => {
    const harness = await mount();
    await type(harness, "endBar", "9999");

    expect(Number(input(harness, "endBar").value)).toBe(TOTAL_BARS);
  });
});

describe("keyboard", () => {
  it("moves the end by a beat with Shift and by a bar with Alt", async () => {
    const harness = await mount();
    await type(harness, "startBar", "14");
    await type(harness, "endBar", "32");

    // The typed range covers whole bars, so its end sits on the last beat of 32.
    // One beat further is the first beat of 33.
    await key(panel(harness), { key: "ArrowRight", shiftKey: true });
    expect(Number(input(harness, "endBar").value)).toBe(33);
    expect(Number(input(harness, "endBeat").value)).toBe(1);

    await key(panel(harness), { key: "ArrowRight", altKey: true });
    expect(Number(input(harness, "endBar").value)).toBe(34);
    expect(Number(input(harness, "endBeat").value)).toBe(1);
  });

  it("clears the selection on Escape", async () => {
    const harness = await mount();
    await type(harness, "startBar", "14");
    await key(panel(harness), { key: "Escape" });

    expect(harness.container.textContent).toContain("まだ範囲を選んでいません");
  });

  it("creates the draft on Enter", async () => {
    const harness = await mount();
    await type(harness, "startBar", "5");
    await type(harness, "endBar", "17");
    await key(panel(harness), { key: "Enter" });

    expect((harness.onCreate.mock.calls[0][0] as ManualCandidateDraft).lengthBars).toBe(13);
  });

  it("reaches the far end of a long song without a pointer", async () => {
    const harness = await mount();
    await type(harness, "startBar", "100");
    await type(harness, "endBar", "108");

    expect(harness.container.textContent).toContain("長さ: 9小節");
  });
});

describe("clearing and refusing", () => {
  it("clears with the button", async () => {
    const harness = await mount();
    await type(harness, "startBar", "14");
    await act(async () => buttonLabelled(harness, "選択解除").click());

    expect(harness.container.textContent).toContain("まだ範囲を選んでいません");
  });

  it("refuses a range with no chords in it", async () => {
    const harness = await mount({ timeline: fullTimeline.slice(0, 4), totalBars: 40 });
    await type(harness, "startBar", "20");
    await type(harness, "endBar", "30");

    expect(harness.container.textContent).toContain("この範囲にはコードがありません");
    expect(buttonLabelled(harness, "この範囲を候補にする").disabled).toBe(true);
    expect(harness.onCreate).not.toHaveBeenCalled();
  });

  it("announces the selection politely", async () => {
    const harness = await mount();
    await type(harness, "startBar", "14");
    await type(harness, "endBar", "32");

    const live = harness.container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("14小節1拍目");
    expect(live?.textContent).toContain("32小節");
  });

  it("says when the range opens mid-chord", async () => {
    const sustained: ChordTimelineItem[] = [
      { bar: 1, beat: 1, durationBeats: 16, chord: chord(0), confidence: 0.9, alternatives: [], warnings: [] },
      { bar: 5, beat: 1, durationBeats: 4, chord: chord(7), confidence: 0.9, alternatives: [], warnings: [] },
    ];
    const harness = await mount({ timeline: sustained, totalBars: 6 });
    await type(harness, "startBar", "3");
    await type(harness, "endBar", "5");

    expect(harness.container.textContent).toContain("最初のコードは範囲より前から鳴っています");
  });
});
