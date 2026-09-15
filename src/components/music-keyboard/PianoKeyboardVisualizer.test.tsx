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
  it("centers a fitted keyboard only when requested", () => {
    const container = renderKeyboard({ centerWhenFitted: true });
    expect(container.querySelector("[data-keyboard-alignment='center-when-fitted']")?.className)
      .toContain("min-w-full");
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("mx-auto");
  });

  it("renders the wide 61-key layout from C2 through C7 without stretching it", () => {
    const container = renderKeyboard({
      minMidiNote: 24,
      maxMidiNote: 84,
      layout: "wide-61",
    });
    const svg = container.querySelector("svg");

    expect(container.querySelectorAll("[data-midi-note]")).toHaveLength(61);
    expect(container.querySelector('[data-midi-note="24"]')).not.toBeNull();
    expect(container.querySelector('[data-midi-note="84"]')).not.toBeNull();
    expect(container.querySelector('[data-c-label="C2"]')).not.toBeNull();
    expect(container.querySelector('[data-c-label="C7"]')).not.toBeNull();
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  });

  it("renders the full 88-key A0-C8 piano with proportional scaling", () => {
    const container = renderKeyboard({
      minMidiNote: 9,
      maxMidiNote: 96,
      layout: "wide-88",
    });
    expect(container.querySelectorAll("[data-midi-note]")).toHaveLength(88);
    expect(container.querySelector('[data-midi-note="9"]')).not.toBeNull();
    expect(container.querySelector('[data-midi-note="96"]')).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  });

  it("keeps a black-key finger label clear of the separate bass marker", () => {
    const container = renderKeyboard({
      guideNotes: [61],
      leftHandGuideNotes: [61],
      guideBassNote: 61,
      fingerLabels: new Map([[61, "L2"]]),
      heldNotes: [],
      sustainedNotes: [],
    });
    const key = container.querySelector('[data-midi-note="61"]');
    expect(key?.textContent).toContain("L2");
    expect(Array.from(key?.querySelectorAll("text") ?? []).map((node) => node.textContent)).toEqual(["L2"]);
    expect(key?.querySelector("[data-bass-reference='guide']")).not.toBeNull();
    expect(key?.querySelector("title")?.textContent).toContain("BASS reference");
  });

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
    expect(container.querySelector("svg")?.getAttribute("class"))
      .toContain("h-[clamp(6rem,13vw,8rem)]");
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

  it("distinguishes left and right hand guide notes", () => {
    const container = renderKeyboard({
      guideNotes: [60, 64, 67],
      leftHandGuideNotes: [60],
      rightHandGuideNotes: [64, 67],
      heldNotes: [],
      sustainedNotes: [],
    });

    expect(container.querySelector('[data-midi-note="60"]')?.getAttribute("data-guide-hand"))
      .toBe("left");
    expect(container.querySelector('[data-midi-note="64"]')?.getAttribute("data-guide-hand"))
      .toBe("right");
    expect(container.querySelectorAll('[data-midi-note="60"] rect')[1]?.getAttribute("stroke"))
      .toBe("#f59e0b");
    expect(container.querySelectorAll('[data-midi-note="64"] rect')[1]?.getAttribute("stroke"))
      .toBe("#22d3ee");
    expect(container.textContent).toContain("左手の目安");
    expect(container.textContent).toContain("右手の目安");
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
    expect(container.querySelectorAll("button, [tabindex]")).toHaveLength(1);
    expect(container.querySelector('[role="region"]')?.getAttribute("tabindex")).toBe("0");
    expect(container.querySelector('[role="region"]')?.getAttribute("aria-label")).toBe("Piano keyboard");
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).not.toBe("Piano keyboard");
    expect(container.querySelector('[data-outside-direction="left"]')?.textContent)
      .toContain("C3");
    expect(container.querySelector('[data-outside-direction="right"]')?.textContent)
      .toContain("C8");
  });

  it("conceals concrete note names while preserving C labels", () => {
    const container = renderKeyboard({
      language: "en",
      heldNotes: [36, 60, 96],
      showGuide: false,
      concealNoteNames: true,
    });

    expect(container.querySelectorAll("svg title")).toHaveLength(0);
    expect(container.querySelector('[data-outside-direction="left"]')?.textContent)
      .toContain("1 notes");
    expect(container.querySelector('[data-outside-direction="left"]')?.textContent)
      .not.toContain("C3");
    expect(container.querySelector('[data-outside-direction="right"]')?.textContent)
      .not.toContain("C8");
    expect(container.querySelector('[data-c-label="C5"]')).not.toBeNull();
  });

  it("shows finger labels on exact keys and includes note, hand, and finger in the accessible title", () => {
    const container = renderKeyboard({
      heldNotes: [],
      sustainedNotes: [],
      fingerLabels: new Map([[60, "R1"], [64, "R3"], [67, "R5"]]),
    });
    expect(Array.from(container.querySelectorAll("[data-finger-label]")).map((node) => node.textContent))
      .toEqual(["R1", "R3", "R5"]);
    expect(container.querySelector('[data-midi-note="60"] title')?.textContent)
      .toContain("C5 (60), R1");
  });
});
