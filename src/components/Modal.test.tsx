// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let mountedRoot: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (mountedRoot) {
    await act(async () => mountedRoot?.unmount());
  }
  host?.remove();
  mountedRoot = undefined;
  host = undefined;
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("Modal", () => {
  it("sets dialog semantics, initial focus, traps Tab, locks scrolling, and restores focus", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.body.append(trigger);
    trigger.focus();
    const initialFocus = { current: null as HTMLButtonElement | null };

    await mount(
      <Modal
        ariaLabelledBy="test-modal-title"
        initialFocusRef={initialFocus}
        onClose={vi.fn()}
      >
        <h2 id="test-modal-title">Test modal</h2>
        <button ref={(element) => { initialFocus.current = element; }}>First</button>
        <button>Last</button>
      </Modal>,
    );

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBe("test-modal-title");
    expect(document.activeElement).toBe(buttons[0]);
    expect(document.body.style.overflow).toBe("hidden");

    buttons[1]?.focus();
    await keyDown(buttons[1], "Tab");
    expect(document.activeElement).toBe(buttons[0]);

    await keyDown(buttons[0], "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(buttons[1]);

    await act(async () => mountedRoot?.unmount());
    mountedRoot = undefined;
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape except while composing with IME", async () => {
    const onClose = vi.fn();
    await mount(
      <Modal ariaLabel="Keyboard dialog" onClose={onClose}>
        <input data-autofocus />
      </Modal>,
    );
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input');

    await keyDown(input, "Escape", { isComposing: true });
    expect(onClose).not.toHaveBeenCalled();
    await keyDown(input, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("honors backdrop close control", async () => {
    const onClose = vi.fn();
    await mount(
      <Modal ariaLabel="Dirty form" onClose={onClose} closeOnBackdrop={false}>
        <input />
      </Modal>,
    );
    const backdrop = document.querySelector<HTMLElement>("[data-modal-backdrop]");
    await act(async () => backdrop?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => mountedRoot?.render(
      <Modal ariaLabel="Clean form" onClose={onClose}>
        <input />
      </Modal>,
    ));
    const enabledBackdrop = document.querySelector<HTMLElement>("[data-modal-backdrop]");
    await act(async () => enabledBackdrop?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("makes only the top modal active and restores the lower modal when it closes", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open dialogs";
    document.body.append(trigger);
    trigger.focus();

    await mount(
      <>
        <Modal ariaLabel="Lower dialog" onClose={vi.fn()}>
          <button data-autofocus>Lower action</button>
        </Modal>
        <Modal ariaLabel="Upper dialog" onClose={vi.fn()}>
          <button data-autofocus>Upper action</button>
        </Modal>
      </>,
    );

    let backdrops = [...document.querySelectorAll<HTMLElement>("[data-modal-backdrop]")];
    let dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
    expect(backdrops[0]?.inert).toBe(true);
    expect(backdrops[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(dialogs[0]?.hasAttribute("aria-modal")).toBe(false);
    expect(backdrops[1]?.inert).toBe(false);
    expect(backdrops[1]?.hasAttribute("aria-hidden")).toBe(false);
    expect(dialogs[1]?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Upper action");

    await act(async () => mountedRoot?.render(
      <Modal ariaLabel="Lower dialog" onClose={vi.fn()}>
        <button data-autofocus>Lower action</button>
      </Modal>,
    ));

    backdrops = [...document.querySelectorAll<HTMLElement>("[data-modal-backdrop]")];
    dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
    expect(backdrops).toHaveLength(1);
    expect(backdrops[0]?.inert).toBe(false);
    expect(backdrops[0]?.hasAttribute("aria-hidden")).toBe(false);
    expect(dialogs[0]?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Lower action");
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => mountedRoot?.unmount());
    mountedRoot = undefined;
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });
});

describe("ConfirmDialog", () => {
  it("focuses the safer cancel action and invokes the selected action", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    await mount(
      <ConfirmDialog
        open
        title="Delete data"
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
        tone="danger"
      />,
    );

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () => buttons[1]?.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

async function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  mountedRoot = createRoot(host);
  await act(async () => mountedRoot?.render(node));
}

async function keyDown(
  target: Element | null | undefined,
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
