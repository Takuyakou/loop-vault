// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditableChordSlot } from "../../domain/progressionEditing";
import { QuickChordEditor } from "./QuickChordEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const slot: EditableChordSlot = {
  id: "slot-1",
  position: { bar: 1, beat: 1, durationBeats: 4 },
  originalChord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
  currentChord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
  alternatives: [
    { chord: { root: 7, quality: "dom7", tensions: [], label: "G7" }, confidence: 0.8 },
    { chord: { root: 2, quality: "min9", tensions: [], label: "Dm9" }, confidence: 0.7 },
  ],
  warnings: [],
  edited: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("QuickChordEditor", () => {
  it("previews a numbered candidate without applying until Enter", async () => {
    const onPreview = vi.fn();
    const onApply = vi.fn();
    const anchor = document.createElement("button");
    document.body.append(anchor);
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(rect(40, 40, 140, 80));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <QuickChordEditor
          slot={slot}
          anchorElement={anchor}
          language="en"
          onPreview={onPreview}
          onApply={onApply}
          onReset={vi.fn()}
          onOpenInspector={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });
    const panel = document.querySelector<HTMLElement>("[data-quick-chord-editor]")!;

    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true }));
    });
    expect(onApply).not.toHaveBeenCalled();
    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });
    expect(onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ label: "Dm9" }));
    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Dm9" }),
      "alternative",
      {
        source: "analyzer",
        candidateRank: 1,
        displayedCandidateCount: 2,
      },
    );

    await act(async () => root.unmount());
  });

  it("asks to apply a root change before Escape closes the editor", async () => {
    const onPreview = vi.fn();
    const onApply = vi.fn();
    const onClose = vi.fn();
    const anchor = document.createElement("button");
    document.body.append(anchor);
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(rect(900, 700, 1020, 760));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <QuickChordEditor
          slot={slot}
          anchorElement={anchor}
          language="en"
          onPreview={onPreview}
          onApply={onApply}
          onReset={vi.fn()}
          onOpenInspector={vi.fn()}
          onClose={onClose}
        />,
      );
    });
    const panel = document.querySelector<HTMLElement>("[data-quick-chord-editor]")!;
    expect(Number.parseFloat(panel.style.left)).toBeGreaterThanOrEqual(8);

    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });
    expect(onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ root: 1 }));
    expect(onApply).not.toHaveBeenCalled();

    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Keep this chord edit?");
    const applyAndClose = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Apply and close")!;
    await act(async () => applyAndClose.click());
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ root: 1 }),
      "structure-editor",
    );
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    expect(document.activeElement).toBe(anchor);
  });

  it("closes on an outside click and asks before discarding a changed draft", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const outside = document.createElement("button");
    document.body.append(outside);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <QuickChordEditor
          slot={slot}
          anchorElement={anchor}
          language="en"
          onPreview={vi.fn()}
          onApply={onApply}
          onReset={vi.fn()}
          onOpenInspector={vi.fn()}
          onClose={onClose}
        />,
      );
    });
    const panel = document.querySelector<HTMLElement>("[data-quick-chord-editor]")!;
    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    await act(async () => {
      outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Keep this chord edit?");

    const discard = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Discard and close")!;
    await act(async () => discard.click());
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("uses U for the same reset command as the visible reset button", async () => {
    const onReset = vi.fn();
    const onClose = vi.fn();
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <QuickChordEditor
          slot={slot}
          anchorElement={anchor}
          language="en"
          onPreview={vi.fn()}
          onApply={vi.fn()}
          onReset={onReset}
          onOpenInspector={vi.fn()}
          onClose={onClose}
        />,
      );
    });
    const panel = document.querySelector<HTMLElement>("[data-quick-chord-editor]")!;
    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "u", bubbles: true }));
    });
    expect(onReset).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("deduplicates and exposes at most five diverse candidates to keys 1 through 5", async () => {
    const onPreview = vi.fn();
    const onApply = vi.fn();
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const manyAlternatives: EditableChordSlot = {
      ...slot,
      alternatives: [
        { chord: { root: 7, quality: "dom7", tensions: [], label: "G7" }, confidence: 0.95 },
        { chord: { ...slot.currentChord, label: "C major seven" }, confidence: 0.94 },
        { chord: { root: 2, quality: "min9", tensions: [], label: "Dm9" }, confidence: 0.9 },
        { chord: { root: 0, quality: "min7", tensions: [], label: "Cm7" }, confidence: 0.85 },
        { chord: { root: 5, quality: "maj7", tensions: [], label: "Fmaj7" }, confidence: 0.8 },
        { chord: { root: 9, quality: "min7", tensions: [], bass: 0, label: "Am7/C" }, confidence: 0.75 },
        { chord: { root: 10, quality: "dom7", tensions: [], label: "Bb7" }, confidence: 0.7 },
      ],
    };

    await act(async () => {
      root.render(
        <QuickChordEditor
          slot={manyAlternatives}
          anchorElement={anchor}
          language="en"
          onPreview={onPreview}
          onApply={onApply}
          onReset={vi.fn()}
          onOpenInspector={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    const panel = document.querySelector<HTMLElement>("[data-quick-chord-editor]")!;
    const candidateButtons = [...panel.querySelectorAll<HTMLButtonElement>("button")]
      .filter((button) => /^[1-5]/.test(button.textContent?.trim() ?? ""));
    expect(candidateButtons).toHaveLength(5);
    expect(candidateButtons.map((button) => button.textContent)).not.toContain("C major seven");

    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "5", bubbles: true }));
    });
    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ label: "Fmaj7" }));
    expect(onApply).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}
