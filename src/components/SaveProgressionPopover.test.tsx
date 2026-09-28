// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appCopy } from "../i18n";
import { SaveProgressionPopover } from "./SaveProgressionPopover";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("SaveProgressionPopover", () => {
  it("keeps the save form inside the visible main boundary at the reported narrow geometry", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(786);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(836);
    const main = document.createElement("main");
    const container = document.createElement("div");
    main.append(container);
    document.body.append(main);

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === main) return rect(187, 0, 786, 836);
      if (this.hasAttribute("data-save-progression-root")) {
        return rect(253, 360, 396, 400);
      }
      if (this instanceof HTMLFormElement) return rect(0, 0, 352, 370);
      return rect(0, 0, 0, 0);
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <SaveProgressionPopover
          initialTitle="18-19 bars"
          ideas={[]}
          defaultNextAction="Create a bass loop"
          copy={appCopy.ja}
          onCreate={() => true}
          onAppend={() => true}
          onCopyMemo={() => true}
          onSaved={vi.fn()}
        />,
      );
    });

    const saveButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === appCopy.ja.capture.saveToVault)!;
    await act(async () => saveButton.click());

    const form = document.querySelector<HTMLFormElement>(
      'form[role="dialog"]:has(input[name="progression-title"])',
    )!;
    expect(form.closest("[data-save-progression-root]")).not.toBeNull();
    expect(form.classList.contains("fixed")).toBe(true);
    const left = Number.parseFloat(form.style.left);
    const width = Number.parseFloat(form.style.width);
    expect(left).toBeGreaterThanOrEqual(195);
    expect(left + width).toBeLessThanOrEqual(778);
    expect(Number.parseFloat(form.style.top)).toBeGreaterThanOrEqual(8);
    expect(Number.parseFloat(form.style.maxHeight)).toBeLessThanOrEqual(820);
    expect(document.activeElement).toBe(form.elements.namedItem("progression-title"));

    const title = form.elements.namedItem("progression-title") as HTMLInputElement;
    await act(async () => {
      title.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(document.body.contains(form)).toBe(true);

    const outside = document.createElement("button");
    document.body.append(outside);
    await act(async () => {
      outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(document.body.contains(form)).toBe(false);

    await act(async () => root.unmount());
  });

  it("has no next-action field but still saves the default next action (P8.9-04)", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onCreate = vi.fn(() => true);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <SaveProgressionPopover
          initialTitle="1-4 bars"
          ideas={[]}
          defaultNextAction={appCopy.ja.capture.defaultNextAction}
          copy={appCopy.ja}
          onCreate={onCreate}
          onAppend={() => true}
          onCopyMemo={() => true}
          onSaved={vi.fn()}
        />,
      );
    });
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === appCopy.ja.capture.saveToVault)!.click());

    const form = document.querySelector<HTMLFormElement>('form[role="dialog"]')!;
    expect(form.elements.namedItem("progression-next-action")).toBeNull();
    expect(form.textContent).not.toContain(appCopy.ja.capture.nextAction);
    await act(async () => form.requestSubmit());
    expect(onCreate).toHaveBeenCalledWith("1-4 bars", appCopy.ja.capture.defaultNextAction, false);
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
