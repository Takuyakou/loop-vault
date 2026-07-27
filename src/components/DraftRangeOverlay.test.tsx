// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { parseChordLabel } from "../domain/chords";
import type { ChordTimelineItem } from "../domain/types";
import { createManualDraft } from "../domain/midi/manualDraft";
import { DraftRangeOverlay } from "./DraftRangeOverlay";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const timeline: ChordTimelineItem[] = Array.from({ length: 12 }, (_unused, index) => ({
  eventId: `event-${index + 1}`,
  bar: index + 1,
  beat: 1,
  durationBeats: 4,
  chord: parseChordLabel(index % 2 === 0 ? "Cmaj7" : "G7")!,
  confidence: 0.9,
  alternatives: [],
  warnings: [],
}));

function makeDraft() {
  return createManualDraft({
    timeline,
    range: { startBar: 2, startBeat: 1, endBar: 5, endBeat: 4 },
    now: "2026-07-26T00:00:00.000Z",
  });
}

async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  const onPreview = vi.fn();
  async function render(draft = makeDraft()) {
    await act(async () => root.render(
      <DraftRangeOverlay
        draft={draft}
        timeline={timeline}
        totalBars={12}
        language="en"
        onChange={onChange}
        onPreview={onPreview}
      />,
    ));
  }
  await render();
  return { container, root, onChange, onPreview, render };
}

function pointerEvent(
  type: string,
  clientX: number,
  options: { pointerId?: number; altKey?: boolean } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX,
    altKey: options.altKey ?? false,
  });
  Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
  return event;
}

async function mountPrimary(
  draft = makeDraft(),
  primaryTimeline: readonly ChordTimelineItem[] = timeline,
  totalBars = 12,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  const onCreateRange = vi.fn();
  const onPreview = vi.fn();
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  const onEnter = vi.fn();
  await act(async () => root.render(
    <DraftRangeOverlay
      variant="primary"
      draft={draft}
      timeline={primaryTimeline}
      totalBars={totalBars}
      beatsPerBar={4}
      language="en"
      trackHeightRem={6}
      sourceCandidateIndex={6}
      onChange={onChange}
      onCreateRange={onCreateRange}
      onPreview={onPreview}
      onUndo={onUndo}
      onRedo={onRedo}
      onEnter={onEnter}
    />,
  ));
  const track = container.querySelector<HTMLElement>("[data-song-minimap-track]")!;
  track.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 480,
    bottom: 80,
    width: 480,
    height: 80,
    toJSON: () => ({}),
  });
  return {
    container,
    root,
    track,
    onChange,
    onCreateRange,
    onPreview,
    onUndo,
    onRedo,
    onEnter,
  };
}

