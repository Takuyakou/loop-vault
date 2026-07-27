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
});
