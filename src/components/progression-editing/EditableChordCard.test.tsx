// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditableChordSlot } from "../../domain/progressionEditing";
import { EditableChordCard } from "./EditableChordCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const slot: EditableChordSlot = {
  id: "slot-1",
  position: {
    bar: 1,
    beat: 1,
    durationBeats: 4,
  },
  originalChord: {
    root: 0,
    quality: "maj7",
    tensions: [],
    label: "Cmaj7",
  },
  currentChord: {
    root: 0,
    quality: "maj7",
    tensions: [],
    label: "Cmaj7",
  },
  confidence: 0.9,
  alternatives: [],
  warnings: [],
  edited: false,
};

afterEach(() => {
  document.body.innerHTML = "";
});

async function renderCard() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onSelect = vi.fn();
  const onNavigate = vi.fn();
  const onPreview = vi.fn();
  const onQuickEdit = vi.fn();
  await act(async () => {
    root.render(
      <EditableChordCard
        slot={slot}
        selected={false}
        playing={false}
        onSelect={onSelect}
        onNavigate={onNavigate}
        onPreview={onPreview}
        onQuickEdit={onQuickEdit}
        language="en"
      />,
    );
  });
  return { container, root, onSelect, onNavigate, onPreview, onQuickEdit };
}

describe("EditableChordCard", () => {
  it("selects from the full card and opens actions with Enter, Shift+F10, or Menu", async () => {
    const { container, root, onSelect, onQuickEdit } = await renderCard();
    const option = container.querySelector<HTMLElement>("[role='option']")!;
    const mainButton = container.querySelector<HTMLButtonElement>("button")!;

    await act(async () => option.click());
    expect(onSelect).toHaveBeenCalledOnce();

    await act(async () => {
      mainButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onQuickEdit).toHaveBeenLastCalledWith(mainButton);

    await act(async () => {
      mainButton.dispatchEvent(
        new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }),
      );
    });
    expect(onQuickEdit).toHaveBeenCalledTimes(2);

    await act(async () => {
      mainButton.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }),
      );
    });
    expect(onQuickEdit).toHaveBeenCalledTimes(3);
    await act(async () => root.unmount());
  });

  it("opens quick edit from the context menu and hover edit button", async () => {
    const { container, root, onSelect, onQuickEdit } = await renderCard();
    const option = container.querySelector<HTMLElement>("[role='option']")!;
    const editButton = container.querySelector<HTMLButtonElement>("button[aria-label='Quick edit']")!;

    await act(async () => {
      option.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(onQuickEdit).toHaveBeenLastCalledWith(option);

    await act(async () => editButton.click());
    expect(onQuickEdit).toHaveBeenLastCalledWith(editButton);
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("moves between cards with arrows and previews with Space", async () => {
    const { container, root, onNavigate, onPreview } = await renderCard();
    const mainButton = container.querySelector<HTMLButtonElement>("button")!;

    await act(async () => {
      mainButton.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      mainButton.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      mainButton.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });

    expect(onNavigate).toHaveBeenNthCalledWith(1, 1);
    expect(onNavigate).toHaveBeenNthCalledWith(2, -1);
    expect(onPreview).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("allows long chord labels to wrap inside the card", async () => {
    const { container, root } = await renderCard();
    const label = container.querySelector(".break-words");
    expect(label?.textContent).toBe("Cmaj7");
    expect(label?.className).toContain("[overflow-wrap:anywhere]");
    expect(label?.className).toContain("break-words");
    await act(async () => root.unmount());
  });
});
