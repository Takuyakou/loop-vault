// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranspositionSession } from "../../domain/practiceTransposition";
import { TranspositionPracticeControls } from "./TranspositionPracticeControls";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("TranspositionPracticeControls", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders six accessible L4 keys and supports manual selection", async () => {
    const state = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 10,
      eligibility: {
        eligible: false,
        reasons: ["flow-required", "prerequisite-required"],
      },
    });
    const onSelectKey = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <TranspositionPracticeControls
        state={state}
        language="ja"
        manualSelectionDisabled={false}
        targetTempo={100}
        onSelectKey={onSelectKey}
      />,
    ));

    const keys = container.querySelectorAll<HTMLButtonElement>(
      "[data-key-pitch-class]",
    );
    expect(keys).toHaveLength(6);
    expect(container.textContent).toContain("段位対象外");
    expect(container.textContent).toContain("0 / 6");
    expect(container.textContent).toContain("近い6キー");
    expect(container.querySelector(
      '[data-testid="transposition-key-rail"][role="group"]',
    )).not.toBeNull();
    expect(container.querySelector(
      '[data-key-pitch-class][aria-pressed="true"]',
    )).not.toBeNull();
    await act(async () => keys[1]?.click());
    expect(onSelectKey).toHaveBeenCalledWith(
      Number(keys[1]?.dataset.keyPitchClass),
    );
    await act(async () => root.unmount());
  });

  it("renders twelve L5 keys and disables changes while running", async () => {
    const state = createTranspositionSession({
      level: 5,
      sourceKeyPitchClass: 9,
      sourceMode: "minor",
      seed: 10,
      eligibility: { eligible: true, reasons: [] },
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <TranspositionPracticeControls
        state={state}
        language="en"
        manualSelectionDisabled
        targetTempo={100}
        onSelectKey={vi.fn()}
      />,
    ));

    const keys = container.querySelectorAll<HTMLButtonElement>(
      "[data-key-pitch-class]",
    );
    expect(keys).toHaveLength(12);
    expect([...keys].every((button) => button.disabled)).toBe(true);
    expect(container.textContent).toContain("Rank eligible");
    expect(container.textContent).toContain("0 / 12");
    await act(async () => root.unmount());
  });

  it("uses roving focus with left and right arrow keys", async () => {
    const state = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 10,
      eligibility: { eligible: true, reasons: [] },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(
      <TranspositionPracticeControls
        state={state}
        language="en"
        manualSelectionDisabled={false}
        targetTempo={100}
        onSelectKey={vi.fn()}
      />,
    ));
    const keys = [
      ...container.querySelectorAll<HTMLButtonElement>("[data-key-pitch-class]"),
    ];
    const currentIndex = keys.findIndex((button) => button.tabIndex === 0);
    keys[currentIndex]?.focus();
    const windowKeydown = vi.fn();
    window.addEventListener("keydown", windowKeydown);
    await act(async () => keys[currentIndex]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ));
    expect(document.activeElement).toBe(keys[(currentIndex + 1) % keys.length]);
    expect(windowKeydown).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowKeydown);

    await act(async () => root.unmount());
  });

  it("shows completed progress counts for L4 and L5", async () => {
    const l4 = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 4,
      eligibility: { eligible: true, reasons: [] },
    });
    l4.sessionClearedPitchClasses = l4.keyPool.slice(0, 4);
    const l5 = createTranspositionSession({
      level: 5,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 5,
      eligibility: { eligible: true, reasons: [] },
    });
    l5.sessionClearedPitchClasses = l5.keyPool.slice(0, 9);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <TranspositionPracticeControls
        state={l4}
        language="ja"
        manualSelectionDisabled={false}
        targetTempo={100}
        onSelectKey={vi.fn()}
      />,
    ));
    expect(container.textContent).toContain("4 / 6");

    await act(async () => root.render(
      <TranspositionPracticeControls
        state={l5}
        language="en"
        manualSelectionDisabled={false}
        targetTempo={100}
        onSelectKey={vi.fn()}
      />,
    ));
    expect(container.textContent).toContain("9 / 12");
    await act(async () => root.unmount());
  });
});
