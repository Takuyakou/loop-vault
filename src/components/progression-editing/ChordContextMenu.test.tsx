// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditableProgression } from "../../domain/progressionEditing";
import { makeCandidate } from "../../domain/progressionEditing/testFixtures";
import { EditableProgressionGrid } from "./EditableProgressionGrid";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const editable = createEditableProgression(makeCandidate());
  const onAction = vi.fn(() => true);
  const onSelect = vi.fn();
  const quickEditor = {
    onPreview: vi.fn(),
    onApply: vi.fn(),
    onReset: vi.fn(),
    onOpenInspector: vi.fn(),
  };
  await act(async () => root.render(
    <EditableProgressionGrid
      editable={editable}
      onSelect={onSelect}
      language="en"
      quickEditor={quickEditor}
      contextActions={{
        canCutRange: (slotId) => slotId === editable.slots[0]?.id,
        onAction,
      }}
    />,
  ));
  return { container, root, editable, onAction, onSelect };
}

async function openFor(harness: Awaited<ReturnType<typeof mount>>, index: number) {
  const cards = harness.container.querySelectorAll<HTMLElement>("[data-chord-card]");
  await act(async () => cards[index]?.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  ));
  return document.body.querySelector<HTMLElement>('[role="menu"]')!;
}

function menuButton(label: string) {
  return [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .find((button) => button.querySelector("span")?.textContent === label)!;
}

describe("ChordContextMenu", () => {
  it("announces every explicit action and disables impossible delete directions", async () => {
    const harness = await mount();
    const menu = await openFor(harness, 0);

    expect(menu.getAttribute("aria-label")).toContain("Edit actions");
    expect(menuButton("Extend previous chord").disabled).toBe(true);
    expect(menuButton("Extend next chord").disabled).toBe(false);
    expect(menuButton("Close the gap").disabled).toBe(false);
    expect(menuButton("Replace with N.C.").disabled).toBe(false);
    expect(menuButton("Merge and keep left chord").disabled).toBe(false);
    expect(menuButton("Merge and keep right chord").disabled).toBe(false);
    expect(menuButton("Cut range here").disabled).toBe(false);

    await act(async () => harness.root.unmount());
  });

  it("runs the chosen semantic action and reports the result in a status toast", async () => {
    const harness = await mount();
    await openFor(harness, 1);

    await act(async () => menuButton("Extend previous chord").click());

    expect(harness.onAction).toHaveBeenCalledWith(
      harness.editable.slots[1]?.id,
      "delete-extend-previous",
    );
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(harness.container.querySelector('[role="status"]')?.textContent)
      .toContain("extended C by 2 beats");

    await act(async () => harness.root.unmount());
  });

  it("supports keyboard navigation, Escape, and focus restoration", async () => {
    const harness = await mount();
    const anchor = harness.container.querySelectorAll<HTMLButtonElement>("[data-chord-card]")[0]!;

    await act(async () => anchor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }),
    ));
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')!;
    const first = menuButton("Edit chord");
    expect(document.activeElement).toBe(first);

    await act(async () => first.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ));
    expect(document.activeElement).not.toBe(first);

    await act(async () => menu.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ));
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(anchor);

    await act(async () => harness.root.unmount());
  });
});
