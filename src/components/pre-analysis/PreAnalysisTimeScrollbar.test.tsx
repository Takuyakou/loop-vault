// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { PreAnalysisTimeScrollbar } from "./PreAnalysisTimeScrollbar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("PreAnalysisTimeScrollbar", () => {
  it("moves the white timeline cursor and centers the visible range", async () => {
    const { container, unmount } = await renderScrollbar();
    const track = container.querySelector<HTMLDivElement>(
      "[data-testid='pre-analysis-time-scrollbar']",
    )!;
    const cursor = container.querySelector<HTMLElement>(
      "[data-testid='pre-analysis-time-cursor']",
    )!;
    const visibleRange = container.querySelector<HTMLElement>(
      "[data-testid='pre-analysis-visible-range']",
    )!;
    track.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 24,
      left: 0,
      width: 400,
      height: 24,
      toJSON: () => ({}),
    });

    await act(async () => {
      track.dispatchEvent(pointerEvent("pointerdown", 200));
      track.dispatchEvent(pointerEvent("pointermove", 300));
      track.dispatchEvent(pointerEvent("pointerup", 300));
    });

    expect(Number(track.getAttribute("aria-valuenow"))).toBeCloseTo(48, 1);
    expect(cursor.style.left).toBe("75%");
    expect(visibleRange.style.left).toBe("62.5%");

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
      bottom: 24,
      left: 0,
      width: 400,
      height: 24,
      toJSON: () => ({}),
    });

    await act(async () => {
      track.dispatchEvent(pointerEvent("pointerdown", 300));
      track.dispatchEvent(pointerEvent("pointerup", 300));
    });
    expect(Number(track.getAttribute("aria-valuenow"))).toBeCloseTo(48, 1);

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
    expect(track.getAttribute("aria-valuenow")).toBe("64");
    expect(track.getAttribute("aria-valuetext")).toContain("16小節目");

    await unmount();
  });
});

async function renderScrollbar() {
  const container = document.createElement("div");
  const root = createRoot(container);

  function Harness() {
    const [positionBeat, setPositionBeat] = useState(0);
    const visibleBeats = 16;
    const totalBeats = 64;
    const viewportStartBeat = Math.min(
      totalBeats - visibleBeats,
      Math.max(0, positionBeat - visibleBeats / 2),
    );
    return (
      <PreAnalysisTimeScrollbar
        language="ja"
        totalBeats={totalBeats}
        visibleBeats={visibleBeats}
        viewportStartBeat={viewportStartBeat}
        positionBeat={positionBeat}
        beatsPerBar={4}
        onPositionBeatChange={setPositionBeat}
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
