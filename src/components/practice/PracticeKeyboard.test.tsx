// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLiveNoteState,
  reduceLiveNoteState,
} from "../../domain/liveMidi";
import type { PracticeSessionLevel } from "../../domain/practice";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { PracticeKeyboard } from "./PracticeKeyboard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  defaultLiveMidiStore.setState({ notes: createLiveNoteState() });
});

function renderKeyboard(
  level: PracticeSessionLevel = 1,
  interactionMode: "practice" | "neutral-monitor" = "practice",
): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <PracticeKeyboard
      range={{ minMidiNote: 48, maxMidiNote: 84 }}
      guideNotes={[60, 64, 67]}
      allowedPitchClasses={[0, 4, 7]}
      requiredPitchClasses={[0, 4, 7]}
      level={level}
      matchState="partial"
      interactionMode={interactionMode}
    />,
  ));
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

describe("PracticeKeyboard", () => {
  it("updates held keys directly from the shared Live MIDI note state", () => {
    const container = renderKeyboard();
    const noteOn = reduceLiveNoteState(createLiveNoteState(), {
      timestampMs: 1,
      status: 0x90,
      channel: 0,
      data1: 60,
      data2: 100,
    });

    act(() => defaultLiveMidiStore.setState({ notes: noteOn }));

    expect(container.querySelector('[data-midi-note="60"]')?.getAttribute("data-visual-state"))
      .toBe("guide-and-held");
    expect(container.textContent).toContain("入力: C5");
  });

  it("shows sustained notes without treating them as held", () => {
    let notes = reduceLiveNoteState(createLiveNoteState(), {
      timestampMs: 1,
      status: 0x90,
      channel: 0,
      data1: 64,
      data2: 100,
    });
    notes = reduceLiveNoteState(notes, {
      timestampMs: 2,
      status: 0xb0,
      channel: 0,
      data1: 64,
      data2: 127,
    });
    notes = reduceLiveNoteState(notes, {
      timestampMs: 3,
      status: 0x80,
      channel: 0,
      data1: 64,
      data2: 0,
    });
    const container = renderKeyboard();

    act(() => defaultLiveMidiStore.setState({ notes }));

    expect(container.querySelector('[data-midi-note="64"]')?.getAttribute("data-visual-state"))
      .toBe("guide-and-sustained");
    expect(container.textContent).toContain("入力: -");
  });

  it("does not leak guide or missing note names at Level 2 and Level 3", () => {
    const container = renderKeyboard(2);
    const notes = reduceLiveNoteState(createLiveNoteState(), {
      timestampMs: 1,
      status: 0x90,
      channel: 0,
      data1: 60,
      data2: 100,
    });

    act(() => defaultLiveMidiStore.setState({ notes }));

    expect(container.querySelector('[data-midi-note="64"]')?.getAttribute("data-visual-state"))
      .toBe("idle");
    const summary = container.querySelector('[aria-live="polite"]')?.textContent;
    expect(summary).toContain("入力: 1音");
    expect(summary).toContain("あと: 2音");
    expect(summary).not.toContain("E5");
    expect(summary).not.toContain("G5");
  });

  it("hides the missing-note count at Level 4 and Level 5", () => {
    const container = renderKeyboard(4);
    const notes = reduceLiveNoteState(createLiveNoteState(), {
      timestampMs: 1,
      status: 0x90,
      channel: 0,
      data1: 60,
      data2: 100,
    });

    act(() => defaultLiveMidiStore.setState({ notes }));

    const summary = container.querySelector('[aria-live="polite"]')?.textContent;
    expect(summary).toContain("入力: 1音");
    expect(summary).not.toContain("あと");
    expect(summary).not.toContain("2音");
  });

  it("uses factual input-only copy and ARIA in neutral monitor mode", () => {
    const container = renderKeyboard(1, "neutral-monitor");
    const notes = reduceLiveNoteState(createLiveNoteState(), {
      timestampMs: 1,
      status: 0x90,
      channel: 0,
      data1: 61,
      data2: 100,
    });
    act(() => defaultLiveMidiStore.setState({ notes }));

    expect(container.querySelector('[data-midi-note="61"]')?.getAttribute("data-visual-state"))
      .toBe("held-correct");
    expect(container.textContent).toContain("入力: Db5");
    expect(container.textContent).not.toMatch(/構成外|あと|一致/);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).not.toContain("構成外");
  });
});

describe("P25-10 I4: the play-along marks", () => {
  function renderMarks(marks?: ReadonlyMap<number, "ok" | "wrong">, appearance: "default" | "dojo" = "default"): HTMLElement {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(
      <PracticeKeyboard range={{ minMidiNote: 48, maxMidiNote: 84 }} guideNotes={[60, 64, 67]} leftHandGuideNotes={[60]}
        rightHandGuideNotes={[64, 67]} allowedPitchClasses={[0, 4, 7]} requiredPitchClasses={[0, 4, 7]} level={1}
        matchState="partial" interactionMode="neutral-monitor" appearance={appearance}
        {...(marks === undefined ? {} : { playAlongMarks: marks })} />,
    ));
    cleanups.push(() => { act(() => root.unmount()); container.remove(); });
    return container;
  }

  it("draws a right key green with ● over its guide colour, and a wrong key red with ×", () => {
    const container = renderMarks(new Map([[60, "ok"], [61, "wrong"]]));
    const right = container.querySelector('[data-midi-note="60"] [data-play-along="ok"]')!;
    expect(right.querySelector("rect")?.getAttribute("fill")).toBe("#36c990");
    expect(right.querySelector("text")?.textContent).toBe("●");
    expect(right.querySelector("text")?.getAttribute("font-size")).toBe("13");
    expect(right.querySelector("text")?.getAttribute("fill")).toBe("#05271a");
    const wrong = container.querySelector('[data-midi-note="61"] [data-play-along="wrong"]')!;
    expect(wrong.querySelector("rect")?.getAttribute("fill")).toBe("#ee6b73");
    expect(wrong.querySelector("text")?.textContent).toBe("×");
    expect(wrong.querySelector("text")?.getAttribute("font-size")).toBe("11");
    expect(wrong.querySelector("text")?.getAttribute("fill")).toBe("#2a0508");
    // The guide (the hands' colours) and the finger marks stay as they are.
    expect(container.querySelector('[data-midi-note="64"]')?.getAttribute("data-guide-hand")).toBe("right");
  });

  it("draws nothing new without marks, and nothing on the Chord Dojo appearance", () => {
    expect(renderMarks().querySelector("[data-play-along]")).toBeNull();
    expect(renderMarks(new Map([[60, "ok"]]), "dojo").querySelector("[data-play-along]")).toBeNull();
  });
});
