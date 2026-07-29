// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { PreAnalysisTimeScrollbar } from "./PreAnalysisTimeScrollbar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("PreAnalysisTimeScrollbar", () => {
  it("moves the visible window by dragging its FL-style thumb", async () => {
    const { container, unmount } = await renderScrollbar();
    const track = container.querySelector<HTMLDivElement>(
      "[data-testid='pre-analysis-time-scrollbar']",
    )!;
    const thumb = container.querySelector<HTMLElement>(
      "[data-testid='pre-analysis-time-scroll-thumb']",
    )!;
    track.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 16,
      left: 0,
      width: 400,
      height: 16,
      toJSON: () => ({}),
    });

    await act(async () => {
      thumb.dispatchEvent(pointerEvent("pointerdown", 20));
      track.dispatchEvent(pointerEvent("pointermove", 220));
      track.dispatchEvent(pointerEvent("pointerup", 220));
    });

    expect(Number(track.getAttribute("aria-valuenow"))).toBeCloseTo(32, 1);
    expect(thumb.style.left).toBe("50%");

    await unmount();
  });

  it("supports track clicks and keyboard navigation", async () => {
    const { container, unmount } = await renderScrollbar();
    const track = container.querySelector<HTMLDivElement>(
      "[data-testid='pre-analysis-time-scrollbar']",
    )!;
    track.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 16,
      left: 0,
      width: 400,
      height: 16,
      toJSON: () => ({}),
    });

    await act(async () => {
      track.dispatchEvent(pointerEvent("pointerdown", 300));
      track.dispatchEvent(pointerEvent("pointerup", 300));
    });
    expect(Number(track.getAttribute("aria-valuenow"))).toBeCloseTo(40, 1);

    await act(async () => {
      track.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Home",
        bubbles: true,
      }));
    });
    expect(track.getAttribute("aria-valuenow")).toBe("0");

    await act(async () => {
      track.dispatchEvent(new KeyboardEvent("keydown", {
        key: "End",
        bubbles: true,
      }));
    });
    expect(track.getAttribute("aria-valuenow")).toBe("48");
    expect(track.getAttribute("aria-valuetext")).toContain("小節");

    await unmount();
  });
});

async function renderScrollbar() {
  const container = document.createElement("div");
  const root = createRoot(container);

  function Harness() {
    const [startBeat, setStartBeat] = useState(0);
    return (
      <PreAnalysisTimeScrollbar
        language="ja"
        totalBeats={64}
        visibleBeats={16}
        startBeat={startBeat}
        beatsPerBar={4}
        onStartBeatChange={setStartBeat}
      />
    );
  }

  await act(async () => root.render(<Harness />));
  return {
    container,
    unmount: async () => act(async () => root.unmount()),
  };
}

function pointerEvent(type: string, clientX: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    pointerId: { value: 1 },
  });
  return event;
}
