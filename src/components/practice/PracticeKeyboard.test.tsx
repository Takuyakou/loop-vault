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

function renderKeyboard(level: PracticeSessionLevel = 1): HTMLElement {
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
      language="ja"
      matchState="partial"
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
});
