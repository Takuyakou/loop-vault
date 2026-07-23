// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PianoKeyboardVisualizer, type PianoKeyboardVisualizerProps } from ".";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.();
});

function renderKeyboard(
  overrides: Partial<PianoKeyboardVisualizerProps> = {},
): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <PianoKeyboardVisualizer
      minMidiNote={48}
      maxMidiNote={84}
      guideNotes={[60, 64, 67]}
      heldNotes={[60, 61]}
      sustainedNotes={[64]}
      allowedPitchClasses={[0, 4, 7]}
      requiredPitchClasses={[0, 4]}
      guideBassNote={60}
      heldBassNote={60}
      showGuide
      showCLabels
      octaveConvention="fl-studio"
      matchState="partial"
      language="ja"
      {...overrides}
    />,
  ));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

describe("PianoKeyboardVisualizer", () => {
  it("renders white keys below shorter black keys with C-only labels", () => {
    const container = renderKeyboard();
    const white = container.querySelector('[data-midi-note="60"]');
    const black = container.querySelector('[data-midi-note="61"]');

    expect(white?.getAttribute("data-key-kind")).toBe("white");
    expect(black?.getAttribute("data-key-kind")).toBe("black");
    expect(container.querySelectorAll("[data-c-label]").length).toBe(4);
    expect(container.querySelector('[data-c-label="C5"]')).not.toBeNull();
    expect(container.querySelector('[data-c-label="C#5"]')).toBeNull();
    expect(container.querySelector('[data-key-layer="black"]')).not.toBeNull();
  });

  it("uses foreign precedence and distinguishes guide overlap and sustain", () => {
    const container = renderKeyboard();

    expect(container.querySelector('[data-midi-note="60"]')?.getAttribute("data-visual-state"))
      .toBe("guide-and-held");
    expect(container.querySelector('[data-midi-note="61"]')?.getAttribute("data-visual-state"))
      .toBe("held-foreign");
    expect(container.querySelector('[data-midi-note="64"]')?.getAttribute("data-visual-state"))
      .toBe("guide-and-sustained");
  });

  it("hides guide state and legend for L2 and L3 while keeping live input visible", () => {
    const container = renderKeyboard({ showGuide: false, heldNotes: [64] });

    expect(container.querySelector('[data-midi-note="60"]')?.getAttribute("data-visual-state"))
      .toBe("idle");
    expect(container.querySelector('[data-midi-note="64"]')?.getAttribute("data-visual-state"))
      .toBe("held-correct");
    expect(container.textContent).not.toContain("お手本");
    expect(container.textContent).toContain("押鍵中");
  });

  it("shows localized legend, outside input, and one non-focusable image", () => {
    const container = renderKeyboard({
      language: "en",
      heldNotes: [36, 60, 96],
    });

    expect(container.textContent).toContain("Guide");
    expect(container.textContent).toContain("Input outside visible range");
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(1);
    expect(container.querySelectorAll("button, [tabindex]").length).toBe(0);
    expect(container.querySelector('[data-outside-direction="left"]')?.textContent)
      .toContain("C3");
    expect(container.querySelector('[data-outside-direction="right"]')?.textContent)
      .toContain("C8");
  });
});
