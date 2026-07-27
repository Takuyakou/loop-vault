// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { parseChordLabel } from "../domain/chords";
import type { ChordTimelineItem } from "../domain/types";
import { createManualDraft } from "../domain/midi/manualDraft";
import { DraftBoundaryHandles } from "./DraftBoundaryHandles";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

if (!("PointerEvent" in window)) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

const timeline: ChordTimelineItem[] = [
  {
    eventId: "left",
    bar: 1,
    beat: 1,
    durationBeats: 2,
    chord: parseChordLabel("Cmaj7")!,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  },
  {
    eventId: "right",
    bar: 1,
    beat: 3,
    durationBeats: 2,
    chord: parseChordLabel("G7")!,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  },
];

function makeDraft() {
  return {
    ...createManualDraft({
      timeline,
      range: { startBar: 1, startBeat: 1, endBar: 1, endBeat: 4 },
      now: "2026-07-26T00:00:00.000Z",
    }),
    snapMode: "beat" as const,
  };
}

describe("DraftBoundaryHandles", () => {
  it("moves one shared boundary without creating a gap or overlap", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    await act(async () => root.render(
      <DraftBoundaryHandles
        draft={makeDraft()}
        language="en"
        onChange={onChange}
      />,
    ));
    const details = container.querySelector<HTMLDetailsElement>(
      '[data-testid="draft-boundary-handles"]',
    )!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("Details: adjust chord boundaries (1)");
    await act(async () => container.querySelector<HTMLElement>("summary")?.click());
    expect(details.open).toBe(true);
    const slider = container.querySelector<HTMLInputElement>(
      'input[data-boundary-after="left"]',
    )!;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(slider, "3");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => slider.dispatchEvent(
      new window.PointerEvent("pointerup", { bubbles: true }),
    ));

    const changed = onChange.mock.calls[0]?.[0];
    expect(changed.events[0].durationBeats).toBe(3);
    expect(changed.events[1].relativeStartBeat).toBe(3);
    expect(changed.events[1].durationBeats).toBe(1);
    expect(changed.history).toHaveLength(1);

    await act(async () => root.unmount());
  });

  it("keeps a 50-event boundary editor collapsed and internally scrollable", async () => {
    const longTimeline: ChordTimelineItem[] = Array.from({ length: 50 }, (_unused, index) => ({
      eventId: `event-${index + 1}`,
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord: parseChordLabel(index % 2 === 0 ? "Cmaj7" : "G7")!,
      confidence: 0.9,
      alternatives: [],
      warnings: [],
    }));
    const draft = createManualDraft({
      timeline: longTimeline,
      range: { startBar: 1, startBeat: 1, endBar: 50, endBeat: 4 },
      now: "2026-07-26T00:00:00.000Z",
    });
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => root.render(
      <DraftBoundaryHandles draft={draft} language="en" onChange={vi.fn()} />,
    ));

    const details = container.querySelector<HTMLDetailsElement>("details")!;
    const scrollRegion = container.querySelector<HTMLElement>("[data-boundary-scroll-region]")!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("Details: adjust chord boundaries (49)");
    expect(scrollRegion.className).toContain("max-h-72");
    expect(scrollRegion.className).toContain("overflow-y-auto");

    await act(async () => root.unmount());
  });
});
