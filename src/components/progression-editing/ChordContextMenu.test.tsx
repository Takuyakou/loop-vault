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

    expect(menu.getAttribute("aria-label")).toContain("編集");
    expect(menuButton("前のコードを伸ばす").disabled).toBe(true);
    expect(menuButton("次のコードを伸ばす").disabled).toBe(false);
    expect(menuButton("範囲を詰める").disabled).toBe(false);
    expect(menuButton("N.C.に置き換える").disabled).toBe(false);
    expect(menuButton("結合して左のコードを残す").disabled).toBe(false);
    expect(menuButton("結合して右のコードを残す").disabled).toBe(false);
    expect(menuButton("ここで範囲を切る").disabled).toBe(false);

    await act(async () => harness.root.unmount());
  });

  it("runs the chosen semantic action and reports the result in a status toast", async () => {
    const harness = await mount();
    await openFor(harness, 1);

    await act(async () => menuButton("前のコードを伸ばす").click());

    expect(harness.onAction).toHaveBeenCalledWith(
      harness.editable.slots[1]?.id,
      "delete-extend-previous",
    );
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(harness.container.querySelector('[role="status"]')?.textContent)
      .toContain("前のCを2拍延長しました");

    await act(async () => harness.root.unmount());
  });

  it("supports keyboard navigation, Escape, and focus restoration", async () => {
    const harness = await mount();
    const anchor = harness.container.querySelectorAll<HTMLButtonElement>("[data-chord-card]")[0]!;

    await act(async () => anchor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }),
    ));
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')!;
    const first = menuButton("コードを編集");
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
