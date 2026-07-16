// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Status } from "../domain/types";
import { StatusActionMenu } from "./StatusActionMenu";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  document.body.innerHTML = "";
});

describe("StatusActionMenu", () => {
  it("opens with arrow keys, wraps focus, and restores focus on Escape", async () => {
    await mount(vi.fn());
    const trigger = getButton("Other");
    trigger.focus();

    await keyDown(trigger, "ArrowUp");
    expect(document.activeElement?.textContent).toBe("Abandoned");
    expect(getMenuItems().map((item) => item.tabIndex)).toEqual([-1, 0]);

    await keyDown(document.activeElement, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("Hold");
    expect(getMenuItems().map((item) => item.tabIndex)).toEqual([0, -1]);
    await keyDown(document.activeElement, "ArrowUp");
    expect(document.activeElement?.textContent).toBe("Abandoned");

    await keyDown(document.activeElement, "Escape");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on an outside click without taking focus from the click target", async () => {
    await mount(vi.fn());
    const trigger = getButton("Other");
    await act(async () => trigger.click());
    expect(document.querySelector('[role="menu"]')).not.toBeNull();

    const outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.append(outside);
    await act(async () => {
      outside.focus();
      outside.click();
    });

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
    expect(document.activeElement).not.toBe(trigger);
  });

  it("closes on Tab and focusout without restoring trigger focus", async () => {
    await mount(vi.fn());
    const trigger = getButton("Other");
    await act(async () => trigger.click());

    await keyDown(document.activeElement, "Tab");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).not.toBe(trigger);

    await act(async () => trigger.click());
    const outside = document.createElement("button");
    document.body.append(outside);
    await act(async () => outside.focus());
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it("does not close on Escape while IME composition is active", async () => {
    await mount(vi.fn());
    const trigger = getButton("Other");
    await act(async () => trigger.click());

    await keyDown(document.activeElement, "Escape", { isComposing: true });
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.activeElement).not.toBe(trigger);

    await keyDown(document.activeElement, "Escape");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("focuses the trigger before invoking a selected action", async () => {
    let focusedAtSelect = "";
    const onSelect = vi.fn(() => {
      focusedAtSelect = document.activeElement?.textContent ?? "";
    });
    await mount(onSelect);
    const trigger = getButton("Other");
    await act(async () => trigger.click());
    await act(async () => getButton("Hold").click());

    expect(onSelect).toHaveBeenCalledWith("hold");
    expect(focusedAtSelect).toBe("Other");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

async function mount(onSelect: (status: Status) => void) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <StatusActionMenu
      actions={[
        { status: "hold", label: "Hold" },
        { status: "abandoned", label: "Abandoned" },
      ]}
      label="Other"
      onSelect={onSelect}
    />,
  ));
}

function getButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  return button!;
}

function getMenuItems(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
}

async function keyDown(
  target: Element | null,
  key: string,
  options: KeyboardEventInit = {},
) {
  await act(async () => target?.dispatchEvent(new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...options,
  })));
}
