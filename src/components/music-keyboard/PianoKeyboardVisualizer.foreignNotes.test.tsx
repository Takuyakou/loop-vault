// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PianoKeyboardVisualizer, type PianoKeyboardVisualizerProps } from ".";

/**
 * P23-23a B2/C7: a caller can name pressed keys that must be drawn as foreign (red), key by key.
 * Every caller that names nothing keeps exactly the picture it had: the prop is absent, so no state is forced.
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.();
});

function renderKeyboard(overrides: Partial<PianoKeyboardVisualizerProps> = {}): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <PianoKeyboardVisualizer
      minMidiNote={48}
      maxMidiNote={72}
      guideNotes={[]}
      heldNotes={[60, 64, 67]}
      sustainedNotes={[]}
      allowedPitchClasses={[0, 4, 7]}
      requiredPitchClasses={[]}
      showGuide={false}
      showCLabels
      octaveConvention="fl-studio"
      {...overrides}
    />,
  ));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

const stateOf = (container: HTMLElement, note: number) =>
  container.querySelector(`[data-midi-note="${note}"]`)?.getAttribute("data-visual-state");

describe("foreignNotes: the pressed keys a caller names (P23-23a B2)", () => {
  it("draws exactly the named keys as foreign and leaves the others as they were", () => {
    const container = renderKeyboard({ foreignNotes: [64] });
    expect(stateOf(container, 60)).toBe("held-correct");
    expect(stateOf(container, 64)).toBe("held-foreign");
    expect(stateOf(container, 67)).toBe("held-correct");
  });

  it("keeps the picture of every keyboard that names nothing", () => {
    const container = renderKeyboard();
    expect(stateOf(container, 60)).toBe("held-correct");
    expect(stateOf(container, 64)).toBe("held-correct");
    expect(stateOf(container, 67)).toBe("held-correct");
    // No forced state leaks into the markup: each key is what its own note says.
    expect(container.querySelectorAll("[data-visual-state='held-foreign']")).toHaveLength(0);
  });

  it("draws a named key as foreign even when the caller allows its note name", () => {
    const container = renderKeyboard({ allowedPitchClasses: [0, 4, 7, 11], foreignNotes: [67] });
    expect(stateOf(container, 67)).toBe("held-foreign");
  });

  it("never forces a key that is not pressed", () => {
    const container = renderKeyboard({ foreignNotes: [61] });
    expect(stateOf(container, 61)).toBe("idle");
  });
});