describe("DraftRangeOverlay", () => {
  it("shows both handles, the current range, and all snap modes", async () => {
    const harness = await mount();

    expect(harness.container.querySelectorAll('input[type="range"]')).toHaveLength(2);
    expect(harness.container.textContent).toContain("2.1 – 5.4");
    expect(harness.container.textContent).toContain("Bar");
    expect(harness.container.textContent).toContain("Harmonic");
    expect(harness.container.textContent).toContain("Beat");

    await act(async () => harness.root.unmount());
  });

  it("records snap changes and supports G, arrow, and Space keyboard actions", async () => {
    const harness = await mount();
    const overlay = harness.container.querySelector<HTMLElement>(
      '[data-testid="draft-range-overlay"]',
    )!;
    const harmonic = [...harness.container.querySelectorAll("button")]
      .find((button) => button.textContent === "Harmonic")!;

    await act(async () => harmonic.click());
    const harmonicDraft = harness.onChange.mock.calls[0]?.[0];
    expect(harmonicDraft.snapMode).toBe("harmonic");
    expect(harmonicDraft.history).toHaveLength(1);
    await harness.render(harmonicDraft);

    await act(async () => overlay.dispatchEvent(
      new KeyboardEvent("keydown", { key: "g", bubbles: true }),
    ));
    const beatDraft = harness.onChange.mock.calls[1]?.[0];
    expect(beatDraft.snapMode).toBe("beat");
    await harness.render(beatDraft);

    await act(async () => overlay.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ));
    expect(harness.onChange.mock.calls[2]?.[0].selectedRange).toMatchObject({
      startBar: 2,
      startBeat: 2,
    });

    await act(async () => overlay.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    ));
    expect(harness.onPreview).toHaveBeenCalledOnce();

    await act(async () => harness.root.unmount());
  });

  it("shows the primary selection, both handles, and persistent range details", async () => {
    const harness = await mountPrimary();

    expect(harness.container.querySelector("[data-current-selection]")).not.toBeNull();
    expect(harness.container.querySelector("[data-selection-handle='start']")).not.toBeNull();
    expect(harness.container.querySelector("[data-selection-handle='end']")).not.toBeNull();
    expect(harness.container.textContent).toContain("Selection: 2.1–5.4");
    expect(harness.container.textContent).toContain("Created from a manual range");

    await act(async () => harness.root.unmount());
  });

  it("creates a manual selection by dragging an empty part of the whole-song track", async () => {
    const harness = await mountPrimary();

    await act(async () => {
      harness.track.dispatchEvent(pointerEvent("pointerdown", 240));
      harness.track.dispatchEvent(pointerEvent("pointermove", 400));
      harness.track.dispatchEvent(pointerEvent("pointerup", 400));
    });

    expect(harness.onCreateRange).toHaveBeenCalledWith({
      startBar: 7,
      startBeat: 1,
      endBar: 10,
      endBeat: 4,
    });
    await act(async () => harness.root.unmount());
  });

  it("moves the whole selection without changing its length", async () => {
    const harness = await mountPrimary();
    const selection = harness.container.querySelector<HTMLElement>("[data-current-selection]")!;

    await act(async () => {
      selection.dispatchEvent(pointerEvent("pointerdown", 80));
      harness.track.dispatchEvent(pointerEvent("pointermove", 160));
      harness.track.dispatchEvent(pointerEvent("pointerup", 160));
    });

    const changed = harness.onChange.mock.calls[0]?.[0];
    expect(changed.lengthBars).toBe(makeDraft().lengthBars);
    expect(changed.selectedRange).toMatchObject({
      startBar: 4,
      startBeat: 1,
      endBar: 7,
      endBeat: 4,
    });
    await act(async () => harness.root.unmount());
  });

  it("extends an eight-bar selection to twelve bars with the end handle", async () => {
    const longTimeline: ChordTimelineItem[] = Array.from(
      { length: 24 },
      (_unused, index) => ({
        eventId: `long-${index + 1}`,
        bar: index + 1,
        beat: 1,
        durationBeats: 4,
        chord: parseChordLabel(index % 2 === 0 ? "Cmaj7" : "G7")!,
        confidence: 0.9,
        alternatives: [],
        warnings: [],
      }),
    );
    const draft = createManualDraft({
      timeline: longTimeline,
      range: { startBar: 1, startBeat: 1, endBar: 8, endBeat: 4 },
      now: "2026-07-26T00:00:00.000Z",
    });
    const harness = await mountPrimary(draft, longTimeline, 24);
    const endHandle = harness.container.querySelector<HTMLElement>(
      "[data-selection-handle='end']",
    )!;

    await act(async () => {
      endHandle.dispatchEvent(pointerEvent("pointerdown", 160));
      harness.track.dispatchEvent(pointerEvent("pointermove", 240));
    });
    expect(harness.container.textContent).toContain("Selection: 1.1–12.4");
    expect(harness.container.textContent).toContain("Length: 12 bars");
    expect(harness.container.textContent).toContain("Chords: 12 events");

    await act(async () => {
      harness.track.dispatchEvent(pointerEvent("pointerup", 240));
    });

    const changed = harness.onChange.mock.calls[0]?.[0];
    expect(changed.lengthBars).toBe(12);
    expect(changed.selectedRange).toMatchObject({
      startBar: 1,
      endBar: 12,
      endBeat: 4,
    });
    await act(async () => harness.root.unmount());
  });

  it("supports keyboard move, resize, snap, preview, history, and editor actions", async () => {
    const harness = await mountPrimary();
    const selection = harness.container.querySelector<HTMLElement>("[data-current-selection]")!;

    await act(async () => selection.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ));
    expect(harness.onChange.mock.calls[0]?.[0].selectedRange.startBar).toBe(2);
    expect(harness.onChange.mock.calls[0]?.[0].selectedRange.startBeat).toBe(2);

    await act(async () => selection.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    ));
    await act(async () => selection.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ));
    await act(async () => selection.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
    ));
    await act(async () => selection.dispatchEvent(
      new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true }),
    ));

    expect(harness.onPreview).toHaveBeenCalledOnce();
    expect(harness.onEnter).toHaveBeenCalledOnce();
    expect(harness.onUndo).toHaveBeenCalledOnce();
    expect(harness.onRedo).toHaveBeenCalledOnce();
    await act(async () => harness.root.unmount());
  });
});
